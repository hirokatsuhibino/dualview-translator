//
//  ShareAppGroup.swift
//  DualView Share Extension (iOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  Share Extension 向けの App Group UserDefaults 読み取り専用ヘルパー。
//  Web Ext 側 (Shared (Extension)/SharedSettings.swift) と App Group ID / キー名は同じだが、
//  Xcode 15+ の fileSystemSynchronizedGroups 仕様により Share Ext は自フォルダ内のファイルしか
//  ビルド対象にできないため、構造的に同じヘルパーを Share Ext 側にも置いている（コード重複）。
//
//  メンテナンス上の重複（iOS Share Ext / macOS Share Ext / Web Ext SharedSettings.swift）は
//  将来 Phase で `Shared (Share Extension)/` フォルダを Xcode で正規追加して解消する想定。
//

import Foundation

enum ShareAppGroup {
    static let id = "group.jp.co.orangesoft.dualview-translator"

    /// App Group の UserDefaults。entitlements 不整合時は nil。
    static var defaults: UserDefaults? {
        UserDefaults(suiteName: id)
    }

    /// Web Ext 側 SharedSettings.Keys と同期している必要がある（書き込み元は Web Ext）。
    enum Keys {
        static let uiLang = "uiLang"
        static let targetLang = "targetLang"
    }
}
