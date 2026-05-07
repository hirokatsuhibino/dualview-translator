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

更新対象（必ずすべて同期させる）:
- `manifest.json` の `version`
- `package.json` の `version`
- `safari/DualView Translator/DualView Translator.xcodeproj/project.pbxproj` の以下 2 種類（iOS App Store / Mac App Store 提出に必要）:
  - `MARKETING_VERSION` を新バージョン（例: `1.6.0`）に更新（全 12 箇所、iOS/macOS × App/Extension/ShareExtension × Debug/Release）
  - `CURRENT_PROJECT_VERSION` を +1 インクリメント（全 12 箇所、ビルド番号）

```bash
# 全 12 箇所一括更新の例
sed -i '' 's/MARKETING_VERSION = <旧>;/MARKETING_VERSION = <新>;/g' \
  "safari/DualView Translator/DualView Translator.xcodeproj/project.pbxproj"
sed -i '' 's/CURRENT_PROJECT_VERSION = <旧>;/CURRENT_PROJECT_VERSION = <新>;/g' \
  "safari/DualView Translator/DualView Translator.xcodeproj/project.pbxproj"

# 期待値検証: 12 を返すこと
grep -c "MARKETING_VERSION" "safari/DualView Translator/DualView Translator.xcodeproj/project.pbxproj"
grep -c "CURRENT_PROJECT_VERSION" "safari/DualView Translator/DualView Translator.xcodeproj/project.pbxproj"
```

**注**: ターゲット数が増減したらこの「12 箇所」も連動して変える。Issue #89 で Share Extension 2 ターゲット追加により 8 → 12 になった。


Xcode 側を更新し忘れると iOS App Store / Mac App Store のアップロードが
`Invalid Pre-Release Train` / `CFBundleShortVersionString must be higher` で失敗する（過去事例: Issue #163）。

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
git add manifest.json package.json docs/RELEASE_NOTES.md \
  "safari/DualView Translator/DualView Translator.xcodeproj/project.pbxproj"
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

人間がマージしたら、以下のコマンドでブランチを片付ける:

```bash
git checkout main && git pull
git branch -d release/v<VERSION>
git push origin --delete release/v<VERSION>
```

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
