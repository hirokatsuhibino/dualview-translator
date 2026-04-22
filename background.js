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

// ─── 機能検出フラグ（iOS Safariはcontextual menu / commands非対応） ──
const HAS_CONTEXT_MENUS = typeof chrome.contextMenus !== 'undefined';
const HAS_COMMANDS = typeof chrome.commands !== 'undefined';

// ─── コンテキストメニュー登録 ─────────────────────────────────────────
if (HAS_CONTEXT_MENUS) {
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
}

// ─── UI言語変更・APIキー変更時にメニューを更新 ──────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (!HAS_CONTEXT_MENUS) return;
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
if (HAS_CONTEXT_MENUS) {
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
}

// ─── キーボードショートカット ─────────────────────────────────────────
if (HAS_COMMANDS) {
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
}

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
  if (msg.action === 'cacheStats') {
    getCacheStats()
      .then(stats => sendResponse({ ok: true, ...stats }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === 'clearCache') {
    clearCache()
      .then(cleared => sendResponse({ ok: true, cleared }))
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

// ─── 翻訳・要約キャッシュ ────────────────────────────────────────────
// Google/DeepL 翻訳結果を tc: プレフィックス、Claude/Gemini 要約を sc: プレフィックスでキャッシュ。
// 同一テキストの再呼び出し時に API 呼び出しをスキップしてコスト削減・応答改善を図る。
// （LLM 要約は出力が揺れる場合があるが、再利用による節約を優先してキャッシュ対象とする）
// Google/DeepL 翻訳結果を tc: プレフィックスでキャッシュ
const TC_PREFIX = 'tc:';
const TC_MAX_ENTRIES = 2000;
const TC_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日
const TC_EVICT_RATIO = 0.1; // 超過時に古い順 10% を削除

// Claude/Gemini 要約結果を sc: プレフィックスでキャッシュ（有料APIなのでコスト削減効果大）
const SC_PREFIX = 'sc:';
const SC_MAX_ENTRIES = 500; // 要約は1件あたりのデータ量が多いため上限を小さめに
const SC_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日
const SC_EVICT_RATIO = 0.1; // 超過時に古い順 10% を削除

// chrome.storage.local の Promise ラッパー（callback-only 環境でも動作）
const storageGet = (keys) => new Promise(resolve => chrome.storage.local.get(keys, resolve));
const storageSet = (items) => new Promise(resolve => chrome.storage.local.set(items, resolve));
const storageRemove = (keys) => new Promise(resolve => chrome.storage.local.remove(keys, resolve));

// text の SHA-256 先頭16文字（8バイト）をキーに使う。<10000件なら衝突実質ゼロ
async function hashText(text) {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function buildCacheKey(engine, sl, tl, text) {
  const hash = await hashText(text);
  return `${TC_PREFIX}${engine}:${sl}:${tl}:${hash}`;
}

async function buildSummaryCacheKey(engine, tl, text) {
  const hash = await hashText(text);
  return `${SC_PREFIX}${engine}:${tl}:${hash}`;
}

// キャッシュ読み出し。TTL 切れは miss として削除し、hit 時は ts を更新（LRU的挙動）
async function getCached(key, ttl = TC_TTL_MS) {
  const data = await storageGet(key);
  const entry = data[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > ttl) {
    void storageRemove(key).catch(() => {});
    return null;
  }
  // LRU: 非同期で ts を更新（待たない）
  void storageSet({ [key]: { ...entry, ts: Date.now() } }).catch(() => {});
  return entry;
}

async function setCached(key, entry) {
  await storageSet({ [key]: { ...entry, ts: Date.now() } });
  // 毎回全走査するのは重いので 5% の確率で evict 判定
  if (Math.random() < 0.05) {
    evictIfNeeded().catch(() => {});
  }
}

// プレフィックス単位の LRU eviction
async function evictByPrefix(all, prefix, maxEntries, evictRatio) {
  const keys = Object.keys(all).filter(k => k.startsWith(prefix));
  if (keys.length <= maxEntries) return;
  const sorted = keys
    .map(k => ({ key: k, ts: all[k]?.ts || 0 }))
    .sort((a, b) => a.ts - b.ts);
  const toEvict = Math.ceil(keys.length * evictRatio);
  await storageRemove(sorted.slice(0, toEvict).map(x => x.key));
}

async function evictIfNeeded() {
  const all = await storageGet(null);
  // 翻訳キャッシュ・要約キャッシュをそれぞれ独立して evict
  await evictByPrefix(all, TC_PREFIX, TC_MAX_ENTRIES, TC_EVICT_RATIO);
  await evictByPrefix(all, SC_PREFIX, SC_MAX_ENTRIES, SC_EVICT_RATIO);
}

// 翻訳・要約キャッシュを両方クリア（名称を clearCache に統一して挙動と一致させる）
async function clearCache() {
  const all = await storageGet(null);
  const cacheKeys = Object.keys(all).filter(k => k.startsWith(TC_PREFIX) || k.startsWith(SC_PREFIX));
  if (cacheKeys.length === 0) return 0;
  await storageRemove(cacheKeys);
  return cacheKeys.length;
}

async function getCacheStats() {
  const all = await storageGet(null);
  const keys = Object.keys(all);
  const tcEntries = keys.filter(k => k.startsWith(TC_PREFIX)).length;
  const scEntries = keys.filter(k => k.startsWith(SC_PREFIX)).length;
  return { tcEntries, scEntries, entries: tcEntries + scEntries };
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
// 実 API 呼び出し（1 チャンク分）
async function fetchGoogleChunk(chunk, sl, tl) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(chunk)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const data = await res.json();
  const translated = data[0].map(item => item[0]).filter(Boolean).join('');
  const detectedLang = data[2] || null;
  return { translated, detectedLang };
}

async function fetchGoogle(text, tl, sl) {
  const chunks = splitIntoChunks(text, 4500);
  const results = [];
  let detectedLang = null;

  for (const chunk of chunks) {
    const cacheKey = await buildCacheKey('google', sl, tl, chunk);
    let entry = await getCached(cacheKey);
    if (!entry) {
      const fetched = await fetchGoogleChunk(chunk, sl, tl);
      entry = { translated: fetched.translated, detectedLang: fetched.detectedLang };
      await setCached(cacheKey, entry);
    }
    results.push(entry.translated);
    if (!detectedLang && entry.detectedLang) detectedLang = entry.detectedLang;
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

// 実 API 呼び出し（1 チャンク分）
async function fetchDeepLChunk(chunk, sl, tl, apiKey) {
  const endpoint = getDeepLEndpoint(apiKey);
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
    return {
      translated: data.translations[0].text,
      detectedLang: data.translations[0].detected_source_language
        ? data.translations[0].detected_source_language.toLowerCase()
        : null,
    };
  }
  return { translated: '', detectedLang: null };
}

async function fetchDeepL(text, tl, sl, apiKey) {
  const chunks = splitIntoChunks(text, 4500);
  const results = [];
  let detectedLang = null;

  for (const chunk of chunks) {
    const cacheKey = await buildCacheKey('deepl', sl, tl, chunk);
    let entry = await getCached(cacheKey);
    if (!entry) {
      const fetched = await fetchDeepLChunk(chunk, sl, tl, apiKey);
      entry = { translated: fetched.translated, detectedLang: fetched.detectedLang };
      await setCached(cacheKey, entry);
    }
    results.push(entry.translated);
    if (!detectedLang && entry.detectedLang) detectedLang = entry.detectedLang;
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

  // 使用エンジンとAPIキーを決定（フォールバック考慮）
  let engine, apiKey;
  if (config.engine === 'gemini') {
    if (config.geminiApiKey) { engine = 'gemini'; apiKey = config.geminiApiKey; }
    else if (config.claudeApiKey) { engine = 'claude'; apiKey = config.claudeApiKey; }
  } else {
    if (config.claudeApiKey) { engine = 'claude'; apiKey = config.claudeApiKey; }
    else if (config.geminiApiKey) { engine = 'gemini'; apiKey = config.geminiApiKey; }
  }
  if (!engine) throw new Error('要約エンジンのAPIキーが設定されていません');

  // キャッシュ確認（有料APIなのでヒット時はAPI呼び出しをスキップ）
  const cacheKey = await buildSummaryCacheKey(engine, targetLang, text);
  const cached = await getCached(cacheKey, SC_TTL_MS);
  if (cached) return cached.summary;

  // キャッシュミス → LLM呼び出し
  const summary = engine === 'gemini'
    ? await fetchGeminiSummary(text, langName, apiKey)
    : await fetchClaudeSummary(text, langName, apiKey);

  // 結果をキャッシュ保存
  await setCached(cacheKey, { summary });

  return summary;
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
      model: 'claude-haiku-4-5-20251001',
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
        model: 'claude-haiku-4-5-20251001',
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
