//
//  ShareViewController.swift
//  DualView Share Extension (iOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  Phase 2 では SLComposeServiceViewController テンプレートを最小限に保ち、
//  共有シートに DualView Translator が表示されること・受領テキストが取得できることだけ
//  確認できる状態にしている。
//  Phase 3 で UIHostingController + SwiftUI 並列翻訳ビューに置き換える予定。
//

import UIKit
import Social
import os.log

class ShareViewController: SLComposeServiceViewController {

    override func presentationAnimationDidFinish() {
        super.presentationAnimationDidFinish()
        // 受領テキストの存在のみログ出力（実テキストはユーザーコンテンツなのでログに残さない）
        let contentLength = (contentText ?? "").count
        let attachmentCount = (extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] })?.count ?? 0
        os_log(.debug, "DualView Share Ext (iOS) opened — text length: %{public}d, attachments: %{public}d",
               contentLength, attachmentCount)
    }

    override func isContentValid() -> Bool {
        // Phase 2 スケルトンでは常に Post を許可する。
        // Info.plist の NSExtensionActivationRule で URL / Web ページも受け付けるが、
        // contentText だけ見ると URL 共有時に空判定で Post が無効化されてしまうため、
        // attachment 経由のテキスト/URL を含めた validation は Phase 3 の SwiftUI 化と
        // 一緒に実装する。
        return true
    }

    override func didSelectPost() {
        // Phase 2 ではボタンが押されたタイミングを記録するだけで、実翻訳は行わない。
        // Phase 3 で SwiftUI ビューに置き換え、ここでは completeRequest を呼ぶ役割になる。
        os_log(.debug, "DualView Share Ext (iOS) post action invoked")
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    override func configurationItems() -> [Any]! {
        // Phase 3 で言語選択・エンジン選択の UI を返す予定。
        return []
    }
}
