---
name: Issue対応ワークフロー
description: GitHub Issueの調査→実装→コミット→pushを一連で実行
user_invocable: true
---

# Issue対応ワークフロー

## 概要

GitHub Issue番号を指定すると、調査→実装→コミット→pushを一連で行う。

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

### 3. 実装
- CLAUDE.mdのコーディングルールに従って実装する
- 新規メッセージキーが必要な場合は `/skill i18n-add-key` を使用

### 4. テスト
- `npm test` で全テストがパスすることを確認

### 5. コミット & Push
```bash
git add <files>
git commit -m "$(cat <<'EOF'
feat: <日本語の説明> (closes #<番号>)
EOF
)"
git push
```

### 6. Issueにコメント
`/skill issue-comment` を使って実装詳細をコメント投稿する。

## 変更対象ファイルの判断基準

| 変更内容 | 対象ファイル |
|---------|-------------|
| 共有状態・ユーティリティ | `content-core.js` |
| 選択翻訳パネル | `content-selection.js` |
| ページ/範囲/要素翻訳 | `content-page.js` |
| 翻訳バー・言語検出 | `content-bar.js` |
| 翻訳API・エンジン | `background.js` |
| ポップアップUI | `popup.html` + `popup-init.js` + `popup.js` |
| UI文字列 | `i18n.js` |
| スタイル | `content.css` |
| 権限・スクリプト定義 | `manifest.json` |
