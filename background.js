// DualView Translator - Background Service Worker
// 翻訳API呼び出し（CORS回避）+ コンテキストメニュー管理

// ─── コンテキストメニュー用の翻訳辞書 ────────────────────────────────
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

// ─── キーボードショートカット ─────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'toggle-page-translate') {
    chrome.storage.local.get('targetLang', (data) => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'togglePageTranslate',
        lang: data.targetLang || 'ja',
      });
    });
  }
  if (command === 'translate-selection') {
    chrome.tabs.sendMessage(tab.id, { action: 'keyboardTranslateSelection' });
  }
  if (command === 'enter-region-mode') {
    chrome.tabs.sendMessage(tab.id, { action: 'enterRegionMode' });
  }
});

// ─── メッセージハンドラ ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'translate') {
    getEngineConfig().then(config => {
      return fetchTranslation(msg.text, msg.tl, msg.sl || 'auto', config);
    })
      .then(result => sendResponse({ ok: true, result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === 'detectLang') {
    detectLanguage(msg.text)
      .then(lang => sendResponse({ ok: true, detectedLang: lang }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// ─── エンジン設定をstorageから取得 ────────────────────────────────────
function getEngineConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['translateEngine', 'deeplApiKey'], (data) => {
      resolve({
        engine: data.translateEngine || 'google',
        deeplApiKey: data.deeplApiKey || '',
      });
    });
  });
}

// ─── 翻訳ディスパッチャー ────────────────────────────────────────────
async function fetchTranslation(text, tl, sl, config) {
  if (!text || !text.trim()) return { text: '', detectedLang: null };

  if (config.engine === 'deepl' && config.deeplApiKey) {
    return fetchDeepL(text, tl, sl, config.deeplApiKey);
  }
  return fetchGoogle(text, tl, sl);
}

// ─── Google Translate ────────────────────────────────────────────────
async function fetchGoogle(text, tl, sl) {
  const chunks = splitIntoChunks(text, 4500);
  const results = [];
  let detectedLang = null;

  for (const chunk of chunks) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
    const data = await res.json();
    const translated = data[0].map(item => item[0]).filter(Boolean).join('');
    results.push(translated);
    if (!detectedLang && data[2]) detectedLang = data[2];
  }

  return { text: results.join(' '), detectedLang };
}

// ─── DeepL API ───────────────────────────────────────────────────────
// DualView言語コード → DeepL言語コード変換
const DEEPL_LANG_MAP = {
  'ja': 'JA', 'en': 'EN', 'zh-CN': 'ZH-HANS', 'zh-TW': 'ZH-HANT',
  'ko': 'KO', 'fr': 'FR', 'de': 'DE', 'es': 'ES',
  'pt': 'PT-BR', 'ru': 'RU', 'ar': 'AR',
};

function toDeepLLang(code) {
  return DEEPL_LANG_MAP[code] || code.toUpperCase();
}

function getDeepLEndpoint(apiKey) {
  // Freeキーは `:fx` で終わる
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

async function fetchDeepL(text, tl, sl, apiKey) {
  const chunks = splitIntoChunks(text, 4500);
  const results = [];
  let detectedLang = null;
  const endpoint = getDeepLEndpoint(apiKey);

  for (const chunk of chunks) {
    const body = {
      text: [chunk],
      target_lang: toDeepLLang(tl),
    };
    // DeepLは source_lang が 'auto' の場合は省略する（自動検出）
    if (sl && sl !== 'auto') {
      body.source_lang = toDeepLLang(sl);
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 403) throw new Error('DeepL: APIキーが無効です');
      if (status === 456) throw new Error('DeepL: 翻訳上限に達しました');
      throw new Error(`DeepL HTTP ${status}`);
    }

    const data = await res.json();
    if (data.translations && data.translations.length > 0) {
      results.push(data.translations[0].text);
      if (!detectedLang && data.translations[0].detected_source_language) {
        detectedLang = data.translations[0].detected_source_language.toLowerCase();
      }
    }
  }

  return { text: results.join(' '), detectedLang };
}

// ─── 言語検出（常にGoogle APIを使用 — 無料で高速） ───────────────────
async function detectLanguage(text) {
  if (!text || !text.trim()) return null;
  const sample = text.trim().slice(0, 200);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(sample)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data[2] || null;
}

// ─── ユーティリティ ──────────────────────────────────────────────────
function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = i + maxLen;
    if (end < text.length) {
      const breakAt = text.lastIndexOf('. ', end);
      if (breakAt > i + maxLen / 2) end = breakAt + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}
