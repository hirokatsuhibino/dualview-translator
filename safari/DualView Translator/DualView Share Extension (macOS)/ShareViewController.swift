//
//  ShareViewController.swift
//  DualView Share Extension (macOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  共有メニューから受け取ったテキスト/URL を SwiftUI 並列翻訳ビュー (SharedTranslationView) に
//  渡して表示する。Phase 2 のテンプレ (xib + IBAction) を Phase 3b で
//  NSViewController + NSHostingController ベースに置き換えた。
//

import Cocoa
import SwiftUI
import os.log
import UniformTypeIdentifiers

@available(macOS 12.0, *)
class ShareViewController: NSViewController {

    override func loadView() {
        // xib を使わず空の NSView を初期 view として用意し、後で hosting controller を埋め込む。
        view = NSView(frame: NSRect(x: 0, y: 0, width: 480, height: 480))
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        Task { [weak self] in
            guard let self else { return }
            let originalText = await self.extractSharedText()
            await MainActor.run { self.mountSwiftUI(originalText: originalText) }
        }
    }

    // 取得した共有テキストで SwiftUI ビューを mount する。
    private func mountSwiftUI(originalText: String) {
        os_log(.debug, "DualView Share Ext (macOS) opened — text length: %{public}d", originalText.count)

        let host = NSHostingController(rootView: SharedTranslationView(
            originalText: originalText,
            onClose: { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            }
        ))

        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    // 共有メニューから渡された inputItems からテキスト/URL を最初に見つかった順で抽出する。
    // 優先度: attributedContentText > public.plain-text > public.url
    private func extractSharedText() async -> String {
        guard let inputItems = extensionContext?.inputItems as? [NSExtensionItem] else { return "" }
        for item in inputItems {
            if let attr = item.attributedContentText?.string,
               !attr.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return attr
            }
            for provider in item.attachments ?? [] {
                if let s = await loadProviderText(provider, type: UTType.plainText.identifier) {
                    return s
                }
                if let s = await loadProviderText(provider, type: UTType.url.identifier) {
                    return s
                }
            }
        }
        return ""
    }
}

/// `NSItemProvider.loadItem(forTypeIdentifier:options:)` の Continuation ラッパー。
/// 同名 extension が重複定義されないよう fileprivate にしてある。
fileprivate func loadProviderText(_ provider: NSItemProvider, type identifier: String) async -> String? {
    guard provider.hasItemConformingToTypeIdentifier(identifier) else { return nil }
    return await withCheckedContinuation { continuation in
        provider.loadItem(forTypeIdentifier: identifier, options: nil) { item, _ in
            if let str = item as? String, !str.isEmpty {
                continuation.resume(returning: str)
            } else if let url = item as? URL {
                continuation.resume(returning: url.absoluteString)
            } else if let data = item as? Data, let str = String(data: data, encoding: .utf8) {
                continuation.resume(returning: str)
            } else {
                continuation.resume(returning: nil)
            }
        }
    }
}
