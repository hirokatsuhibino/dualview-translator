//
//  SharedSettings.swift
//  Shared (Extension)
//
//  Copyright (c) Orangesoft Inc.
//
//  App Group の UserDefaults を介して Web Extension の設定値を共有する。
//  Web Extension が `chrome.storage.local.set` で書き込んだ値を、Native Messaging
//  経由で受け取り、ここに保存する。Share Extension など他ターゲットからも
//  同じキーで読み出せる（Phase 3b 以降で Share Extension 側のビルド対象にも追加予定）。
//
//  Issue #89 Phase 1（PR #183）で SafariWebExtensionHandler.swift に inline 実装した
//  ロジックを Phase 3a で本ファイルに切り出した。
//

import Foundation

enum SharedSettings {

    // 4 つの entitlements ファイルすべてに設定済みの App Group ID。
    // 値変更時は entitlements 側も同期更新すること。
    static let appGroupID = "group.jp.co.orangesoft.dualview-translator"

    // App Group UserDefaults。シミュレータ等で suite 取得失敗時は nil。
    static var shared: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    // Web Extension とミラーするキー一覧。
    // ここを増やしたら background.js 側の MIRRORED_KEYS も同期して更新する。
    enum Keys {
        // ユーザー設定
        static let targetLang = "targetLang"
        static let uiLang = "uiLang"
        static let dvtTheme = "dvtTheme"

        // 翻訳エンジン
        static let translateEngine = "translateEngine"
        static let deeplApiKey = "deeplApiKey"

        // 要約エンジン
        static let llmEngine = "llmEngine"
        static let claudeApiKey = "claudeApiKey"
        static let geminiApiKey = "geminiApiKey"

        // background.js の MIRRORED_KEYS と完全一致させる allowlist。
        // 想定外キーが App Group に書き込まれないよう Native ハンドラで検証する用。
        static let mirrorAllowed: Set<String> = [
            targetLang, uiLang, dvtTheme,
            translateEngine, deeplApiKey,
            llmEngine, claudeApiKey, geminiApiKey,
        ]
    }

    // UserDefaults の plist 互換型のみ許可。Web Ext 側は通常 String / Bool / Number しか送らないが、
    // 想定外型（例: メモリ上の関数オブジェクトなど）が来た場合に備えて防御的にチェックする。
    static func isValidUserDefaultsValue(_ value: Any) -> Bool {
        switch value {
        case is String, is NSNumber, is Bool,
             is [Any], is [String: Any],
             is Data, is Date:
            return true
        default:
            return false
        }
    }

    // mirrorSettings リクエストを反映する。
    // - allowlist 外のキーは無視（rejected に記録）
    // - 値が NSNull の場合は当該キーを削除（Web Ext 側で undefined にした場合に備えて）
    // - plist 非互換の値も rejected として除外する
    // 戻り値: (適用件数, 拒否されたキー一覧)
    //
    // UserDefaults は呼び出し側で取得して渡す。これにより
    // (1) `shared` 取得（= UserDefaults(suiteName:) 生成）が caller / callee で二重に走らない、
    // (2) caller 側で nil を明示的なエラーレスポンスに変換できる、
    // という 2 点を達成する。
    @discardableResult
    static func applyMirroredEntries(_ entries: [String: Any], to defaults: UserDefaults) -> (applied: Int, rejectedKeys: [String]) {
        var applied = 0
        var rejectedKeys: [String] = []
        for (key, value) in entries {
            guard Keys.mirrorAllowed.contains(key) else {
                rejectedKeys.append(key)
                continue
            }
            if value is NSNull {
                defaults.removeObject(forKey: key)
                applied += 1
            } else if isValidUserDefaultsValue(value) {
                defaults.set(value, forKey: key)
                applied += 1
            } else {
                rejectedKeys.append(key)
            }
        }
        return (applied, rejectedKeys)
    }
}
