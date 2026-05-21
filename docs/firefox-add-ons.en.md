# Firefox Add-ons (AMO) Listing Text (English)

Firefox AMO descriptions support HTML tags (`<b>`, `<ul>`, `<li>`, `<a>`, `<br>`, etc.).

---

## Extension Name

DualView Translator

## Summary (250 characters max)

Dual-view translation: keeps the original visible with the translation right below. Read foreign content with full context. Google Translate / DeepL ready, AI summaries on tap.

## Detailed Description (HTML)

```html
<p>Tired of translation tools that swallow the original text? DualView Translator keeps it right there — the translation slides in <b>right under</b> the original, so you never lose the context.</p>

<p>Great for language learners, anyone reading foreign articles, or when you just want to double-check what a translator gave you.</p>

<b>■ What you get</b>
<ul>
  <li><b>Dual-view display</b> — translation appears right under the original, no jumping back and forth</li>
  <li><b>8 translation modes</b> — pick what fits: a single line, the whole page, just one element, with or without AI summary</li>
  <li><b>Auto-translation rules</b> — set up your favorite sites once, and they get translated automatically when you open them</li>
  <li><b>Translation reset</b> — undo per element with the × button, or wipe everything in one tap</li>
  <li><b>Two engines</b> — Google Translate (free, no setup) or DeepL (sharper translations)</li>
  <li><b>AI summaries</b> — Claude or Gemini sums up the translated content in 3–5 lines</li>
  <li><b>Tabbed popup</b> — translation actions and settings, neatly separated</li>
  <li><b>Keyboard shortcuts</b> — Ctrl+Shift+T, you know the drill</li>
  <li><b>11 UI languages</b> — Japanese, English, Chinese (Simplified/Traditional), Korean, French, German, Spanish, Portuguese, Russian, Arabic</li>
  <li><b>Dark / Light theme</b> — follows your OS, no fuss</li>
</ul>

<b>■ The 8 translation modes</b>
<ol>
  <li><b>Selection translation</b> — highlight text, the panel pops up</li>
  <li><b>Full-page translation</b> — translate the whole page in dual view</li>
  <li><b>Full-page + AI summary</b> — translation plus a quick overview</li>
  <li><b>Element selection translation</b> — click the element you care about</li>
  <li><b>Element selection + AI summary</b> — same, but with a summary</li>
  <li><b>Right-click translation</b> — select text, right-click, done</li>
  <li><b>Element translation (right-click)</b> — right-click on a block to translate it</li>
  <li><b>Element translation + AI summary</b> — same, with a summary</li>
</ol>

<b>■ The translation bar</b>
<p>Open a foreign-language page and a small bar pops up at the top. One click to "Translate", one click to "Translate &amp; Summarize". That's it.</p>

<b>■ Auto-translation rules</b>
<p>Got a site you read in another language every day? Register it once with a URL pattern, narrow down to the part you care about with a CSS selector (or just click the element to generate one), and you're set. Works with SPAs, dynamic content, even webmail.</p>

<b>■ Dynamic content</b>
<p>Lazy-loaded sections, infinite scroll — they get picked up and translated as they appear. No need to keep clicking "translate" again.</p>

<b>■ Translation engines</b>
<ul>
  <li><b>Google Translate</b>: free, no API key, ready to roll (default)</li>
  <li><b>DeepL</b>: better quality. Free tier covers 500,000 characters/month</li>
</ul>

<b>■ AI summaries</b>
<p>Hook up Claude (Anthropic) or Gemini (Google) and get a quick 3–5 line summary of the page you just translated. API key needed for these.</p>

<b>■ Privacy, plain and simple</b>
<ul>
  <li>Your text only goes to the translation engine you picked</li>
  <li>API keys live in your browser's local storage, nowhere else</li>
  <li>No history collection, no tracking, no data goes to us</li>
</ul>

<b>■ Keyboard shortcuts</b>
<ul>
  <li>Ctrl+Shift+T → toggle full-page translation</li>
  <li>Ctrl+Shift+Y → translate selected text</li>
  <li>Ctrl+Shift+R → enter element selection mode</li>
</ul>
```

---

## Categories

- Primary: Productivity
- Secondary: Accessibility

## Tags (Search Keywords)

translation, translator, translate, deepl, google translate, dual view, bilingual, AI summary

## Languages

Japanese, English, Chinese (Simplified), Chinese (Traditional), Korean, French, German, Spanish, Portuguese, Russian, Arabic

## Screenshot Captions

### Screenshot 1: Dual-view display
The translation slides right under the original. Read both at once.

### Screenshot 2: Selection translation
Just highlight text — a floating panel pops up. Done.

### Screenshot 3: Tabbed popup
Translation actions on one tab, settings on the other. Clean and easy.

### Screenshot 4: AI summary
AI sums up the translation in 3–5 lines. Catch the gist fast.

### Screenshot 5: Translation bar
Foreign-language page? A bar pops up automatically. One click to go.

### Screenshot 6: Auto-translation rules
Set up your regular sites once, and they get auto-translated. Element picker generates selectors for you.

## Notes for reviewers

The red `dev` badge next to the version number in the popup only shows up when the extension is loaded as a **temporary add-on in developer mode**. Add-ons installed through Firefox AMO get `installType: 'normal'` from `browser.management.getSelf()`, so the badge stays hidden (CSS `display: none`).

---

Copyright (c) Orangesoft Inc.
