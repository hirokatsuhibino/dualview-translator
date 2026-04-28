---
description: コミットメッセージとリリースノートの運用ルール
---

# Git・リリースノート運用ルール

## コミットメッセージのフォーマット

Conventional Commits形式で日本語を使って記述する。

```
<type>: <日本語の説明>
```

### typeの種類

| type | 意味 |
|------|------|
| feat | 機能追加 |
| fix | バグ修正 |
| docs | ドキュメントのみの変更 |
| style | コードの動作に影響しない変更（フォーマット等） |
| refactor | リファクタリング |
| test | テストの追加・修正 |
| chore | ビルド・補助ツールの変更 |

### 例

```
feat: 自動翻訳ルール登録機能を追加
fix: ルール削除後もObserverが残るバグを修正
test: content-bar の waitForElement テストを追加
```

※ Issue自動クローズは **PRのbody** に `closes #<番号>` を記載して行う（コミットメッセージには含めない）

### ルール

- typeは英語、説明は日本語で書く
- コミットメッセージに `closes #<番号>` は**含めない**（Issue自動クローズはPRのbodyで行う）
- 複数行のコミットメッセージにはHEREDOCを使う
- mainへの直接pushは禁止。必ずブランチ→PR→マージの流れで行う

## リリースノート運用ルール

`docs/RELEASE_NOTES.md` / `docs/RELEASE_NOTES.en.md` を編集する際の注意事項。

### 「未リリース」セクションは常設、リリース時に空に戻す

`docs/RELEASE_NOTES.md` / `docs/RELEASE_NOTES.en.md` の先頭には常に空の `## 未リリース`（英語版は `## Unreleased`）セクションを **常設**しておく。次のリリースまでの間、以下のように使う。

#### 通常 PR（feat / fix / docs 等）

機能追加・バグ修正・ドキュメント変更など、ユーザーから見て差分のある PR では **`## 未リリース` の直下に項目を追記する**。リリース PR を待たずに各 PR で都度書き入れることで、リリース準備時に「何を含めるか」を改めて思い出さなくて済む。

#### リリース PR（`chore: vX.Y.Z リリース準備`）

リリース確定時には:

1. `## 未リリース` の中身を `## vX.Y.Z（YYYY-MM-DD）` 配下にそのまま **移動**する
2. `## 未リリース` セクション自体は**削除せず空欄で残す**（次のリリースに向けた受け皿として常設）
3. リリース PR でしかバージョン番号は確定させない

#### 正しい例（リリース確定後の状態）

```markdown
# リリースノート

## 未リリース

---

## v1.4.0（2026-04-27）

### 改善
- ...
```

#### NG 例

```markdown
# リリースノート

## v1.4.0（2026-04-27）   ← 直接 v1.4.0 に置き換えてしまう／「未リリース」枠が消える
```

#### 通常 PR の途中状態（OK）

機能追加 PR の途中では「未リリース」の下に項目が並ぶ。これは想定動作:

```markdown
# リリースノート

## 未リリース

### バグ修正

- 〇〇の問題を修正（#XXX）
- △△の挙動を改善（#YYY）

---

## v1.4.0（2026-04-27）
...
```

詳細は `.claude/skills/release.md` の手順 5 を参照。

## ストア掲載文の文字数制限

`_locales/<lang>/messages.json` および `manifest.json` から参照されるストア掲載文（特に拡張機能の説明本文）は、**全言語で 112 文字以下** に揃える。

### 制限の根拠

| ストア | 上限 | 実害 |
|---|---|---|
| **Apple App Store**（Safari Web Extension）| **112** | これを超えると `xcrun altool`/Xcode のアップロードが `code 90862` で **失敗する** |
| Chrome Web Store | 132 | 超えると Web Store ダッシュボードで弾かれる |
| Firefox AMO | 132（要約欄）| 同上 |

最も厳しい上限は Apple の **112 文字**。これを超えると iOS / macOS Safari のリリースが完全にブロックされる。

### 対象フィールド

- `_locales/<lang>/messages.json` の **`extDescription.message`**（`manifest.json` の `description` から `__MSG_extDescription__` で参照される本文）
- `_locales/<lang>/messages.json` の各エントリの **`description`** フィールド（翻訳者向け注記。Apple は注記もこの 112 制限を要求する）

### 自動チェック

`tests/locales.test.js` に下記のテストが含まれており、`npm test` でガードされる:

- 「全 locale の `extDescription.message` が 112 文字以下」
- 「全 locale の全エントリの `description` が 112 文字以下」

新言語追加・文言改訂時は CI で自動検出される。

### 経緯

Issue #119 / #121（PR #120 / #122）で 2 連続でこの制限を踏んで iOS Safari v1.4 のアップロードが失敗した。Chrome / Firefox では超過しても気付けないため、必ず Apple の 112 を上限ルールにする。
