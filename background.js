// Copyright (c) Orangesoft Inc
// DualView Translator - Background Service Worker
// 翻訳API呼び出し（CORS回避）+ コンテキストメニュー管理

// ─── コンテキストメニュー用の翻訳辞書 ────────────────────────────────
const CONTEXT_MENU_TITLES = {
  ja:      { selection: 'DualView: 「%s」を翻訳',              element: 'DualView: この要素を翻訳',           elementSummary: 'DualView: この要素を翻訳＆要約' },
  en:      { selection: 'DualView: Translate "%s"',            element: 'DualView: Translate this element',  elementSummary: 'DualView: Translate & summarize this element' },
  'zh-CN': { selection: 'DualView: 翻译「%s」',               element: 'DualView: 翻译此元素',              elementSummary: 'DualView: 翻译并摘要此元素' },
  'zh-TW': { selection: 'DualView: 翻譯「%s」',               element: 'DualView: 翻譯此元素',              elementSummary: 'DualView: 翻譯並摘要此元素' },
  ko:      { selection: 'DualView: "%s" 번역',                element: 'DualView: 이 요소 번역',            elementSummary: 'DualView: 이 요소 번역 및 요약' },
  fr:      { selection: 'DualView : Traduire « %s »',         element: 'DualView : Traduire cet élément',   elementSummary: 'DualView : Traduire et résumer cet élément' },
  de:      { selection: 'DualView: „%s" übersetzen',           element: 'DualView: Dieses Element übersetzen', elementSummary: 'DualView: Dieses Element übersetzen & zusammenfassen' },
  es:      { selection: 'DualView: Traducir "%s"',             element: 'DualView: Traducir este elemento',  elementSummary: 'DualView: Traducir y resumir este elemento' },
  pt:      { selection: 'DualView: Traduzir "%s"',             element: 'DualView: Traduzir este elemento',  elementSummary: 'DualView: Traduzir e resumir este elemento' },
  ru:      { selection: 'DualView: Перевести «%s»',            element: 'DualView: Перевести этот элемент',  elementSummary: 'DualView: Перевести и обобщить этот элемент' },
  ar:      { selection: 'DualView: ترجمة "%s"',               element: 'DualView: ترجمة هذا العنصر',        elementSummary: 'DualView: ترجمة وتلخيص هذا العنصر' },
};

function getMenuTitles(lang) {
  return CONTEXT_MENU_TITLES[lang] || CONTEXT_MENU_TITLES['en'];
}

// ─── LLM APIキーの有無を判定 ─────────────────────────────────────────
function hasLLMApiKey(data) {
  return !!(data.claudeApiKey || data.geminiApiKey);
}

// ─── DeepL選択時にAPIキーが設定されているか判定 ──────────────────────
function isTranslateAvailable(data) {
  return data.translateEngine !== 'deepl' || !!data.deeplApiKey;
}

// ─── コンテキストメニュー登録 ─────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['uiLang', 'claudeApiKey', 'geminiApiKey', 'translateEngine', 'deeplApiKey'], (data) => {
    const titles = getMenuTitles(data.uiLang || 'ja');
    const llmEnabled = hasLLMApiKey(data);
    const translateEnabled = isTranslateAvailable(data);
    chrome.contextMenus.create({
      id: 'dvt-translate-selection',
      title: titles.selection,
      contexts: ['selection'],
      enabled: translateEnabled,
    });
    chrome.contextMenus.create({
      id: 'dvt-translate-element',
      title: titles.element,
      contexts: ['page', 'frame', 'link', 'image', 'video', 'audio'],
      enabled: translateEnabled,
    });
    chrome.contextMenus.create({
      id: 'dvt-translate-summarize-element',
      title: titles.elementSummary,
      contexts: ['page', 'frame', 'link', 'image', 'video', 'audio'],
      enabled: translateEnabled && llmEnabled,
    });
  });
});

// ─── UI言語変更・APIキー変更時にメニューを更新 ──────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.uiLang) {
    const titles = getMenuTitles(changes.uiLang.newValue);
    chrome.contextMenus.update('dvt-translate-selection', { title: titles.selection });
    chrome.contextMenus.update('dvt-translate-element', { title: titles.element });
    chrome.contextMenus.update('dvt-translate-summarize-element', { title: titles.elementSummary });
  }
  // 翻訳エンジン・DeepL APIキーの変更時に翻訳メニュー項目の有効/無効を切り替え
  if (changes.translateEngine || changes.deeplApiKey) {
    chrome.storage.local.get(['translateEngine', 'deeplApiKey', 'claudeApiKey', 'geminiApiKey'], (data) => {
      const translateEnabled = isTranslateAvailable(data);
      chrome.contextMenus.update('dvt-translate-selection', { enabled: translateEnabled });
      chrome.contextMenus.update('dvt-translate-element', { enabled: translateEnabled });
      chrome.contextMenus.update('dvt-translate-summarize-element', {
        enabled: translateEnabled && hasLLMApiKey(data),
      });
    });
  }
  // LLM APIキーの変更時に要約メニュー項目の有効/無効を切り替え
  if (changes.claudeApiKey || changes.geminiApiKey) {
    chrome.storage.local.get(['claudeApiKey', 'geminiApiKey', 'translateEngine', 'deeplApiKey'], (data) => {
      chrome.contextMenus.update('dvt-translate-summarize-element', {
        enabled: isTranslateAvailable(data) && hasLLMApiKey(data),
      });
    });
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
  if (info.menuItemId === 'dvt-translate-summarize-element') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'contextMenuTranslateAndSummarize',
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
  if (msg.action === 'testApiKey') {
    testApiKey(msg.engine, msg.apiKey)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === 'summarize') {
    getLLMConfig().then(config => {
      return fetchSummary(msg.text, msg.targetLang, config);
    })
      .then(summary => sendResponse({ ok: true, summary }))
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

// ─── LLM設定をstorageから取得 ─────────────────────────────────────────
function getLLMConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['llmEngine', 'claudeApiKey', 'geminiApiKey'], (data) => {
      resolve({
        engine: data.llmEngine || 'claude',
        claudeApiKey: data.claudeApiKey || '',
        geminiApiKey: data.geminiApiKey || '',
      });
    });
  });
}

// ─── 言語コード→言語名変換（LLMプロンプト用） ────────────────────────
const LANG_NAMES_FOR_PROMPT = {
  ja: '日本語', en: 'English', 'zh-CN': '中文（简体）', 'zh-TW': '中文（繁體）',
  ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español',
  pt: 'Português', ru: 'Русский', ar: 'العربية',
};

function getLangNameForPrompt(code) {
  return LANG_NAMES_FOR_PROMPT[code] || code;
}

// ─── LLM要約ディスパッチャー ─────────────────────────────────────────
async function fetchSummary(text, targetLang, config) {
  if (!text || !text.trim()) return '';

  const langName = getLangNameForPrompt(targetLang);

  // 選択されたエンジンを優先、APIキーがなければもう一方にフォールバック
  if (config.engine === 'gemini') {
    if (config.geminiApiKey) return fetchGeminiSummary(text, langName, config.geminiApiKey);
    if (config.claudeApiKey) return fetchClaudeSummary(text, langName, config.claudeApiKey);
  } else {
    if (config.claudeApiKey) return fetchClaudeSummary(text, langName, config.claudeApiKey);
    if (config.geminiApiKey) return fetchGeminiSummary(text, langName, config.geminiApiKey);
  }
  throw new Error('要約エンジンのAPIキーが設定されていません');
}

// ─── Claude API 要約 ─────────────────────────────────────────────────
async function fetchClaudeSummary(text, targetLang, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `以下のテキストを${targetLang}で3〜5行に要約してください。要約のみを出力してください。\n\n${text}`,
      }],
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { const err = await res.json(); detail = err.error?.message || JSON.stringify(err); } catch(e) {}
    const status = res.status;
    if (status === 401) throw new Error('Claude: APIキーが無効です');
    if (status === 429) throw new Error('Claude: レート制限に達しました');
    throw new Error(`Claude HTTP ${status}: ${detail}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ─── Gemini API 要約 ─────────────────────────────────────────────────
async function fetchGeminiSummary(text, targetLang, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `以下のテキストを${targetLang}で3〜5行に要約してください。要約のみを出力してください。\n\n${text}`,
        }],
      }],
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { const err = await res.json(); detail = err.error?.message || JSON.stringify(err); } catch(e) {}
    const status = res.status;
    if (status === 400) throw new Error(`Gemini: APIキーが無効です: ${detail}`);
    if (status === 429) throw new Error('Gemini: レート制限に達しました');
    throw new Error(`Gemini HTTP ${status}: ${detail}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── APIキー検証 ────────────────────────────────────────────────────
async function testApiKey(engine, apiKey) {
  if (!apiKey) throw new Error('APIキーが入力されていません');

  if (engine === 'deepl') {
    const endpoint = getDeepLEndpoint(apiKey);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: ['test'], target_lang: 'JA' }),
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('APIキーが無効です');
      throw new Error(`HTTP ${res.status}`);
    }
    return;
  }

  if (engine === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    if (!res.ok) {
      // 401のみキー無効。400（残高不足等）や429（レート制限）は認証成功とみなす
      if (res.status === 401) throw new Error('APIキーが無効です');
      if (res.status === 400 || res.status === 429) return;
      let detail = '';
      try { const err = await res.json(); detail = err.error?.message || ''; } catch(e) {}
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }
    return;
  }

  if (engine === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
      }),
    });
    if (!res.ok) {
      if (res.status === 400) throw new Error('APIキーが無効です');
      throw new Error(`HTTP ${res.status}`);
    }
    return;
  }

  throw new Error(`不明なエンジン: ${engine}`);
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
