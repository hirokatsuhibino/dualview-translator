//
//  DualViewRenderer.swift
//  DualView Share Extension (macOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  原文・翻訳の段落ペアを WKWebView 上に「Web 版と同じ見た目」で描画する
//  SwiftUI ラッパー。ブラウザ拡張本体の `content.css` の .dvt-orig / .dvt-trans を
//  Share Extension 向けに最小抽出して埋め込んでいる。
//
//  - iOS: UIViewRepresentable で WKWebView を SwiftUI に橋渡し
//  - macOS: NSViewRepresentable で同じ役割
//  - JavaScript は無効化（XSS リスクを下げる）
//  - 背景は透過（SwiftUI 側の背景がそのまま見える）
//  - テーマは `@media (prefers-color-scheme)` でシステム追従
//
//  Web Ext / macOS Share Ext と同一実装（folder reference 制約でファイル重複あり）。
//

import SwiftUI
import WebKit

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@available(iOS 15.0, macOS 12.0, *)
struct DualViewRenderer: View {
    let pairs: [TranslationProviderGoogle.ParagraphPair]

    /// 文ペア表示（原文1→訳1→原文2→訳2…）を有効にする訳文長の閾値。
    /// Web 拡張側（content-page.js の PAIR_MIN_TRANS_LENGTH）と一致させている。
    static let pairMinTransLength: Int = 80

    var body: some View {
        DualViewWebView(html: Self.makeHTML(pairs: pairs))
    }

    /// HTML を組み立てる。Swift コードからテスト可能にするため static にしている。
    static func makeHTML(pairs: [TranslationProviderGoogle.ParagraphPair]) -> String {
        let body = pairs.map { pair in
            renderPair(pair)
        }.joined(separator: "\n")

        // 共有テキストは任意の文字列が入りうるため、XSS 対策として
        // <head> 内で CSP を宣言しスクリプト・外部リソース読み込みを止める。
        return """
        <!doctype html>
        <html>
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
        <style>
        :root { color-scheme: light dark; }
        html, body {
          margin: 0;
          padding: 0;
          background: transparent;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
          font-size: 16px;
          line-height: 1.55;
          padding: 12px 14px;
          color: #1c1c1e;
          -webkit-text-size-adjust: 100%;
        }
        .dvt-pair {
          margin-bottom: 16px;
        }
        .dvt-pair:last-child {
          margin-bottom: 0;
        }
        .dvt-orig {
          display: block;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .dvt-trans {
          display: block;
          margin-top: 6px;
          padding-left: 10px;
          border-left: 3px solid #f5a623;
          white-space: pre-wrap;
          word-break: break-word;
        }
        /* 文ペア表示（長文段落向け）。原文・訳文を文単位で交互に並べる */
        .dvt-pair-paired {
          padding: 0;
        }
        .dvt-sent {
          margin-bottom: 8px;
        }
        .dvt-sent:last-child {
          margin-bottom: 0;
        }
        .dvt-sent-orig {
          display: block;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .dvt-sent-trans {
          display: block;
          margin-top: 3px;
          padding-left: 8px;
          border-left: 2px solid rgba(245, 166, 35, 0.6);
          font-size: 0.95em;
          opacity: 0.9;
          white-space: pre-wrap;
          word-break: break-word;
        }
        @media (prefers-color-scheme: dark) {
          body { color: #f2f2f7; }
          .dvt-trans { border-left-color: #f5a623; }
          .dvt-sent-trans { border-left-color: rgba(245, 166, 35, 0.6); }
        }
        </style>
        </head>
        <body>
        \(body)
        </body>
        </html>
        """
    }

    /// 段落 1 件分のペア HTML を生成する。
    /// 訳文長が閾値以上で、原文・訳文を文分割した結果が両側 2 文以上かつ同数なら
    /// 文単位のサブペアを内側に並べる。それ以外は従来通りの単一ペア表示。
    private static func renderPair(_ pair: TranslationProviderGoogle.ParagraphPair) -> String {
        let translatedTrimmed = pair.translated.trimmingCharacters(in: .whitespacesAndNewlines)

        if translatedTrimmed.count >= pairMinTransLength {
            let origSents = SentenceSplitter.split(pair.original)
            let transSents = SentenceSplitter.split(pair.translated)
            if origSents.count >= 2 && origSents.count == transSents.count {
                let inner = zip(origSents, transSents).map { o, t in
                    """
                      <div class="dvt-sent">
                        <div class="dvt-sent-orig">\(escapeHTML(o))</div>
                        <div class="dvt-sent-trans">\(escapeHTML(t))</div>
                      </div>
                    """
                }.joined(separator: "\n")
                return """
                <div class="dvt-pair dvt-pair-paired">
                \(inner)
                </div>
                """
            }
        }

        return """
        <div class="dvt-pair">
          <div class="dvt-orig">\(escapeHTML(pair.original))</div>
          <div class="dvt-trans">\(escapeHTML(pair.translated))</div>
        </div>
        """
    }

    /// HTML 用エスケープ。共有テキストは untrusted 入力として扱う。
    static func escapeHTML(_ s: String) -> String {
        var r = s
        r = r.replacingOccurrences(of: "&", with: "&amp;")
        r = r.replacingOccurrences(of: "<", with: "&lt;")
        r = r.replacingOccurrences(of: ">", with: "&gt;")
        r = r.replacingOccurrences(of: "\"", with: "&quot;")
        r = r.replacingOccurrences(of: "'", with: "&#39;")
        return r
    }
}

#if os(iOS)

@available(iOS 15.0, *)
private struct DualViewWebView: UIViewRepresentable {
    let html: String

    func makeUIView(context: Context) -> WKWebView {
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = false

        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences = prefs
        // 共有テキストがディスクキャッシュに残らないよう、データストアは ephemeral にする
        config.websiteDataStore = .nonPersistent()

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.alwaysBounceVertical = true
        // 共有 Extension は外部 URL を開かない（Safari 等への遷移を抑止）
        webView.navigationDelegate = context.coordinator
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        uiView.loadHTMLString(html, baseURL: nil)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        // 最初の HTML ロード以外（リンククリック等）は遮断する
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if navigationAction.navigationType == .linkActivated {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}

#elseif os(macOS)

@available(macOS 12.0, *)
private struct DualViewWebView: NSViewRepresentable {
    let html: String

    func makeNSView(context: Context) -> WKWebView {
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = false

        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences = prefs
        config.websiteDataStore = .nonPersistent()

        let webView = WKWebView(frame: .zero, configuration: config)
        // macOS の WKWebView は背景を透過するために KVC で drawsBackground を false にする
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        nsView.loadHTMLString(html, baseURL: nil)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if navigationAction.navigationType == .linkActivated {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}

#endif
