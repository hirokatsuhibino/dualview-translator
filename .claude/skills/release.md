---
name: リリース
description: バージョン更新→リリースノート整備→PR→タグ→GitHub Release→zipアップロードの一連のリリースフローを実行
user_invocable: true
---

# リリーススキル

## 概要

バージョンを上げ、リリースノートを整備し、PR経由でmainにマージ後、
git tag・GitHub Release作成・zip添付まで一連のリリースフローを実行する。

## 手順

### 1. 現在のバージョンと未リリース内容を確認

```bash
node -p "require('./manifest.json').version"
```

`docs/RELEASE_NOTES.md` の `## 未リリース` セクションを確認して変更内容をまとめる。

### 2. 新バージョンを決定

バージョニング規則（Semantic Versioning）:
- `PATCH`（x.x.**N**）: バグ修正のみ
- `MINOR`（x.**N**.0）: 新機能追加（後方互換あり）← 複数の新機能がある場合
- `MAJOR`（**N**.0.0）: 破壊的変更

判断に迷う場合はユーザーに確認する。

### 3. リリースブランチを作成

```bash
git checkout -b release/v<VERSION>
```

### 4. バージョン番号を更新

更新対象（必ず両方同期させる）:
- `manifest.json` の `version`
- `package.json` の `version`

### 5. リリースノートを更新

`docs/RELEASE_NOTES.md` を以下のように編集する:

1. `## 未リリース` セクションの内容を `## v<VERSION>（YYYY-MM-DD）` セクションに移動
2. Claude Haiku などモデル変更・改善も漏れなく記載する
3. `## 未リリース` セクションを空欄で残す（次のリリース用）

フォーマット:
```markdown
## 未リリース

---

## v<VERSION>（YYYY-MM-DD）

### 新機能
- ...

### 改善
- ...

### 修正
- ...
```

カテゴリは内容に応じて使い分ける。該当なしのカテゴリは省略可。

### 6. テストを実行

```bash
npm test
```

全件パスを確認してから次へ進む。

### 7. コミット・push・PR作成

```bash
git add manifest.json package.json docs/RELEASE_NOTES.md
git commit -m "chore: v<VERSION> リリース準備（バージョン番号更新・リリースノート整備）"
git push -u origin release/v<VERSION>
gh pr create \
  --title "chore: v<VERSION> リリース準備" \
  --body "$(cat <<'EOF'
## Summary

- `manifest.json` / `package.json`: バージョンを **<VERSION>** に更新
- `docs/RELEASE_NOTES.md`: 未リリース機能を v<VERSION> としてまとめ

## v<VERSION> の主な変更

### 新機能
- ...

### 改善
- ...
EOF
)"
```

### 8. 人間にマージを依頼してクリーンアップ

`.claude/CLAUDE.md` の絶対ルールにより **Claude は PR をマージしない**。
人間がレビュー・マージを完了するまで待つ。

人間がマージしたら `/skill pr-cleanup` でローカル・リモートのブランチを片付ける（main への切替・pull・作業ブランチ削除を自動化）。

### 9. git タグを打つ

```bash
git tag v<VERSION>
git push origin v<VERSION>
```

### 10. GitHub Release を作成

```bash
gh release create v<VERSION> \
  --repo hirokatsuhibino/dualview-translator \
  --title "v<VERSION>" \
  --notes "$(cat <<'EOF'
## 新機能
- ...

## 改善
- ...

## 修正
- ...

---

Copyright (c) Orangesoft Inc.
EOF
)"
```

`--notes` の内容はリリースノートの該当バージョンセクションから転記する。

### 11. zip を作成して GitHub Release にアップロード

`/skill build-zip` を実行してから:

```bash
gh release upload v<VERSION> \
  dualview-translator-<VERSION>.zip \
  dualview-translator-<VERSION>-source.zip \
  --repo hirokatsuhibino/dualview-translator
```

アップロード結果を確認:

```bash
gh release view v<VERSION> --repo hirokatsuhibino/dualview-translator \
  --json assets --jq '.assets[] | {name, size: (.size / 1024 | floor | tostring) + "KB"}'
```

## ルール

- バージョンは `manifest.json` と `package.json` の両方を必ず同期させる
- zipファイルは git に含めない（`.gitignore` 済み）
- mainへの直接pushは禁止。必ず `release/v<VERSION>` ブランチ → PR → マージ の流れで行う
- コミットメッセージは `chore: v<VERSION> リリース準備（バージョン番号更新・リリースノート整備）` の形式
- GitHub Release の notes は日本語で記述する
