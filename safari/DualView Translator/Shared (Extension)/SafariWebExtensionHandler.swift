//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Copyright (c) Orangesoft Inc.
//

import SafariServices
import os.log
// Translation framework は iOS 17.4+ / macOS 14.4+ にしか存在しないため、
// strong link すると iOS 15 / macOS 10.14 など古い OS で dyld が拡張をロードできなくなる。
// @_weakLinked により実体不在時もロードを許可し、availability ガードで実呼び出しを抑止する。
#if canImport(Translation)
@_weakLinked import Translation
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
            let sourceLang = Locale.Language(identifier: source)
            let targetLang = Locale.Language(identifier: target)
            let status = await availability.status(from: sourceLang, to: targetLang)

            let statusString: String
            switch status {
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
            ]
            #else
            return ["ok": false, "error": "Translation framework not importable"]
            #endif
        } else {
            return ["ok": false, "error": "Requires iOS 18+ / macOS 15+ for programmatic LanguageAvailability"]
        }
    }

}
