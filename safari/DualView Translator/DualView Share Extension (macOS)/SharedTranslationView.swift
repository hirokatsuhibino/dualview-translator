//
//  SharedTranslationView.swift
//  DualView Share Extension (macOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  Share Extension の SwiftUI 並列翻訳ビュー（iOS / macOS で同一実装）。
//  原文を上、訳文を下に表示し、コピー / 閉じるボタンを提供する。
//  v1 は Google Translate のみ・要約なし・targetLang は App Group から取得。
//
//  Web Ext / macOS Share Ext と同一実装（folder reference 制約で重複）。
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

    @State private var translatedText: String = ""
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
            originalBlock
            translatedBlock
            Spacer(minLength: 0)
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

    // ─── 原文ブロック ──────────────────────────────────────────────
    private var originalBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(I18N.t("original"))
                .font(.caption)
                .foregroundColor(.secondary)
            ScrollView {
                Text(originalText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(maxHeight: 120)
            .padding(8)
            .background(secondaryBackground)
            .cornerRadius(6)
        }
    }

    // ─── 訳文ブロック ──────────────────────────────────────────────
    private var translatedBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(I18N.t("translated"))
                .font(.caption)
                .foregroundColor(accentOrange)
            if isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                    Text(I18N.t("translating"))
                        .foregroundColor(.secondary)
                }
                .padding(8)
            } else if let error = errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .padding(8)
            } else {
                ScrollView {
                    Text(translatedText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .frame(maxHeight: 200)
                .padding(8)
                .background(accentOrange.opacity(0.08))
                .cornerRadius(6)
                HStack {
                    Spacer()
                    copyButton
                }
            }
        }
    }

    // ─── コピーボタン ──────────────────────────────────────────────
    private var copyButton: some View {
        Button(action: copyTranslation) {
            Text(copyButtonLabel)
        }
        .buttonStyle(.bordered)
        .disabled(translatedText.isEmpty)
    }

    private var copyButtonLabel: String {
        // 「コピー済」を 2 秒間だけ表示してフィードバックする
        if let stamp = copiedTimestamp, Date().timeIntervalSince(stamp) < 2.0 {
            return I18N.t("copied")
        }
        return I18N.t("copyBtn")
    }

    // ─── 翻訳実行 ──────────────────────────────────────────────────
    private func runTranslation() async {
        if originalText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            isLoading = false
            errorMessage = I18N.t("shareEmpty")
            return
        }
        do {
            let result = try await TranslationProviderGoogle.translate(
                text: originalText,
                sourceLang: "auto",
                targetLang: targetLang
            )
            await MainActor.run {
                translatedText = result.translated
                isLoading = false
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
        guard !translatedText.isEmpty else { return }
        #if os(iOS)
        UIPasteboard.general.string = translatedText
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(translatedText, forType: .string)
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
    private var accentOrange: Color {
        Color(red: 0.96, green: 0.65, blue: 0.14)
    }

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
