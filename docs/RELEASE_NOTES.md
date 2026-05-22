---
title: Release Notes
description: DualView Translator のリリースノート。
permalink: /RELEASE_NOTES.html
---

日本語 | [English](RELEASE_NOTES.en.html)

# リリースノート

## 未リリース

### バグ修正

- **ペア表示モードで外側の縦バーが原文行の左にも見える問題を修正**（#228）
  - PR #222 系の対応で `.dvt-trans` に inline `border-left` を強制した影響で、文ペア表示時に外側ブロックの縦バーが原文（英語）行の左にも見えていた
  - ペア表示モードでは各 `.dvt-pair-trans` 側に内側の縦バーがあるため、外側の縦バーは冗長として inline で解除
  - 短文の単一翻訳（非ペア表示）モードでは従来通り外側のバーを維持
- **ペア表示モードで翻訳の背景色が原文の裏にも回り込む問題を修正**（#230）
  - #228 と同じ構造的原因で、外側 `.dvt-trans` の薄いオレンジ背景がペア全体に広がり、原文（英語）行の裏にも翻訳色が回り込んでいた
  - 外側 `.dvt-trans` の `background` を inline `transparent` で解除し、訳文行（`.dvt-pair-trans`）側に従来の薄い翻訳色背景を移動して視覚的区別を維持
  - 短文の単一翻訳（非ペア表示）モードでは従来通り外側に翻訳色背景を表示
- **領域選択翻訳でホストページの line-clamp により原文後半が隠れる問題を修正**（#222 / closes #221）
  - Reddit など投稿本文を `-webkit-line-clamp` / `max-height + overflow:hidden` で切り詰めるサイトで、翻訳挿入後に原文の後半が clamp 範囲外へ押し出されて見えなくなる問題を修正
  - 翻訳挿入時に祖先要素を辿り該当する truncation を一時解除し、undo / ページリセット時に元のスタイルへ復元する
  - 同一祖先を共有する複数翻訳に備えて参照カウントで管理

### 改善

- **選択範囲の翻訳パネルも長文時に文ペア表示に対応**（#233）
  - 選択翻訳パネルの訳文も、ページ翻訳と同じ条件（訳文 80 字以上 & 原文・訳文の文数が 2 文以上同数）で「原文1→訳1→原文2→訳2…」の交互配置になる
  - ペア表示時はパネル冒頭の原文プレビュー欄は冗長になるため非表示にしてレイアウトをすっきりさせる
  - 短文や文数不一致のケースは従来の単一表示にフォールバック
  - 読み上げボタンはペア表示時も訳文部分のみを連結して読み上げる（原文を読まない）
- **選択翻訳のミニアイコンクリック時に翻訳を即時開始**（#234）
  - テキスト選択後に表示される 🌐 ミニアイコンをクリックすると、パネルが開くと同時に翻訳が自動実行されるようになった
  - 従来はパネルを開いた後に「翻訳する」ボタンを押す 2 ステップが必要だった
  - コンテキストメニューからの翻訳と同じ動作に統一
- **長文段落で原文と訳文を文単位でペア表示**（#214 / #219）
  - 長文の段落で原文ブロックの末尾と訳文ブロックの先頭が視覚的に大きく離れる問題を改善
  - 翻訳は従来通り段落単位で行い精度を維持。原文・訳文の文数が一致した長文段落のみ「原文1→訳1→原文2→訳2…」と交互に並べる
  - 文数が一致しない場合・インライン要素（`<a>` 等）を含む段落・短い段落は従来の単一ペア表示にフォールバック
  - iOS / macOS の Share Extension（共有シート経由の翻訳）にも同じ文ペア表示ロジックを適用（#219）
- **開発者モードで読み込んだ拡張に「dev」バッジを表示**（#216）
  - ポップアップのバージョン番号の隣に赤色の `dev` バッジを表示し、unpacked ロード（開発者モードで読み込んだ拡張）と Chrome Web Store / Firefox AMO / App Store 配信版とを視覚的に識別できるようにした
  - 判定は `chrome.management.getSelf()` の `installType === 'development'` で行う（management 権限の追加は不要）
  - ストア版・企業 sideload 版ではバッジは表示されない

---

## v1.7.1（2026-05-20）

### 新機能

- **端末間で設定を同期する機能を追加**（#205）
  - ポップアップ「設定」タブに「端末間で同期」セクションを新設。チェックボックス ON で `chrome.storage.sync` 経由の同期が有効になる
  - 同期対象: 翻訳先言語、翻訳エンジン、要約エンジン、自動翻訳ルール、除外ドメイン、UI 表示言語
  - **APIキーは同期されません**（クラウド経由の漏洩リスク回避）。各端末で個別設定が必要
  - 同期エンジン: Chrome / Edge は Google アカウント、Firefox は Firefox アカウント、Safari は iCloud Keychain 経由（ベータ）
  - 初回 ON 時はクラウド優先（他端末で既に設定済みの内容を尊重）でローカルへマージ
  - 容量制限（chrome.storage.sync は 8KB/item / 100KB total）を超えた場合はエラー表示
- **設定のエクスポート / インポートを追加**（#206）
  - ポップアップ「設定」タブに「設定のバックアップ」セクションを新設
  - 翻訳先言語・エンジン選択・自動翻訳ルール・除外ドメイン・UI言語を JSON ファイルでバックアップ／復元できる
  - API キーは既定で含まれず、「APIキーを含める」チェックを ON にしたときだけ書き出される（漏洩リスクの明示的 opt-in）
  - インポートは「ファイルから読み込む」ボタン（Chrome / Edge / Safari）または JSON を直接テキストエリアに貼り付け（全ブラウザ）。Firefox 限定で popup がファイル選択ダイアログ・alert・confirm で閉じてしまう既知の問題があるため、Firefox では file picker ボタンを自動的に隠し、状態通知もインライン表示で完結させる設計
  - インポートはマージ動作（JSON に含まれるキーのみ書き換え、含まれないキーは既存値を維持）。バージョン非互換 JSON は拒否、不正値は静かに無視
  - 翻訳・要約キャッシュおよびヒット率統計はエクスポート対象外（容量・端末固有のため）。テーマも OSの prefers-color-scheme から毎ページ再判定されるため対象外

### バグ修正

- **`<html lang="ja_JP">` のようにアンダースコア区切りの言語コードで翻訳バーが誤表示される問題を修正**（#204）
  - 翻訳先が日本語のときに「このページは ja_JP で書かれています。翻訳しますか？」が表示されていた
  - 言語コード比較・表示名取得の正規化処理でアンダースコア (`_`) もハイフン (`-`) と同等に扱うよう修正
- **Apple翻訳失敗時のエラー詳細を UI に表示するよう改善**（#202 / PR #203）
  - これまで失敗すると `[翻訳失敗]` だけが表示されていたが、ネイティブハンドラからのエラー文字列も付記されるようになり調査しやすくなった
  - iOS Safari 拡張では Apple Translation が未実装（Extension プロセスが UIWindowScene を持たないため）なのに `appleAvailable = true` になっていた問題を修正。`ping` レスポンスに `translateActionSupported` フラグを追加し、iOS では `false` を返すことで Apple Translation が選択肢に表示されなくなった
- **Firefox で「領域を選択して翻訳」を Esc キーでキャンセルできない問題を修正**（#211）
  - ポップアップを閉じた直後はページ document にキーボードフォーカスが戻らないため、`document` への `keydown` リスナーが発火していなかった
  - モード開始時に `window.focus()` を呼びつつ、`keydown` リスナーを `window` の capture phase に変更して堅牢化。要素ピッカー（ルールタブの「要素を選択」）にも同等の修正を適用

---

## v1.7.0（2026-05-13）

### 改善

- **iOS / macOS Share Extension の翻訳結果を段落単位の dual view 表示に刷新**（#199 / PR #200）
  - これまで翻訳全文を 1 ブロックで表示していたが、Web 版（ブラウザ拡張本体）と同じく **段落ごとに原文・翻訳を縦に並べる** UI に変更
  - 翻訳側には Web 版と同じオレンジの左縦線（`border-left: 3px solid #f5a623`）を表示
  - 段落間に per-request UUID マーカーを挟む方式で API 呼び出しを 1 リクエストにまとめており、レート制限や文脈ロスへの影響なし
  - 表示は `WKWebView` で行い、システムテーマ（ライト / ダーク）に追従
  - WebView 上の共有テキストは XSS 対策として HTML エスケープ済み、CSP で外部リソース読み込みもブロック
  - マーカー分割が崩れた場合は従来通り全文 1 ブロック表示にフォールバックするので最悪でも現状維持

### バグ修正

- **翻訳バーに「このページは null で書かれています」と表示されるバグを修正**（#195 / #197 / PR #198）
  - `<html lang="null">` / `<html lang="und">` / `<html lang="unknown">` のような不正な lang 属性を持つサイトで、本来言語名が入るべき位置に文字列「null」がそのまま表示されていた
  - 不正な言語コードは「無い」扱いにして API による自動検出にフォールバックするよう変更
  - API 検出も成功しなかった場合は「このページの言語が不明です。翻訳しますか？」という言語不明用バーを表示する（11 言語対応）
  - `<html lang="en ">` のような前後空白混じりや、`<html lang="   ">` のような空白のみの値も正しく扱う（trim 正規化）
  - 副次的に `i18n` のプレースホルダ置換も `null` / `undefined` 安全に修正（隠れ地雷の除去）

---

## v1.6.2（2026-05-07）

### バグ修正

- **App Store / TestFlight アップロード時の Validation エラーを修正**（PR #192 / #193）
  - Share Extension の `PRODUCT_NAME` がプラットフォーム suffix（`(iOS)` / `(macOS)`）を含んでおり、`CFBundleExecutable` のカッコ `( )` を Apple が拒否していた（error 90121）
  - `PRODUCT_NAME` を `"DualView Share Extension"`（カッコなし）にハードコードして解消
  - ユーザー可視の機能変更なし

---

## v1.6.1（2026-05-07）

### 改善

- **Container App 起動画面の多言語化**（#188 / PR #189）
  - iOS / macOS の Container App を起動したときに表示される Safari 拡張の有効化案内が、これまで英語固定だったのを 11 言語（ja / en / zh-CN / zh-TW / ko / fr / de / es / pt / ru / ar）に対応
  - 端末の言語設定に応じて自動切替（`navigator.language` 判定）
  - 拡張のオン/オフ状態に応じた説明文も全言語で表示
  - macOS Sequoia 以降の「Safari の設定 → 機能拡張」表記にも対応
  - アラビア語のときは右→左レイアウトに自動切替

---

## v1.6.0（2026-05-07）

### 新機能

- **iOS / macOS Share Extension**（Issue #89, PR #183 / #184 / #185 / #186）
  - 共有シートから DualView Translator を選ぶと並列翻訳ビューが開き、Safari 以外のアプリ（メモ・Mail・News など）のテキストも翻訳できる
  - SwiftUI ベースの並列ビュー（原文 / 訳文）+ コピー / 閉じるボタン
  - 翻訳エンジンは Google Translate（v1）。要約・DeepL・Apple 翻訳は v2 以降で順次追加予定
  - 翻訳先言語などの設定は Web 拡張で変更したものが App Group 経由で自動共有される（再設定不要）
  - 最低 OS: iOS 15.0 / macOS 12.0（既存 Safari Web Extension は引き続き macOS 10.14+）

- **訳文の音声読み上げ**（#181）
  - 翻訳結果ブロックに 🔊 ボタンを追加し、クリックで翻訳先言語の音声で読み上げる
  - 配置: 選択翻訳パネル（コピーボタン隣・常時表示）／インライン翻訳ブロック（× の左・ホバー時）／要約ブロック（バッジ隣・常時表示）
  - 再生中はアイコンが ⏹ に切り替わり、再クリック・別ボタン・`Esc`・タブ切替・ページ離脱で停止
  - ブラウザ内蔵の Web Speech API を使うため追加 API キー・権限不要
  - 対応音声がインストールされていない言語では「お使いの環境では {言語} の読み上げに対応していません」をトースト表示

### 改善

- Web 拡張の `chrome.storage.local` の主要キー（`uiLang` / `targetLang` / `dvtTheme` / `translateEngine` / `deeplApiKey` / `llmEngine` / `claudeApiKey` / `geminiApiKey`）を Native 経由で App Group の `UserDefaults` にミラー保存。Share Extension などの他ターゲットから設定を共有できるようにした（PR #183）
- macOS Share Extension のインライン翻訳ボタン UI を改善（キーボードフォーカス時の表示、タッチ環境での常時表示、`@media (hover: none)` 対応など）

### バグ修正

- 選択翻訳パネルを閉じた際にインライン翻訳・要約ブロックの読み上げが誤停止する不具合を修正（PR #182）
- 同一言語スキップ時に他ブロックの読み上げまで止まる不具合を修正（同上）

---

## v1.5.0（2026-05-01）

### 新機能

- **Apple Translation 連携（macOS Safari 限定）**（#144, #146, #148, #151）
  - 翻訳エンジンに **Apple 翻訳** を追加。On-Device の `Translation.framework` を使用し、APIキー不要・ネットワーク不要で動作する
  - 設定タブの翻訳エンジン選択肢に追加（Safari 環境のみ表示。Chrome / Firefox では選択肢自体が出ない）
  - 起動時の `ping` 応答で Safari かどうかを自動検出
  - `chrome.runtime.sendNativeMessage` 経由で `SafariWebExtensionHandler` を呼び出す。SwiftUI の `.translationTask` modifier を画面外の `NSHostingController` でホストする方式で、拡張プロセスから programmatic に翻訳を実行
- **オフライン自動フォールバック**（#150, #155）
  - Google / DeepL を選択中でもネットワーク不通時に Apple 翻訳に自動切替（macOS Safari 限定）
  - キャッシュ優先：Google / DeepL のチャンク単位キャッシュが hit する場合はそのまま返却し、不必要なフォールバックを避ける
  - `NLLanguageRecognizer`（Apple `NaturalLanguage` framework）でオフライン言語検出。`sl='auto'` でも問題なく動作
  - フォールバック発生時に画面右下にトースト通知（ページ life cycle 内 1 回のみ表示）
  - i18n キー `engineApple` / `fallbackToApple` を全 11 言語に追加

### マイルストーン

- **Chrome Web Store で配信開始**（#142）
  - 公開 URL: https://chromewebstore.google.com/detail/dualview-translator/hmnlfemcpbkcfppjnghiofddiiclkbmg
- **macOS Safari 版が Mac App Store で配信開始**（2026-05-01）
  - 公開 URL: https://apps.apple.com/jp/app/dualview-translator/id6763488360
  - これで Chrome / Firefox / iOS Safari / macOS Safari の 4 チャネルすべてが正規ストアから配信される状態に

### 改善

- **翻訳結果が原文と完全一致する場合は翻訳ブロックを表示しない**（#138, #140）
  - 記号列・数字のみ・URL・絵文字列など、翻訳しても結果が変わらないテキストで翻訳ブロックが空に近い形で挿入されるのを防止
  - 一致時は wrapper 全体を解体して元の DOM 構造に戻すため、空行が残らない（#140 で修正）
  - ページ全体翻訳・領域選択翻訳・右クリック翻訳に効く（選択翻訳は明示トリガーのため対象外）
- **領域選択翻訳・右クリック翻訳の要約ブロックを「元に戻す」操作で消せるように**（#134）
  - 要約ブロック右上に × ボタンを追加（要約だけを撤去可能）
  - ポップアップの「翻訳をリセット」が `.dvt-summary` クラス全体を撤去するようになり、領域選択時の要約も消える
  - aria-label / title 用に i18n キー `undoSummary` を全 11 言語に追加

### バグ修正

- **macOS Safari で「領域を選択して翻訳」ボタン押下時に popup が閉じず領域選択も動作しない問題を修正**（#157）
  - 原因 1: `chrome.runtime.onMessage.addListener` 末尾の不要な `return true` で macOS Safari がメッセージチャンネルを async 待ちのまま保持し、popup の `await sendToContent` が undefined を受け取っていた
  - 原因 2: `await sendToContent` 後の `window.close()` が macOS Safari で user gesture context を失って無視されていた
  - 修正: listener 末尾の `return true` を削除 + popup 起動時に tabId をキャッシュし、region 系ボタンで同期的に `sendMessage` を発射してから `window.close()` を呼ぶ
  - iOS Safari / Chrome / Firefox は影響なし

---

## v1.4.1（2026-04-28）

### バグ修正

- **iOS Safari でテキスト選択時にミニアイコンが表示されない問題を修正**（#127）
  - `mouseup` イベントベースの検知だけでは iOS のテキスト選択（長押し → 範囲ハンドル操作）に対応できなかったため、`selectionchange` イベント + 300ms デバウンスでも検知するように変更
  - `selectionchange` の登録は **タッチデバイスのみ** に限定（`'ontouchstart' in document.documentElement` で判定）。デスクトップ系（Chrome / Firefox / macOS Safari）では Shift+Arrow キーボード選択でアイコンが出ないという既存仕様を維持
  - 副次的に Escape 押下でデバウンスタイマーをクリアし、閉じた後にアイコンが意図せず再表示されないようにした

### マイルストーン

- **iOS Safari 拡張が App Store で配信開始**（2026-04-28）
  - 公開 URL: https://apps.apple.com/jp/app/dualview-translator/id6763488360
  - 申請ビルド: Safari Build 2 (Marketing Version 1.0)
  - macOS Safari 版は引き続き Mac App Store 審査中

---

## v1.4.0（2026-04-27）

### 改善

- **テキスト選択時の翻訳 UI を「ミニアイコン → クリックで展開」方式に変更**（#102）
  - 選択直後にフルサイズの翻訳パネルが即座に出る挙動を見直し、選択範囲の隣に小さな翻訳アイコンだけを表示するように変更
  - アイコンをクリックすると初めて従来のフローティングパネルが展開する
  - コピー目的でテキストを選択しただけのときに翻訳 UI が邪魔にならなくなった
  - 右クリック翻訳・`Ctrl+Shift+Y`（選択翻訳ショートカット）は明示トリガーのため、従来通りミニアイコンを介さず直接フルパネルを開く
  - aria-label / title 用の i18n キー `translateSelection` を全 11 言語に追加
- **ストア掲載文・ショートカット説明をブラウザ標準 i18n（`_locales/`）で多言語化**（#93）
  - `manifest.json` の `description` と `commands.*.description` を `__MSG_<key>__` 化し
    `_locales/<lang>/messages.json` に 11 言語分（ar / de / en / es / fr / ja / ko / pt_BR / ru / zh_CN / zh_TW）の翻訳を追加
  - これにより Chrome Web Store / Firefox Add-ons / Mac App Store / iOS App Store の拡張一覧説明文と
    `chrome://extensions/shortcuts` のショートカット説明がユーザーのブラウザ言語で表示される
  - `default_locale` は `en`（未対応 locale はここにフォールバック）
  - Safari Web Extension の Xcode プロジェクトにも `_locales/` をビルドリソースとして追加

### ドキュメント

- **拡張機能の説明文に英語版を追加**（#91）
  - `docs/chrome-web-store.en.md` / `docs/firefox-add-ons.en.md` / `README.en.md` / `docs/RELEASE_NOTES.en.md` を新規追加
  - 既存の日本語版とは別に、英語圏ユーザー / Chrome Web Store / Firefox AMO 海外配信向けの説明文を整備
  - `.claude/CLAUDE.md` に「日英両方のドキュメントを必ず更新する」ルールを明記
- **GitHub Pages のトップページに Firefox Add-ons の公開リンクを掲載**（#94）
  - `docs/index.md` / `docs/index.en.md` の「配布」セクションで、Firefox を「準備中」表記から AMO ページへのリンクに更新
- **GitHub Pages のリリースノートリンクを自言語版に統一**（#95）
  - `docs/index.md` / `docs/index.en.md` から他言語版リリースノートへのリンクを削除し、自言語版のみ表示
  - 他言語版へはリリースノート冒頭の言語切り替えリンクから遷移できる
- **GitHub Pages のトップページに開発元（オレンジソフト）情報を追加**（#98）
  - `docs/index.md` / `docs/index.en.md` に「開発元 / Developer」セクションを新規追加
  - 開発元（株式会社オレンジソフト）と関連製品（safeAttach / xgate4）へのリンクを掲載

### マイルストーン

- **Safari (macOS / iOS) を Mac App Store / iOS App Store に申請**（2026-04-25）
  - Phase 4 完了（#1）。Apple 審査結果待ち（通常 24〜48 時間）
  - 申請ビルド: Safari Build 2 (Marketing Version 1.0)
  - 関連 PR: #74（HD アイコン）/ #76（提出設定）/ #82（App Group 修正）/ #84（Build 番号）

### バグ修正

- **macOS Safari で API キーや設定が保存されない問題を修正**（#81）
  - PR #76 で App Sandbox を有効化した際、App Group entitlement が未設定だったため `storage.local` が `Disk I/O error` で失敗していた
  - App / Extension 両方に App Group `group.jp.co.orangesoft.dualview-translator` を追加し、共有 Container にアクセスできるよう修正
  - iOS 側にも予防的に同じ App Group を追加

### 改善

- **App Store 提出向けの HD アプリアイコンを制作**（#49）
  - 1024x1024 のマスターから macOS 各サイズ（16〜1024）と iOS 1024 を自動生成
  - iOS 1024 は Apple 推奨に従い角丸を焼き込まないフラット形状（システム側でマスク適用）
  - macOS 用は squircle 風の角丸を適用
  - 拡張本体のブラウザ用アイコン（`icons/icon{16,32,48,128}.png`）も同じマスターから再生成
  - 元データを `assets/app-icon.svg` と再生成スクリプト `assets/generate-icons.py` としてリポジトリに保存

- **Safari / iOS App Store 提出準備**（#75）
  - macOS App / Extension に App Sandbox + Outgoing Connections capability を追加（Mac App Store 必須）
  - iOS App Store ラージアイコンのアルファチャネルを削除（Apple のラージアイコン要件に対応）
  - App Category を Productivity（仕事効率化）に設定
  - 暗号化輸出規制申告（`ITSAppUsesNonExemptEncryption = NO`）を Info.plist に追加
  - macOS / iOS ともに App Store Connect への Archive Upload が成功する状態に
  - macOS Safari / iOS Safari 実機（TestFlight 経由）での動作確認完了

- **プライバシーポリシーを GitHub Pages で公開**（#77）
  - App Store 申請に必要な公開 URL を確保
  - 公開 URL: `https://hirokatsuhibino.github.io/dualview-translator/privacy-policy.html`

---

## v1.3.0（2026-04-22）

### 新機能

- **「ルール」タブを新設**: 自動翻訳ルールが「設定」タブから独立（#50）
  - タブ構成: 翻訳 / ルール / 設定
- **登録済み自動翻訳ルールの編集機能**: 一覧の項目をクリックすると下部フォームで編集可能に（#50）
  - 「追加」ボタンが「更新」に切り替わり、キャンセルボタンで編集解除
  - URLパターン / selector / mode のいずれかが変わったら、既に開いているページに対しても `reapplyAutoRule` で最新ルールを再評価・適用
- **翻訳結果のキャッシュ機能**（#56）
  - Google 翻訳 / DeepL の結果をチャンク単位で `chrome.storage.local` にキャッシュ（key: `tc:<engine>:<sl>:<tl>:<hash>`）
  - 同じ文の再翻訳で API 呼び出しを省略 → 速度向上 + DeepL Free の文字数節約 + Google のレート制限対策
  - TTL 30日 / 最大 2000 件（超過時は LRU で 10% ずつ自動削除）
  - 「設定」タブに現在のキャッシュ件数表示 + 「キャッシュをクリア」ボタン
- **要約結果のキャッシュ機能**（#58）
  - Claude / Gemini の要約結果を `chrome.storage.local` にキャッシュ（key: `sc:<engine>:<tl>:<hash>`）
  - 同じ文の再要約で有料 API 呼び出しを省略 → コスト削減 + 応答速度向上
  - TTL 30日 / 最大 500 件（超過時は LRU で 10% ずつ自動削除）
  - キャッシュ件数は翻訳・要約の合計で「設定」タブに表示
- **キャッシュヒット率の表示**（#64）
  - 「設定」タブのキャッシュ件数の下に翻訳・要約それぞれのヒット率をバー付きで表示
  - ヒット/ミスは `chrome.storage.local` に永続化。キャッシュクリア時にリセット
  - アクセスが1件もない場合はヒット率を非表示

### 改善

- **要約モデルをコスト効率の高いモデルに変更**: Claude Sonnet → Claude Haiku（約10分の1のコスト）（#62）

---

## v1.2.4（2026-04-17）

### 新機能

- **APIキー検証機能**: DeepL / Claude / Gemini のAPIキー入力フィールドに「テスト」ボタンを追加し、ワンクリックでキーの有効性を検証可能に（#27）
  - 成功時は「✓ 有効」（緑）、失敗時は「✗ 無効」（赤）を3秒間表示
  - 残高不足・レート制限はキー有効として判定

### 修正

- **Claudeモデル更新**: 廃止された `claude-3-5-sonnet-20241022` を `claude-sonnet-4-5-20250514` に更新（#29）
- **翻訳バーの表示修正**: innerHTML→DOM API変換時に `<strong>` タグが文字列として表示されるデグレを修正（#29）
- **テストボタンのレイアウト改善**: テストボタンをinputフィールド内右端に配置し、横スクロールなしで見えるように改善（#31, #33）

### 改善

- **PR必須化**: mainへの直接pushを禁止し、すべての変更をPR経由に変更（#25）

---

## v1.2.3（2026-04-16）

### 修正

- **Firefox互換性の改善**: Firefox Add-ons申請時の警告をすべて解消
  - 全ファイルの `innerHTML` をDOM API（`createElement` 等）に置換しセキュリティ警告を解消
  - ポップアップのインラインスクリプトを外部ファイル（`popup-init.js`）に分離（CSP対応）
  - `manifest.json` に `data_collection_permissions` を追加（Firefox新規拡張で必須化）
  - Firefox最低バージョンを109→112に引き上げ（`background.type` サポートに対応）

---

## v1.2.2（2026-04-16）

### 修正

- **二重翻訳バグの修正**: 翻訳済みのテキストが再度翻訳されてしまう問題を修正（#24）

---

## v1.2.1（2026-04-14）

### 修正

- **Chrome Web Store審査対応**: 未使用の `scripting` 権限を `manifest.json` から削除

---

## v1.2.0（2026-04-02）

### 新機能

- **自動翻訳ルール**: URLパターン＋CSSセレクタで特定サイト・特定要素を自動翻訳（#17）
  - 要素ピッカーでページ上の要素をクリックするだけでセレクタを自動生成
  - SPA（シングルページアプリ）のURL変更を検知して再チェック
  - 動的コンテンツ対応（要素が現れるまで最大10秒待機）
  - Webメール等のコンテンツ書き換え対応（変更検知→自動再翻訳）
- **翻訳リセット機能**: 翻訳を元に戻す操作を強化（#18）
  - 翻訳済み要素の末尾に「×」ボタンを追加（要素ごとの個別リセット）
  - ポップアップの「翻訳をリセット」ボタンがページ全体翻訳・領域翻訳の両方をリセット

### 改善

- **選択翻訳パネルのドラッグ移動＆リサイズ**: ヘッダーをドラッグしてパネルを移動、右下ハンドルでリサイズ可能（#21）
- **APIキー未設定時のUI無効化**: LLM APIキー未設定時に要約ボタン・メニューをdisabled（#19）
- **DeepL APIキー未設定時のUI無効化**: DeepL選択時にAPIキー未入力なら翻訳ボタン・コンテキストメニューをdisabled（#20）
- リファクタリング: マジックナンバーの定数化、重複コードの共通関数化（content-page.js 606行 → 511行）
- テスト強化: 自動翻訳ルール・waitForElement・startAutoRuleObserver のテストを追加（合計171件）

---

## v1.1.0（2026-04-01）

### 新機能

- **要素選択翻訳＆要約**: ポップアップから要素をクリックして翻訳＋AIによる要約を表示（#15）
- **タブ式ポップアップUI**: 「翻訳」タブと「設定」タブに分離し、よく使う操作にすぐアクセスできるように改善（#13）
- **動的コンテンツの自動翻訳**: ページ全体翻訳中にlazy loadやinfinite scrollで追加されたコンテンツを自動検出して翻訳（#14）
- **自動テスト**: Vitest + jsdom による126件のユニットテストを導入

### 変更

- **領域選択方式の変更**: ドラッグによる矩形範囲選択から、要素をクリックして選択する方式に変更。マウスホバーで対象要素がハイライト表示されるため、直感的に翻訳したい範囲を指定できる（#12）

### 翻訳モード一覧（8モード）

| モード | 操作方法 |
|--------|---------|
| 選択翻訳 | テキストをドラッグ選択 |
| ページ全体翻訳 | ポップアップから実行 |
| ページ全体翻訳＆要約 | ポップアップから実行 |
| 要素選択翻訳 | ポップアップから要素をクリック |
| 要素選択翻訳＆要約 | ポップアップから要素をクリック |
| 右クリック翻訳 | テキスト選択して右クリック |
| 要素翻訳 | 右クリック（テキスト未選択時） |
| 要素翻訳＆要約 | 右クリック（テキスト未選択時） |

---

## v1.0.0（2026-03-31）

### 初回リリース

- デュアルビュー表示（原文と翻訳を並べて表示）
- 7つの翻訳モード（選択翻訳、ページ全体翻訳＆要約、領域選択、右クリック翻訳、要素翻訳＆要約）
- 2つの翻訳エンジン（Google翻訳 / DeepL）
- AI要約機能（Claude / Gemini）
- 翻訳バー（外国語ページ自動検出）
- キーボードショートカット（Ctrl+Shift+T/Y/R）
- 11言語UI対応
- ダーク/ライトテーマ自動追従

---

Copyright (c) Orangesoft Inc
