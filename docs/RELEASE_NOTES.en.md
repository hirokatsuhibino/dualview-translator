---
title: Release Notes
description: Release notes for DualView Translator.
permalink: /RELEASE_NOTES.en.html
---

[日本語](RELEASE_NOTES.html) | English

# Release Notes

## Unreleased

### Bug fixes

- **Fix: mini translate icon didn't show up on iOS Safari** (#127)
  - The selection detection was `mouseup`-only, which doesn't fire predictably for iOS text selection (long-press + range handles). Added a debounced `selectionchange` listener (300ms) so iOS picks up the selection too. Desktop behavior (Chrome / Firefox / macOS Safari) is unchanged.

### Milestones

- **iOS Safari extension is now live on the App Store** (2026-04-28)
  - Public URL: https://apps.apple.com/app/dualview-translator/id6763488360
  - Submitted build: Safari Build 2 (Marketing Version 1.0)
  - macOS Safari is still in Mac App Store review

---

## v1.4.0 (2026-04-27)

### Improvements

- **Selection translation now starts from a tiny icon instead of an instant full panel** (#102)
  - Highlighting text used to pop the entire translate panel right under your selection — handy, but in the way when you were just trying to copy something
  - Now you only get a small translate icon next to your selection. Click it and the full panel slides in like before
  - Right-click "Translate" and `Ctrl+Shift+Y` are explicit triggers, so they still open the full panel directly (no extra click)
  - Added an i18n key `translateSelection` (used as the icon's aria-label / title) across all 11 languages
- **Localized store description & shortcut hints via the browser's built-in i18n (`_locales/`)** (#93)
  - Replaced `manifest.json`'s `description` and `commands.*.description` with `__MSG_<key>__` placeholders
    and shipped 11 language packs (ar / de / en / es / fr / ja / ko / pt_BR / ru / zh_CN / zh_TW) under `_locales/`
  - Now the description in Chrome Web Store / Firefox Add-ons / Mac App Store / iOS App Store listings
    and the shortcut hints in `chrome://extensions/shortcuts` show up in the user's browser language
  - `default_locale` is `en` — anything we haven't translated falls back here
  - The Safari Web Extension Xcode project also picks up `_locales/` as a build resource

### Documentation

- **English versions of extension descriptions** (#91)
  - Added `docs/chrome-web-store.en.md` / `docs/firefox-add-ons.en.md` / `README.en.md`
  - Targets English-speaking users and overseas distribution on Chrome Web Store / Firefox AMO
- **Linked the published Firefox Add-ons page from the GitHub Pages landing pages** (#94)
  - The "Distribution" section in `docs/index.md` / `docs/index.en.md` now points to the AMO page instead of saying "coming soon"
- **Cleaned up release-notes links on the GitHub Pages landing pages so each language only shows its own** (#95)
  - Dropped the cross-language release-notes link from `docs/index.md` / `docs/index.en.md`
  - You can still hop between languages from the language toggle at the top of each release-notes page
- **Added a "Developer" section to the GitHub Pages landing pages** (#98)
  - New "Developer" section on `docs/index.md` / `docs/index.en.md` linking to Orangesoft Inc. and other products (safeAttach / xgate4)

### Milestones

- **Submitted Safari (macOS / iOS) to Mac App Store / iOS App Store** (2026-04-25)
  - Phase 4 complete (#1). Awaiting Apple review (typically 24–48 hours)
  - Submitted build: Safari Build 2 (Marketing Version 1.0)
  - Related PRs: #74 (HD icons) / #76 (submission setup) / #82 (App Group fix) / #84 (build number bump)

### Bug Fixes

- **Fixed: API keys and settings not saved on macOS Safari** (#81)
  - When App Sandbox was enabled in PR #76, the App Group entitlement was missing, so `storage.local` failed with `Disk I/O error`
  - Added App Group `group.jp.co.orangesoft.dualview-translator` to both App and Extension to allow access to the shared Container
  - Same App Group also added to iOS as a precaution

### Improvements

- **HD app icon for App Store submission** (#49)
  - Auto-generated all macOS sizes (16–1024) and iOS 1024 from a single 1024x1024 master
  - iOS 1024 follows Apple's recommendation: no baked-in rounded corners (system applies the mask)
  - macOS uses a squircle-style rounded corner
  - The browser-extension icons (`icons/icon{16,32,48,128}.png`) are also regenerated from the same master
  - Master data saved as `assets/app-icon.svg` and the regeneration script `assets/generate-icons.py`

- **Safari / iOS App Store submission setup** (#75)
  - Added App Sandbox + Outgoing Connections capability to the macOS App / Extension (required for Mac App Store)
  - Removed the alpha channel from the iOS App Store large icon (per Apple's large-icon requirements)
  - Set App Category to Productivity
  - Added the encryption export-compliance declaration (`ITSAppUsesNonExemptEncryption = NO`) to Info.plist
  - macOS / iOS Archive Upload to App Store Connect now succeeds
  - Verified working on macOS Safari / iOS Safari devices via TestFlight

- **Privacy Policy published on GitHub Pages** (#77)
  - Provides a stable public URL required for App Store submission
  - Public URL: `https://hirokatsuhibino.github.io/dualview-translator/privacy-policy.html`

---

## v1.3.0 (2026-04-22)

### New Features

- **New "Rules" tab**: auto-translation rules now have their own tab, separate from settings (#50)
  - Tab layout: Translate / Rules / Settings
- **Edit registered auto-translation rules**: click an item in the list to edit it in the form below (#50)
  - The "Add" button switches to "Update", and a "Cancel" button appears to exit edit mode
  - When the URL pattern, selector, or mode changes, the latest rule is re-evaluated and applied via `reapplyAutoRule` to already-open pages
- **Translation cache** (#56)
  - Caches Google Translate / DeepL results per chunk in `chrome.storage.local` (key: `tc:<engine>:<sl>:<tl>:<hash>`)
  - Skips API calls for re-translations of the same text → faster, saves DeepL Free character quota, easier on Google's rate limit
  - TTL 30 days / max 2,000 entries (LRU evicts 10% when over the limit)
  - Settings tab shows the current cache count and a "Clear cache" button
- **Summarization cache** (#58)
  - Caches Claude / Gemini summary results in `chrome.storage.local` (key: `sc:<engine>:<tl>:<hash>`)
  - Skips paid API calls for re-summarizations → cost reduction + faster responses
  - TTL 30 days / max 500 entries (LRU evicts 10% when over the limit)
  - The settings tab shows the combined translation + summary cache count
- **Cache hit rate display** (#64)
  - Hit rates for translation and summarization shown with progress bars under the cache count in the settings tab
  - Hits / misses are persisted in `chrome.storage.local` and reset when the cache is cleared
  - Hidden when there are no accesses yet

### Improvements

- **Switched the summary model to a more cost-effective one**: Claude Sonnet → Claude Haiku (about 1/10 the cost) (#62)

---

## v1.2.4 (2026-04-17)

### New Features

- **API key validation**: a "Test" button on each of the DeepL / Claude / Gemini API key fields lets you check key validity in one click (#27)
  - Shows "✓ Valid" (green) on success or "✗ Invalid" (red) on failure for 3 seconds
  - Insufficient balance / rate limit are treated as valid keys

### Fixes

- **Claude model update**: replaced the deprecated `claude-3-5-sonnet-20241022` with `claude-sonnet-4-5-20250514` (#29)
- **Translation bar display fix**: fixed a regression where `<strong>` tags appeared as literal text after innerHTML→DOM API conversion (#29)
- **Test button layout**: placed the Test button inside the input field on the right so it's visible without horizontal scroll (#31, #33)

### Improvements

- **PRs required**: direct push to main is now disallowed; all changes must go through a PR (#25)

---

## v1.2.3 (2026-04-16)

### Fixes

- **Firefox compatibility**: cleared all warnings raised during the Firefox Add-ons submission
  - Replaced all `innerHTML` usages with DOM APIs (`createElement`, etc.) to clear security warnings
  - Moved the popup's inline scripts to an external file (`popup-init.js`) for CSP compliance
  - Added `data_collection_permissions` to `manifest.json` (now required for new Firefox extensions)
  - Bumped Firefox minimum version from 109 to 112 (for `background.type` support)

---

## v1.2.2 (2026-04-16)

### Fixes

- **Double-translation bug fix**: fixed an issue where already-translated text could be translated again (#24)

---

## v1.2.1 (2026-04-14)

### Fixes

- **Chrome Web Store review compliance**: removed the unused `scripting` permission from `manifest.json`

---

## v1.2.0 (2026-04-02)

### New Features

- **Auto-translation rules**: auto-translate specific sites and elements via URL pattern + CSS selector (#17)
  - The element picker generates a selector from a single click on the page
  - Detects URL changes in SPAs (single-page apps) and re-checks
  - Dynamic content support (waits up to 10 seconds for elements to appear)
  - Webmail-style content rewriting handled (change detection → auto re-translation)
- **Translation reset**: stronger ways to undo translations (#18)
  - Added an "×" button at the end of each translated element (per-element reset)
  - The popup's "Reset translations" button now resets both full-page and region translations

### Improvements

- **Drag and resize the selection translation panel**: drag the header to move, drag the bottom-right handle to resize (#21)
- **Disable UI when API key is missing**: the summary button and menu are disabled when the LLM API key is missing (#19)
- **Disable UI when DeepL API key is missing**: with DeepL selected and the key missing, translation buttons and the context menu are disabled (#20)
- Refactor: extracted magic numbers as constants and consolidated duplicated code (content-page.js 606 → 511 lines)
- More tests: added tests for auto-translation rules, `waitForElement`, and `startAutoRuleObserver` (171 total)

---

## v1.1.0 (2026-04-01)

### New Features

- **Element selection translation & summary**: click an element from the popup to translate it and get an AI summary (#15)
- **Tabbed popup UI**: split into "Translate" and "Settings" tabs so common actions are reachable in one click (#13)
- **Auto-translate dynamic content**: while a full-page translation is active, content added by lazy load or infinite scroll is auto-detected and translated (#14)
- **Automated tests**: introduced 126 unit tests with Vitest + jsdom

### Changes

- **Region selection method changed**: from drag-rectangle selection to click-an-element selection. Hovering highlights the target element so you can pick the region intuitively (#12)

### Translation modes (8 total)

| Mode | How |
|------|-----|
| Selection translation | Drag-select text |
| Full-page translation | From the popup |
| Full-page translation & summary | From the popup |
| Element selection translation | Click an element from the popup |
| Element selection translation & summary | Click an element from the popup |
| Right-click translation | Select text, then right-click |
| Element translation | Right-click (with no text selected) |
| Element translation & summary | Right-click (with no text selected) |

---

## v1.0.0 (2026-03-31)

### Initial Release

- Dual-view display (original text with translation right below)
- 7 translation modes (selection, full page & summary, region selection, right-click, element & summary)
- 2 translation engines (Google Translate / DeepL)
- AI summary (Claude / Gemini)
- Translation bar (auto-detect foreign-language pages)
- Keyboard shortcuts (Ctrl+Shift+T/Y/R)
- 11-language UI
- Auto-following dark / light theme

---

Copyright (c) Orangesoft Inc
