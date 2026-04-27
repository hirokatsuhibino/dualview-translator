---
title: Privacy Policy
description: Privacy policy for DualView Translator.
permalink: /privacy-policy.html
---

# Privacy Policy — DualView Translator

Last updated: 2026-04-17

## Overview

DualView Translator is a browser extension that provides side-by-side translation and AI-powered summarization. This privacy policy explains how the extension handles user data.

## Data Collection

DualView Translator does **not** collect, store, or transmit any personal data to our servers. We do not have any servers that receive user data.

## Data Stored Locally

The following data is stored locally on your device using the browser's `chrome.storage.local` API. This data never leaves your device except as described below.

- **User preferences**: UI language, target language, translation engine selection, theme settings
- **API keys**: DeepL, Claude, and Gemini API keys (entered by the user)
- **Auto-translation rules**: URL patterns and CSS selectors configured by the user

## Data Sent to Third-Party Services

When you use translation or summarization features, the text you select or the page content is sent to the following third-party APIs depending on your engine selection:

| Service | When used | Data sent | Privacy policy |
|---------|-----------|-----------|----------------|
| Google Translate | Default translation engine | Selected text or page content | [Google Privacy Policy](https://policies.google.com/privacy) |
| DeepL | When selected as translation engine | Selected text or page content, API key | [DeepL Privacy Policy](https://www.deepl.com/privacy) |
| Anthropic (Claude) | When used for summarization | Selected text or page content, API key | [Anthropic Privacy Policy](https://www.anthropic.com/privacy) |
| Google (Gemini) | When used for summarization | Selected text or page content, API key | [Google Privacy Policy](https://policies.google.com/privacy) |

## Permissions

- **activeTab**: Access the current tab's content for translation
- **storage**: Store user preferences and API keys locally
- **contextMenus**: Add right-click translation options
- **host_permissions**: Communicate with translation and summarization APIs

## Data Security

- API keys are stored locally and transmitted only to their respective API endpoints
- No data is sent to any server operated by the extension developer
- No analytics, tracking, or telemetry is collected

## Children's Privacy

This extension does not knowingly collect any information from children under 13.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted in the extension's repository.

## Contact

If you have questions about this privacy policy, please contact us via the [GitHub repository](https://github.com/hirokatsuhibino/dualview-translator/issues).

---

Copyright (c) Orangesoft Inc.
