# CLAUDE.md — DualView Translator

## プロジェクト概要

原文と翻訳を並べて表示するブラウザ翻訳拡張（Chrome / Firefox対応、Manifest V3）。
Google Translate（無料）と DeepL API をサポート。
LLM（Claude / Gemini）による要約機能も搭載。

## ファイル構成

```
├── manifest.json          # 拡張の定義（権限・スクリプト・アイコン）
├── background.js          # Service Worker: 翻訳/要約API呼び出し・コンテキストメニュー管理
├── content-core.js        # 共有状態(DVT)・ユーティリティ・初期化・メッセージリスナー
├── content-selection.js   # テキスト選択翻訳パネル(DVT_SEL)・コンテキストメニュー翻訳
├── content-page.js        # ページ全体/要素選択翻訳/要約/MutationObserver(DVT_PAGE)
├── content-bar.js         # ページ読み込み時の翻訳バー・言語検出(DVT_BAR)
├── content.css            # 注入スタイル（ダーク/ライト対応）
├── i18n.js                # 多言語辞書(DVT_I18N) + t()ヘルパー（11言語対応）
├── popup.html             # ポップアップUI（タブ式: 翻訳/設定）
├── popup-init.js          # ポップアップ初期化（テーマ適用・ショートカット表示）
├── popup.js               # ポップアップのイベント処理・タブ切り替え
├── icons/                 # 拡張アイコン（16/32/48/128px）
├── LICENSE                # MIT License
├── README.md              # ユーザー向けドキュメント
├── package.json           # npm設定（テスト用）
├── vitest.config.js       # Vitest設定
├── tests/                 # 自動テスト
│   ├── setup.js           #   Chrome APIモック・jsdomモック
│   ├── helpers.js          #   IIFEスクリプトのロードヘルパー
│   ├── i18n.test.js       #   i18n テスト（86件）
│   ├── content-core.test.js #  content-core テスト（20件）
│   ├── content-page.test.js #  content-page テスト（10件）
│   ├── content-bar.test.js #   content-bar テスト（17件）
│   ├── content-selection.test.js # content-selection テスト（9件）
│   ├── background.test.js  #  background テスト（18件）
│   ├── safari-compat.test.js # Safari/iOS互換テスト（8件）
│   ├── auto-rule-edit.test.js # 自動翻訳ルール編集テスト（10件）
│   └── translation-cache.test.js # 翻訳・要約キャッシュテスト（22件）
├── docs/                  # 公開資料
│   ├── chrome-web-store.md #   Chrome Web Store掲載用テキスト
│   ├── RELEASE_NOTES.md   #   リリースノート
│   ├── test-plan.md       #   テストプラン（74項目、Markdown表形式）
│   └── manual-test-scenarios.yaml #  手動テストシナリオ（YAML、自動テスト補完）
└── safari/                # Safari Web Extension（Xcode プロジェクト）
    ├── README.md          #   ビルド・インストール手順
    └── DualView Translator/ # macOS/iOS両対応のXcodeプロジェクト
```

## アーキテクチャ

### content script のモジュール構成

読み込み順序: `i18n.js` → `content-core.js` → 他3ファイル（順不同）

- **DVT** (`content-core.js`): グローバル名前空間。共有状態 `DVT.state` とユーティリティ関数を公開
- **DVT_SEL** (`content-selection.js`): 選択パネルUI。DVTに依存
- **DVT_PAGE** (`content-page.js`): ページ/要素選択翻訳・要約・MutationObserver。DVTに依存
- **DVT_BAR** (`content-bar.js`): 翻訳バー。DVT, DVT_PAGEに依存

### データフロー

```
popup.js → chrome.tabs.sendMessage → content-core.js (メッセージリスナー) → DVT_PAGE / DVT_SEL / DVT_BAR
content-*.js → chrome.runtime.sendMessage → background.js → Google Translate API / DeepL API / Claude API / Gemini API
```

### 翻訳エンジン

- **Google Translate**: 非公式エンドポイント `translate.googleapis.com`（APIキー不要）
- **DeepL**: `api-free.deepl.com` / `api.deepl.com`（APIキー必要、Free/Pro自動判定）
- 切り替え: `chrome.storage.local` の `translateEngine` / `deeplApiKey` で管理

### 翻訳・要約キャッシュ

- 翻訳結果を `tc:` プレフィックス、要約結果を `sc:` プレフィックスで `chrome.storage.local` にキャッシュ
- 翻訳キー: `tc:<engine>:<sl>:<tl>:<sha256(text)[:16]>` / 値: `{ translated, detectedLang, ts }`
- 要約キー: `sc:<engine>:<tl>:<sha256(text)[:16]>` / 値: `{ summary, ts }`
- 翻訳: TTL 30日 / 最大 2000 件 / LRU 10% evict
- 要約: TTL 30日 / 最大 500 件 / LRU 10% evict（有料APIのコスト削減が主目的）
- 「設定」タブに翻訳+要約の合計件数表示とクリアボタン（`cacheStats` / `clearCache` メッセージ）

### 要約エンジン（LLM）

- **Claude**: `api.anthropic.com/v1/messages`（model: claude-3-5-sonnet-20241022）
- **Gemini**: `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash`
- 切り替え: `chrome.storage.local` の `llmEngine` / `claudeApiKey` / `geminiApiKey` で管理
- 選択エンジンのAPIキーが未設定の場合、もう一方に自動フォールバック

### キーボードショートカット

- `chrome.commands` API で定義（manifest.json の `commands` セクション）
- `background.js` の `chrome.commands.onCommand` で受信し content script に転送
- デフォルトキー: `Ctrl+Shift+T`（ページ翻訳）/ `Ctrl+Shift+Y`（選択翻訳）/ `Ctrl+Shift+R`（領域選択）

### ポップアップUI

- 3タブ構成: 「翻訳」タブ（デフォルト）／「ルール」タブ／「設定」タブ
- 翻訳タブ: 翻訳先言語セレクタ + 翻訳モードボタン群 + ステータスバー
- ルールタブ: 自動翻訳ルール一覧 + 追加/編集フォーム
  - 項目クリックで select-to-edit（フォームに値がセットされ、「追加」→「更新」、キャンセルボタン表示）
  - `editingRuleId` で編集中IDを保持。selector/mode 変更時は既存 Observer を再起動
- 設定タブ: 表示言語・翻訳エンジン・要約エンジン・ヒント情報
- タブ切り替えは `.dvt-tab` / `.dvt-tab-content` クラスで制御

### 要素選択翻訳

- `enterRegionMode(mode)`: mode='translate'（翻訳のみ）/ mode='summarize'（翻訳＆要約）
- マウスホバーで `.dvt-region-highlight` クラスを付与してハイライト表示
- クリックで要素を確定 → `translateClickedElement()` or `translateAndSummarizeClickedElement()`
- 子要素の葉要素のみを翻訳対象として抽出（親子重複を除外）

### 動的コンテンツ監視

- ページ全体翻訳がアクティブな間、`MutationObserver` でDOMの `childList` + `subtree` を監視
- 500msデバウンスで短時間の大量DOM変更を1回の翻訳処理にまとめる
- `filterTranslatableElements()` が `data-dvt-id` 付きの既翻訳要素を除外するため二重翻訳なし
- `undoPageTranslate()` 時に `stopPageObserver()` で監視を停止

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
- 要約ブロック(`.dvt-summary`): 緑系の左枠線で翻訳と視覚的に区別
- 既知の問題: Firefoxポップアップでテーマが反映されない場合がある

## テスト

- Vitest + jsdom で自動テストを実行: `npm test`
- テストファイルは `tests/` ディレクトリに配置
- Chrome拡張APIは `tests/setup.js` でモック（chrome.storage, chrome.runtime等）
- IIFEパターンのスクリプトは `tests/helpers.js` の `loadScript()` でグローバルにロード
- `window.matchMedia` 等のjsdom未サポートAPIも `setup.js` でモック済み
- 新規メッセージやユーティリティ関数を追加した場合は対応するテストも追加すること
- 自動テストで拾えない領域（実ブラウザUX・a11y・ストレージ競合・クロスブラウザ差異・Safari/iOS固有挙動等）は `docs/manual-test-scenarios.yaml` に記述する
  - p0: リリース前必須 / p1: リリーステスト推奨 / p2: 可能なら実施
- 開発ワークフロー向けの Claude スキルは `.claude/skills/` 配下に配置
  - `/pr-review-check` — オープンPRの未対応レビューを一括確認

## 既知の問題

- Google Translate非公式エンドポイントはレート制限・ブロックのリスクあり
- Firefoxポップアップのライトテーマ切り替えが動作しない場合がある
- `<all_urls>` のhost_permissionsはChrome Web Store審査で指摘される可能性あり
- 要素単位の翻訳モード（要素選択翻訳、右クリック翻訳）では、翻訳後に要素内で動的にロードされるコンテンツは自動翻訳されない（#16）
