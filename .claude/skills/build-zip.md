---
name: リリースzip作成
description: 拡張機能の公開用zip（拡張本体）とソースコードアーカイブをバージョン付きで作成する
user_invocable: true
---

# リリースzip作成スキル

## 概要

Chrome Web Store / Firefox Add-ons 向けの公開用zipと、
ソースコードアーカイブ（Firefox審査提出用）を作成する。

## 手順

### 1. バージョンを確認する

`manifest.json` の `version` フィールドを読み取る。

```bash
node -p "require('./manifest.json').version"
```

以降 `<VERSION>` をこの値で置き換える。

### 2. 既存zipを削除

```bash
rm -f dualview-translator-*.zip
```

### 3. 公開用zip（拡張本体）を作成

Chrome Web Store / Firefox Add-ons への提出用。
ファイル名: `dualview-translator-<VERSION>.zip`

含めるファイル:
- `manifest.json`
- `background.js`
- `content-core.js`
- `content-selection.js`
- `content-page.js`
- `content-bar.js`
- `content.css`
- `i18n.js`
- `popup.html`
- `popup-init.js`
- `popup.js`
- `icons/`
- `_locales/`
- `LICENSE`

```bash
zip -r dualview-translator-<VERSION>.zip \
  manifest.json \
  background.js \
  content-core.js \
  content-selection.js \
  content-page.js \
  content-bar.js \
  content.css \
  i18n.js \
  popup.html \
  popup-init.js \
  popup.js \
  icons/ \
  _locales/ \
  LICENSE
```

### 4. ソースコードアーカイブを作成（Firefox審査用）

Firefox Add-ons の審査では、ビルドが不要な場合でもソースコードの提出が求められることがある。
ファイル名: `dualview-translator-<VERSION>-source.zip`

除外するもの:
- `node_modules/` — 依存パッケージ（`npm install` で復元可能）
- `.git/` — gitリポジトリ内部データ
- `safari/` — Safari向けXcodeプロジェクト（Firefox審査対象外）
- `.claude/` — AI開発支援ツール設定
- `dualview-translator-*.zip` — 既存zipが混入しないよう除外
- `docs/sample-after.png`, `docs/popup.png`, `docs/sample-afterのコピー.png` — スクリーンショット一時ファイル

```bash
zip -r dualview-translator-<VERSION>-source.zip . \
  -x ".git/*" \
  -x "node_modules/*" \
  -x "safari/*" \
  -x ".claude/*" \
  -x "dualview-translator-*.zip" \
  -x "docs/sample-after.png" \
  -x "docs/popup.png" \
  -x "docs/sample-afterのコピー.png"
```

### 5. 生成物を確認

```bash
ls -lh dualview-translator-*.zip
```

## 出力

作成されたファイルとサイズをユーザーに報告する。

| ファイル | 用途 |
|---|---|
| `dualview-translator-<VERSION>.zip` | Chrome Web Store / Firefox Add-ons 提出用 |
| `dualview-translator-<VERSION>-source.zip` | Firefox審査用ソースコード |

## ルール

- バージョンは必ず `manifest.json` から取得する（手入力しない）
- 既存のzipは作成前に削除する（古いバージョンが残らないよう）
- 新しいソースファイルが追加された場合は、公開用zipの含めるファイルリストも更新する
- zipファイル自体は git に含めない
