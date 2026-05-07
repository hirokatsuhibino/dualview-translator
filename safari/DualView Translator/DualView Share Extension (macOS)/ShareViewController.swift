//
//  ShareViewController.swift
//  DualView Share Extension (macOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  Phase 2 では Xcode 自動生成の xib ベースの NSViewController を残しつつ、
//  受領テキスト/URL の存在をログ出力するだけのスケルトンにしている。
//  Phase 3 で NSHostingController + SwiftUI 並列翻訳ビューに置き換える予定。
//

import Cocoa
import os.log

class ShareViewController: NSViewController {

    override var nibName: NSNib.Name? {
        return NSNib.Name("ShareViewController")
    }

    override func loadView() {
        super.loadView()
        // 受領テキスト/URL/Web ページの個数のみログ出力。
        // 実テキストはユーザーコンテンツなのでログに残さない（Phase 4 のレビューでも問題にならないように）。
        let attachmentCount = (extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] })?.count ?? 0
        os_log(.debug, "DualView Share Ext (macOS) opened — attachments: %{public}d", attachmentCount)
    }

    @IBAction func send(_ sender: AnyObject?) {
        // Phase 3 で実翻訳が完了した後に呼ばれる予定。
        // Phase 2 では即 completeRequest して空のレスポンスを返す。
        os_log(.debug, "DualView Share Ext (macOS) send action invoked")
        let outputItem = NSExtensionItem()
        extensionContext?.completeRequest(returningItems: [outputItem], completionHandler: nil)
    }

    @IBAction func cancel(_ sender: AnyObject?) {
        let cancelError = NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError, userInfo: nil)
        extensionContext?.cancelRequest(withError: cancelError)
    }
}
