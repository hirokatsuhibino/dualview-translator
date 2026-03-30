// DualView Translator - Content Script
// Handles: selection-based floating translation + full-page dual-view translation

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let targetLang = 'ja';
  let selectionPanel = null;
  let pageTranslateActive = false;
  let pendingTranslations = 0;

  let translateBar = null;

  // 言語コード→表示名マップ
  const LANG_NAMES = {
    ja: '日本語', en: 'English', zh: '中文', 'zh-cn': '中文（簡体）', 'zh-tw': '中文（繁体）',
    ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', pt: 'Português',
    ru: 'Русский', ar: 'العربية', it: 'Italiano', nl: 'Nederlands', vi: 'Tiếng Việt',
    th: 'ไทย', id: 'Bahasa Indonesia', hi: 'हिन्दी', pl: 'Polski', sv: 'Svenska',
  };

  function getLangDisplayName(code) {
    if (!code) return '不明';
    const lower = code.toLowerCase();
    return LANG_NAMES[lower] || LANG_NAMES[lower.split('-')[0]] || code;
  }

  // Load saved lang preference, then detect page language
  chrome.storage.local.get(['targetLang', 'dismissedDomains'], (data) => {
    if (data.targetLang) targetLang = data.targetLang;
    const dismissed = data.dismissedDomains || [];
    if (!dismissed.includes(location.hostname)) {
      detectPageLanguage();
    }
  });

  // ─── Translation via background ──────────────────────────────────────────
  // Returns { text, detectedLang } or { text: '[エラー]', detectedLang: null }
  function translate(text, tl, sl = 'auto') {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'translate', text, tl, sl }, (res) => {
        if (chrome.runtime.lastError) { resolve({ text: '[エラー]', detectedLang: null }); return; }
        if (res?.ok) {
          resolve(res.result); // { text, detectedLang }
        } else {
          resolve({ text: '[翻訳失敗]', detectedLang: null });
        }
      });
    });
  }

  // Normalize language codes for comparison (e.g. "zh-CN" vs "zh")
  function langMatches(detected, target) {
    if (!detected) return false;
    const d = detected.toLowerCase().split('-')[0];
    const t = target.toLowerCase().split('-')[0];
    return d === t;
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

  function buildSelectionPanelHTML(text) {
    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
    return `
      <div class="dvt-sel-header">
        <span class="dvt-sel-label">DualView 翻訳</span>
        <button class="dvt-sel-close" title="閉じる">✕</button>
      </div>
      <div class="dvt-sel-original">
        <span class="dvt-badge dvt-badge-orig">原文</span>
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 3l14 0M12 3v4M3 10h8m0 0-3 3m3-3-3-3M16 10h5M16 14l5 0M16 17l5 0"/></svg>
          翻訳する
        </button>
      </div>
      <div class="dvt-sel-result" style="display:none">
        <span class="dvt-badge dvt-badge-trans">翻訳</span>
        <div class="dvt-sel-trans-text"></div>
        <div class="dvt-sel-actions">
          <button class="dvt-copy-btn" title="コピー">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            コピー
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
    btn.textContent = '翻訳中…';
    result.style.display = 'block';
    transText.innerHTML = '<span class="dvt-spinner"></span>';

    const { text: translated, detectedLang } = await translate(text, tl);

    // Same language: show message instead of translation
    if (langMatches(detectedLang, tl)) {
      transText.innerHTML = `<span class="dvt-same-lang">原文と翻訳先の言語が同じです（${detectedLang}）</span>`;
    } else {
      transText.textContent = translated;
    }

    btn.disabled = false;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 3l14 0M12 3v4M3 10h8m0 0-3 3m3-3-3-3M16 10h5M16 14l5 0M16 17l5 0"/></svg> 再翻訳`;

    // Copy button (only useful when translated)
    panel.querySelector('.dvt-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(translated).then(() => {
        const cb = panel.querySelector('.dvt-copy-btn');
        cb.textContent = '✓ コピー済';
        setTimeout(() => {
          cb.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> コピー`;
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

    const toast = showToast(`0 / ${elements.length} 翻訳中…`, true);
    let done = 0;

    // Batch translate with concurrency limit
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

        // Placeholder while translating
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
          // Same language: remove the translation row entirely, restore original only
          if (transEl) transEl.remove();
        } else {
          if (transEl) transEl.textContent = result;
        }

        done++;
        updateToast(toast, `${done} / ${elements.length} 翻訳中…`);
        if (done >= elements.length) {
          updateToast(toast, `✓ ${done} 件翻訳完了`);
          setTimeout(() => toast.remove(), 2500);
        }
      }
    }

    // Start concurrent workers
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
    showToast('翻訳をリセットしました', false, 2000);
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
    hint.textContent = '翻訳したい領域をドラッグして選択してください  [Esc でキャンセル]';
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
      showToast('翻訳対象のテキストが見つかりませんでした', false, 2500);
      return;
    }

    const toast = showToast(`0 / ${leafElements.length} 翻訳中…`, true);
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
        updateToast(toast, `${done} / ${leafElements.length} 翻訳中…`);
        if (done >= leafElements.length) {
          updateToast(toast, `✓ ${done} 件翻訳完了`);
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

  // ─── Page Language Detection & Translate Bar ─────────────────────────────
  async function detectPageLanguage() {
    // html lang属性から検出を試みる
    const htmlLang = document.documentElement.lang;
    if (htmlLang && !langMatches(htmlLang, targetLang)) {
      showTranslateBar(htmlLang);
      return;
    }
    // lang属性がターゲットと一致、または未設定の場合はAPIで検出
    if (htmlLang && langMatches(htmlLang, targetLang)) return;

    // ページ本文からサンプルテキストを抽出
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
        このページは <strong>${escapeHtml(langName)}</strong> で書かれています。翻訳しますか？
      </span>
      <button class="dvt-translate-bar-btn dvt-translate-bar-accept">翻訳する</button>
      <button class="dvt-translate-bar-btn dvt-translate-bar-close" title="閉じる">✕</button>
    `;
    document.body.appendChild(bar);
    translateBar = bar;

    // 翻訳ボタン
    bar.querySelector('.dvt-translate-bar-accept').addEventListener('click', () => {
      removeTranslateBar();
      translatePage(targetLang);
    });

    // 閉じるボタン（ドメインを記憶）
    bar.querySelector('.dvt-translate-bar-close').addEventListener('click', () => {
      removeTranslateBar();
      // このドメインをdismissリストに追加
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
    if (msg.action === 'getState') {
      sendResponse({ pageTranslateActive, targetLang });
    }
    return true;
  });

})();