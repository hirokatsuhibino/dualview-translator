---
name: Issue対応ワークフロー
description: GitHub Issueの調査→コメント→実装→コミット→pushを一連で実行
---

# Issue対応ワークフロー

## 概要

GitHub Issue番号を指定すると、調査→Issueコメント→実装→コミット→pushを一連で行う。

## 手順

### 1. Issue確認
```bash
gh issue view <番号>
```
- タイトル・本文・ラベル・コメントを確認
- 要件を把握

### 2. 調査・影響範囲の特定
- 関連するファイルを `Read` / `Grep` で調査
- 変更が必要なファイルを特定
- 破壊的変更がないか確認

### 3. Issueにコメント（対応方針）
```bash
gh issue comment <番号> --body "..."
```
- 対応方針・変更ファイル・懸念点をまとめる
- ユーザーの確認を待たず次に進む（ユーザーが「コメントして対応」と指示した場合）

### 4. 実装
- CLAUDE.mdのコーディングルールに従う
- コメントは日本語
- CSSセレクタは `.dvt-` プレフィックス
- XSS対策: `DVT.escapeHtml()` を通す
- UI文字列は `t('key')` で取得（i18n対応）
- 新規メッセージキーが必要な場合は `/skill i18n-add-key` を使用

### 5. コミット
```bash
git add <files> && git commit -m "$(cat <<'EOF'
<日本語のコミットメッセージ> (closes #<番号>)

<変更内容の説明>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```
- コミットメッセージは**必ず日本語**
- `closes #<番号>` でIssueを自動クローズ

### 6. Push
```bash
git push
```

## ルール

- コミットメッセージは日本語で書く
- `closes #N` をコミットメッセージに含めてIssueを自動クローズ
- 多言語対応が必要な変更は全11言語に追加（i18n-add-keyスキル活用）
- content scriptの変更は適切なモジュール（core/selection/page/bar）に配置
- background.jsのコンテキストメニュータイトルは `CONTEXT_MENU_TITLES` にも追加

## 変更対象ファイルの判断基準

| 変更内容 | 対象ファイル |
|---------|-------------|
| 共有状態・ユーティリティ | `content-core.js` |
| 選択翻訳パネル | `content-selection.js` |
| ページ/範囲/要素翻訳 | `content-page.js` |
| 翻訳バー・言語検出 | `content-bar.js` |
| 翻訳API・エンジン | `background.js` |
| ポップアップUI | `popup.html` + `popup.js` |
| UI文字列 | `i18n.js` |
| スタイル | `content.css` |
| 権限・スクリプト定義 | `manifest.json` |
