//
//  TranslationProviderGoogle.swift
//  DualView Share Extension (macOS)
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
