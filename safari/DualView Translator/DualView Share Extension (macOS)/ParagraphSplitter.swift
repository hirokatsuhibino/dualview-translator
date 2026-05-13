//
//  ParagraphSplitter.swift
//  DualView Share Extension (macOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  Share Extension に渡されたテキストを「段落」単位に分割するユーティリティ。
//  Web 版（拡張本体）が DOM 要素（≒段落）単位で原文／翻訳を並べているのと同じ粒度を
//  iOS / macOS の Share Extension でも再現するために使う。
//
//  仕様:
//   - 改行コード差を吸収（CRLF / CR を LF へ正規化）
//   - 連続改行（\n が 2 つ以上）を段落区切りとみなす
//   - 各段落は前後の空白・改行を trim
//   - 空段落は除外
//
//  Web Ext / macOS Share Ext と同一実装（folder reference 制約でファイル重複あり）。
//

import Foundation

enum ParagraphSplitter {

    /// テキストを段落配列へ分割する。
    /// 空文字や空白のみの入力では空配列を返す。
    static func split(_ text: String) -> [String] {
        // 改行コードを LF に正規化
        let normalized = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")

        // \n\n（連続 2 つ以上）を段落区切りに使うため、まず 3 つ以上を 2 つに畳む
        // （components(separatedBy: "\n\n") は \n\n\n を ["", ""] と扱うため、
        //  空段落除去だけでも十分だが、可読性のため正規化する）
        let collapsed = collapseBlankLines(normalized)

        return collapsed
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    /// `\n` が 3 つ以上連続する箇所を `\n\n` に正規表現で 1-pass 置換する。
    private static func collapseBlankLines(_ text: String) -> String {
        // `\n{3,}` を `\n\n` に 1-pass で置換（ループより効率的）
        return text.replacingOccurrences(
            of: "\\n{3,}",
            with: "\n\n",
            options: .regularExpression
        )
    }
}
