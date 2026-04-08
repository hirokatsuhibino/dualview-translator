# 権限の正当性説明文

Chrome Web Store 審査の「権限の正当性」フォームに記載する説明文。

---

## `<all_urls>` host_permissions の正当性

### 英語（審査フォーム提出用）

**Permission: `<all_urls>` (host_permissions)**

DualView Translator requires access to all URLs because its core functionality is to translate any web page the user visits. The extension cannot predict in advance which websites users want to translate — the entire value of the extension is that it works on any site.

Specifically, `<all_urls>` is required for the following reasons:

1. **Content script injection**: The extension injects content scripts (`content-core.js`, `content-page.js`, `content-bar.js`, etc.) into web pages to display dual-view translations (original text alongside translated text). This must work on any URL the user chooses to translate.

2. **Automatic translation bar**: When the user visits a page in a foreign language, the extension automatically detects the language and displays a translation bar at the top of the page. This feature requires permission to run on all pages.

3. **Auto-translation rules**: Users can register URL patterns (e.g., `*://example.com/*`) to auto-translate specific sites. Since users define these patterns themselves, the extension cannot restrict host permissions to a predefined list of domains.

4. **Selection translation**: The user can select any text on any web page to trigger an instant translation panel. This requires content script access to all pages.

The extension does NOT use `<all_urls>` to collect user data, track browsing history, or access page content for any purpose other than displaying translations requested by the user. Translation text is sent only to the translation API selected by the user (Google Translate or DeepL), and API keys are stored only in the browser's local storage.

---

### 日本語（社内確認用）

**権限: `<all_urls>` (host_permissions)**

DualView Translatorは、ユーザーが訪問するあらゆるウェブページを翻訳することを核心機能としているため、すべてのURLへのアクセスが必要です。ユーザーがどのウェブサイトを翻訳したいかを事前に特定することはできず、「どのサイトでも翻訳できる」ことが本拡張の主たる価値です。

具体的に `<all_urls>` が必要な理由は以下のとおりです。

1. **コンテンツスクリプトの注入**: 原文と翻訳を並べて表示するデュアルビュー翻訳を実現するため、ウェブページにコンテンツスクリプトを注入する必要があります。ユーザーが翻訳を選択したページで動作するため、すべてのURLへのアクセスが必要です。

2. **自動翻訳バー**: ユーザーが外国語のページを訪問した際、言語を自動検出して翻訳バーをページ上部に表示します。この機能はすべてのページで実行される必要があります。

3. **自動翻訳ルール**: ユーザーが独自のURLパターン（例: `*://example.com/*`）を登録して特定サイトを自動翻訳できます。ユーザーが自由にパターンを定義するため、ドメインを事前に限定することは不可能です。

4. **選択翻訳**: ユーザーが任意のウェブページ上でテキストを選択すると翻訳パネルが表示されます。この機能もすべてのページへのコンテンツスクリプトアクセスが必要です。

本拡張は `<all_urls>` をユーザーデータの収集・閲覧履歴の追跡・翻訳表示以外の目的でのページ内容アクセスには一切使用していません。翻訳テキストはユーザーが選択した翻訳API（Google翻訳またはDeepL）にのみ送信され、APIキーはブラウザのローカルストレージにのみ保存されます。

---

Copyright (c) Orangesoft Inc.
