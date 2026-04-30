//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Copyright (c) Orangesoft Inc.
//

import SafariServices
import SwiftUI
import os.log
// Translation framework は iOS 17.4+ / macOS 14.4+ にしか存在しないため、
// strong link すると iOS 15 / macOS 10.14 など古い OS で dyld が拡張をロードできなくなる。
// @_weakLinked により実体不在時もロードを許可し、availability ガードで実呼び出しを抑止する。
#if canImport(Translation)
@_weakLinked import Translation
#endif
#if os(macOS)
import AppKit
#endif

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        // ペイロードに翻訳対象テキスト等のユーザーコンテンツが含まれる可能性があるため、
        // 本体は出力せず、存在有無とプロファイルIDのみデバッグレベルで記録する
        os_log(.debug, "Received message from browser.runtime.sendNativeMessage (hasMessage: %{public}@, profile: %{public}@)", message == nil ? "false" : "true", profile?.uuidString ?? "none")

        // メッセージが { action: "...", ...パラメータ } 形式（フラット辞書）の場合は action でディスパッチ。
        // 各 action に必要なパラメータ（source / target / text 等）はトップレベルから直接読み取る。
        // action キーが無い旧形式メッセージは後方互換のため echo を返す。
        let payload = message as? [String: Any]
        let action = payload?["action"] as? String

        // 同期で完結する action は即応答。非同期 API を呼ぶ action のみ Task で処理。
        if let action = action {
            switch action {
            case "ping":
                respond(context: context, body: handlePing())
                return
            case "checkLanguageAvailability":
                // Task は macOS 10.15+ / iOS 13+ で利用可能。
                // それ未満では Translation framework 自体も使えないので機能無効レスポンスを返す。
                if #available(iOS 13.0, macOS 10.15, *) {
                    Task {
                        let body = await handleCheckLanguageAvailability(payload: payload ?? [:])
                        respond(context: context, body: body)
                    }
                } else {
                    respond(context: context, body: [
                        "ok": false,
                        "error": "Requires iOS 13+ / macOS 10.15+ runtime"
                    ])
                }
                return
            case "listSupportedLanguages":
                // 対応言語リストを返す診断用アクション。
                // checkLanguageAvailability が unsupported を返す場合に、
                // フレームワークが期待する identifier 形式を確認するために使用する。
                if #available(iOS 13.0, macOS 10.15, *) {
                    Task {
                        let body = await handleListSupportedLanguages()
                        respond(context: context, body: body)
                    }
                } else {
                    respond(context: context, body: [
                        "ok": false,
                        "error": "Requires iOS 13+ / macOS 10.15+ runtime"
                    ])
                }
                return
            case "translate":
                // 実テキスト翻訳。TranslationSession は SwiftUI 経由でしか取得できないため、
                // NSHostingController + 画面外 NSWindow で隠し SwiftUI ビューをホストする戦略。
                // macOS のみ対応。iOS 拡張プロセスは UIWindowScene 非保有のため別途検討。
                if #available(iOS 18.0, macOS 15.0, *) {
                    Task {
                        let body = await handleTranslate(payload: payload ?? [:])
                        respond(context: context, body: body)
                    }
                } else {
                    respond(context: context, body: [
                        "ok": false,
                        "error": "Requires iOS 18+ / macOS 15+"
                    ])
                }
                return
            default:
                // 未知の action は明示的にエラーを返す（黙って echo にフォールバックすると
                // JS 側のバグに気付きにくくなるため）
                respond(context: context, body: [
                    "ok": false,
                    "error": "unknown action: \(action)"
                ])
                return
            }
        }

        // 後方互換: action が無いメッセージは従来どおり echo する
        respond(context: context, body: ["echo": message ?? NSNull()])
    }

    // ─── 共通レスポンダ ────────────────────────────────────────────
    private func respond(context: NSExtensionContext, body: [String: Any]) {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: body]
        } else {
            response.userInfo = ["message": body]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    // ─── ping: ブリッジ動作確認 ────────────────────────────────────
    // Translation framework が利用可能な OS かどうかをだけ返す軽量応答。
    // 実機で「JS から呼んで戻ってくるか」を最初に確認するための健康診断用。
    private func handlePing() -> [String: Any] {
        var info: [String: Any] = [
            "ok": true,
            "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
        ]
        // Translation framework は iOS 17.4+ / macOS 14.4+ で導入。
        // ただし LanguageAvailability などのプログラマティック API は iOS 18+ / macOS 15+ で追加されたため、
        // 「フレームワーク自体の有無」と「programmatic API が使えるか」は別フラグで返す。
        if #available(iOS 17.4, macOS 14.4, *) {
            info["translationFrameworkAvailable"] = true
        } else {
            info["translationFrameworkAvailable"] = false
        }
        if #available(iOS 18.0, macOS 15.0, *) {
            info["languageAvailabilityAPIAvailable"] = true
        } else {
            info["languageAvailabilityAPIAvailable"] = false
        }
        return info
    }

    // ─── checkLanguageAvailability: 言語ペアの対応状態を返す ─────────
    // Apple の Translation framework が拡張プロセスから programmatic に呼べるかの最小検証。
    // UI を伴わない LanguageAvailability API のみ使用する。
    // payload: { source: "en", target: "ja" } / 結果: installed | supported | unsupported
    @available(iOS 13.0, macOS 10.15, *)
    private func handleCheckLanguageAvailability(payload: [String: Any]) async -> [String: Any] {
        guard let source = payload["source"] as? String,
              let target = payload["target"] as? String else {
            return ["ok": false, "error": "missing source/target"]
        }

        // LanguageAvailability は iOS 18+ / macOS 15+ で programmatic に呼び出し可能。
        // 17.4〜17.x / 14.4〜14.x は Translation framework は存在するが API は SwiftUI 経由のみ。
        if #available(iOS 18.0, macOS 15.0, *) {
            #if canImport(Translation)
            let availability = LanguageAvailability()
            let supported = await availability.supportedLanguages

            // フレームワークの status(from:to:) は region 単位で対応判定するため、
            // 同じ言語コードでも en-IN→ja-JP は未対応・en-US→ja-JP は対応のように分岐する。
            // 入力コード（"en" 等）に該当する全リージョン variant を取得し、preferred 順に
            // 全ペア組み合わせを試して installed/supported が返る最初のペアを採用する。
            let sourceCandidates = candidateLanguages(code: source, from: supported)
            let targetCandidates = candidateLanguages(code: target, from: supported)

            var bestStatus: LanguageAvailability.Status = .unsupported
            var bestSource = sourceCandidates.first ?? Locale.Language(identifier: source)
            var bestTarget = targetCandidates.first ?? Locale.Language(identifier: target)
            var foundSupported = false

            outer: for src in sourceCandidates {
                for tgt in targetCandidates {
                    let s = await availability.status(from: src, to: tgt)
                    // 最初に試したペアを暫定として保持（全ペア unsupported のときの返却用）
                    if !foundSupported && bestStatus == .unsupported {
                        bestStatus = s
                        bestSource = src
                        bestTarget = tgt
                    }
                    if s == .installed || s == .supported {
                        bestStatus = s
                        bestSource = src
                        bestTarget = tgt
                        foundSupported = true
                        break outer
                    }
                }
            }

            let statusString: String
            switch bestStatus {
            case .installed: statusString = "installed"
            case .supported: statusString = "supported"
            case .unsupported: statusString = "unsupported"
            @unknown default: statusString = "unknown"
            }
            return [
                "ok": true,
                "status": statusString,
                "source": source,
                "target": target,
                "sourceMaximalIdentifier": bestSource.maximalIdentifier,
                "targetMaximalIdentifier": bestTarget.maximalIdentifier,
                "sourceCandidatesCount": sourceCandidates.count,
                "targetCandidatesCount": targetCandidates.count,
            ]
            #else
            return ["ok": false, "error": "Translation framework not importable"]
            #endif
        } else {
            return ["ok": false, "error": "Requires iOS 18+ / macOS 15+ for programmatic LanguageAvailability"]
        }
    }

    // 入力コードに対応する Locale.Language の候補リストを preferred region 順で返す。
    // 主要言語は実用的な region を優先順位付きで列挙する。それ以外は対応リストの登録順。
    @available(iOS 16.0, macOS 13.0, *)
    private func candidateLanguages(code: String, from supported: [Locale.Language]) -> [Locale.Language] {
        // "zh-CN" 形式: region 完全一致のみを返す（曖昧さを残さない）
        if code.contains("-") || code.contains("_") {
            let parts = code.replacingOccurrences(of: "_", with: "-").split(separator: "-")
            if parts.count >= 2 {
                let langPart = String(parts[0])
                let regionPart = String(parts[1]).uppercased()
                if let match = supported.first(where: {
                    $0.languageCode?.identifier == langPart && $0.region?.identifier == regionPart
                }) {
                    return [match]
                }
            }
            return [Locale.Language(identifier: code)]
        }

        // 言語コードのみ: languageCode 一致を全て取得し、preferred region 順にソート
        let matches = supported.filter { $0.languageCode?.identifier == code }
        if matches.isEmpty {
            return [Locale.Language(languageCode: Locale.LanguageCode(code))]
        }

        // 主要言語の preferred region 優先順位（先頭ほど高優先）
        let preferred: [String] = preferredRegions(for: code)
        return matches.sorted { a, b in
            let aRegion = a.region?.identifier ?? ""
            let bRegion = b.region?.identifier ?? ""
            let aIdx = preferred.firstIndex(of: aRegion) ?? Int.max
            let bIdx = preferred.firstIndex(of: bRegion) ?? Int.max
            return aIdx < bIdx
        }
    }

    private func preferredRegions(for code: String) -> [String] {
        switch code {
        case "en": return ["US", "GB", "AU", "CA", "IE", "NZ", "SG", "ZA", "IN"]
        case "ja": return ["JP"]
        case "ko": return ["KR"]
        case "zh": return ["CN", "TW", "HK"]
        case "fr": return ["FR", "CA"]
        case "de": return ["DE", "CH"]
        case "es": return ["ES", "MX", "US"]
        case "pt": return ["PT", "BR"]
        case "it": return ["IT", "CH"]
        case "ar": return ["AE"]
        case "ru": return ["RU"]
        default: return []
        }
    }

    // ─── listSupportedLanguages: 対応言語リストを返す ────────────────
    // フレームワークが認識する識別子の正確な形式を確認するための診断用アクション。
    // checkLanguageAvailability が想定外に unsupported を返す場合の切り分けに使う。
    @available(iOS 13.0, macOS 10.15, *)
    private func handleListSupportedLanguages() async -> [String: Any] {
        if #available(iOS 18.0, macOS 15.0, *) {
            #if canImport(Translation)
            let availability = LanguageAvailability()
            let supported = await availability.supportedLanguages
            // 各 Language を maximalIdentifier（"en-Latn-US" 形式）と内部コンポーネントで返す
            let entries: [[String: String]] = supported.map { lang in
                [
                    "maximalIdentifier": lang.maximalIdentifier,
                    "languageCode": lang.languageCode?.identifier ?? "",
                    "script": lang.script?.identifier ?? "",
                    "region": lang.region?.identifier ?? "",
                ]
            }
            return [
                "ok": true,
                "count": entries.count,
                "languages": entries,
            ]
            #else
            return ["ok": false, "error": "Translation framework not importable"]
            #endif
        } else {
            return ["ok": false, "error": "Requires iOS 18+ / macOS 15+ for programmatic LanguageAvailability"]
        }
    }

    // ─── translate: 実テキスト翻訳 ────────────────────────────────
    // payload: { source, target, text }
    // 戻り値: { ok: true, translated, sourceMaximalIdentifier, targetMaximalIdentifier }
    //   or  { ok: false, error }
    @available(iOS 18.0, macOS 15.0, *)
    private func handleTranslate(payload: [String: Any]) async -> [String: Any] {
        guard let source = payload["source"] as? String,
              let target = payload["target"] as? String,
              let text = payload["text"] as? String else {
            return ["ok": false, "error": "missing source/target/text"]
        }
        if text.isEmpty {
            return ["ok": true, "translated": ""]
        }

        #if canImport(Translation)
        // 言語ペアを supportedLanguages から解決する（PR #147 のロジック流用）
        let availability = LanguageAvailability()
        let supported = await availability.supportedLanguages
        let sourceCandidates = candidateLanguages(code: source, from: supported)
        let targetCandidates = candidateLanguages(code: target, from: supported)
        guard let sourceLang = sourceCandidates.first else {
            return ["ok": false, "error": "source language not in supportedLanguages: \(source)"]
        }
        guard let targetLang = targetCandidates.first else {
            return ["ok": false, "error": "target language not in supportedLanguages: \(target)"]
        }

        #if os(macOS)
        do {
            let translated = try await translateUsingHiddenHost_macOS(
                text: text,
                source: sourceLang,
                target: targetLang
            )
            return [
                "ok": true,
                "translated": translated,
                "sourceMaximalIdentifier": sourceLang.maximalIdentifier,
                "targetMaximalIdentifier": targetLang.maximalIdentifier,
            ]
        } catch {
            return [
                "ok": false,
                "error": "translation failed: \(error.localizedDescription)",
            ]
        }
        #else
        // iOS の Safari Web Extension ハンドラは UIWindowScene を持たないため、
        // SwiftUI ホスト戦略は使えない。別途 App Group 経由などの戦略が必要（次段階）。
        return [
            "ok": false,
            "error": "iOS translation not yet implemented (requires App Group bridge to container app)",
        ]
        #endif
        #else
        return ["ok": false, "error": "Translation framework not importable"]
        #endif
    }

    #if os(macOS) && canImport(Translation)
    // SwiftUI 経由で TranslationSession を取得して翻訳実行する。
    // 画面外の NSWindow に NSHostingController を置き、ビューが「appear」したタイミングで
    // .translationTask の closure に渡される TranslationSession を使う。
    // CheckedContinuation で結果を非同期に受け取る。Window と HostingController は
    // Holder クラスで継続中強参照を保持し、結果コールバック後に解放する。
    @available(macOS 15.0, *)
    @MainActor
    private func translateUsingHiddenHost_macOS(
        text: String,
        source: Locale.Language,
        target: Locale.Language
    ) async throws -> String {
        return try await withCheckedThrowingContinuation { continuation in
            let holder = HiddenHostHolder()
            // タイムアウト保険: 30 秒以内に結果が来なかった場合は強制終了する
            let timeoutTask = Task { [weak holder] in
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    if holder?.window != nil {
                        holder?.cleanup()
                        continuation.resume(throwing: NSError(
                            domain: "DVT.Translation",
                            code: -1,
                            userInfo: [NSLocalizedDescriptionKey: "translation timed out (30s)"]
                        ))
                    }
                }
            }

            let view = TranslationHostView(
                text: text,
                source: source,
                target: target
            ) { result in
                // 結果が一度確定したら timeout を停止して window/hosting を解放
                timeoutTask.cancel()
                holder.cleanup()
                continuation.resume(with: result)
            }

            let hosting = NSHostingController(rootView: view)
            // 画面外（負座標）かつ alphaValue=0 で実質不可視のウィンドウを作る。
            // borderless スタイルでメニューバー等の干渉も回避。
            let window = NSWindow(
                contentRect: NSRect(x: -10000, y: -10000, width: 1, height: 1),
                styleMask: [.borderless],
                backing: .buffered,
                defer: false
            )
            window.contentViewController = hosting
            window.alphaValue = 0
            window.ignoresMouseEvents = true
            // orderFrontRegardless で実際にビューが appear するまで進める
            window.orderFrontRegardless()

            holder.window = window
            holder.hostingController = hosting
        }
    }
    #endif
}

#if os(macOS) && canImport(Translation)
// 隠しホスト関連のリソースを retain/release するためのクラス。
// 値型のローカル変数では非同期境界を超えられないため class でくるむ。
@available(macOS 15.0, *)
@MainActor
private final class HiddenHostHolder {
    var window: NSWindow?
    var hostingController: NSHostingController<TranslationHostView>?

    func cleanup() {
        window?.orderOut(nil)
        window?.contentViewController = nil
        window = nil
        hostingController = nil
    }
}

// 隠しホスト用の最小 SwiftUI ビュー。
// configuration を State で持ち、ビューが appear した瞬間に .translationTask が起動して
// session.translate(text) を実行、結果を onResult で外に返す。
@available(iOS 18.0, macOS 15.0, *)
private struct TranslationHostView: View {
    let text: String
    @State private var configuration: TranslationSession.Configuration?
    let onResult: (Result<String, Error>) -> Void

    init(
        text: String,
        source: Locale.Language,
        target: Locale.Language,
        onResult: @escaping (Result<String, Error>) -> Void
    ) {
        self.text = text
        self.onResult = onResult
        _configuration = State(initialValue: TranslationSession.Configuration(source: source, target: target))
    }

    var body: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .translationTask(configuration) { session in
                do {
                    let response = try await session.translate(text)
                    onResult(.success(response.targetText))
                } catch {
                    onResult(.failure(error))
                }
            }
    }
}
#endif
