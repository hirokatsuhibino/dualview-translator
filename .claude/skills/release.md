---
name: リリース
description: バージョン更新→zip作成→コミット→pushの一連のリリースフローを実行
user_invocable: true
---

# リリーススキル

## 概要

バージョンを上げて、公開用zipを作成し、コミット＆pushする一連のリリースフローを実行する。

## 手順

### 1. 現在のバージョンを確認

```bash
node -p "require('./manifest.json').version"
```

### 2. バージョンを更新

パッチバージョンを上げる（例: 1.2.2 → 1.2.3）。メジャー/マイナー変更はユーザーに確認する。

更新対象:
- `manifest.json` の `version`
- `package.json` の `version`

### 3. リリースノート更新

`docs/RELEASE_NOTES.md` の先頭（`## v1.x.x` の前）に新バージョンのセクションを追加する。

- 前回リリースからの `git log` を確認して変更内容をまとめる
- フォーマットは既存エントリに合わせる（`## v<VERSION>（YYYY-MM-DD）` + カテゴリ別リスト）
- カテゴリ: `新機能` / `改善` / `修正` を内容に応じて使い分ける

### 4. zip作成

`/skill build-zip` を使用して公開用zipとソースコードアーカイブを作成する。

### 5. コミット & Push

```bash
git add manifest.json package.json docs/RELEASE_NOTES.md
git commit -m "$(cat <<'EOF'
chore: バージョンを<VERSION>に更新

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

## ルール

- バージョンは `manifest.json` と `package.json` の両方を必ず同期させる
- zipファイルはgitに含めない
- コミットメッセージは `chore: バージョンを<VERSION>に更新` の形式
