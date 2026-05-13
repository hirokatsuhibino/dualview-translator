//
//  SharedTranslationView.swift
//  DualView Share Extension (iOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  Share Extension の SwiftUI ビュー。
//  Web 版（ブラウザ拡張本体）と同じ「段落単位の dual view」UX を提供する:
//    - 入力テキストを段落分割
//    - 1 リクエストで翻訳
//    - 原文／翻訳のペアを WKWebView 上に並べて表示
//    - 翻訳側に左縦線（border-left）を付けて視覚的に区別
//  ローディング・エラー・ヘッダー・コピーボタンは SwiftUI のまま保持。
//
//  Web Ext / macOS Share Ext と同一実装（folder reference 制約でファイル重複あり）。
//

import SwiftUI
import os.log

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@available(iOS 15.0, macOS 12.0, *)
struct SharedTranslationView: View {
    let originalText: String
    let onClose: () -> Void

    @State private var pairs: [TranslationProviderGoogle.ParagraphPair] = []
    @State private var isLoading: Bool = true
    @State private var errorMessage: String?
    @State private var copiedTimestamp: Date?

    private let targetLang: String

    init(originalText: String, onClose: @escaping () -> Void) {
        self.originalText = originalText
        self.onClose = onClose
        // App Group ミラーから targetLang を読む（未設定なら "ja"）
        self.targetLang = ShareAppGroup.defaults?
            .string(forKey: ShareAppGroup.Keys.targetLang) ?? "ja"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            dualViewBlock
            if !isLoading && errorMessage == nil && !pairs.isEmpty {
                HStack {
                    Spacer()
                    copyButton
                }
            }
        }
        .padding(16)
        .frame(minWidth: 320, minHeight: 320)
        .task {
            await runTranslation()
        }
    }

    // ─── ヘッダ ────────────────────────────────────────────────────
    private var header: some View {
        HStack {
            Text(I18N.t("dualviewTitle"))
                .font(.headline)
            Spacer()
            Button(action: onClose) {
                Text(I18N.t("close"))
            }
            .keyboardShortcut(.escape, modifiers: [])
            .buttonStyle(.bordered)
        }
    }

    // ─── dual view ブロック ────────────────────────────────────────
    private var dualViewBlock: some View {
        Group {
            if isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                    Text(I18N.t("translating"))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .padding(8)
            } else if let error = errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
            } else {
                DualViewRenderer(pairs: pairs)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(secondaryBackground)
                    .cornerRadius(6)
            }
        }
    }

    // ─── コピーボタン ──────────────────────────────────────────────
    private var copyButton: some View {
        Button(action: copyTranslation) {
            Text(copyButtonLabel)
        }
        .buttonStyle(.bordered)
        .disabled(joinedTranslated.isEmpty)
    }

    private var copyButtonLabel: String {
        // 「コピー済」を 2 秒間だけ表示してフィードバックする
        if let stamp = copiedTimestamp, Date().timeIntervalSince(stamp) < 2.0 {
            return I18N.t("copied")
        }
        return I18N.t("copyBtn")
    }

    /// 全段落の翻訳結果を `\n\n` 区切りで連結したもの。コピー機能で使う。
    private var joinedTranslated: String {
        pairs.map { $0.translated }.joined(separator: "\n\n")
    }

    // ─── 翻訳実行 ──────────────────────────────────────────────────
    private func runTranslation() async {
        if originalText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            isLoading = false
            errorMessage = I18N.t("shareEmpty")
            return
        }
        let paragraphs = ParagraphSplitter.split(originalText)
        // 万一全てが空白なら現状維持で空エラーを返す
        if paragraphs.isEmpty {
            isLoading = false
            errorMessage = I18N.t("shareEmpty")
            return
        }
        do {
            let result = try await TranslationProviderGoogle.translateParagraphs(
                paragraphs: paragraphs,
                sourceLang: "auto",
                targetLang: targetLang
            )
            if result.usedFallback {
                // マーカー分割が崩れた場合は呼び出し側でログ出力（UI は 1 ブロック表示にフォールバック）
                os_log(.info, "Share translate: paragraph marker fallback applied")
            }
            await MainActor.run {
                self.pairs = result.pairs
                self.isLoading = false
            }
        } catch {
            os_log(.error, "Share translate failed: %{public}@", String(describing: error))
            await MainActor.run {
                errorMessage = "\(I18N.t("error")) \(error.localizedDescription)"
                isLoading = false
            }
        }
    }

    // ─── コピー処理 ────────────────────────────────────────────────
    private func copyTranslation() {
        let combined = joinedTranslated
        guard !combined.isEmpty else { return }
        #if os(iOS)
        UIPasteboard.general.string = combined
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(combined, forType: .string)
        #endif
        copiedTimestamp = Date()
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            await MainActor.run {
                if let stamp = copiedTimestamp, Date().timeIntervalSince(stamp) >= 2.0 {
                    copiedTimestamp = nil
                }
            }
        }
    }

    // ─── プラットフォーム差吸収 ────────────────────────────────────
    private var secondaryBackground: Color {
        #if os(iOS)
        return Color(uiColor: .secondarySystemBackground)
        #elseif os(macOS)
        return Color(nsColor: .controlBackgroundColor)
        #else
        return Color.gray.opacity(0.1)
        #endif
    }
}
