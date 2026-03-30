// DualView Translator - Background Service Worker
// Handles translation API calls (avoids CORS issues in content scripts on some browsers)

// ─── コンテキストメニュー用の翻訳辞書（background.jsはi18n.jsを読めないため） ─
const CONTEXT_MENU_TITLES = {
  ja:      { selection: 'DualView: 「%s」を翻訳',              element: 'DualView: この要素を翻訳' },
  en:      { selection: 'DualView: Translate "%s"',            element: 'DualView: Translate this element' },
  'zh-CN': { selection: 'DualView: 翻译「%s」',               element: 'DualView: 翻译此元素' },
  'zh-TW': { selection: 'DualView: 翻譯「%s」',               element: 'DualView: 翻譯此元素' },
  ko:      { selection: 'DualView: "%s" 번역',                element: 'DualView: 이 요소 번역' },
  fr:      { selection: 'DualView : Traduire « %s »',         element: 'DualView : Traduire cet élément' },
  de:      { selection: 'DualView: „%s" übersetzen',           element: 'DualView: Dieses Element übersetzen' },
  es:      { selection: 'DualView: Traducir "%s"',             element: 'DualView: Traducir este elemento' },
  pt:      { selection: 'DualView: Traduzir "%s"',             element: 'DualView: Traduzir este elemento' },
  ru:      { selection: 'DualView: Перевести «%s»',            element: 'DualView: Перевести этот элемент' },
  ar:      { selection: 'DualView: ترجمة "%s"',               element: 'DualView: ترجمة هذا العنصر' },
};

function getMenuTitles(lang) {
  return CONTEXT_MENU_TITLES[lang] || CONTEXT_MENU_TITLES['en'];
}

// ─── コンテキストメニュー登録 ─────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  // 保存済みUI言語を読んでメニュータイトルを設定
  chrome.storage.local.get('uiLang', (data) => {
    const titles = getMenuTitles(data.uiLang || 'ja');
    chrome.contextMenus.create({
      id: 'dvt-translate-selection',
      title: titles.selection,
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'dvt-translate-element',
      title: titles.element,
      contexts: ['page', 'frame', 'link', 'image', 'video', 'audio'],
    });
  });
});

// ─── UI言語変更時にメニュータイトルを更新 ─────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.uiLang) {
    const titles = getMenuTitles(changes.uiLang.newValue);
    chrome.contextMenus.update('dvt-translate-selection', { title: titles.selection });
    chrome.contextMenus.update('dvt-translate-element', { title: titles.element });
  }
});

// ─── コンテキストメニュークリック ─────────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'dvt-translate-selection' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'contextMenuTranslate',
      text: info.selectionText,
    });
  }
  if (info.menuItemId === 'dvt-translate-element') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'contextMenuTranslateElement',
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'translate') {
    fetchTranslation(msg.text, msg.tl, msg.sl || 'auto')
      .then(result => sendResponse({ ok: true, result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === 'detectLang') {
    // 言語検出のみ: 短いテキストをAPIに送り、検出言語を返す
    detectLanguage(msg.text)
      .then(lang => sendResponse({ ok: true, detectedLang: lang }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function fetchTranslation(text, tl, sl) {
  if (!text || !text.trim()) return { text: '', detectedLang: null };

  // Split long texts into chunks (API limit ~5000 chars)
  const chunks = splitIntoChunks(text, 4500);
  const results = [];
  let detectedLang = null;

  for (const chunk of chunks) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Google returns [[["translated","original",...],...], null, detectedLang, ...]
    const translated = data[0].map(item => item[0]).filter(Boolean).join('');
    results.push(translated);
    // data[2] is the detected source language (only reliable on first chunk)
    if (!detectedLang && data[2]) detectedLang = data[2];
  }

  return { text: results.join(' '), detectedLang };
}

// テキストから言語を検出する（翻訳は不要、検出結果のみ返す）
async function detectLanguage(text) {
  if (!text || !text.trim()) return null;
  const sample = text.trim().slice(0, 200);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(sample)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data[2] || null;
}

function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = i + maxLen;
    if (end < text.length) {
      // Try to break at sentence boundary
      const breakAt = text.lastIndexOf('. ', end);
      if (breakAt > i + maxLen / 2) end = breakAt + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}
