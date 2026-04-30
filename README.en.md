# DualView Translator

[日本語](README.md) | English

A browser translation extension that shows the translation **right below the original** in a dual view. Chrome / Firefox / iOS Safari supported (macOS Safari is still in App Store review).

The original text doesn't disappear when you translate, so you can always read with full context.

## What you get

- **Dual-view display** — translation right under the original, never lose the source
- **8 translation modes** — pick the one that fits the moment
- **Auto-translation rules** — match a URL pattern + CSS selector and you're done. Works with SPAs and dynamic content
- **Translation reset** — × button per element, or wipe the page from the popup
- **2 translation engines** — Google Translate (free) or DeepL (sharper)
- **AI summaries** — Claude or Gemini auto-summarizes the translated content
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

For DeepL, sign up at [DeepL API](https://www.deepl.com/pro-api) and paste your key into the popup settings.

## AI summarization

The extension can summarize translated content into 3–5 lines, shown in a green box at the top of the page.

| Engine | API key | Notes |
|--------|---------|-------|
| **Claude** | Required (paid) | Anthropic's AI. High-quality summaries |
| **Gemini** | Required (free tier) | Google's AI. Free tier available |

Pick Claude or Gemini under "Summary engine" in the popup and paste in your key.
- Claude: get a key at [Anthropic Console](https://console.anthropic.com/)
- Gemini: get a key at [Google AI Studio](https://aistudio.google.com/apikey)

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

### macOS Safari (in App Store review)

Submitted to the Mac App Store on 2026-04-25, currently awaiting Apple's review. The Safari Web Extension Xcode project lives under `safari/` if you want to build locally. Build instructions are in [safari/README.md](safari/README.md).

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
