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

// ─── 翻訳エンジン名（typo 防止のため定数化） ──────────────────────
const ENGINES = Object.freeze({ GOOGLE: 'google', DEEPL: 'deepl', APPLE: 'apple' });

// SafariWebExtensionHandler.swift と一致する action 名。Swift 側と JS 側で
// string が一致する必要があるため、定数として一元管理する。
const NATIVE_ACTIONS = Object.freeze({
  PING: 'ping',
  TRANSLATE: 'translate',
  DETECT_LANGUAGE: 'detectLanguage',
  CHECK_LANGUAGE_AVAILABILITY: 'checkLanguageAvailability',
  LIST_SUPPORTED_LANGUAGES: 'listSupportedLanguages',
});

// ─── LLM APIキーの有無を判定 ─────────────────────────────────────────
function hasLLMApiKey(data) {
  return !!(data.claudeApiKey || data.geminiApiKey);
}

// ─── 翻訳エンジンが利用可能か判定 ──────────────────────────────────
// DeepL: APIキーが必要 / Apple: Safari (Native Messaging が動く環境) のみ
function isTranslateAvailable(data) {
  if (data.translateEngine === ENGINES.DEEPL) return !!data.deeplApiKey;
  if (data.translateEngine === ENGINES.APPLE) return !!data.appleAvailable;
  return true; // google はキー不要・常に利用可能
}

// ─── 機能検出フラグ（iOS Safariはcontextual menu / commands非対応） ──
const HAS_CONTEXT_MENUS = typeof chrome.contextMenus !== 'undefined';
const HAS_COMMANDS = typeof chrome.commands !== 'undefined';
// Native Messaging API の存在チェック。実際の Safari 判定は ping 応答で行う
const HAS_NATIVE_MESSAGING = typeof chrome.runtime?.sendNativeMessage === 'function';

// Native Messaging Host (Safari ネイティブハンドラ) の bundle ID
const NATIVE_HOST_ID = 'jp.co.orangesoft.dualview-translator';

// ─── Apple Translation 利用可否を検出 ──────────────────────────────
// ping を 1 回投げて応答を見て Safari かどうかを判定し、appleAvailable に永続化する。
async function detectAppleAvailability() {
  if (!HAS_NATIVE_MESSAGING) {
    await chrome.storage.local.set({ appleAvailable: false });
    return false;
  }
  try {
    // タイムアウト勝利時に native promise が遅延 reject すると unhandled になるため
    // 事前に空の catch を付けて握りつぶす。
    const nativePromise = chrome.runtime.sendNativeMessage(NATIVE_HOST_ID, { action: NATIVE_ACTIONS.PING });
    nativePromise.catch(() => {});
    const response = await Promise.race([
      nativePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), 3000)),
    ]);
    // ping が ok:true でかつ Translation framework と LanguageAvailability API
    // 両方が利用可能な OS でだけ apple を有効にする
    const available = !!(response && response.ok &&
      response.translationFrameworkAvailable &&
      response.languageAvailabilityAPIAvailable);
    await chrome.storage.local.set({ appleAvailable: available });
    return available;
  } catch (_err) {
    // ping 失敗（Chrome / Firefox / 未対応 OS など）
    await chrome.storage.local.set({ appleAvailable: false });
    return false;
  }
}

// 拡張起動時に1度だけ実行（installed / startup の両方をカバー）
chrome.runtime.onInstalled.addListener(() => { detectAppleAvailability(); });
chrome.runtime.onStartup?.addListener(() => { detectAppleAvailability(); });

// ─── コンテキストメニュー登録 ─────────────────────────────────────────
if (HAS_CONTEXT_MENUS) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['uiLang', 'claudeApiKey', 'geminiApiKey', 'translateEngine', 'deeplApiKey', 'appleAvailable'], (data) => {
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
  // 翻訳エンジン・DeepL APIキー・Safari 検出結果の変更時に翻訳メニュー項目の有効/無効を切り替え
  if (changes.translateEngine || changes.deeplApiKey || changes.appleAvailable) {
    chrome.storage.local.get(['translateEngine', 'deeplApiKey', 'claudeApiKey', 'geminiApiKey', 'appleAvailable'], (data) => {
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
    chrome.storage.local.get(['claudeApiKey', 'geminiApiKey', 'translateEngine', 'deeplApiKey', 'appleAvailable'], (data) => {
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

// ─── エンジン設定をstorageから取得（Promise キャッシュ + onChanged 連動） ──
// ページ全体翻訳・MutationObserver 連動翻訳では数十〜数百要素を並行翻訳するため、
// 毎回 storage.local.get するとホットパスで storage IO が多重発生する。
// engineConfigCache に Promise<Config> を保持することで:
// - 並列で getEngineConfig() が呼ばれても in-flight の Promise を共有（重複 IO なし）
// - resolve 後は同じ Promise を返すだけなのでキャッシュとして機能
// 関連キーが変わったら null にして次回呼び出しで再ロードする。
const ENGINE_CONFIG_KEYS = ['translateEngine', 'deeplApiKey', 'appleAvailable'];
let engineConfigCache = null; // Promise<Config> | null

function loadEngineConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(ENGINE_CONFIG_KEYS, (data) => {
      resolve({
        engine: data.translateEngine || ENGINES.GOOGLE,
        deeplApiKey: data.deeplApiKey || '',
        appleAvailable: !!data.appleAvailable,
      });
    });
  });
}

function getEngineConfig() {
  if (!engineConfigCache) {
    engineConfigCache = loadEngineConfig();
  }
  return engineConfigCache;
}

// 関連キーの変更を監視してキャッシュを invalidate
chrome.storage.onChanged.addListener((changes) => {
  if (ENGINE_CONFIG_KEYS.some((k) => k in changes)) {
    engineConfigCache = null;
  }
});

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

// ─── Claude 要約モデル ────────────────────────────────────────────────
const CLAUDE_SUMMARY_MODEL = 'claude-haiku-4-5-20251001';

// chrome.storage.local の Promise ラッパー（callback-only 環境でも動作）
const storageGet = (keys) => new Promise(resolve => chrome.storage.local.get(keys, resolve));
const storageSet = (items) => new Promise(resolve => chrome.storage.local.set(items, resolve));
const storageRemove = (keys) => new Promise(resolve => chrome.storage.local.remove(keys, resolve));

// chrome.storage.local.getKeys (Chrome 121+) は Promise / callback 両形式の実装が
// 混在しうる。await が undefined にならないよう Promise 化のラッパーで吸収する。
// 関数自体が無い環境では null を返し、呼び出し側でフォールバックする。
function storageGetKeys() {
  if (typeof chrome.storage.local.getKeys !== 'function') return null;
  return new Promise((resolve, reject) => {
    try {
      const result = chrome.storage.local.getKeys((keys) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(keys);
      });
      // Promise を返す実装（Chrome MV3 / Firefox）に対応
      if (result && typeof result.then === 'function') {
        result.then(resolve, reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

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

// ─── ヒット率統計キー ─────────────────────────────────────────────────
const HIT_STATS_KEY = 'cacheHitStats';

// 統計更新を直列化するキュー（並行 read-modify-write の競合を防ぐ）
let _hitStatsQueue = Promise.resolve();

// ヒット率統計をインクリメント（キューで直列化して競合を防ぐ）
function recordCacheAccess(isHit, key) {
  _hitStatsQueue = _hitStatsQueue.then(() =>
    storageGet(HIT_STATS_KEY).then(data => {
      const s = data[HIT_STATS_KEY] || { tcHits: 0, tcMisses: 0, scHits: 0, scMisses: 0 };
      if (key.startsWith(TC_PREFIX)) {
        isHit ? s.tcHits++ : s.tcMisses++;
      } else {
        isHit ? s.scHits++ : s.scMisses++;
      }
      return storageSet({ [HIT_STATS_KEY]: s });
    })
  ).catch(() => {});
}

// キャッシュ読み出し。TTL 切れは miss として削除し、hit 時は ts を更新（LRU的挙動）
async function getCached(key, ttl = TC_TTL_MS) {
  const data = await storageGet(key);
  const entry = data[key];
  if (!entry) {
    recordCacheAccess(false, key);
    return null;
  }
  if (Date.now() - entry.ts > ttl) {
    void storageRemove(key).catch(() => {});
    recordCacheAccess(false, key);
    return null;
  }
  // LRU: 非同期で ts を更新（待たない）
  void storageSet({ [key]: { ...entry, ts: Date.now() } }).catch(() => {});
  recordCacheAccess(true, key);
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
// 指定 prefix に該当するキャッシュエントリだけを storage から取得する。
// chrome.storage.local.getKeys() (Chrome 121+) があればキー一覧だけ取って必要分を
// get（軽量）、無ければ get(null) フォールバック（自動翻訳ルール等まで含む全件取得）。
async function getCacheEntriesByPrefix(prefix) {
  const keys = await storageGetKeys();
  if (keys) {
    const filtered = keys.filter((k) => k.startsWith(prefix));
    if (filtered.length === 0) return {};
    return await storageGet(filtered);
  }
  return pickEntriesByPrefix(await storageGet(null), prefix);
}

// オブジェクトから指定 prefix のエントリを抽出するピュア関数。
// フォールバックパスで storageGet(null) を 1 回だけ呼んで複数 prefix を処理するときに使う。
function pickEntriesByPrefix(all, prefix) {
  const filtered = {};
  for (const k of Object.keys(all)) {
    if (k.startsWith(prefix)) filtered[k] = all[k];
  }
  return filtered;
}

// LRU evict 本体。entries は { key: {translated, ts}, ... } の形。
async function evictEntries(entries, maxEntries, evictRatio) {
  const keys = Object.keys(entries);
  if (keys.length <= maxEntries) return;
  const sorted = keys
    .map(k => ({ key: k, ts: entries[k]?.ts || 0 }))
    .sort((a, b) => a.ts - b.ts);
  const toEvict = Math.ceil(keys.length * evictRatio);
  await storageRemove(sorted.slice(0, toEvict).map(x => x.key));
}

async function evictByPrefix(prefix, maxEntries, evictRatio) {
  await evictEntries(await getCacheEntriesByPrefix(prefix), maxEntries, evictRatio);
}

async function evictIfNeeded() {
  // 翻訳キャッシュ・要約キャッシュをそれぞれ独立して evict。
  // getKeys 対応環境では各 prefix 個別に軽量取得で問題ない。
  // 非対応環境では get(null) を 1 回だけ呼んで両 prefix を処理し、IO を節約する。
  const keys = await storageGetKeys();
  if (keys) {
    await evictByPrefix(TC_PREFIX, TC_MAX_ENTRIES, TC_EVICT_RATIO);
    await evictByPrefix(SC_PREFIX, SC_MAX_ENTRIES, SC_EVICT_RATIO);
    return;
  }
  const all = await storageGet(null);
  await evictEntries(pickEntriesByPrefix(all, TC_PREFIX), TC_MAX_ENTRIES, TC_EVICT_RATIO);
  await evictEntries(pickEntriesByPrefix(all, SC_PREFIX), SC_MAX_ENTRIES, SC_EVICT_RATIO);
}

// 翻訳・要約キャッシュを両方クリア（ヒット率統計もリセット）
async function clearCache() {
  // evictIfNeeded と同じく、フォールバック時は get(null) を 1 回だけ呼ぶ
  const keys = await storageGetKeys();
  let cacheKeys;
  if (keys) {
    cacheKeys = keys.filter(k => k.startsWith(TC_PREFIX) || k.startsWith(SC_PREFIX));
  } else {
    const all = await storageGet(null);
    cacheKeys = Object.keys(all).filter(k => k.startsWith(TC_PREFIX) || k.startsWith(SC_PREFIX));
  }
  const keysToRemove = cacheKeys.length > 0 ? [...cacheKeys, HIT_STATS_KEY] : [HIT_STATS_KEY];
  await storageRemove(keysToRemove);
  return cacheKeys.length;
}

// ヒット率を計算するヘルパー（0〜100の整数。アクセスなしは null）
function calcHitRate(hits, misses) {
  const total = hits + misses;
  return total === 0 ? null : Math.round((hits / total) * 100);
}

async function getCacheStats() {
  // entries 数と hit rate しか必要ないので prefix 別にキー数だけ数える。
  let tcEntries = 0;
  let scEntries = 0;
  const keys = await storageGetKeys();
  const sourceKeys = keys || Object.keys(await storageGet(null));
  for (const k of sourceKeys) {
    if (k.startsWith(TC_PREFIX)) tcEntries++;
    else if (k.startsWith(SC_PREFIX)) scEntries++;
  }
  const data = await storageGet(HIT_STATS_KEY);
  const s = data[HIT_STATS_KEY] || { tcHits: 0, tcMisses: 0, scHits: 0, scMisses: 0 };
  return {
    tcEntries,
    scEntries,
    entries: tcEntries + scEntries,
    tcHitRate: calcHitRate(s.tcHits, s.tcMisses),
    scHitRate: calcHitRate(s.scHits, s.scMisses),
    tcHits: s.tcHits,
    tcMisses: s.tcMisses,
    scHits: s.scHits,
    scMisses: s.scMisses,
  };
}

// ─── ネットワークエラー判定 ──────────────────────────────────────────
// fetch がネットワーク不通で失敗した場合は TypeError("Failed to fetch") 等を throw する。
// HTTP エラー (4xx/5xx) は別 throw で識別可能なので除外。
// このヘルパーで「オフラインフォールバックが妥当か」を判定する。
//
// TypeError 単独だと fetch 以外のコードバグ（プロパティ参照ミス等）も誤検知して
// バグを apple フォールバックで隠蔽してしまうため、TypeError + ネットワーク系
// メッセージの両方を要求する。
function isNetworkError(err) {
  if (!err) return false;
  if (!(err instanceof TypeError) && err.name !== 'TypeError') return false;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('load failed') ||
    msg.includes('offline');
}

// NLLanguage 形式（"zh-Hans" / "zh-Hant"）→ アプリ内言語コード（"zh-CN" / "zh-TW"）への対応。
// 他の言語は NLLanguage の rawValue がそのまま BCP-47 言語コードと一致するためマッピング不要。
const NL_LANG_TO_APP = {
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
};

// SafariWebExtensionHandler の detectLanguage アクションを叩いて、
// オフラインで言語検出する（NLLanguageRecognizer 経由）。
// 失敗したら null を返し、呼び出し元で適切にエラー化する。
async function detectLanguageNative(text) {
  if (!HAS_NATIVE_MESSAGING) return null;
  try {
    const sample = text.slice(0, 500);
    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST_ID, {
      action: NATIVE_ACTIONS.DETECT_LANGUAGE,
      text: sample,
    });
    if (!response?.ok || !response.detectedLang) return null;
    const code = response.detectedLang;
    return NL_LANG_TO_APP[code] || code;
  } catch (_e) {
    return null;
  }
}

// 言語コードが auto/und/空 のいずれか（=具体的な言語コードが指定されていない状態）。
// Apple Translation は auto 検出非対応のため、これを判定して native detect に分岐する。
function isUnspecifiedLang(sl) {
  return !sl || sl === 'auto' || sl === 'und';
}

// Apple Translation 呼び出し前に sl を必ず具体コードに解決する。
// 具体コードならそのまま、auto/und/空 ならネイティブ言語検出を経由する。
async function ensureExplicitSourceLang(sl, text) {
  if (!isUnspecifiedLang(sl)) return sl;
  const detected = await detectLanguageNative(text);
  if (!detected) {
    throw new Error('Apple Translation: language detection failed (offline)');
  }
  return detected;
}

// ─── 翻訳ディスパッチャー ────────────────────────────────────────────
// 主エンジン (Google/DeepL) はチャンク単位の内部キャッシュを持つため、cache hit
// ではネットワーク要求が発行されずオフラインでも成功する。よって navigator.onLine
// での早期バイパスはせず、cache 優先で動かす。主エンジンが network error で失敗
// したときのみ Apple にフォールバックする。
async function fetchTranslation(text, tl, sl, config) {
  if (!text || !text.trim()) return { text: '', detectedLang: null, engineUsed: null };

  // 明示選択された apple は直行（sl が auto なら native 検出で具体コードに解決）
  if (config.engine === ENGINES.APPLE && config.appleAvailable) {
    const finalSl = await ensureExplicitSourceLang(sl, text);
    const result = await fetchApple(text, tl, finalSl);
    return { ...result, engineUsed: ENGINES.APPLE };
  }

  // 主エンジン実行。deepl 選択中で APIキー未設定なら Google にフォールスルーするため、
  // 実際に呼ばれたエンジンを primaryEngine として保持してログ・engineUsed と一致させる。
  const primaryEngine = (config.engine === ENGINES.DEEPL && config.deeplApiKey)
    ? ENGINES.DEEPL
    : ENGINES.GOOGLE;
  try {
    if (primaryEngine === ENGINES.DEEPL) {
      const result = await fetchDeepL(text, tl, sl, config.deeplApiKey);
      return { ...result, engineUsed: ENGINES.DEEPL };
    }
    const result = await fetchGoogle(text, tl, sl);
    return { ...result, engineUsed: ENGINES.GOOGLE };
  } catch (err) {
    if (config.appleAvailable && isNetworkError(err)) {
      console.warn(`[DVT] ${primaryEngine} network error → apple fallback:`, err.message);
      const finalSl = await ensureExplicitSourceLang(sl, text);
      const result = await fetchApple(text, tl, finalSl);
      return { ...result, engineUsed: ENGINES.APPLE, fallback: true, fallbackReason: 'network-error' };
    }
    throw err;
  }
}

// ─── 並列度制御付き map ───────────────────────────────────────────────
// 入力配列を最大 concurrency 個ずつ並列に処理する。Promise.all は無制限なので
// 翻訳 API のレート対策として独自に書く（依存追加を避ける目的もある）。
// 戻り値は入力順を保持する（results[i] = fn(items[i]) の値）。
// 1 件失敗した時点で他ワーカーの新規タスク取得を止める短絡終了で、
// 不要な API 呼び出し・キャッシュ書き込みの並行継続を防ぐ。
async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let stopped = false;
  let firstError = null;
  async function worker() {
    while (!stopped) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (!stopped) {
          stopped = true;
          firstError = err;
        }
        return;
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  if (firstError) throw firstError;
  return results;
}

// ─── 翻訳エンジン共通: チャンク分割 + キャッシュ + 並列実行 ────────
// 各エンジンは fetchChunkFn(chunk, sl, tl) を渡すだけで、チャンク分割・キャッシュ
// 参照・並列実行・detectedLang の集約を統一できる。エンジンの増減は薄いラッパー
// 1 つだけで対応可能になる。
async function fetchChunkedWithCache(engine, text, sl, tl, { chunkSize, concurrency, fetchChunkFn }) {
  const chunks = splitIntoChunks(text, chunkSize);
  const entries = await mapWithConcurrency(chunks, concurrency, async (chunk) => {
    const cacheKey = await buildCacheKey(engine, sl, tl, chunk);
    const cached = await getCached(cacheKey);
    if (cached) return cached;
    const fetched = await fetchChunkFn(chunk, sl, tl);
    const entry = { translated: fetched.translated, detectedLang: fetched.detectedLang ?? null };
    await setCached(cacheKey, entry);
    return entry;
  });
  const detectedLang = entries.reduce((acc, e) => acc || e.detectedLang, null);
  return { text: entries.map(e => e.translated).join(' '), detectedLang };
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

// 非公式エンドポイントなのでレート対策に並列度を抑える
async function fetchGoogle(text, tl, sl) {
  return fetchChunkedWithCache(ENGINES.GOOGLE, text, sl, tl, {
    chunkSize: 4500,
    concurrency: 4,
    fetchChunkFn: fetchGoogleChunk,
  });
}

// ─── Apple Translation（Safari ネイティブ呼び出し） ───────────────────
// SafariWebExtensionHandler の translate アクションを Promise 形式で呼ぶ
// （callback 形式だと Safari で undefined response になるケースがあるため）。
async function fetchAppleChunk(chunk, sl, tl) {
  if (isUnspecifiedLang(sl)) {
    throw new Error('Apple Translation requires explicit source language; "auto" detection is not supported');
  }
  const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST_ID, {
    action: NATIVE_ACTIONS.TRANSLATE,
    source: sl,
    target: tl,
    text: chunk,
  });
  if (!response || !response.ok) {
    throw new Error(response?.error || 'Apple translation failed');
  }
  return { translated: response.translated, detectedLang: null };
}

// Apple Translation は隠し SwiftUI ホスト + 30 秒タイムアウトのため並列化せず逐次
async function fetchApple(text, tl, sl) {
  return fetchChunkedWithCache(ENGINES.APPLE, text, sl, tl, {
    chunkSize: 4000,
    concurrency: 1,
    fetchChunkFn: fetchAppleChunk,
  });
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
  return fetchChunkedWithCache(ENGINES.DEEPL, text, sl, tl, {
    chunkSize: 4500,
    concurrency: 4,
    fetchChunkFn: (chunk, srcLang, tgtLang) => fetchDeepLChunk(chunk, srcLang, tgtLang, apiKey),
  });
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
      model: CLAUDE_SUMMARY_MODEL,
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
        model: CLAUDE_SUMMARY_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('APIキーが無効です');
      if (res.status === 429) return; // レート制限はキー有効とみなす
      if (res.status === 400) {
        // レスポンスボディでモデル不明エラーを判別（それ以外の400は認証とは無関係なのでキー有効扱い）
        let errType = '';
        let errMsg = '';
        try {
          const errJson = await res.json();
          errType = errJson.error?.type || '';
          errMsg = errJson.error?.message || '';
        } catch(e) {}
        // model_not_found など、モデル名誤りが原因の場合はキー有効とみなさない
        if (errType === 'not_found_error' || /model/i.test(errMsg)) {
          throw new Error(`APIキー検証エラー: モデルが見つかりません (${errMsg})`);
        }
        return; // 残高不足・その他の400はキー有効とみなす
      }
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
