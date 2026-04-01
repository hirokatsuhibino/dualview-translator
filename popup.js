// DualView Translator — Popup Script

// ── バージョン表示 ──────────────────────────────────────────────────────
document.getElementById('appVersion').textContent = 'v' + chrome.runtime.getManifest().version;

// ── タブ切り替え ────────────────────────────────────────────────────────
document.querySelectorAll('.dvt-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.dvt-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dvt-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

const uiLangSel       = document.getElementById('uiLang');
const targetLangSel   = document.getElementById('targetLang');
const engineSel       = document.getElementById('translateEngine');
const deeplSettings   = document.getElementById('deeplSettings');
const deeplApiKeyInput = document.getElementById('deeplApiKey');
const llmSel           = document.getElementById('llmEngine');
const claudeSettings   = document.getElementById('claudeSettings');
const claudeApiKeyInput = document.getElementById('claudeApiKey');
const geminiSettings   = document.getElementById('geminiSettings');
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const btnPage         = document.getElementById('btnPage');
const btnPageSummary  = document.getElementById('btnPageSummary');
const btnRegion       = document.getElementById('btnRegion');
const btnRegionSummary = document.getElementById('btnRegionSummary');
const btnUndo         = document.getElementById('btnUndo');
const statusDot       = document.getElementById('statusDot');
const statusText      = document.getElementById('statusText');

// ── SVGアイコン定数 ──────────────────────────────────────────────────
const SVG_PAGE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>';
const SVG_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>';

// ── UI言語の初期化 ───────────────────────────────────────────────────
DVT_I18N.loadLang((lang) => {
  uiLangSel.value = lang;
  DVT_I18N.applyToDOM();
});

// ── Load saved settings ──────────────────────────────────────────────
chrome.storage.local.get(['targetLang', 'translateEngine', 'deeplApiKey', 'llmEngine', 'claudeApiKey', 'geminiApiKey'], (data) => {
  if (data.targetLang) targetLangSel.value = data.targetLang;
  if (data.translateEngine) engineSel.value = data.translateEngine;
  if (data.deeplApiKey) deeplApiKeyInput.value = data.deeplApiKey;
  if (data.llmEngine) llmSel.value = data.llmEngine;
  if (data.claudeApiKey) claudeApiKeyInput.value = data.claudeApiKey;
  if (data.geminiApiKey) geminiApiKeyInput.value = data.geminiApiKey;
  toggleDeepLSettings();
  toggleLLMSettings();
});

// ── UI言語変更 ───────────────────────────────────────────────────────
uiLangSel.addEventListener('change', () => {
  const lang = uiLangSel.value;
  DVT_I18N.setLang(lang);
  chrome.storage.local.set({ uiLang: lang });
  // UI全体を再描画
  DVT_I18N.applyToDOM();
  // ページ翻訳状態に応じてボタンテキストを再設定
  if (pageActive) {
    setPageActive(true);
  } else {
    setPageActive(false);
  }
  // content scriptにも通知
  sendToContent({ action: 'setUILang', lang });
});

// ── 翻訳エンジン変更 ─────────────────────────────────────────────────
engineSel.addEventListener('change', () => {
  chrome.storage.local.set({ translateEngine: engineSel.value });
  toggleDeepLSettings();
});

deeplApiKeyInput.addEventListener('input', () => {
  chrome.storage.local.set({ deeplApiKey: deeplApiKeyInput.value.trim() });
});

function toggleDeepLSettings() {
  deeplSettings.style.display = engineSel.value === 'deepl' ? 'block' : 'none';
}

// ── 要約エンジン変更 ─────────────────────────────────────────────────
llmSel.addEventListener('change', () => {
  chrome.storage.local.set({ llmEngine: llmSel.value });
  toggleLLMSettings();
});

claudeApiKeyInput.addEventListener('input', () => {
  chrome.storage.local.set({ claudeApiKey: claudeApiKeyInput.value.trim() });
});

geminiApiKeyInput.addEventListener('input', () => {
  chrome.storage.local.set({ geminiApiKey: geminiApiKeyInput.value.trim() });
});

function toggleLLMSettings() {
  claudeSettings.style.display = llmSel.value === 'claude' ? 'block' : 'none';
  geminiSettings.style.display = llmSel.value === 'gemini' ? 'block' : 'none';
}

// ── Sync target language change to content script ────────────────────
targetLangSel.addEventListener('change', () => {
  const lang = targetLangSel.value;
  chrome.storage.local.set({ targetLang: lang });
  sendToContent({ action: 'setLang', lang });
});

// ── Get current tab ───────────────────────────────────────────────────
async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ── Send message to content script ────────────────────────────────────
async function sendToContent(msg) {
  const tab = await getTab();
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    setStatus('error', t('statusUnavailable'));
    return null;
  }
}

// ── Status helpers ─────────────────────────────────────────────────────
function setStatus(type, text) {
  statusText.textContent = text;
  statusDot.className = 'status-dot' + (type !== 'idle' ? ' ' + type : '');
}

// ── Page translate ─────────────────────────────────────────────────────
let pageActive = false;

btnPage.addEventListener('click', async () => {
  const lang = targetLangSel.value;

  if (pageActive) {
    await sendToContent({ action: 'undoPage' });
    setPageActive(false);
    return;
  }

  setStatus('translating', t('statusTranslating'));
  btnPage.disabled = true;
  btnRegion.disabled = true;

  const res = await sendToContent({ action: 'translatePage', lang });
  if (res?.ok) {
    setPageActive(true);
    setStatus('active', t('statusPageActive'));
  }

  btnPage.disabled = false;
  btnRegion.disabled = false;
});

function setPageActive(active) {
  pageActive = active;
  if (active) {
    btnPage.className = 'btn btn-active';
    btnPage.innerHTML = `${SVG_CHECK} <span>${t('translatingClick')}</span>`;
    btnUndo.style.display = 'flex';
  } else {
    btnPage.className = 'btn btn-primary';
    btnPage.innerHTML = `${SVG_PAGE} <span data-i18n="translateFullPage">${t('translateFullPage')}</span>`;
    btnUndo.style.display = 'none';
    setStatus('idle', t('statusDefault'));
  }
}

// ── Page translate & summarize ─────────────────────────────────────────
btnPageSummary.addEventListener('click', async () => {
  const lang = targetLangSel.value;

  if (pageActive) {
    await sendToContent({ action: 'undoPage' });
    setPageActive(false);
    return;
  }

  setStatus('translating', t('statusTranslating'));
  btnPage.disabled = true;
  btnPageSummary.disabled = true;
  btnRegion.disabled = true;

  const res = await sendToContent({ action: 'translatePageAndSummarize', lang });
  if (res?.ok) {
    setPageActive(true);
    setStatus('active', t('statusPageActive'));
  }

  btnPage.disabled = false;
  btnPageSummary.disabled = false;
  btnRegion.disabled = false;
});

// ── Undo ──────────────────────────────────────────────────────────────
btnUndo.addEventListener('click', async () => {
  await sendToContent({ action: 'undoPage' });
  setPageActive(false);
});

// ── Region mode ────────────────────────────────────────────────────────
btnRegion.addEventListener('click', async () => {
  setStatus('translating', t('statusSelectRegion'));
  const res = await sendToContent({
    action: 'enterRegionMode',
    lang: targetLangSel.value,
    mode: 'translate'
  });
  if (res?.ok) {
    window.close();
  }
});

// ── Region mode & summarize ───────────────────────────────────────────
btnRegionSummary.addEventListener('click', async () => {
  setStatus('translating', t('statusSelectRegion'));
  const res = await sendToContent({
    action: 'enterRegionMode',
    lang: targetLangSel.value,
    mode: 'summarize'
  });
  if (res?.ok) {
    window.close();
  }
});

// ── Check current state on popup open ─────────────────────────────────
(async () => {
  const res = await sendToContent({ action: 'getState' });
  if (res) {
    if (res.targetLang) targetLangSel.value = res.targetLang;
    if (res.pageTranslateActive) setPageActive(true);
  }
})();
