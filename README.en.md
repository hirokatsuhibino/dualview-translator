# DualView Translator

[日本語](README.md) | English

A browser translation extension that shows the translation **right below the original** in a dual view. Chrome / Firefox / iOS Safari / macOS Safari supported.

The original text doesn't disappear when you translate, so you can always read with full context.

## What you get

- **Dual-view display** — translation right under the original, never lose the source
- **8 translation modes** — pick the one that fits the moment
- **Auto-translation rules** — match a URL pattern + CSS selector and you're done. Works with SPAs and dynamic content
- **Translation reset** — × button per element, or wipe the page from the popup
- **3 translation engines** — Google Translate (free) / DeepL (sharper) / Apple Translation (offline, macOS Safari only). When you're offline, we automatically fall back to Apple Translation
- **AI summaries** — Claude or Gemini auto-summarizes the translated content
- **Text-to-speech** — every translation block gets a 🔊 button. Reads out the translation using your browser's built-in voice (no extra API key needed)
- **iOS / macOS Share Extension** — translate text from outside Safari too (Notes, Mail, News, etc.) via the share sheet (v1.6+ / iOS 15+ / macOS 12+)
- **Translation & summary cache** — same text won't hit the API twice. Faster, cheaper. Hit rate shown in settings
- **Tabbed popup** — translate stuff on one tab, configure on the other
- **Keyboard shortcuts** — common actions in one keypress
- **11 languages** — Japanese, English, Chinese (Simplified/Traditional), Korean, French, German, Spanish, Portuguese, Russian, Arabic
- **Dark / Light theme** — follows your browser
- **Multilingual UI** — switch the extension's display language anytime

## Translation modes

| Mode | How | What for |
|------|-----|----------|
| **Selection translation** | Highlight text → click the small icon that appears | Quick translate of one phrase |
| **Full-page translation** | From the popup | Translate an entire article or document |
| **Full-page + AI summary** | From the popup | Translation plus an AI overview |
| **Element selection** | Click an element via popup | Translate just one part of the page |
| **Element + AI summary** | Click an element via popup | Translate one part plus AI summary |
| **Right-click translation** | Select text → right-click | Instant translation of selected text |
| **Element translation (right-click)** | Right-click (no text selected) | Translate the block under the cursor |
| **Element + AI summary (right-click)** | Right-click (no text selected) | Same with AI summary |

Plus, when you open a foreign-language page, a translation bar shows up at the top. One click → "Translate" or "Translate & Summarize".

## Auto-translation rules

Tell DualView to auto-translate certain sites whenever you open them.

### Adding a rule

1. Click the toolbar icon
2. Open the "Rules" tab
3. Enter a URL pattern (e.g. `*://example.com/*`)
4. Optionally specify a CSS selector for the target elements
   - **"Pick element" button**: click anything on the page and the selector is generated for you
5. Pick a mode (translate only / translate + summary)
6. Click "Add"

### Editing a rule

- Click an entry in the list — its values load into the form below in **edit mode**
- Change the URL pattern, selector, or mode and click "Update" to overwrite
- "Cancel" exits edit mode (back to add mode)
- Clicking the same entry again also exits edit mode

### How auto-translate behaves

- **No selector**: translates the whole page
- **With selector**: translates only the matching elements, and re-translates when the content changes (great for webmail)
- **SPA support**: rules are re-checked whenever the URL changes

## Translation engines

| Engine | API key | Notes |
|--------|---------|-------|
| **Google Translate** | None | Free, ready to use. Default |
| **DeepL** | Required (free tier) | Sharper translations. 500,000 characters/month free |
| **Apple Translation** | None | macOS Safari only. On-device — no network, no API key |

For DeepL, sign up at [DeepL API](https://www.deepl.com/pro-api) and paste your key into the popup settings.

Apple Translation only shows up on macOS Safari (we auto-detect it at startup and add it to the engine picker). If you're on Google or DeepL and your network drops, we automatically fall back to Apple Translation — but if the cache already has what you need, we just serve from cache and skip the fallback.

## AI summarization

The extension can summarize translated content into 3–5 lines, shown in a green box at the top of the page.

| Engine | API key | Notes |
|--------|---------|-------|
| **Claude** | Required (paid) | Anthropic's AI. High-quality summaries |
| **Gemini** | Required (free tier) | Google's AI. Free tier available |

Pick Claude or Gemini under "Summary engine" in the popup and paste in your key.
- Claude: get a key at [Anthropic Console](https://console.anthropic.com/)
- Gemini: get a key at [Google AI Studio](https://aistudio.google.com/apikey)

## Text-to-speech

Every translation block gets a 🔊 button on the right. Click it and the translation is read out in your target language.

| Where | Visibility |
|-------|------------|
| Selection panel | Next to the copy button, always visible |
| Inline translation block | To the left of the ×, only on hover |
| Summary block | Right after the "Summary" badge, always visible |

- Icon flips to ⏹ while speaking — click again to stop
- Pressing another speak button stops the current playback and starts the new one
- `Esc`, switching tabs, or leaving the page also stops it
- Uses your browser's built-in Web Speech API, so **no extra API key or permission is needed**
- If the OS doesn't ship a voice for the target language (say, Arabic on a fresh Windows install), you'll see a toast and nothing plays

## Share Extension (iOS / macOS)

Starting in v1.6, you can translate text from outside Safari too — just hit the share sheet.

| Action | What happens |
|--------|--------------|
| In Notes / Mail / News etc., select text → Share → **DualView Translator** | Side-by-side translation pops up as a sheet (iOS) or a floating window (macOS) |
| **Copy** in the translation view | Copies the translation to clipboard (shows "✓ Copied" for 2 seconds) |
| **Close** / `Esc` (macOS) | Dismisses the extension |

- Supported OS: **iOS 15.0+ / macOS 12.0+** (the existing Safari Web Extension still works on macOS 10.14+)
- Translation engine: **Google Translate** (v1). Summarization, DeepL, and Apple Translation are coming in v2.
- Settings (target language, etc.) you set in the web extension are shared via App Group automatically — no need to set anything up again
- The shared text rides on a GET URL, but we use `URLSession.ephemeral` + disabled `URLCache` so it doesn't get cached on your device. (Heads up: it can still appear in Google's server access logs or any proxy logs along the way — that's the nature of GET requests.)

Bundled with the App Store version (no separate setup needed — it just shows up in the share sheet's app list).

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+T` (Mac: `Cmd+Shift+T`) | Toggle full-page translation |
| `Ctrl+Shift+Y` (Mac: `Cmd+Shift+Y`) | Translate selected text |
| `Ctrl+Shift+R` (Mac: `Cmd+Shift+R`) | Enter element selection mode |

You can change these in your browser's shortcut settings:
- **Chrome / Edge**: `chrome://extensions/shortcuts`
- **Firefox**: `about:addons` → gear icon → "Manage Extension Shortcuts"

## Supported languages

Japanese, English, Chinese (Simplified/Traditional), Korean, French, German, Spanish, Portuguese, Russian, Arabic

## Install

### Chrome / Edge

Live on the Chrome Web Store:

https://chromewebstore.google.com/detail/dualview-translator/hmnlfemcpbkcfppjnghiofddiiclkbmg

Want to try a dev build? Grab the latest ZIP from [Releases](../../releases) and load it in `chrome://extensions/` via "Load unpacked".

### Firefox

Get it from Firefox Add-ons:

https://addons.mozilla.org/en-US/firefox/addon/dualview-translator/

### iOS Safari

Live on the App Store since 2026-04-28:

https://apps.apple.com/app/dualview-translator/id6763488360

### macOS Safari

Live on the Mac App Store since 2026-05-01:

https://apps.apple.com/app/dualview-translator/id6763488360

The Safari Web Extension Xcode project lives under `safari/` if you want to build locally. Build instructions are in [safari/README.md](safari/README.md).

### Pin it to your toolbar

Pin the extension to your toolbar after installing, and you can open the popup in one click.

1. Click the puzzle-piece (Extensions) icon at the top-right of your toolbar.
2. Click the pin icon next to "DualView Translator" to keep it in view.

A page walking you through these steps pops up automatically the first time you install. Browsers don't let extensions force-pin themselves, so you'll have to do this bit by hand. On browsers that can read the pin state (Chrome 91+ and friends), the hint goes away once it's pinned — but on browsers that can't (like Firefox), it may stick around since there's no way to tell.

## How to use

### Selection translation (the easy one)

1. Highlight the text you want translated
2. A small translate icon shows up next to your selection — click it
3. The floating panel pops open
4. Pick a target language and click "Translate"
5. Original and translation appear stacked together (translation right below)

### Full-page translation

1. Click the toolbar icon
2. Pick a target language
3. Click "Translate this page" (or "Translate & Summarize" for the AI summary version)
4. Translations get inserted under each paragraph and heading
5. "Reset translations" undoes everything (per-element undo via the × button)

> Lazy-loaded content gets translated automatically as it appears.

### Element selection translation

1. Click the toolbar icon
2. Click "Pick a region to translate" (or with summary)
3. Hover over elements — orange highlight shows what's selectable
4. Click the element you want, and it (plus its children) gets translated
5. Esc to cancel

### Right-click translation

- **With text selected**: right-click → "DualView: Translate" → result in panel
- **No text selected**: right-click → "DualView: Translate this element" → block translated in dual view
- **No text selected**: right-click → "DualView: Translate & Summarize this element" → translation + AI summary

### Switching translation engines

1. Click the toolbar icon
2. Open the "Settings" tab
3. Pick "Google Translate" or "DeepL" under "Translation engine"
4. If DeepL, paste your API key

### Setting up the summary engine

1. Click the toolbar icon
2. Open the "Settings" tab
3. Pick Claude or Gemini under "Summary engine"
4. Paste in your API key

### Changing the UI language

In the popup's "Settings" tab, find "Display language" — switch the extension UI language anytime.

### Syncing settings across devices

Tick the checkbox in the "Sync between devices" section of the Settings tab, and your settings will sync automatically across all your devices.

- Synced: target language, translation engine, summary engine, auto-translate rules, dismissed domains, UI language
- **API keys**: not synced — they stay on each device to avoid leaking through your cloud account. Set them per device
- Engines: Google account on Chrome / Edge, Firefox account on Firefox, iCloud Keychain on Safari (beta)
- First-time enable: cloud values win (so anything already synced from another device stays), and local-only keys get pushed up
- If you hit chrome.storage.sync's 8KB-per-item limit (can happen with lots of auto-translate rules), you'll see an inline error.

### Backing up your settings (export / import)

The Settings tab has a "Settings backup" section. Export your current settings to a JSON file, then import that file on another device or after a clean reinstall.

- Included: target language, translation engine, summary engine, auto-translate rules, dismissed domains, UI language
- **Theme**: not included — it's re-derived from your OS `prefers-color-scheme` on every page load, so importing it would be overwritten right away
- **API keys**: not included by default. Tick "Include API keys" to opt in — keeping it separate means you won't leak them by accident
- Translation/summary caches and hit-rate stats aren't included (device-specific)
- Import flow: on Chrome / Edge / Safari, hit "Load from file" to pick the `.json` directly. On Firefox the file picker button is hidden because Firefox popups close themselves when a system dialog opens — paste the JSON contents into the textarea instead.
- Import is a **merge**: only the keys present in the JSON are written. Keys not in the file (e.g. API keys when you exported without them) keep their current values.
- Mismatched versions (e.g. a future v2 file on a v1 client) are rejected for safety.

## Notes

- Google Translate uses a free endpoint, so heavy use can hit a temporary rate limit
- DeepL Free API caps at 500,000 characters/month
- AI summaries need a Claude or Gemini API key
- Doesn't run on browser-internal pages (`chrome://`, `about:`, etc.)

## Privacy

- Translated text only goes to your chosen translation engine's API (Google / DeepL)
- Summary text only goes to your chosen summary engine's API (Claude / Gemini)
- API keys are stored only in your browser's local storage, never sent elsewhere
- No translation history collection, no tracking

## Development

### Tests

```bash
npm install        # install dependencies
npm test           # run tests
npm run test:watch # watch mode
```

Tests run with [Vitest](https://vitest.dev/) + jsdom.

## License

MIT License

---

Copyright (c) Orangesoft Inc
