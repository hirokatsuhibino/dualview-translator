# CLAUDE.md — DualView Translator

## プロジェクト概要

原文と翻訳を並べて表示するブラウザ翻訳拡張（Chrome / Firefox対応、Manifest V3）。
Google Translate（無料）と DeepL API をサポート。

## ファイル構成

```
├── manifest.json          # 拡張の定義（権限・スクリプト・アイコン）
├── background.js          # Service Worker: 翻訳API呼び出し・コンテキストメニュー管理
├── content-core.js        # 共有状態(DVT)・ユーティリティ・初期化・メッセージリスナー
├── content-selection.js   # テキスト選択翻訳パネル(DVT_SEL)・コンテキストメニュー翻訳
├── content-page.js        # ページ全体/範囲選択/要素翻訳(DVT_PAGE)
├── content-bar.js         # ページ読み込み時の翻訳バー・言語検出(DVT_BAR)
├── content.css            # 注入スタイル（ダーク/ライト対応）
├── i18n.js                # 多言語辞書(DVT_I18N) + t()ヘルパー（11言語対応）
├── popup.html             # ポップアップUI（設定・翻訳モード選択）
├── popup.js               # ポップアップのイベント処理
├── icons/                 # 拡張アイコン（16/32/48/128px）
└── README.md              # ユーザー向けドキュメント
```

## アーキテクチャ

### content script のモジュール構成

読み込み順序: `i18n.js` → `content-core.js` → 他3ファイル（順不同）

- **DVT** (`content-core.js`): グローバル名前空間。共有状態 `DVT.state` とユーティリティ関数を公開
- **DVT_SEL** (`content-selection.js`): 選択パネルUI。DVTに依存
- **DVT_PAGE** (`content-page.js`): ページ/範囲/要素翻訳。DVTに依存
- **DVT_BAR** (`content-bar.js`): 翻訳バー。DVT, DVT_PAGEに依存

### データフロー

```
popup.js → chrome.tabs.sendMessage → content-core.js (メッセージリスナー) → DVT_PAGE / DVT_SEL / DVT_BAR
content-*.js → chrome.runtime.sendMessage → background.js → Google Translate API / DeepL API
```

### 翻訳エンジン

- **Google Translate**: 非公式エンドポイント `translate.googleapis.com`（APIキー不要）
- **DeepL**: `api-free.deepl.com` / `api.deepl.com`（APIキー必要、Free/Pro自動判定）
- 切り替え: `chrome.storage.local` の `translateEngine` / `deeplApiKey` で管理

## コーディングルール

- コメントは日本語で書く（コードは英語可）
- コミットメッセージは日本語で書く
- CSSセレクタは全て `.dvt-` プレフィックスを付ける（ホストページとの衝突回避）
- DOM要素には `data-dvt="true"` 属性を付与して拡張の要素を識別
- `!important` を使用してホストページのスタイルを確実にオーバーライド
- XSS対策: ユーザー入力やAPIレスポンスは必ず `DVT.escapeHtml()` を通す

## 多言語対応

- 11言語: ja, en, zh-CN, zh-TW, ko, fr, de, es, pt, ru, ar
- UI文字列は `t('key')` / `t('key', { param: value })` で取得
- popup.htmlは `data-i18n` / `data-i18n-html` / `data-i18n-placeholder` 属性で自動翻訳
- 新規メッセージ追加時は `i18n.js` の全11言語ブロックに追加すること
- background.jsのコンテキストメニュータイトルは `CONTEXT_MENU_TITLES` に別途定義

## テーマ対応

- CSS: `@media (prefers-color-scheme: light)` + `.dvt-light` クラスの2方式併用
- popup.html: CSS変数(`:root` / `:root.dvt-light`)で切り替え
- content.css: メディアクエリ + `.dvt-light` セレクタで全コンポーネント対応
- 既知の問題: Firefoxポップアップでテーマが反映されない場合がある

## 既知の問題

- Google Translate非公式エンドポイントはレート制限・ブロックのリスクあり
- Firefoxポップアップのライトテーマ切り替えが動作しない場合がある
- `<all_urls>` のhost_permissionsはChrome Web Store審査で指摘される可能性あり
