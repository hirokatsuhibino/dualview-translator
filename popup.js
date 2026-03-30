// DualView Translator — Popup Script

const targetLangSel = document.getElementById('targetLang');
const btnPage       = document.getElementById('btnPage');
const btnRegion     = document.getElementById('btnRegion');
const btnUndo       = document.getElementById('btnUndo');
const statusDot     = document.getElementById('statusDot');
const statusText    = document.getElementById('statusText');

// ── Load saved language ───────────────────────────────────────────────
chrome.storage.local.get('targetLang', (data) => {
  if (data.targetLang) targetLangSel.value = data.targetLang;
});

// ── Sync language change to content script ────────────────────────────
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
    setStatus('error', 'このページでは利用できません');
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

  setStatus('translating', 'ページを翻訳中…');
  btnPage.disabled = true;
  btnRegion.disabled = true;

  const res = await sendToContent({ action: 'translatePage', lang });
  if (res?.ok) {
    setPageActive(true);
    setStatus('active', 'ページ翻訳中（リセットで元に戻す）');
  }

  btnPage.disabled = false;
  btnRegion.disabled = false;
});

function setPageActive(active) {
  pageActive = active;
  if (active) {
    btnPage.className = 'btn btn-active';
    btnPage.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      翻訳中（クリックで解除）`;
    btnUndo.style.display = 'flex';
  } else {
    btnPage.className = 'btn btn-primary';
    btnPage.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M7 8h10M7 12h10M7 16h6"/>
      </svg>
      ページ全体を翻訳`;
    btnUndo.style.display = 'none';
    setStatus('idle', 'テキストを選択して翻訳、またはモードを選択');
  }
}

// ── Undo ──────────────────────────────────────────────────────────────
btnUndo.addEventListener('click', async () => {
  await sendToContent({ action: 'undoPage' });
  setPageActive(false);
});

// ── Region mode ────────────────────────────────────────────────────────
btnRegion.addEventListener('click', async () => {
  setStatus('translating', '領域を選択してください…');
  const res = await sendToContent({
    action: 'enterRegionMode',
    lang: targetLangSel.value
  });
  if (res?.ok) {
    // Close popup so user can select region on page
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
