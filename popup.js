// Copyright (c) Orangesoft Inc
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

// SVG文字列をDOM要素に変換
function parseSvg(svgStr) {
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

// ── UI言語の初期化 ───────────────────────────────────────────────────
DVT_I18N.loadLang((lang) => {
  uiLangSel.value = lang;
  DVT_I18N.applyToDOM();
});

// ── Load saved settings ──────────────────────────────────────────────
chrome.storage.local.get(['targetLang', 'translateEngine', 'deeplApiKey', 'llmEngine', 'claudeApiKey', 'geminiApiKey', 'appleAvailable'], (data) => {
  if (data.targetLang) targetLangSel.value = data.targetLang;
  // Apple Translation は Safari でのみ利用可能。background.js の起動時 ping で判定済みの
  // appleAvailable フラグが true のときだけ <option value="apple"> を表示する
  const appleOption = document.getElementById('engineAppleOption');
  if (appleOption) {
    appleOption.style.display = data.appleAvailable ? '' : 'none';
  }
  // 保存されたエンジンが apple だが現環境で利用不可な場合は google にフォールバック
  if (data.translateEngine === 'apple' && !data.appleAvailable) {
    engineSel.value = 'google';
    chrome.storage.local.set({ translateEngine: 'google' });
  } else if (data.translateEngine) {
    engineSel.value = data.translateEngine;
  }
  if (data.deeplApiKey) deeplApiKeyInput.value = data.deeplApiKey;
  if (data.llmEngine) llmSel.value = data.llmEngine;
  if (data.claudeApiKey) claudeApiKeyInput.value = data.claudeApiKey;
  if (data.geminiApiKey) geminiApiKeyInput.value = data.geminiApiKey;
  toggleDeepLSettings();
  toggleLLMSettings();
  updateTranslateButtons();
  updateSummaryButtons();
  // ストレージ読み込み後にテストボタンの状態を更新
  updateApiTestButtons();
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
  updateTranslateButtons();
});

deeplApiKeyInput.addEventListener('input', () => {
  chrome.storage.local.set({ deeplApiKey: deeplApiKeyInput.value.trim() });
  updateTranslateButtons();
});

function toggleDeepLSettings() {
  deeplSettings.style.display = engineSel.value === 'deepl' ? 'block' : 'none';
}

// ── DeepL APIキー未設定時は翻訳ボタンを無効化 ──────────────────────
function updateTranslateButtons() {
  const needsKey = engineSel.value === 'deepl' && !deeplApiKeyInput.value.trim();
  btnPage.disabled = needsKey;
  btnRegion.disabled = needsKey;
  // 要約ボタンも翻訳できなければ無効化（LLMキー有無と合わせて判定）
  if (needsKey) {
    btnPageSummary.disabled = true;
    btnRegionSummary.disabled = true;
  }
}

// ── 要約エンジン変更 ─────────────────────────────────────────────────
llmSel.addEventListener('change', () => {
  chrome.storage.local.set({ llmEngine: llmSel.value });
  toggleLLMSettings();
});

claudeApiKeyInput.addEventListener('input', () => {
  chrome.storage.local.set({ claudeApiKey: claudeApiKeyInput.value.trim() });
  updateSummaryButtons();
});

geminiApiKeyInput.addEventListener('input', () => {
  chrome.storage.local.set({ geminiApiKey: geminiApiKeyInput.value.trim() });
  updateSummaryButtons();
});

// ── LLM APIキー未設定時は要約ボタンを無効化 ─────────────────────────
// DeepL APIキー未設定時も翻訳自体ができないため要約ボタンも無効化
function updateSummaryButtons() {
  const needsDeepLKey = engineSel.value === 'deepl' && !deeplApiKeyInput.value.trim();
  const hasLLMKey = !!claudeApiKeyInput.value.trim() || !!geminiApiKeyInput.value.trim();
  btnPageSummary.disabled = needsDeepLKey || !hasLLMKey;
  btnRegionSummary.disabled = needsDeepLKey || !hasLLMKey;
}

function toggleLLMSettings() {
  claudeSettings.style.display = llmSel.value === 'claude' ? 'block' : 'none';
  geminiSettings.style.display = llmSel.value === 'gemini' ? 'block' : 'none';
}

// ── APIキー検証 ──────────────────────────────────────────────────────
const apiTestButtons = [];

function setupApiKeyTest(btnId, inputId, engine) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;

  function updateTestBtn() {
    btn.disabled = !input.value.trim();
  }
  apiTestButtons.push(updateTestBtn);

  btn.addEventListener('click', () => {
    const apiKey = input.value.trim();
    if (!apiKey) return;

    btn.disabled = true;
    btn.textContent = t('apiKeyTesting');
    btn.classList.remove('dvt-test-ok', 'dvt-test-ng');

    chrome.runtime.sendMessage(
      { action: 'testApiKey', engine, apiKey },
      (res) => {
        if (res?.ok) {
          btn.textContent = t('apiKeyValid');
          btn.classList.add('dvt-test-ok');
        } else {
          btn.textContent = t('apiKeyInvalid');
          btn.title = res?.error || '';
          btn.classList.add('dvt-test-ng');
        }
        btn.disabled = false;
        setTimeout(() => {
          btn.textContent = t('apiKeyTest');
          btn.classList.remove('dvt-test-ok', 'dvt-test-ng');
          btn.title = '';
        }, 3000);
      }
    );
  });

  input.addEventListener('input', updateTestBtn);
}

// ストレージ読み込み後に呼ぶ
function updateApiTestButtons() {
  apiTestButtons.forEach(fn => fn());
}

setupApiKeyTest('deeplTestBtn', 'deeplApiKey', 'deepl');
setupApiKeyTest('claudeTestBtn', 'claudeApiKey', 'claude');
setupApiKeyTest('geminiTestBtn', 'geminiApiKey', 'gemini');

// ── Sync target language change to content script ────────────────────
targetLangSel.addEventListener('change', () => {
  const lang = targetLangSel.value;
  chrome.storage.local.set({ targetLang: lang });
  sendToContent({ action: 'setLang', lang });
});

// ── URLパターン自動生成（現在のタブURLから） ─────────────────────────
function urlToWildcardPattern(url) {
  try {
    const u = new URL(url);
    // *://hostname/* の形式で生成
    return '*://' + u.hostname + '/*';
  } catch (e) {
    return url;
  }
}

// ── Get current tab ───────────────────────────────────────────────────
async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// popup 起動直後にアクティブタブの tabId をキャッシュする。
// region 選択系ボタンで window.close() を user gesture context 内で同期呼びするために必要。
// async な await getTab() を経由すると macOS Safari で popup が閉じる前に sendMessage が
// 飛ばないリスクがあるため、初期化時に解決しておく。
let cachedTabId = null;
chrome.tabs.query({ active: true, currentWindow: true })
  .then(([tab]) => { if (tab?.id) cachedTabId = tab.id; })
  .catch(() => {});

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

// 同期 fire-and-forget。キャッシュ済み tabId で sendMessage を発射するだけで
// レスポンスは待たない。region 系ハンドラのように window.close() を user gesture
// context 内で同期実行したい場面で使う。返り値は送信を試みたかどうか（キャッシュ有無）。
function sendToContentSync(msg) {
  if (cachedTabId == null) return false;
  try {
    // sendMessage は Promise を返すが await しない。reject されても unhandled に
    // ならないよう catch を付けておく。
    const p = chrome.tabs.sendMessage(cachedTabId, msg);
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return true;
  } catch (_e) {
    return false;
  }
}

// region 系・要素ピッカー系の共通シーケンス: 同期送信 → 失敗時 async fallback → 同期 close。
// macOS Safari では await を挟むと user gesture context が失われ window.close() が無視される
// ため、必ず click ハンドラ末尾で同期的に close を呼ぶ必要がある。
function sendToContentAndClose(msg) {
  const sent = sendToContentSync(msg);
  if (!sent) sendToContent(msg);
  window.close();
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
    btnPage.textContent = '';
    btnPage.appendChild(parseSvg(SVG_CHECK));
    const span = document.createElement('span');
    span.textContent = t('translatingClick');
    btnPage.appendChild(span);
    btnUndo.style.display = 'flex';
  } else {
    btnPage.className = 'btn btn-primary';
    btnPage.textContent = '';
    btnPage.appendChild(parseSvg(SVG_PAGE));
    const span = document.createElement('span');
    span.setAttribute('data-i18n', 'translateFullPage');
    span.textContent = t('translateFullPage');
    btnPage.appendChild(span);
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
btnRegion.addEventListener('click', () => {
  setStatus('translating', t('statusSelectRegion'));
  sendToContentAndClose({
    action: 'enterRegionMode',
    lang: targetLangSel.value,
    mode: 'translate',
  });
});

// ── Region mode & summarize ───────────────────────────────────────────
btnRegionSummary.addEventListener('click', () => {
  setStatus('translating', t('statusSelectRegion'));
  sendToContentAndClose({
    action: 'enterRegionMode',
    lang: targetLangSel.value,
    mode: 'summarize',
  });
});

// ── Check current state on popup open ─────────────────────────────────
(async () => {
  const res = await sendToContent({ action: 'getState' });
  if (res) {
    if (res.targetLang) targetLangSel.value = res.targetLang;
    if (res.pageTranslateActive) {
      setPageActive(true);
    } else if (res.hasTranslations) {
      // 領域翻訳など、ページ全体翻訳以外の翻訳が存在する場合もリセットボタンを表示
      btnUndo.style.display = 'flex';
      setStatus('active', t('statusPageActive'));
    }
  }
})();

// ── 自動翻訳ルール管理 ─────────────────────────────────────────────
let autoRules = [];
// 編集中ルールのID（null のとき新規追加モード）
let editingRuleId = null;

function loadAutoRules() {
  chrome.storage.local.get('autoRules', (data) => {
    autoRules = data.autoRules || [];
    renderAutoRules();
  });
}

function saveAutoRules() {
  chrome.storage.local.set({ autoRules });
}

// ボタンラベルを data-i18n キーごと切り替える
// （textContent だけ差し替えると DVT_I18N.applyToDOM() でラベルが戻ってしまう）
function setAddButtonLabelKey(key) {
  const btn = document.getElementById('btnAddRule');
  btn.dataset.i18n = key;
  btn.textContent = t(key);
}

// 編集モードへ切り替え（select-to-edit: 一覧項目タップでフォームに値をセット）
function enterEditMode(ruleId) {
  const rule = autoRules.find(r => r.id === ruleId);
  if (!rule) return;
  editingRuleId = ruleId;
  document.getElementById('ruleUrlPattern').value = rule.urlPattern;
  document.getElementById('ruleSelector').value = rule.selector || '';
  document.getElementById('ruleMode').value = rule.mode || 'translate';
  setAddButtonLabelKey('autoRuleUpdate');
  document.getElementById('btnCancelRuleEdit').style.display = '';
  renderAutoRules();
}

// 編集モード解除（フォームをクリアして追加モードに戻す）
function exitEditMode() {
  editingRuleId = null;
  document.getElementById('ruleUrlPattern').value = '';
  document.getElementById('ruleSelector').value = '';
  document.getElementById('ruleMode').value = 'translate';
  setAddButtonLabelKey('autoRuleAdd');
  document.getElementById('btnCancelRuleEdit').style.display = 'none';
  renderAutoRules();
}

function renderAutoRules() {
  const list = document.getElementById('autoRuleList');
  if (!list) return;
  list.textContent = '';

  if (autoRules.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'rule-empty';
    empty.textContent = t('autoRuleEmpty');
    list.appendChild(empty);
    return;
  }

  autoRules.forEach((rule, idx) => {
    const item = document.createElement('div');
    item.className = 'rule-item';
    if (rule.id === editingRuleId) item.classList.add('editing');
    item.dataset.ruleId = rule.id;
    // キーボード操作・スクリーンリーダー対応
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.setAttribute('aria-pressed', String(rule.id === editingRuleId));

    const modeLabelKey = rule.mode === 'summarize' ? 'autoRuleModeSummarize' : 'autoRuleModeTranslate';
    // textContent に代入するのでエスケープ不要（エスケープすると &gt; 等がそのまま表示される）
    const subText = rule.selector
      ? `${rule.selector} · ${t(modeLabelKey)}`
      : `${t('translateFullPage')} · ${t(modeLabelKey)}`;

    const row = document.createElement('div');
    row.className = 'rule-item-row';
    // 有効/無効トグル（<label> で包まずチェックボックス単体に — パターンテキストを
    // クリックしたときにトグルしてしまう／編集モードに入れない問題を避ける）
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.dataset.idx = idx;
    checkbox.className = 'rule-toggle-cb';
    row.appendChild(checkbox);
    const pattern = document.createElement('span');
    pattern.className = 'rule-pattern';
    pattern.textContent = rule.urlPattern;
    row.appendChild(pattern);
    const delBtn = document.createElement('button');
    delBtn.className = 'rule-del';
    delBtn.dataset.idx = idx;
    delBtn.title = t('autoRuleDelete');
    delBtn.textContent = '✕';
    row.appendChild(delBtn);
    item.appendChild(row);
    const sub = document.createElement('div');
    sub.className = 'rule-item-sub';
    sub.textContent = subText;
    item.appendChild(sub);
    list.appendChild(item);
  });

  // チェックボックスのイベント設定（無効化時はObserverを停止）
  list.querySelectorAll('input[type=checkbox]').forEach(cb => {
    // click が項目クリック（編集モード遷移）まで伝播しないように止める
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      const idx = Number(cb.dataset.idx);
      autoRules[idx].enabled = cb.checked;
      saveAutoRules();
      if (!cb.checked && autoRules[idx]?.id) {
        sendToContent({ action: 'stopAutoRuleObserver', ruleId: autoRules[idx].id });
      }
    });
  });

  // 削除ボタンのイベント設定（削除時はObserverを停止）
  list.querySelectorAll('.rule-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // 項目クリック（編集モード遷移）と分離
      const idx = Number(btn.dataset.idx);
      const deleted = autoRules[idx];
      autoRules.splice(idx, 1);
      saveAutoRules();
      // 編集中のルールを削除したら編集モード解除
      if (deleted?.id === editingRuleId) {
        exitEditMode();
      } else {
        renderAutoRules();
      }
      if (deleted?.id) {
        sendToContent({ action: 'stopAutoRuleObserver', ruleId: deleted.id });
      }
    });
  });

  // ルール項目クリックで編集モードに遷移（チェックボックス・削除ボタン以外）
  list.querySelectorAll('.rule-item').forEach(item => {
    item.addEventListener('click', () => {
      const ruleId = item.dataset.ruleId;
      if (ruleId === editingRuleId) {
        // 編集中の項目を再度クリックしたら解除
        exitEditMode();
      } else {
        enterEditMode(ruleId);
      }
    });
    // キーボード（Enter / Space）でも同じ操作ができるように
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });
}

document.getElementById('btnAddRule').addEventListener('click', () => {
  const urlInput = document.getElementById('ruleUrlPattern');
  const selectorInput = document.getElementById('ruleSelector');
  const modeSelect = document.getElementById('ruleMode');

  const urlPattern = urlInput.value.trim();
  if (!urlPattern) {
    urlInput.focus();
    return;
  }

  const selector = selectorInput.value.trim();
  const mode = modeSelect.value;

  if (editingRuleId) {
    // 既存ルールを更新
    const idx = autoRules.findIndex(r => r.id === editingRuleId);
    if (idx === -1) {
      // 編集中に他コンテキスト（storage event等）で削除されていたケース。
      // 編集内容を失わないようにフォームと編集状態は維持してユーザーに通知する
      alert(t('autoRuleNotFound'));
      return;
    }
    const prev = autoRules[idx];
    const changed = prev.urlPattern !== urlPattern
      || prev.selector !== selector
      || prev.mode !== mode;
    autoRules[idx] = { ...prev, urlPattern, selector, mode };
    saveAutoRules();
    // urlPattern/selector/mode のいずれかが変わったら現ページに再適用を依頼する
    // （旧Observer停止 → 最新ルールで checkAutoRules を再実行）
    if (changed) {
      sendToContent({ action: 'reapplyAutoRule', ruleId: editingRuleId });
    }
    exitEditMode();
  } else {
    // 新規追加
    autoRules.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      urlPattern,
      selector,
      mode,
      enabled: true,
    });
    saveAutoRules();
    renderAutoRules();
    urlInput.value = '';
    selectorInput.value = '';
  }
});

document.getElementById('btnCancelRuleEdit').addEventListener('click', () => {
  exitEditMode();
});

loadAutoRules();

// ── 要素ピッカーボタン ─────────────────────────────────────────────
document.getElementById('btnPickSelector').addEventListener('click', () => {
  const urlPattern = document.getElementById('ruleUrlPattern').value.trim();
  sendToContentAndClose({ action: 'enterSelectorPickMode', urlPattern });
});

// ── 起動時の初期化: URL自動補完 + ピッカー結果の復元 ───────────────────
(async () => {
  // 現在のページURLからURLパターンを自動補完
  const tab = await getTab();
  if (tab?.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
    const urlInput = document.getElementById('ruleUrlPattern');
    if (urlInput && !urlInput.value) {
      urlInput.value = urlToWildcardPattern(tab.url);
    }
  }

  // 要素ピッカーで選択したセレクタが保存されていれば復元
  chrome.storage.local.get(['pendingRuleSelector', 'pendingRuleUrlPattern'], (data) => {
    if (data.pendingRuleSelector) {
      document.getElementById('ruleSelector').value = data.pendingRuleSelector;
      if (data.pendingRuleUrlPattern) {
        document.getElementById('ruleUrlPattern').value = data.pendingRuleUrlPattern;
      }
      // storageから削除
      chrome.storage.local.remove(['pendingRuleSelector', 'pendingRuleUrlPattern']);
      // ルールタブに切り替え（フォームが表示されるタブへ）
      document.getElementById('tabBtnRules').click();
    }
  });
})();

// ── 翻訳キャッシュ ───────────────────────────────────────────────────
// ポップアップ起動時にキャッシュ件数を表示し、クリアボタンで一括削除できる

// chrome.runtime.sendMessage の Promise ラッパー（callback-only 環境でも動作）
const sendMsg = (msg) => new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));

async function refreshCacheStats() {
  const label = document.getElementById('cacheEntriesLabel');
  if (!label) return;
  // applyToDOM() による data-i18n 上書きを防ぐため属性を除去
  label.removeAttribute('data-i18n');
  try {
    const res = await sendMsg({ action: 'cacheStats' });
    if (res?.ok) {
      label.textContent = t('cacheEntriesLabel', { count: res.entries });
      updateHitRateDisplay(res);
    } else {
      label.textContent = '—';
    }
  } catch (e) {
    label.textContent = '—';
  }
}

// ヒット率の表示を更新する
function updateHitRateDisplay(stats) {
  const container = document.getElementById('cacheHitRates');
  const tcLabel = document.getElementById('tcHitRateLabel');
  const scLabel = document.getElementById('scHitRateLabel');
  const tcFill = document.getElementById('tcHitRateFill');
  const scFill = document.getElementById('scHitRateFill');
  if (!container || !tcLabel || !scLabel || !tcFill || !scFill) return;

  const hasTcData = stats.tcHitRate !== null;
  const hasScData = stats.scHitRate !== null;

  if (!hasTcData && !hasScData) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  if (hasTcData) {
    tcLabel.textContent = t('cacheHitRateTc', { rate: stats.tcHitRate });
    tcFill.style.width = `${stats.tcHitRate}%`;
    tcLabel.closest('.cache-hit-rate-item').style.display = 'flex';
  } else {
    tcLabel.closest('.cache-hit-rate-item').style.display = 'none';
  }

  if (hasScData) {
    scLabel.textContent = t('cacheHitRateSc', { rate: stats.scHitRate });
    scFill.style.width = `${stats.scHitRate}%`;
    scLabel.closest('.cache-hit-rate-item').style.display = 'flex';
  } else {
    scLabel.closest('.cache-hit-rate-item').style.display = 'none';
  }
}

document.getElementById('btnClearCache').addEventListener('click', async () => {
  const btn = document.getElementById('btnClearCache');
  const label = document.getElementById('cacheEntriesLabel');
  btn.disabled = true;
  try {
    const res = await sendMsg({ action: 'clearCache' });
    if (res?.ok) {
      // 完了メッセージを一時表示してから件数を再取得
      label.textContent = t('cacheClearedToast', { count: res.cleared });
      setTimeout(refreshCacheStats, 2000);
    }
  } catch (e) {
    // エラー時は何もせず元の件数のまま
  } finally {
    btn.disabled = false;
  }
});

refreshCacheStats();

// ── 端末間同期（issue #205） ─────────────────────────────────────────
// chrome.storage.local の syncEnabled トグルで ON/OFF。
// 実際のミラー処理は background.js の onChanged リスナで動く。
// popup 側は UI（チェックボックス + ステータス表示）と初回 ON 時の合流を担当。
const syncCheckbox = document.getElementById('syncEnabledCheckbox');
const syncStatusEl = document.getElementById('syncStatus');

function setSyncStatus(messageKey, type, params) {
  if (!syncStatusEl) return;
  if (!messageKey) {
    syncStatusEl.dataset.status = 'none';
    syncStatusEl.textContent = '';
    return;
  }
  syncStatusEl.dataset.status = type; // 'ok' | 'error'
  syncStatusEl.textContent = params ? t(messageKey, params) : t(messageKey);
}

// 初期表示: storage の syncEnabled を反映し、過去エラーがあれば表示
chrome.storage.local.get(['syncEnabled', 'syncError', 'syncLastAt'], (data) => {
  syncCheckbox.checked = !!data.syncEnabled;
  if (data.syncError) {
    setSyncStatus('syncStatusError', 'error', { error: data.syncError });
  } else if (data.syncEnabled && data.syncLastAt) {
    const date = new Date(data.syncLastAt);
    setSyncStatus('syncStatusOk', 'ok', { time: date.toLocaleString() });
  }
});

syncCheckbox.addEventListener('change', async () => {
  const enabled = syncCheckbox.checked;
  await storageSetAll({ syncEnabled: enabled });
  if (!enabled) {
    // OFF: sync 側のデータは残置（再 ON 時に再利用）
    setSyncStatus(null);
    return;
  }
  // ON: background に初回合流を依頼
  setSyncStatus('syncInitializing', 'ok');
  const res = await sendMsg({ action: 'syncInitialize' });
  // res が undefined のケース (service worker error / runtime.lastError) も明示処理
  if (!res || !res.ok) {
    syncCheckbox.checked = false;
    storageSetAll({ syncEnabled: false });
    const errorStr = res?.error || 'no_response';
    const key = errorStr === 'storage_sync_unavailable'
      ? 'syncStatusUnavailable'
      : 'syncStatusError';
    setSyncStatus(key, 'error', { error: errorStr });
    return;
  }
  // 合流結果が変化を伴っていれば UI を再描画
  if (res.fromCloud > 0) {
    reapplyAllSettings();
  }
  const date = new Date();
  setSyncStatus('syncStatusOk', 'ok', { time: date.toLocaleString() });
});

// 他端末からの同期で local が変わったとき UI を更新
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.syncError && changes.syncError.newValue) {
    // syncError が truthy にセットされた → エラー表示
    setSyncStatus('syncStatusError', 'error', { error: changes.syncError.newValue });
  } else if (changes.syncLastAt && changes.syncLastAt.newValue && syncCheckbox.checked) {
    // 同じ set 呼び出しで syncError=null と syncLastAt の両方が変わる成功パスにも対応するため、
    // 「syncError が新しく truthy に設定された」場合のみ OK を抑制（解消イベントは OK 扱い）
    const errorBeingSet = changes.syncError?.newValue;
    if (!errorBeingSet) {
      const date = new Date(changes.syncLastAt.newValue);
      setSyncStatus('syncStatusOk', 'ok', { time: date.toLocaleString() });
    }
  }
  // SYNC_KEYS が他端末から更新された場合は UI を再描画
  const syncKeys = ['targetLang', 'translateEngine', 'llmEngine', 'autoRules', 'dismissedDomains', 'uiLang'];
  const updated = Object.keys(changes).filter(k => syncKeys.includes(k));
  if (updated.length > 0 && syncCheckbox.checked) {
    // autoRules 単独変更なら loadAutoRules だけで十分
    if (updated.length === 1 && updated[0] === 'autoRules') {
      loadAutoRules();
    } else {
      reapplyAllSettings();
    }
  }
});

// ── 設定のバックアップ（エクスポート / インポート） ────────────────────────
// issue #206: デバッグ等で設定が消える事故への備え。chrome.storage.local の
// 該当キーだけを JSON に書き出す。APIキーは opt-in（既定 OFF）。
const SETTINGS_EXPORT_KEYS = [
  'targetLang', 'translateEngine', 'llmEngine',
  'autoRules', 'dismissedDomains', 'uiLang'
  // 注: dvtTheme は content-core.js が prefers-color-scheme から毎ページ書き直すため
  // エクスポート/インポートしても次ページ表示で上書きされる。混乱を避けて対象外。
];
const SETTINGS_API_KEYS = ['deeplApiKey', 'claudeApiKey', 'geminiApiKey'];
const SETTINGS_EXPORT_FORMAT = 'dualview-translator-settings';
const SETTINGS_EXPORT_VERSION = 1;
// 値レベルのバリデーション: 不正値で UI と storage が乖離しないよう許可リストで弾く
const SETTINGS_VALIDATORS = {
  targetLang: (v) => typeof v === 'string' && /^[a-zA-Z-]{2,10}$/.test(v),
  translateEngine: (v) => ['google', 'deepl', 'apple'].includes(v),
  llmEngine: (v) => ['claude', 'gemini'].includes(v),
  uiLang: (v) => ['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar'].includes(v),
  // autoRules の各要素は object で string urlPattern を持つこと
  autoRules: (v) => Array.isArray(v) && v.every(r =>
    r && typeof r === 'object' && !Array.isArray(r) && typeof r.urlPattern === 'string'
  ),
  // dismissedDomains は文字列配列のみ
  dismissedDomains: (v) => Array.isArray(v) && v.every(s => typeof s === 'string'),
  deeplApiKey: (v) => typeof v === 'string',
  claudeApiKey: (v) => typeof v === 'string',
  geminiApiKey: (v) => typeof v === 'string',
};

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// chrome.runtime.lastError を確認しないと QUOTA_BYTES 超過などのエラーが silent に握り潰される
function storageGetAll(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (data) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message || String(err))); else resolve(data);
    });
  });
}
function storageSetAll(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message || String(err))); else resolve();
    });
  });
}

document.getElementById('btnExportSettings').addEventListener('click', async () => {
  const includeKeys = document.getElementById('backupIncludeKeys').checked;
  const keys = includeKeys
    ? [...SETTINGS_EXPORT_KEYS, ...SETTINGS_API_KEYS]
    : [...SETTINGS_EXPORT_KEYS];
  const data = await storageGetAll(keys);
  // 値が undefined のキーは除外
  const cleaned = {};
  for (const k of keys) {
    if (data[k] !== undefined) cleaned[k] = data[k];
  }
  const payload = {
    format: SETTINGS_EXPORT_FORMAT,
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    includesApiKeys: includeKeys,
    data: cleaned
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dualview-translator-settings-${todayStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Firefox 検出: WebExtension popup では file picker が popup を閉じてしまうため、
// Firefox のときは「ファイルから読み込む」ボタンを隠して貼り付け方式のみにする。
// Chrome / Edge / Safari では popup が閉じないので file picker が使える。
// 注: navigator.userAgent ベースの判定。将来 popup の挙動が同じ別ブラウザが出てきたら
// 機能検出（browser.runtime.getBrowserInfo 等）も検討する余地あり。
const __isFirefox = navigator.userAgent.includes('Firefox');
if (__isFirefox) {
  // ボタンを非表示にし、ハンドラ自体も登録しない（誤発火で popup が閉じるのを防ぐ）
  const fileBtn = document.getElementById('btnLoadFromFile');
  if (fileBtn) fileBtn.style.display = 'none';
  // ファイル選択ができない旨をプレースホルダーに反映（UX 誤認防止）。
  // ta.placeholder を直接書くと後続の DVT_I18N.applyToDOM()（言語切替時など）で
  // data-i18n-placeholder の値に戻ってしまうため、属性自体を書き換える。
  const ta = document.getElementById('importJsonText');
  if (ta) {
    ta.dataset.i18nPlaceholder = 'backupImportPlaceholderPasteOnly';
    ta.placeholder = t('backupImportPlaceholderPasteOnly');
  }
} else {
  document.getElementById('btnLoadFromFile').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });

  document.getElementById('importFileInput').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = ''; // 同じファイルを連続選択しても change が発火するようリセット
    if (!file) return;
    try {
      const text = await file.text();
      document.getElementById('importJsonText').value = text;
      setImportStatus(null);
    } catch (e) {
      setImportStatus('backupImportInvalid', 'error');
    }
  });
}

// Firefox の WebExtension popup では alert() / confirm() / file picker など
// 「フォーカスを奪うモーダル」を呼ぶと popup そのものが閉じてしまい、
// await 後の continuation（storage.set など）が実行されない。
// そのためインライン状態表示で完結させる。
function setImportStatus(messageKey, type) {
  const el = document.getElementById('importStatus');
  if (!el) return;
  if (!messageKey) {
    el.dataset.status = 'none';
    el.textContent = '';
    return;
  }
  el.dataset.status = type; // 'ok' | 'error'
  el.textContent = t(messageKey);
}

document.getElementById('btnApplyImport').addEventListener('click', async () => {
  const textarea = document.getElementById('importJsonText');
  const raw = textarea.value.trim();
  setImportStatus(null);
  if (!raw) {
    setImportStatus('backupImportEmpty', 'error');
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    setImportStatus('backupImportInvalid', 'error');
    return;
  }
  if (!payload
      || payload.format !== SETTINGS_EXPORT_FORMAT
      || typeof payload.data !== 'object'
      || payload.data === null
      || Array.isArray(payload.data)) {
    setImportStatus('backupImportInvalid', 'error');
    return;
  }
  // バージョン互換: 未知バージョンの JSON は拒否（将来 v2 を v1 クライアントで誤適用しない）
  if (payload.version !== SETTINGS_EXPORT_VERSION) {
    setImportStatus('backupImportInvalid', 'error');
    return;
  }
  // 既知のキー + 値の妥当性で 2 段階フィルタ（不明キー / 不正値は静かに無視）
  const allowed = new Set([...SETTINGS_EXPORT_KEYS, ...SETTINGS_API_KEYS]);
  const toSet = {};
  for (const [k, v] of Object.entries(payload.data)) {
    if (!allowed.has(k)) continue;
    const validator = SETTINGS_VALIDATORS[k];
    if (validator && !validator(v)) continue;
    toSet[k] = v;
  }
  try {
    await storageSetAll(toSet);
    // popup を reload するとブラウザによっては閉じてしまうため in-place で UI を再描画する
    // reapplyAllSettings 内の storage 書き込み（apple フォールバック）もここで try/catch
    await reapplyAllSettings();
  } catch (e) {
    setImportStatus('backupImportInvalid', 'error');
    return;
  }
  textarea.value = '';
  setImportStatus('backupImportDone', 'ok');
});

// インポート反映: storage に保存済みの全設定を UI に読み戻す。
// 初期化ロジック（line 52 付近）と一致させているが、本関数は同期的に呼び出した
// 全 UI を新しい値に揃える役割を持つ（reload 代替）。
async function reapplyAllSettings() {
  const data = await storageGetAll([
    'targetLang', 'translateEngine', 'deeplApiKey', 'llmEngine',
    'claudeApiKey', 'geminiApiKey', 'appleAvailable', 'uiLang'
  ]);
  if (data.targetLang) targetLangSel.value = data.targetLang;
  // 初期化ロジック（line 52 付近）と同じく Apple Translation オプションの表示制御
  const appleOption = document.getElementById('engineAppleOption');
  if (appleOption) appleOption.style.display = data.appleAvailable ? '' : 'none';
  if (data.translateEngine === 'apple' && !data.appleAvailable) {
    // 別端末 (Safari) でエクスポート → 現端末 (Chrome) でインポート時の整合確保
    engineSel.value = 'google';
    await storageSetAll({ translateEngine: 'google' });
  } else if (data.translateEngine) {
    engineSel.value = data.translateEngine;
  }
  deeplApiKeyInput.value = data.deeplApiKey || '';
  if (data.llmEngine) llmSel.value = data.llmEngine;
  claudeApiKeyInput.value = data.claudeApiKey || '';
  geminiApiKeyInput.value = data.geminiApiKey || '';
  toggleDeepLSettings();
  toggleLLMSettings();
  updateTranslateButtons();
  updateSummaryButtons();
  updateApiTestButtons();
  if (data.uiLang) {
    uiLangSel.value = data.uiLang;
    DVT_I18N.setLang(data.uiLang);
    DVT_I18N.applyToDOM();
    sendToContent({ action: 'setUILang', lang: data.uiLang });
  }
  // 自動翻訳ルール一覧を再ロード（ここがインポートで一番見落とされやすい）
  loadAutoRules();
  // テーマは popup-init.js の chrome.storage.onChanged リスナで自動反映される
}
