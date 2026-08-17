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
├── _locales/              # ブラウザ標準 i18n（manifest description / commands）
│   └── <lang>/messages.json #   11言語分（ar/de/en/es/fr/ja/ko/pt_BR/ru/zh_CN/zh_TW）
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
│   ├── translation-cache.test.js # 翻訳・要約キャッシュテスト（31件）
│   └── locales.test.js    #   _locales 整合性テスト（7件）
├── docs/                  # 公開資料
│   ├── chrome-web-store.md #   Chrome Web Store掲載用テキスト
│   ├── RELEASE_NOTES.md   #   リリースノート
│   ├── test-plan.md       #   テストプラン（79項目、Markdown表形式）
│   └── manual-test-scenarios.yaml #  手動テストシナリオ（YAML、自動テスト補完）
├── safari/                # Safari Web Extension（Xcode プロジェクト）
│   ├── README.md          #   ビルド・インストール手順
│   └── DualView Translator/ # macOS/iOS両対応のXcodeプロジェクト
└── assets/                # アプリアイコン元データ・再生成スクリプト
    ├── README.md          #   再生成手順とデザイン仕様
    ├── app-icon.svg       #   マスター SVG（編集起点）
    ├── generate-icons.py  #   全サイズ PNG を Pillow で再生成
    └── app-icon-{master,ios,mac}-1024.png # 1024x1024 派生
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
- **Apple Translation**（Safari 限定・macOS）: `chrome.runtime.sendNativeMessage` で `SafariWebExtensionHandler` の `translate` アクションを呼び、On-Device の `Translation.framework` で翻訳。ネットワーク・APIキー不要
- 切り替え: `chrome.storage.local` の `translateEngine` / `deeplApiKey` で管理
- Safari 検出: 拡張起動時に `ping` を投げて応答有無で判定し、`chrome.storage.local.appleAvailable` にキャッシュ。popup の `<option value="apple">` は `appleAvailable: true` のときだけ表示される
- **オフラインフォールバック**: `fetchTranslation` ディスパッチャは Google / DeepL 選択時でも、`navigator.onLine === false` または fetch の network error 発生時に Apple Translation へ自動フォールバックする（`appleAvailable` && `sl !== 'auto'` のみ）。`fetchTranslation` の戻り値に `engineUsed` / `fallback` / `fallbackReason` を含めて UI 側で識別可能にしている

### 翻訳・要約キャッシュ

- 翻訳結果を `tc:` プレフィックス、要約結果を `sc:` プレフィックスで `chrome.storage.local` にキャッシュ
- 翻訳キー: `tc:<engine>:<sl>:<tl>:<sha256(text)[:16]>` / 値: `{ translated, detectedLang, ts }`
- 要約キー: `sc:<engine>:<tl>:<sha256(text)[:16]>` / 値: `{ summary, ts }`
- 翻訳: TTL 30日 / 最大 2000 件 / LRU 10% evict
- 要約: TTL 30日 / 最大 500 件 / LRU 10% evict（有料APIのコスト削減が主目的）
- 「設定」タブに翻訳+要約の合計件数表示とクリアボタン（`cacheStats` / `clearCache` メッセージ）
- ヒット率統計を `HIT_STATS_KEY='cacheHitStats'` キーに永続化（`{ tcHits, tcMisses, scHits, scMisses }`）
- `getCached()` でヒット/ミスをカウント。`_hitStatsQueue` で直列化して競合を防ぐ
- 「設定」タブに翻訳・要約それぞれのヒット率をバー付きで表示（未アクセス時は非表示）
- `clearCache()` 実行時にヒット率統計もリセット

### フレーム間メッセージリレー（Disqus iframe 対応）

- Disqus などの cross-origin iframe コメント欄を翻訳するため、`manifest.json` に `https://disqus.com/embed/comments/*` 用の content_scripts エントリ（`all_frames: true`）を追加
- iframe 内には `i18n.js` / `content-core.js` / `content-page.js` のみ注入（翻訳バーと選択翻訳は iframe では発火させない）
- トップフレームの `content-core.js` が `chrome.runtime.onMessage` で `translatePage` / `translatePageAndSummarize` / `undoPage` / `togglePageTranslate` / `enterRegionMode` を受けたとき、`relayToChildFrames()` で配下 iframe に `window.postMessage` で同じ指示を伝播
- iframe 側は起動時に親へ `__dvtReady` を送り、トップフレームでページ翻訳がアクティブなら現状態を返してもらうことで、遅延ロード iframe にも追従できる
- **領域選択（要素選択翻訳）も iframe 対応**: `enterRegionMode` をトップ→子 iframe にリレーし、各フレームが独立に領域選択モードへ入る。どのフレームでクリック確定 / Escape キャンセルしても全フレームのモードを解除する
  - 解除同期は `content-page.js` の `exitRegionMode` が dispatch する `dvt-region-exit` カスタムイベントを `content-core.js` が受けて行う（疎結合）
  - 確定/キャンセルが起きたフレームから `window.top` 経由で全フレームへ `exitRegionMode` をブロードキャスト（`__dvtRegionExitBroadcast` 内部アクション）
  - `exitRegionMode(fromRelay)`: `fromRelay=true`（リレー由来）のときは `dvt-region-exit` を再発火せず無限ループを防ぐ。二重解除に対して idempotent
- セキュリティ: 受信メッセージを `__dvt_relay: true` シグネチャ + 自フレーム送信遮断（`event.source === window`）+ 許可 action リスト（`translatePage` / `translatePageAndSummarize` / `undoPage` / `togglePageTranslate` / `enterRegionMode` / `exitRegionMode`）に限定する。`__dvt_relay` は公開値で postMessage 自体は任意フレームから送れるため、**トップフレームでは postMessage 由来の翻訳系アクションを一切実行しない**（子 iframe のみ実行。トップへの正規 postMessage は子からの `__dvtReady` / `__dvtRegionExitBroadcast` のみ）。これによりホストページが自前で作った子 iframe からトップへ postMessage してページ翻訳を操作する攻撃を防ぐ
- スコープ: ページ全体翻訳 + 領域選択（要素選択翻訳）。選択テキスト翻訳・コンテキストメニュー翻訳・翻訳バー・自動翻訳ルールは iframe 対象外（OpenWeb / Facebook Comments 等の他コメントシステムも未対応）

### Shadow DOM 貫通翻訳（Hyvor Talk 等の Web Components 型コメント対応）

- Hyvor Talk のようなコメントシステムは cross-origin iframe ではなく **open Shadow DOM** にコメントを直接描画する。通常の `querySelectorAll` は shadow boundary を越えないため、専用の貫通ヘルパーを使う
- **`DVT.deepQuerySelectorAll(root, selector)` / `DVT.forEachShadowRoot(root, cb)`**（`content-core.js`）: light DOM + 配下の全 open shadow root を再帰的に辿る。`SHADOW_MAX_DEPTH`（12）で再帰深さを制限。closed shadow root は `el.shadowRoot === null` で自然にスキップ
- **翻訳対象抽出**: `filterTranslatableElements` / `extractRegionElements` を `DVT.deepQuerySelectorAll` 化し、shadow 内コメントも翻訳対象に含める
- **動的監視**: `startPageObserver` が `observeShadowRoots()` で現存する全 open shadow root も `observe`。`translateNewElements`（デバウンス後）で後から出現した shadow root も監視対象に追加し、遅延ロードのコメントに追従。`observedShadowRoots`（WeakSet）で二重 observe を防ぐ
- **undo / 復元**: `undoPageTranslate` の `[data-dvt-id]` / `.dvt-summary` 収集を `DVT.deepQuerySelectorAll` 化し、shadow 内の翻訳済み要素も復元
- **領域選択**: `enterRegionMode` の mousemove / click ハンドラで `eventTarget(e)`（`event.composedPath()[0]` を優先）を使い、retargeting で host になってしまう問題を回避して shadow 内の実要素をハイライト/翻訳
- **対象外**: 自動翻訳ルールのセレクタ選択（`enterSelectorPickMode`／生成 CSS セレクタは shadow を貫通できず機能しない）、言語検出（`content-bar.js`／shadow 内テキスト未収集）、closed shadow root（JS から到達不可）
- **既知の制約**: 翻訳結果の表示制御は inline style（`setProperty('display','block','important')` 等）で行うため shadow 内でも機能は動作するが、`content.css` は shadow boundary を越えないため装飾（訳文の色・区切り線等）は未適用。shadow root への style 注入は follow-up

### 要約エンジン（LLM）

- **Claude**: `api.anthropic.com/v1/messages`（model: claude-haiku-4-5-20251001）
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

### 文ペア表示（長文段落のアライメント）

- `applyTranslation()` で訳文長が `PAIR_MIN_TRANS_LENGTH`（80字）を超える場合、原文・訳文を `DVT.splitSentences()` で文単位に分割
- 両側の文数が一致し、原文がインライン要素を含まない純テキストの場合のみ「原文1→訳1→原文2→訳2…」と交互配置（`.dvt-pair` / `.dvt-pair-orig` / `.dvt-pair-trans`）
- 元の `.dvt-orig` は `.dvt-orig-paired` クラスで CSS 非表示。undo 時の `restoreOriginalContent()` が `.dvt-orig` の子ノードを使うため、復元ロジックは変更不要
- 文数不一致・インライン要素を含む・短い段落は従来の単一ペア表示にフォールバック
- iOS / macOS の Share Extension（`safari/.../DualViewRenderer.swift`）にも同じロジックを移植済み。`SentenceSplitter.swift`（`DVT.splitSentences` の Swift ポート）で文分割し、訳文 80 字以上かつ両側文数一致のときに `.dvt-pair-paired` で交互表示する
- 選択翻訳パネル（`content-selection.js`）の `runSelectionTranslate` でも同じ閾値（`PAIR_MIN_TRANS_LENGTH=80` / 両側 2 文以上同数）で `.dvt-pair` / `.dvt-pair-orig` / `.dvt-pair-trans` を組む。ペア表示時はパネル冒頭の `.dvt-sel-original`（最大 60 字の原文プレビュー）を `display:none` にして冗長を排除。再翻訳でフォールバックに戻った場合は元に戻す。読み上げボタンはペア表示時 `.dvt-pair-trans` のみを連結して読み上げる

### 動的コンテンツ監視

- ページ全体翻訳がアクティブな間、`MutationObserver` でDOMの `childList` + `subtree` を監視
- 500msデバウンスで短時間の大量DOM変更を1回の翻訳処理にまとめる
- `filterTranslatableElements()` が `data-dvt-id` 付きの既翻訳要素を除外するため二重翻訳なし
- `undoPageTranslate()` 時に `stopPageObserver()` で監視を停止

### ビューポート優先＋遅延翻訳（Issue #256）

長いページで DOM 順に全要素を翻訳すると、ユーザーが見ている箇所の訳文が出るまで待たされるため、
ページ全体翻訳は「見えている部分から先に翻訳し、画面外はスクロールで近づいたときに翻訳する」方式で動く。

- `runConcurrentTranslation(elements, tl, idPrefix, { lazy })` の `lazy: true` で有効化
- 対象要素を `IntersectionObserver`（`rootMargin` = 画面高 × `LAZY_ROOT_MARGIN_RATIO`(1.5)）に登録し、
  交差した要素だけを翻訳キューへ投入。同一コールバック内の要素は `viewportDistance()` の昇順（画面内 → 下方向 → 上方向）に並べ替える
- 上方向（既読領域）は `LAZY_UPWARD_PENALTY`(2) 倍のペナルティを掛けて後回しにする
- 翻訳ワーカーは初回バッチ・スクロール由来を問わず共通プール（`CONCURRENCY`(6)）で `pumpLazyWorkers()` が起動
- 要素数が `LAZY_MIN_ELEMENTS`(30) 未満、または `IntersectionObserver` 非対応環境では
  従来どおり全件即時翻訳（順序だけビューポート優先）にフォールバック
- トーストは初回バッチの進捗のみ表示し、未翻訳分が残る場合は `toastDoneLazy`（「残り N 件はスクロール時」）で畳む。
  以降のスクロール由来の翻訳はトーストを出さない
- 進捗カウントは `processed`（処理済み＝進捗表示の分子・残件計算用）と `translated`（実際に訳文を挿入した数＝完了トーストの件数）を分けて持つ。
  キュー投入から実行までの間に DOM から外れた／テキストが消えた要素は `translateOneElement` がスキップし、
  そのとき `data-dvt-id="dvt-pending"` を解放して要素が復活したときに再翻訳できるようにする
- `undoPageTranslate()` / ページ翻訳解除時に `stopLazyTranslation()` で Observer と待機キューを破棄。
  進行中ワーカーは `isLazyAborted()` を見て次のループで抜ける

**適用範囲**

| モード | 遅延翻訳 |
|---|---|
| ページ全体翻訳 / 翻訳バー | ✅ 有効 |
| MutationObserver 由来の新規要素 | ✅ 有効（既存の `lazyState` に追加 observe） |
| ページ全体翻訳＆要約 | ❌ 無効（全訳文を結合して LLM に渡すため全件翻訳が必要） |
| 領域選択 / 右クリック / 自動翻訳ルール / 選択テキスト翻訳 | ❌ 無効（範囲が明示された少数要素のため） |

**既知の制約**: `display:none` の要素（タブ UI の裏側など）は交差しないため、表示されるまで翻訳されない。

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
- ストア掲載文・ショートカット説明（`manifest.json` の `description` / `commands.*.description`）は
  ブラウザ標準の `_locales/<lang>/messages.json` で管理し `__MSG_<key>__` で参照する
  - 言語ディレクトリ命名は Chrome の locale 命名規則（`zh_CN` / `pt_BR` 等）
  - `default_locale` は `en`（未対応 locale はここにフォールバック）
  - `_locales/` の整合性は `tests/locales.test.js` で検証

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
  - `/release` — バージョン更新→リリースノート整備→PR→タグ→GitHub Release→zipアップロードのフルフロー
  - `/build-zip` — 公開用zip（拡張本体）とソースアーカイブ（Firefox審査用）を作成
- 開発ワークフロー向けの Claude コマンドは `.claude/commands/` 配下に配置
  - `/pr-resume` — PR レビュー対応フローを手動再開

## 既知の問題

- Google Translate非公式エンドポイントはレート制限・ブロックのリスクあり
- Firefoxポップアップのライトテーマ切り替えが動作しない場合がある
- `<all_urls>` のhost_permissionsはChrome Web Store審査で指摘される可能性あり
- 要素単位の翻訳モード（要素選択翻訳、右クリック翻訳）では、翻訳後に要素内で動的にロードされるコンテンツは自動翻訳されない（#16）
