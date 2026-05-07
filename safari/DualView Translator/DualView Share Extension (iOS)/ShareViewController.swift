//
//  ShareViewController.swift
//  DualView Share Extension (iOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  共有シートから受け取ったテキスト/URL を SwiftUI 並列翻訳ビュー (SharedTranslationView) に
//  渡して表示する。Phase 2 のテンプレ (SLComposeServiceViewController) を Phase 3b で
//  UIViewController + UIHostingController ベースに置き換えた。
//

import UIKit
import SwiftUI
import os.log
import UniformTypeIdentifiers

@available(iOS 15.0, *)
class ShareViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        // テキスト/URL 取得は async（NSItemProvider の callback API を Continuation で包む）。
        // 取得完了までは空ビューのまま、完了したら SwiftUI を mount する。
        Task { [weak self] in
            guard let self else { return }
            let originalText = await self.extractSharedText()
            await MainActor.run { self.mountSwiftUI(originalText: originalText) }
        }
    }

    // 取得した共有テキストで SwiftUI ビューを mount する。
    private func mountSwiftUI(originalText: String) {
        os_log(.debug, "DualView Share Ext (iOS) opened — text length: %{public}d", originalText.count)

        let host = UIHostingController(rootView: SharedTranslationView(
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
        host.didMove(toParent: self)
    }

    // 共有シートから渡された inputItems からテキスト/URL を最初に見つかった順で抽出する。
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
/// 失敗時は呼び出し側の運用が単純になるよう nil を返すが、原因追跡のために error は os_log に落とす。
fileprivate func loadProviderText(_ provider: NSItemProvider, type identifier: String) async -> String? {
    guard provider.hasItemConformingToTypeIdentifier(identifier) else { return nil }
    return await withCheckedContinuation { continuation in
        provider.loadItem(forTypeIdentifier: identifier, options: nil) { item, error in
            if let error = error {
                // error オブジェクト自体はユーザーコンテンツを含まないので %{public}@ で出してよい。
                os_log(.error, "loadItem failed for %{public}@: %{public}@",
                       identifier, String(describing: error))
                continuation.resume(returning: nil)
                return
            }
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
