//
//  TranslationProviderGoogle.swift
//  DualView Share Extension (iOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  Google Translate 非公式エンドポイント (translate.googleapis.com) を Swift から呼び出す。
//  background.js の `fetchGoogleChunk` を移植したもの。
//
//  注意:
//  - 非公式エンドポイントのためレート制限・ブロックリスクあり（v1 のみで利用想定）
//  - チャンク分割は v1 ではしない（Share 経由で受け取る文は短文中心のため）
//  - APIキー不要・課金なし
//
//  Web Ext / macOS Share Ext と同一実装（Xcode 15+ folder reference の制約でファイル重複あり）。
//

import Foundation

// async URLSession (data(from:)) は iOS 15+ / macOS 12+ で利用可能。
// SharedTranslationView と整合させ、Share Extension の最低 OS と同じガードを付ける。
@available(iOS 15.0, macOS 12.0, *)
enum TranslationProviderGoogle {

    enum TranslationError: Error, LocalizedError {
        case http(statusCode: Int)
        case invalidResponse
        case network(underlying: Error)

        var errorDescription: String? {
            switch self {
            case .http(let code): return "Google HTTP \(code)"
            case .invalidResponse: return "Google returned an unexpected response"
            case .network(let underlying): return underlying.localizedDescription
            }
        }
    }

    struct Result {
        let translated: String
        let detectedLang: String?
    }

    /// 段落単位の原文と翻訳のペア。Web 版の `.dvt-orig` / `.dvt-trans` 並び表示と対応。
    struct ParagraphPair: Equatable {
        let original: String
        let translated: String
    }

    /// 複数段落翻訳の結果。`usedFallback = true` の場合はマーカー分割が失敗し、
    /// 全文を 1 ペアにまとめて返している。
    struct MultiResult {
        let pairs: [ParagraphPair]
        let detectedLang: String?
        let usedFallback: Bool
    }

    /// Share Extension からの翻訳呼び出し用 URLSession。
    /// ephemeral 設定 + URLCache 無効化により、ユーザーが共有したテキストを含む URL が
    /// ディスクキャッシュ・URL ログ等に残らないようにする（GET の `q=` クエリにテキストが入るため）。
    private static let ephemeralSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        return URLSession(configuration: config)
    }()

    /// Google Translate を呼び出して翻訳結果を返す。
    /// `session` を nil で呼ぶと共有テキストの漏れ対策として ephemeral session を使う。
    /// テスト等で差し替えたければ任意の URLSession を渡せる。
    static func translate(
        text: String,
        sourceLang: String = "auto",
        targetLang: String,
        session: URLSession? = nil
    ) async throws -> Result {
        if text.isEmpty {
            return Result(translated: "", detectedLang: nil)
        }
        guard let url = makeURL(text: text, sourceLang: sourceLang, targetLang: targetLang) else {
            throw TranslationError.invalidResponse
        }

        let resolvedSession = session ?? ephemeralSession
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await resolvedSession.data(from: url)
        } catch {
            throw TranslationError.network(underlying: error)
        }

        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw TranslationError.http(statusCode: http.statusCode)
        }

        return try parseResponse(data: data)
    }

    /// 複数段落を 1 リクエストで翻訳する。
    /// 段落間に per-request の UUID ベース・マーカーを挟んで送信し、レスポンスを同じマーカーで分割する。
    /// マーカー分割で個数が一致しなかった場合は、全文を 1 ペアにまとめた `MultiResult`
    /// を `usedFallback = true` で返す（呼び出し側で安全に表示できる）。
    static func translateParagraphs(
        paragraphs: [String],
        sourceLang: String = "auto",
        targetLang: String,
        session: URLSession? = nil
    ) async throws -> MultiResult {
        // 空入力は空結果
        if paragraphs.isEmpty {
            return MultiResult(pairs: [], detectedLang: nil, usedFallback: false)
        }

        // 1 段落のみの場合は通常翻訳に委譲（マーカーを混入させない）
        if paragraphs.count == 1 {
            let r = try await translate(
                text: paragraphs[0],
                sourceLang: sourceLang,
                targetLang: targetLang,
                session: session
            )
            return MultiResult(
                pairs: [ParagraphPair(original: paragraphs[0], translated: r.translated)],
                detectedLang: r.detectedLang,
                usedFallback: false
            )
        }

        // 入力段落と衝突しない per-request マーカーを生成
        let marker = Self.generateMarker(for: paragraphs)

        // 段落間にマーカーを挟んで 1 リクエストで送信
        let separator = "\n\n\(marker)\n\n"
        let joinedInput = paragraphs.joined(separator: separator)
        let r = try await translate(
            text: joinedInput,
            sourceLang: sourceLang,
            targetLang: targetLang,
            session: session
        )

        // レスポンスをマーカーで分割
        let splitTranslated = splitByMarker(r.translated, marker: marker)
        if splitTranslated.count == paragraphs.count {
            let pairs = zip(paragraphs, splitTranslated).map {
                ParagraphPair(original: $0, translated: $1)
            }
            return MultiResult(
                pairs: pairs,
                detectedLang: r.detectedLang,
                usedFallback: false
            )
        }

        // フォールバック: マーカーが消失/増殖した場合は全文を 1 ペアとして扱う。
        // 翻訳結果に残ったマーカー文字列だけは念のため除去しておく。
        let combinedOriginal = paragraphs.joined(separator: "\n\n")
        let cleaned = r.translated
            .replacingOccurrences(of: marker, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return MultiResult(
            pairs: [ParagraphPair(original: combinedOriginal, translated: cleaned)],
            detectedLang: r.detectedLang,
            usedFallback: true
        )
    }

    /// 段落間に挟む per-request のユニーク・マーカーを生成する。
    /// - UUID ベース（`@@DVTPARA_<hex 16>@@`）で、ASCII 英数字 + `@` + `_` のみで構成
    /// - Google が翻訳しないことを期待しつつ、共有テキスト本文と衝突しないことを保証する
    /// - 万一入力段落にマーカーが含まれていたら最大 5 回まで再生成し、最後の保険として
    ///   タイムスタンプ + 完全な UUID 付きの文字列を返す（実用上ありえないが安全側に倒す）
    private static func generateMarker(for paragraphs: [String]) -> String {
        for _ in 0..<5 {
            let uuid = UUID().uuidString.replacingOccurrences(of: "-", with: "")
            let candidate = "@@DVTPARA_\(uuid.prefix(16))@@"
            if !paragraphs.contains(where: { $0.contains(candidate) }) {
                return candidate
            }
        }
        // 最後の保険: タイムスタンプ + 完全な UUID
        let fullUuid = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        let ts = Int(Date().timeIntervalSince1970 * 1000)
        return "@@DVTPARA_\(fullUuid)_\(ts)@@"
    }

    /// マーカー区切りで分割し、各要素を trim する。
    static func splitByMarker(_ text: String, marker: String) -> [String] {
        return text
            .components(separatedBy: marker)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    }

    static func makeURL(text: String, sourceLang: String, targetLang: String) -> URL? {
        var components = URLComponents(string: "https://translate.googleapis.com/translate_a/single")
        components?.queryItems = [
            URLQueryItem(name: "client", value: "gtx"),
            URLQueryItem(name: "sl", value: sourceLang),
            URLQueryItem(name: "tl", value: targetLang),
            URLQueryItem(name: "dt", value: "t"),
            URLQueryItem(name: "q", value: text),
        ]
        return components?.url
    }

    /// Google のレスポンスは `[ [[translated, original, ...], ...], ..., detectedLang, ... ]` という
    /// 緩い JSON 配列。非公式 API のため、構造が崩れても可能な限り値が取れる形でパースする。
    static func parseResponse(data: Data) throws -> Result {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [Any] else {
            throw TranslationError.invalidResponse
        }
        let segments = (json.first as? [Any]) ?? []
        let translated = segments
            .compactMap { ($0 as? [Any])?.first as? String }
            .joined()

        // Google のレスポンス構造が変化した場合、segments パースが空文字列になりがち。
        // 入力が非空のときに翻訳結果が空なら、構造不一致として明示的にエラーにする。
        // （呼び出し側では空入力時は parseResponse まで到達しない）
        if translated.isEmpty {
            throw TranslationError.invalidResponse
        }

        let detectedLang: String? = json.count > 2 ? (json[2] as? String) : nil

        return Result(translated: translated, detectedLang: detectedLang)
    }
}
