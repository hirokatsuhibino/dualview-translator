// DualView Translator - Content Script
// Handles: selection-based floating translation + full-page dual-view translation

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let targetLang = 'ja';
  let selectionPanel = null;
  let pageTranslateActive = false;

  let translateBar = null;

  // 言語コード→表示名マップ
  const LANG_NAMES = {
    ja: '日本語', en: 'English', zh: '中文', 'zh-cn': '中文（簡体）', 'zh-tw': '中文（繁体）',
    ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', pt: 'Português',
    ru: 'Русский', ar: 'العربية', it: 'Italiano', nl: 'Nederlands', vi: 'Tiếng Việt',
    th: 'ไทย', id: 'Bahasa Indonesia', hi: 'हिन्दी', pl: 'Polski', sv: 'Svenska',
  };

  function getLangDisplayName(code) {
    if (!code) return 'Unknown';
    const lower = code.toLowerCase();
    return LANG_NAMES[lower] || LANG_NAMES[lower.split('-')[0]] || code;
  }

  // テーマ検出: Webページコンテキストで検出しstorageに保存（ポップアップ用）
  (function detectTheme() {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    function apply(light) {
      document.documentElement.classList.toggle('dvt-light', light);
      chrome.storage.local.set({ dvtTheme: light ? 'light' : 'dark' });
    }
    apply(mq.matches);
    mq.addEventListener('change', function(e) { apply(e.matches); });
  })();

  // UI言語をロードしてからターゲット言語をロード、最後に言語検出
  DVT_I18N.loadLang(() => {
    chrome.storage.local.get(['targetLang', 'dismissedDomains'], (data) => {
      if (data.targetLang) targetLang = data.targetLang;
      const dismissed = data.dismissedDomains || [];
      if (!dismissed.includes(location.hostname)) {
        detectPageLanguage();
      }
    });
  });

  // ─── Translation via background ──────────────────────────────────────────
  function translate(text, tl, sl = 'auto') {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'translate', text, tl, sl }, (res) => {
        if (chrome.runtime.lastError) { resolve({ text: t('error'), detectedLang: null }); return; }
        if (res?.ok) {
          resolve(res.result);
        } else {
          resolve({ text: t('translateFailed'), detectedLang: null });
        }
      });
    });
  }

  // Normalize language codes for comparison (e.g. "zh-CN" vs "zh")
  function langMatches(detected, target) {
    if (!detected) return false;
    const d = detected.toLowerCase().split('-')[0];
    const tgt = target.toLowerCase().split('-')[0];
    return d === tgt;
  }

  // ─── Selection Toolbar ───────────────────────────────────────────────────
  document.addEventListener('mouseup', (e) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (selectionPanel && selectionPanel.contains(e.target)) return;
    removeSelectionPanel();
    if (text && text.length > 1) {
      showSelectionPanel(sel, text);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeSelectionPanel();
  });

  function removeSelectionPanel() {
    if (selectionPanel) { selectionPanel.remove(); selectionPanel = null; }
  }

  function showSelectionPanel(sel, text) {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const panel = document.createElement('div');
    panel.className = 'dvt-sel-panel';
    panel.setAttribute('data-dvt', 'true');
    panel.innerHTML = buildSelectionPanelHTML(text);

    // Position: below selection, avoid viewport overflow
    const top = rect.bottom + window.scrollY + 10;
    const left = Math.min(Math.max(rect.left + window.scrollX, 8), window.innerWidth - 360 + window.scrollX);
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';

    document.body.appendChild(panel);
    selectionPanel = panel;

    // Wire up events
    panel.querySelector('.dvt-sel-lang').value = targetLang;

    panel.querySelector('.dvt-sel-btn').addEventListener('click', async () => {
      const tl = panel.querySelector('.dvt-sel-lang').value;
      targetLang = tl;
      chrome.storage.local.set({ targetLang: tl });
      await runSelectionTranslate(panel, text, tl);
    });

    panel.querySelector('.dvt-sel-close').addEventListener('click', removeSelectionPanel);

    panel.querySelector('.dvt-sel-lang').addEventListener('change', (e) => {
      targetLang = e.target.value;
    });
  }

  const SVG_TRANSLATE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 3l14 0M12 3v4M3 10h8m0 0-3 3m3-3-3-3M16 10h5M16 14l5 0M16 17l5 0"/></svg>';
  const SVG_COPY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';

  function buildSelectionPanelHTML(text) {
    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
    return `
      <div class="dvt-sel-header">
        <span class="dvt-sel-label">${escapeHtml(t('dualviewTitle'))}</span>
        <button class="dvt-sel-close" title="${escapeHtml(t('close'))}">✕</button>
      </div>
      <div class="dvt-sel-original">
        <span class="dvt-badge dvt-badge-orig">${escapeHtml(t('original'))}</span>
        <div class="dvt-sel-orig-text">${escapeHtml(preview)}</div>
      </div>
      <div class="dvt-sel-controls">
        <select class="dvt-sel-lang">
          <option value="ja">🇯🇵 日本語</option>
          <option value="en">🇺🇸 English</option>
          <option value="zh-CN">🇨🇳 中文（簡）</option>
          <option value="zh-TW">🇹🇼 中文（繁）</option>
          <option value="ko">🇰🇷 한국어</option>
          <option value="fr">🇫🇷 Français</option>
          <option value="de">🇩🇪 Deutsch</option>
          <option value="es">🇪🇸 Español</option>
          <option value="pt">🇵🇹 Português</option>
          <option value="ru">🇷🇺 Русский</option>
          <option value="ar">🇸🇦 العربية</option>
        </select>
        <button class="dvt-sel-btn">
          ${SVG_TRANSLATE}
          ${escapeHtml(t('translateBtn'))}
        </button>
      </div>
      <div class="dvt-sel-result" style="display:none">
        <span class="dvt-badge dvt-badge-trans">${escapeHtml(t('translated'))}</span>
        <div class="dvt-sel-trans-text"></div>
        <div class="dvt-sel-actions">
          <button class="dvt-copy-btn" title="${escapeHtml(t('copyBtn'))}">
            ${SVG_COPY}
            ${escapeHtml(t('copyBtn'))}
          </button>
        </div>
      </div>
    `;
  }

  async function runSelectionTranslate(panel, text, tl) {
    const btn = panel.querySelector('.dvt-sel-btn');
    const result = panel.querySelector('.dvt-sel-result');
    const transText = panel.querySelector('.dvt-sel-trans-text');

    btn.disabled = true;
    btn.textContent = t('translating');
    result.style.display = 'block';
    transText.innerHTML = '<span class="dvt-spinner"></span>';

    const { text: translated, detectedLang } = await translate(text, tl);

    if (langMatches(detectedLang, tl)) {
      transText.innerHTML = `<span class="dvt-same-lang">${escapeHtml(t('sameLang', { lang: detectedLang }))}</span>`;
    } else {
      transText.textContent = translated;
    }

    btn.disabled = false;
    btn.innerHTML = `${SVG_TRANSLATE} ${escapeHtml(t('retranslateBtn'))}`;

    panel.querySelector('.dvt-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(translated).then(() => {
        const cb = panel.querySelector('.dvt-copy-btn');
        cb.textContent = t('copied');
        setTimeout(() => {
          cb.innerHTML = `${SVG_COPY} ${escapeHtml(t('copyBtn'))}`;
        }, 2000);
      });
    });
  }

  // ─── Page Translation ─────────────────────────────────────────────────────
  async function translatePage(tl) {
    if (pageTranslateActive) {
      undoPageTranslate();
      return;
    }

    pageTranslateActive = true;
    targetLang = tl;

    const SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, figcaption, blockquote, dt, dd';
    const elements = Array.from(document.querySelectorAll(SELECTORS)).filter(el => {
      if (el.closest('[data-dvt]')) return false;
      if (el.dataset.dvtId) return false;
      const text = el.innerText?.trim();
      return text && text.length >= 4;
    });

    if (elements.length === 0) return;

    const toast = showToast(t('toastTranslating', { done: 0, total: elements.length }), true);
    let done = 0;

    const CONCURRENCY = 6;
    const queue = [...elements];

    async function worker() {
      while (queue.length > 0) {
        const el = queue.shift();
        if (!el) break;

        const originalText = el.innerText.trim();
        const originalHTML = el.innerHTML;
        const id = 'dvt-' + Math.random().toString(36).slice(2);
        el.dataset.dvtId = id;

        const wrapper = document.createElement('span');
        wrapper.setAttribute('data-dvt', 'true');
        wrapper.innerHTML = `
          <span class="dvt-orig" data-dvt="true">${originalHTML}</span>
          <span class="dvt-trans" data-dvt="true"><span class="dvt-spinner"></span></span>
        `;
        el.innerHTML = '';
        el.appendChild(wrapper);

        const { text: result, detectedLang } = await translate(originalText, tl);
        const transEl = el.querySelector('.dvt-trans');

        if (langMatches(detectedLang, tl)) {
          if (transEl) transEl.remove();
        } else {
          if (transEl) transEl.textContent = result;
        }

        done++;
        updateToast(toast, t('toastTranslating', { done, total: elements.length }));
        if (done >= elements.length) {
          updateToast(toast, t('toastDone', { count: done }));
          setTimeout(() => toast.remove(), 2500);
        }
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);
  }

  function undoPageTranslate() {
    pageTranslateActive = false;
    document.querySelectorAll('[data-dvt-id]').forEach(el => {
      const origEl = el.querySelector('.dvt-orig');
      if (origEl) {
        el.innerHTML = origEl.innerHTML;
        delete el.dataset.dvtId;
      }
    });
    document.querySelectorAll('[data-dvt-id]').forEach(el => {
      delete el.dataset.dvtId;
    });
    showToast(t('toastReset'), false, 2000);
  }

  // ─── Region Selection Mode ─────────────────────────────────────────────────
  let regionMode = false;
  let regionOverlay = null;
  let regionStart = null;

  function enterRegionMode() {
    regionMode = true;
    document.body.style.cursor = 'crosshair';
    const hint = document.createElement('div');
    hint.className = 'dvt-region-hint';
    hint.setAttribute('data-dvt', 'true');
    hint.textContent = t('regionHint');
    document.body.appendChild(hint);

    function onMousedown(e) {
      if (e.target.closest('[data-dvt]')) return;
      regionStart = { x: e.clientX, y: e.clientY };

      regionOverlay = document.createElement('div');
      regionOverlay.className = 'dvt-region-overlay';
      regionOverlay.setAttribute('data-dvt', 'true');
      document.body.appendChild(regionOverlay);

      function onMousemove(e) {
        const x = Math.min(e.clientX, regionStart.x);
        const y = Math.min(e.clientY, regionStart.y);
        const w = Math.abs(e.clientX - regionStart.x);
        const h = Math.abs(e.clientY - regionStart.y);
        regionOverlay.style.left = x + window.scrollX + 'px';
        regionOverlay.style.top = y + window.scrollY + 'px';
        regionOverlay.style.width = w + 'px';
        regionOverlay.style.height = h + 'px';
      }

      function onMouseup(e) {
        document.removeEventListener('mousemove', onMousemove);
        document.removeEventListener('mouseup', onMouseup);

        const endX = e.clientX;
        const endY = e.clientY;
        const rectData = {
          left: Math.min(regionStart.x, endX),
          top: Math.min(regionStart.y, endY),
          right: Math.max(regionStart.x, endX),
          bottom: Math.max(regionStart.y, endY),
        };

        if (rectData.right - rectData.left > 20 && rectData.bottom - rectData.top > 20) {
          translateRegion(rectData);
        }

        exitRegionMode(hint, onMousedown, onKeydown);
      }

      document.addEventListener('mousemove', onMousemove);
      document.addEventListener('mouseup', onMouseup);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') exitRegionMode(hint, onMousedown, onKeydown);
    }

    document.addEventListener('mousedown', onMousedown);
    document.addEventListener('keydown', onKeydown);
    hint._cleanup = () => {
      document.removeEventListener('mousedown', onMousedown);
      document.removeEventListener('keydown', onKeydown);
    };
  }

  function exitRegionMode(hint, ...cleanups) {
    regionMode = false;
    document.body.style.cursor = '';
    if (hint) hint.remove();
    if (regionOverlay) { regionOverlay.remove(); regionOverlay = null; }
    cleanups.forEach(fn => { try { fn && document.removeEventListener('mousedown', fn); } catch(e){} });
    if (hint?._cleanup) hint._cleanup();
  }

  async function translateRegion(rect) {
    const SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div';
    const elements = Array.from(document.querySelectorAll(SELECTORS)).filter(el => {
      if (el.closest('[data-dvt]')) return false;
      if (el.dataset.dvtId) return false;
      const elRect = el.getBoundingClientRect();
      return (
        elRect.left < rect.right &&
        elRect.right > rect.left &&
        elRect.top < rect.bottom &&
        elRect.bottom > rect.top &&
        el.innerText?.trim().length >= 4
      );
    });

    const leafElements = elements.filter(el =>
      !elements.some(other => other !== el && el.contains(other))
    );

    if (leafElements.length === 0) {
      showToast(t('toastNoText'), false, 2500);
      return;
    }

    const toast = showToast(t('toastTranslating', { done: 0, total: leafElements.length }), true);
    let done = 0;

    for (const el of leafElements) {
      if (el.dataset.dvtId) continue;
      const originalText = el.innerText.trim();
      const originalHTML = el.innerHTML;
      const id = 'dvt-r-' + Math.random().toString(36).slice(2);
      el.dataset.dvtId = id;

      const wrapper = document.createElement('span');
      wrapper.setAttribute('data-dvt', 'true');
      wrapper.innerHTML = `
        <span class="dvt-orig" data-dvt="true">${originalHTML}</span>
        <span class="dvt-trans" data-dvt="true"><span class="dvt-spinner"></span></span>
      `;
      el.innerHTML = '';
      el.appendChild(wrapper);

      translate(originalText, targetLang).then(({ text: result, detectedLang }) => {
        const transEl = el.querySelector('.dvt-trans');
        if (langMatches(detectedLang, targetLang)) {
          if (transEl) transEl.remove();
        } else {
          if (transEl) transEl.textContent = result;
        }
        done++;
        updateToast(toast, t('toastTranslating', { done, total: leafElements.length }));
        if (done >= leafElements.length) {
          updateToast(toast, t('toastDone', { count: done }));
          setTimeout(() => toast.remove(), 2500);
        }
      });
    }
  }

  // ─── Toast Notification ───────────────────────────────────────────────────
  function showToast(message, persistent = false, duration = 0) {
    const el = document.createElement('div');
    el.className = 'dvt-toast';
    el.setAttribute('data-dvt', 'true');
    el.innerHTML = `
      <span class="dvt-toast-icon">${persistent ? '<span class="dvt-spinner dvt-spinner-sm"></span>' : '●'}</span>
      <span class="dvt-toast-msg">${message}</span>
    `;
    document.body.appendChild(el);
    if (duration > 0) setTimeout(() => el.remove(), duration);
    return el;
  }

  function updateToast(el, message) {
    const msgEl = el.querySelector('.dvt-toast-msg');
    if (msgEl) msgEl.textContent = message;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Context Menu Translation ─────────────────────────────────────────
  function showContextMenuPanel(text) {
    removeSelectionPanel();

    const panel = document.createElement('div');
    panel.className = 'dvt-sel-panel';
    panel.setAttribute('data-dvt', 'true');
    panel.innerHTML = buildSelectionPanelHTML(text);

    // 選択範囲の位置を取得（可能なら）
    const sel = window.getSelection();
    let top, left;
    if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      top = rect.bottom + window.scrollY + 10;
      left = Math.min(Math.max(rect.left + window.scrollX, 8), window.innerWidth - 360 + window.scrollX);
    } else {
      // 選択範囲が取れない場合は画面上部中央
      top = window.scrollY + 80;
      left = Math.max((window.innerWidth - 340) / 2 + window.scrollX, 8);
    }
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';

    document.body.appendChild(panel);
    selectionPanel = panel;

    // イベント登録
    panel.querySelector('.dvt-sel-lang').value = targetLang;
    panel.querySelector('.dvt-sel-btn').addEventListener('click', async () => {
      const tl = panel.querySelector('.dvt-sel-lang').value;
      targetLang = tl;
      chrome.storage.local.set({ targetLang: tl });
      await runSelectionTranslate(panel, text, tl);
    });
    panel.querySelector('.dvt-sel-close').addEventListener('click', removeSelectionPanel);
    panel.querySelector('.dvt-sel-lang').addEventListener('change', (e) => {
      targetLang = e.target.value;
    });

    // 即座に翻訳開始
    runSelectionTranslate(panel, text, targetLang);
  }

  // ─── Page Language Detection & Translate Bar ─────────────────────────────
  async function detectPageLanguage() {
    const htmlLang = document.documentElement.lang;
    if (htmlLang && !langMatches(htmlLang, targetLang)) {
      showTranslateBar(htmlLang);
      return;
    }
    if (htmlLang && langMatches(htmlLang, targetLang)) return;

    const bodyText = document.body?.innerText?.trim();
    if (!bodyText || bodyText.length < 20) return;
    const sample = bodyText.slice(0, 200);

    try {
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'detectLang', text: sample }, (res) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(res?.ok ? res.detectedLang : null);
        });
      });
      if (result && !langMatches(result, targetLang)) {
        showTranslateBar(result);
      }
    } catch (e) {
      // 検出失敗は無視
    }
  }

  function showTranslateBar(detectedLang) {
    if (translateBar) return;
    const langName = getLangDisplayName(detectedLang);

    const bar = document.createElement('div');
    bar.className = 'dvt-translate-bar';
    bar.setAttribute('data-dvt', 'true');
    bar.innerHTML = `
      <span class="dvt-translate-bar-text">
        ${t('translateBarMsg', { lang: escapeHtml(langName) })}
      </span>
      <button class="dvt-translate-bar-btn dvt-translate-bar-accept">${escapeHtml(t('translateBarAccept'))}</button>
      <button class="dvt-translate-bar-btn dvt-translate-bar-close" title="${escapeHtml(t('close'))}">✕</button>
    `;
    document.body.appendChild(bar);
    translateBar = bar;

    bar.querySelector('.dvt-translate-bar-accept').addEventListener('click', () => {
      removeTranslateBar();
      translatePage(targetLang);
    });

    bar.querySelector('.dvt-translate-bar-close').addEventListener('click', () => {
      removeTranslateBar();
      chrome.storage.local.get('dismissedDomains', (data) => {
        const list = data.dismissedDomains || [];
        if (!list.includes(location.hostname)) {
          list.push(location.hostname);
          chrome.storage.local.set({ dismissedDomains: list });
        }
      });
    });
  }

  function removeTranslateBar() {
    if (translateBar) { translateBar.remove(); translateBar = null; }
  }

  // ─── Message Listener (from popup) ───────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'translatePage') {
      translatePage(msg.lang);
      sendResponse({ ok: true, active: pageTranslateActive });
    }
    if (msg.action === 'undoPage') {
      undoPageTranslate();
      sendResponse({ ok: true });
    }
    if (msg.action === 'enterRegionMode') {
      enterRegionMode();
      sendResponse({ ok: true });
    }
    if (msg.action === 'setLang') {
      targetLang = msg.lang;
      chrome.storage.local.set({ targetLang: msg.lang });
      sendResponse({ ok: true });
    }
    if (msg.action === 'setUILang') {
      DVT_I18N.setLang(msg.lang);
      sendResponse({ ok: true });
    }
    if (msg.action === 'contextMenuTranslate') {
      showContextMenuPanel(msg.text);
      sendResponse({ ok: true });
    }
    if (msg.action === 'getState') {
      sendResponse({ pageTranslateActive, targetLang });
    }
    return true;
  });

})();
