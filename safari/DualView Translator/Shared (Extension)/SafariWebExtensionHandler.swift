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
// NaturalLanguage は iOS 12+ / macOS 10.14+ で標準提供。
// オフラインで言語検出可能な NLLanguageRecognizer をオフラインフォールバック時に利用する。
import NaturalLanguage

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
                // Translation framework を内部で呼ぶため iOS 13+ / macOS 10.15+ が必要。
                if #available(iOS 13.0, macOS 10.15, *) {
                    runAsync(context: context) {
                        await self.handleCheckLanguageAvailability(payload: payload ?? [:])
                    }
                } else {
                    respond(context: context, body: makeError("Requires iOS 13+ / macOS 10.15+ runtime"))
                }
                return
            case "listSupportedLanguages":
                // checkLanguageAvailability が unsupported を返したときの切り分け用診断 action。
                if #available(iOS 13.0, macOS 10.15, *) {
                    runAsync(context: context) {
                        await self.handleListSupportedLanguages()
                    }
                } else {
                    respond(context: context, body: makeError("Requires iOS 13+ / macOS 10.15+ runtime"))
                }
                return
            case "translate":
                // 実テキスト翻訳。TranslationSession は SwiftUI 経由でしか取得できないため、
                // NSHostingController + 画面外 NSWindow で隠し SwiftUI ビューをホストする戦略。
                // macOS のみ対応。iOS 拡張プロセスは UIWindowScene 非保有のため別途検討。
                if #available(iOS 18.0, macOS 15.0, *) {
                    runAsync(context: context) {
                        await self.handleTranslate(payload: payload ?? [:])
                    }
                } else {
                    respond(context: context, body: makeError("Requires iOS 18+ / macOS 15+"))
                }
                return
            case "detectLanguage":
                // NLLanguageRecognizer によるオフライン言語検出。
                // iOS 12+ / macOS 10.14+ で同期 API なので Task 不要・即応答。
                respond(context: context, body: handleDetectLanguage(payload: payload ?? [:]))
                return
            case "mirrorSettings":
                // Web Extension の chrome.storage.local 変更を App Group UserDefaults に反映する。
                // Share Extension 等の他ターゲットから設定値を読み出すための同期パス。
                // 設定共有なので失敗してもアプリ機能は継続できる（Web Ext 側でログするだけ）。
                respond(context: context, body: handleMirrorSettings(payload: payload ?? [:]))
                return
            default:
                // 未知の action は明示的にエラーを返す（黙って echo にフォールバックすると
                // JS 側のバグに気付きにくくなるため）
                respond(context: context, body: makeError("unknown action: \(action)"))
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

    // 失敗レスポンスを統一フォーマットで生成するヘルパー
    private func makeError(_ message: String) -> [String: Any] {
        return ["ok": false, "error": message]
    }

    // 非同期ハンドラを Task で走らせて結果を respond する小さなラッパー。
    // 呼び出し側で availability ガードした上で使う想定（closure に availability 注釈を
    // 伝播させる手段が無いため、availability check 自体は呼び出し側に残す）。
    @available(iOS 13.0, macOS 10.15, *)
    private func runAsync(
        context: NSExtensionContext,
        handler: @escaping () async -> [String: Any]
    ) {
        Task {
            let body = await handler()
            respond(context: context, body: body)
        }
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
        // translate アクション（実テキスト翻訳）は macOS 15+ のみ実装済み。
        // iOS は Extension プロセスが UIWindowScene を持たないため SwiftUI ホスト戦略が使えず未実装。
        // background.js 側でこのフラグを見て iOS では appleAvailable を false にする。
        #if os(macOS)
        if #available(macOS 15.0, *) {
            info["translateActionSupported"] = true
        } else {
            info["translateActionSupported"] = false
        }
        #else
        info["translateActionSupported"] = false
        #endif
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
            return makeError("missing source/target")
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

            return [
                "ok": true,
                "status": Self.statusToString(bestStatus),
                "source": source,
                "target": target,
                "sourceMaximalIdentifier": bestSource.maximalIdentifier,
                "targetMaximalIdentifier": bestTarget.maximalIdentifier,
                "sourceCandidatesCount": sourceCandidates.count,
                "targetCandidatesCount": targetCandidates.count,
            ]
            #else
            return makeError("Translation framework not importable")
            #endif
        } else {
            return makeError("Requires iOS 18+ / macOS 15+ for programmatic LanguageAvailability")
        }
    }

    // LanguageAvailability.Status → 文字列マッピング。
    // 拡張プロセス境界を JSON で渡すため、enum を string で安定化させる。
    @available(iOS 18.0, macOS 15.0, *)
    private static func statusToString(_ status: LanguageAvailability.Status) -> String {
        switch status {
        case .installed: return "installed"
        case .supported: return "supported"
        case .unsupported: return "unsupported"
        @unknown default: return "unknown"
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

    // 主要言語ごとの preferred region。新言語追加時はここに追記する。
    private static let preferredRegionsTable: [String: [String]] = [
        "en": ["US", "GB", "AU", "CA", "IE", "NZ", "SG", "ZA", "IN"],
        "ja": ["JP"],
        "ko": ["KR"],
        "zh": ["CN", "TW", "HK"],
        "fr": ["FR", "CA"],
        "de": ["DE", "CH"],
        "es": ["ES", "MX", "US"],
        "pt": ["PT", "BR"],
        "it": ["IT", "CH"],
        "ar": ["AE"],
        "ru": ["RU"],
    ]

    private func preferredRegions(for code: String) -> [String] {
        return Self.preferredRegionsTable[code] ?? []
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
            return makeError("Translation framework not importable")
            #endif
        } else {
            return makeError("Requires iOS 18+ / macOS 15+ for programmatic LanguageAvailability")
        }
    }

    // ─── detectLanguage: オフライン言語検出 ─────────────────────────
    // NLLanguageRecognizer はオンデバイスで動作するため、ネットワーク不通時も呼び出し可能。
    // 主に Apple Translation フォールバック時に sl="auto" を解決するために使う。
    // 戻り値: { ok: true, detectedLang: "en" / "ja" / "zh-Hans" 等, confidence: 0..1 }
    //   or  { ok: false, error: "..." }
    private func handleDetectLanguage(payload: [String: Any]) -> [String: Any] {
        guard let text = payload["text"] as? String, !text.isEmpty else {
            return makeError("missing or empty text")
        }
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        guard let dominant = recognizer.dominantLanguage else {
            return ["ok": true, "detectedLang": NSNull(), "confidence": 0.0]
        }
        let hypotheses = recognizer.languageHypotheses(withMaximum: 1)
        let confidence = hypotheses[dominant] ?? 0.0
        return [
            "ok": true,
            "detectedLang": dominant.rawValue,
            "confidence": confidence,
        ]
    }

    // ─── mirrorSettings: Web Ext 設定を App Group へ反映 ────────────
    // payload: { entries: { "uiLang": "ja", "targetLang": "en", ... } }
    // Web Extension 側で chrome.storage.local が変化したとき呼ばれ、Share Extension
    // など他ターゲットから参照できるよう共有領域に値を写す。
    // App Group ID / allowlist / 型バリデーション / 適用ロジックは SharedSettings.swift に集約
    // （Phase 3a / Issue #89 で独立ファイル化）。
    private func handleMirrorSettings(payload: [String: Any]) -> [String: Any] {
        guard let entries = payload["entries"] as? [String: Any] else {
            return makeError("missing entries")
        }
        // entitlements 不整合等で UserDefaults(suiteName:) が nil になるケースを明示的なエラーにする。
        // 黙って書き込み失敗するのではなく JS 側で気付けるようにする。
        // 取得した defaults を applyMirroredEntries に渡すことで suiteName 生成は 1 回で済む。
        guard let defaults = SharedSettings.shared else {
            return makeError("App Group UserDefaults unavailable; check entitlements")
        }
        let result = SharedSettings.applyMirroredEntries(entries, to: defaults)
        // 値そのものは APIキー等を含み得るためログには件数のみ記録する
        os_log(.debug, "mirrorSettings applied %{public}d key(s), rejected %{public}d",
               result.applied, result.rejectedKeys.count)
        var response: [String: Any] = ["ok": true, "applied": result.applied]
        if !result.rejectedKeys.isEmpty {
            response["rejected"] = result.rejectedKeys
        }
        return response
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
            return makeError("missing source/target/text")
        }
        if text.isEmpty {
            return ["ok": true, "translated": ""]
        }

        #if canImport(Translation)
        // 言語ペアを supportedLanguages から解決する（PR #147 のロジック流用）
        let pair = await resolveLanguagePair(source: source, target: target)
        switch pair {
        case .resolveFailure(let err):
            return makeError(err)
        case .resolved(let sourceLang, let targetLang):
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
                os_log(.error, "[DVT] Apple Translation failed: %{public}@", error.localizedDescription)
                return makeError("translation failed: \(error.localizedDescription)")
            }
            #else
            // iOS の Safari Web Extension ハンドラは UIWindowScene を持たないため、
            // SwiftUI ホスト戦略は使えない。ping の translateActionSupported: false で
            // background.js 側が appleAvailable を false にするため、ここには到達しないはず。
            os_log(.error, "[DVT] translate action called on iOS but not implemented (UIWindowScene unavailable in extension process)")
            return makeError("iOS translation not yet implemented (requires App Group bridge to container app)")
            #endif
        }
        #else
        return makeError("Translation framework not importable")
        #endif
    }

    // resolveLanguagePair の結果。
    // Result<_, Error> を使わない理由: Failure は Error 準拠が必要だが、
    // ここでは単純なエラー文字列で十分なため専用 enum にする。
    @available(iOS 18.0, macOS 15.0, *)
    private enum LanguagePairResolution {
        case resolved(Locale.Language, Locale.Language)
        case resolveFailure(String)
    }

    // 入力された source/target コードを supportedLanguages から解決して Locale.Language ペアを返す。
    // 候補が無い場合は失敗を返す（呼び出し側でエラー応答に変換）。
    @available(iOS 18.0, macOS 15.0, *)
    private func resolveLanguagePair(
        source: String,
        target: String
    ) async -> LanguagePairResolution {
        #if canImport(Translation)
        let availability = LanguageAvailability()
        let supported = await availability.supportedLanguages
        let sourceCandidates = candidateLanguages(code: source, from: supported)
        let targetCandidates = candidateLanguages(code: target, from: supported)
        guard let sourceLang = sourceCandidates.first else {
            return .resolveFailure("source language not in supportedLanguages: \(source)")
        }
        guard let targetLang = targetCandidates.first else {
            return .resolveFailure("target language not in supportedLanguages: \(target)")
        }
        return .resolved(sourceLang, targetLang)
        #else
        return .resolveFailure("Translation framework not importable")
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
        // 表示外しに加え、close() で NSWindow のライフサイクルを明示的に終了させる。
        // contentViewController を先に nil にしておかないと close 中に SwiftUI 側の view 解放が遅れることがある。
        window?.orderOut(nil)
        window?.contentViewController = nil
        window?.close()
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
