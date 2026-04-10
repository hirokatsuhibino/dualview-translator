# Chrome Web Store 審査回答

Chrome Web Store 審査フォームへの回答をまとめたドキュメント。

---

## 単一用途（Single Purpose）

DualView Translator has a single purpose: to display original text and its translation side by side on any web page, so users can read foreign-language content while keeping the original context visible.

All features serve this purpose:

- Selection translation — translates selected text in a floating panel alongside the original
- Full-page translation — inserts translations below each paragraph, keeping original text visible
- Element translation — translates a clicked element in dual-view
- AI summarization — summarizes translated content as a reading aid (complementary to translation)
- Auto-translation rules — applies dual-view translation automatically on predefined sites
- Translation bar — prompts translation when a foreign-language page is detected

The extension does not modify browser settings, manage bookmarks, alter search behavior, or perform any function unrelated to translation.

---

## activeTab が必要な理由

The `activeTab` permission is required to interact with the currently active tab when the user clicks the extension icon. Specifically, it is used to send messages from the popup to the content scripts running in the active tab — for example, to trigger page translation, reset translations, or enter element selection mode. Without this permission, the popup cannot communicate with the page the user is currently viewing.

---

## storage が必要な理由

The `storage` permission is required to persist user settings across browser sessions. The following data is stored locally using `chrome.storage.local`:

- Selected translation engine (Google Translate or DeepL) and DeepL API key
- Selected AI summarization engine (Claude or Gemini) and the respective API key
- Target language for translation
- UI display language
- Auto-translation rules (URL patterns, CSS selectors, translation mode)

No data is synced to external servers. All settings remain on the user's device.

---

## scripting が必要な理由

The `scripting` permission is required to programmatically inject content scripts into web pages. While content scripts are declared statically in the manifest, `scripting` is additionally used to execute functions in the page context — for example, to extract CSS selectors when the user activates the element picker for auto-translation rule configuration. This allows the extension to identify the exact DOM element the user clicked without exposing page content to the background service worker.

---

## contextMenus が必要な理由

The `contextMenus` permission is required to add translation options to the browser's right-click context menu. The extension adds the following menu items:

- "DualView: Translate selection" — appears when the user has selected text; translates the selection and displays it in a panel
- "DualView: Translate this element" — appears when no text is selected; translates the block element at the cursor position in dual-view
- "DualView: Translate & summarize this element" — same as above, with AI summarization

These menu items provide a quick translation trigger without requiring the user to open the popup.

---

## ホスト権限が必要な理由（host_permissions）

`<all_urls>` is required because the extension must work on any web page the user chooses to translate. The target site cannot be known in advance. It is used solely to inject content scripts for dual-view translation, show the auto-detection bar, support user-defined auto-translation rules, and enable selection translation. It is NOT used to collect data or track browsing history.

Additional API endpoints are declared for the translation and AI services the user selects:

- `https://translate.googleapis.com/*` — Google Translate (default engine, no API key required)
- `https://api-free.deepl.com/*`, `https://api.deepl.com/*` — DeepL Free and Pro (requires user's API key)
- `https://api.anthropic.com/*` — Claude AI summarization (requires user's API key)
- `https://generativelanguage.googleapis.com/*` — Gemini AI summarization (requires user's API key)

All requests are triggered only by explicit user action.

---

## リモートコードの利用有無

**The extension does NOT use any remote code.**

All JavaScript executed by the extension is bundled locally within the extension package:

- `background.js` — service worker
- `content-core.js`, `content-page.js`, `content-bar.js`, `content-selection.js` — content scripts
- `i18n.js` — localization
- `popup.js` — popup UI logic

The extension makes network requests only to the translation and AI APIs listed above (Google Translate, DeepL, Claude, Gemini), and these requests transmit user-provided text for translation or summarization only. No external scripts are fetched or executed at runtime.

---

Copyright (c) Orangesoft Inc.
