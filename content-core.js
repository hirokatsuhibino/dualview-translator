// Copyright (c) Orangesoft Inc
// DualView Translator — 共有状態・ユーティリティ・初期化・メッセージリスナー

// eslint-disable-next-line no-var
var DVT = (function () {
  'use strict';

  // ─── 共有状態 ──────────────────────────────────────────────────────────
  const state = {
    targetLang: 'ja',
    selectionPanel: null,
    selectionMiniBtn: null,
    pageTranslateActive: false,
    translateBar: null,
    lastContextMenuTarget: null,
    regionMode: false,
  };

  // ─── 言語コード→表示名マップ ───────────────────────────────────────
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

  // ─── 翻訳API呼び出し（background経由） ──────────────────────────────
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

  // ─── 言語コード比較（正規化） ──────────────────────────────────────
  function langMatches(detected, target) {
    if (!detected) return false;
    const d = detected.toLowerCase().split('-')[0];
    const tgt = target.toLowerCase().split('-')[0];
    return d === tgt;
  }

  // ─── ユーティリティ ────────────────────────────────────────────────
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(message, persistent = false, duration = 0) {
    const el = document.createElement('div');
    el.className = 'dvt-toast';
    el.setAttribute('data-dvt', 'true');
    const icon = document.createElement('span');
    icon.className = 'dvt-toast-icon';
    if (persistent) {
      const spinner = document.createElement('span');
      spinner.className = 'dvt-spinner dvt-spinner-sm';
      icon.appendChild(spinner);
    } else {
      icon.textContent = '●';
    }
    el.appendChild(icon);
    const msg = document.createElement('span');
    msg.className = 'dvt-toast-msg';
    msg.textContent = message;
    el.appendChild(msg);
    document.body.appendChild(el);
    if (duration > 0) setTimeout(() => el.remove(), duration);
    return el;
  }

  function updateToast(el, message) {
    const msgEl = el.querySelector('.dvt-toast-msg');
    if (msgEl) msgEl.textContent = message;
  }

  // ─── テーマ検出 ────────────────────────────────────────────────────
  (function detectTheme() {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    function apply(light) {
      document.documentElement.classList.toggle('dvt-light', light);
      chrome.storage.local.set({ dvtTheme: light ? 'light' : 'dark' });
    }
    apply(mq.matches);
    mq.addEventListener('change', function(e) { apply(e.matches); });
  })();

  // ─── 右クリック位置の要素を記録 ────────────────────────────────────
  document.addEventListener('contextmenu', (e) => {
    state.lastContextMenuTarget = e.target;
  });

  // ─── 初期化: UI言語→ターゲット言語→言語検出 ────────────────────────
  DVT_I18N.loadLang(() => {
    chrome.storage.local.get(['targetLang', 'dismissedDomains'], (data) => {
      if (data.targetLang) state.targetLang = data.targetLang;
      const dismissed = data.dismissedDomains || [];
      if (typeof DVT_BAR !== 'undefined') {
        // 自動翻訳ルールを先にチェック。マッチしなければ翻訳バーを表示
        DVT_BAR.checkAutoRules().then(matched => {
          if (!matched && !dismissed.includes(location.hostname)) {
            DVT_BAR.detectPageLanguage();
          }
        });
      }
    });
  });

  // ─── メッセージリスナー（popup / background からの指示） ─────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'translatePage') {
      DVT_PAGE.translatePage(msg.lang);
      sendResponse({ ok: true, active: state.pageTranslateActive });
    }
    if (msg.action === 'translatePageAndSummarize') {
      DVT_PAGE.translatePageAndSummarize(msg.lang);
      sendResponse({ ok: true, active: state.pageTranslateActive });
    }
    if (msg.action === 'undoPage') {
      DVT_PAGE.undoPageTranslate();
      sendResponse({ ok: true });
    }
    if (msg.action === 'enterRegionMode') {
      DVT_PAGE.enterRegionMode(msg.mode);
      sendResponse({ ok: true });
    }
    if (msg.action === 'enterSelectorPickMode') {
      DVT_PAGE.enterSelectorPickMode(msg.urlPattern);
      sendResponse({ ok: true });
    }
    if (msg.action === 'stopAutoRuleObserver') {
      if (typeof DVT_BAR !== 'undefined') DVT_BAR.stopAutoRuleObserver(msg.ruleId);
      sendResponse({ ok: true });
    }
    if (msg.action === 'reapplyAutoRule') {
      // ルール更新時: 既存Observerを停止してから最新ルールで再評価
      if (typeof DVT_BAR !== 'undefined') {
        DVT_BAR.stopAutoRuleObserver(msg.ruleId);
        DVT_BAR.checkAutoRules();
      }
      sendResponse({ ok: true });
    }
    if (msg.action === 'setLang') {
      state.targetLang = msg.lang;
      chrome.storage.local.set({ targetLang: msg.lang });
      sendResponse({ ok: true });
    }
    if (msg.action === 'setUILang') {
      DVT_I18N.setLang(msg.lang);
      sendResponse({ ok: true });
    }
    if (msg.action === 'togglePageTranslate') {
      if (state.pageTranslateActive) {
        DVT_PAGE.undoPageTranslate();
      } else {
        DVT_PAGE.translatePage(msg.lang);
      }
      sendResponse({ ok: true, active: state.pageTranslateActive });
    }
    if (msg.action === 'keyboardTranslateSelection') {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 1) {
        DVT_SEL.showContextMenuPanel(text);
      }
      sendResponse({ ok: true });
    }
    if (msg.action === 'contextMenuTranslate') {
      DVT_SEL.showContextMenuPanel(msg.text);
      sendResponse({ ok: true });
    }
    if (msg.action === 'contextMenuTranslateElement') {
      DVT_PAGE.translateElement();
      sendResponse({ ok: true });
    }
    if (msg.action === 'contextMenuTranslateAndSummarize') {
      DVT_PAGE.translateAndSummarizeElement();
      sendResponse({ ok: true });
    }
    if (msg.action === 'getState') {
      // 翻訳済み要素の有無（領域・ページ両方）をチェック
      const hasTranslations = document.querySelectorAll('[data-dvt-id]').length > 0;
      sendResponse({ pageTranslateActive: state.pageTranslateActive, targetLang: state.targetLang, hasTranslations });
    }
    return true;
  });

  // ─── 公開API ───────────────────────────────────────────────────────
  return {
    state,
    translate,
    langMatches,
    escapeHtml,
    showToast,
    updateToast,
    getLangDisplayName,
  };
})();
