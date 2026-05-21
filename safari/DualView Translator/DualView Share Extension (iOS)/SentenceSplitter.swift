//
//  SentenceSplitter.swift
//  DualView Share Extension (iOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  テキストを文単位に分割するユーティリティ。
//  Web 拡張本体の `DVT.splitSentences()`（content-core.js）と同じ規則:
//
//   - CJK の文末記号（`。` / `．` / `！` / `？`）の直後で常に分割
//     （読点 `、` は文の途切れではないので分割対象に含めない）
//     直後に閉じ括弧（`」` `』` `）` 等）が続く場合はまとめてから分割
//   - Latin の `.!?` は、直後が空白＋大文字相当（A-Z / ひらがな / カタカナ / 漢字）
//     の場合のみ分割。略語（Mr. e.g.）や小数（3.14）での誤分割を抑制
//   - 文末の句点も保持する
//   - 前後空白を trim、空要素を除外
//
//  iOS / macOS Share Ext で共有される同一実装（folder reference 制約でファイル重複あり）。
//

import Foundation

enum SentenceSplitter {

    /// テキストを文配列に分割する。空入力や非文字列相当は空配列。
    static func split(_ text: String) -> [String] {
        guard !text.isEmpty else { return [] }

        // 後続文字の参照を O(1) にするため配列化（Swift String の index は重い）
        let chars = Array(text)
        let len = chars.count
        var parts: [String] = []
        var buf = ""

        var i = 0
        while i < len {
            let c = chars[i]
            buf.append(c)

            if isCJKTerminator(c) {
                // CJK 文末記号: 直後の閉じ括弧類はまとめて取り込む
                while i + 1 < len, isClosingBracket(chars[i + 1]) {
                    i += 1
                    buf.append(chars[i])
                }
                appendTrimmed(&parts, buf)
                buf = ""
            } else if c == "." || c == "!" || c == "?" {
                // Latin: 直後の文脈で判定
                let next = i + 1 < len ? chars[i + 1] : nil
                if next == nil {
                    // 文末
                    appendTrimmed(&parts, buf)
                    buf = ""
                } else if isWhitespace(next!) {
                    // 後続の非空白文字を見て、大文字相当なら区切る
                    var j = i + 1
                    while j < len, isWhitespace(chars[j]) { j += 1 }
                    if j < len, isSentenceStart(chars[j]) {
                        appendTrimmed(&parts, buf)
                        buf = ""
                    }
                }
            }
            i += 1
        }

        appendTrimmed(&parts, buf)
        return parts
    }

    // MARK: - Helpers

    private static func appendTrimmed(_ parts: inout [String], _ s: String) {
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            parts.append(trimmed)
        }
    }

    private static func isCJKTerminator(_ c: Character) -> Bool {
        return c == "。" || c == "．" || c == "！" || c == "？"
    }

    /// 一般的な閉じ括弧・引用符（CJK / Latin）。
    /// `isClosingBracket` 呼び出しごとに再生成しないよう静的に保持する。
    private static let closingBrackets: Set<Character> = [
        "）", "｝", "］", "」", "』", ")", "]", "}", "\"", "'", "”", "’",
    ]

    private static func isClosingBracket(_ c: Character) -> Bool {
        return closingBrackets.contains(c)
    }

    private static func isWhitespace(_ c: Character) -> Bool {
        return c.isWhitespace
    }

    /// 文頭らしい文字か判定する。Latin 大文字 / ひらがな / カタカナ / 漢字を文頭として扱う。
    private static func isSentenceStart(_ c: Character) -> Bool {
        if c.isASCII, c.isLetter, c.isUppercase {
            return true
        }
        // CJK 系の Unicode スカラ範囲で判定
        for scalar in c.unicodeScalars {
            let v = scalar.value
            // ひらがな
            if (0x3040...0x309F).contains(v) { return true }
            // カタカナ
            if (0x30A0...0x30FF).contains(v) { return true }
            // CJK 統合漢字
            if (0x4E00...0x9FFF).contains(v) { return true }
        }
        return false
    }
}
