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
    // フォールバック通知トーストを 1 ページ life cycle 内で 1 度だけ表示するためのフラグ
    fallbackToastShown: false,
  };

  // ─── 言語コード→表示名マップ ───────────────────────────────────────
  const LANG_NAMES = {
    ja: '日本語', en: 'English', zh: '中文', 'zh-cn': '中文（簡体）', 'zh-tw': '中文（繁体）',
    ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', pt: 'Português',
    ru: 'Русский', ar: 'العربية', it: 'Italiano', nl: 'Nederlands', vi: 'Tiếng Việt',
    th: 'ไทย', id: 'Bahasa Indonesia', hi: 'हिन्दी', pl: 'Polski', sv: 'Svenska',
  };

  // 言語コードとして意味を成さない値（'<html lang="null">' のようなゴミ HTML 対策）
  const INVALID_LANG_CODES = new Set(['null', 'undefined', 'und', 'unknown', 'x-unknown']);

  // 言語コードとして信頼できる値かを判定（ゴミ HTML の <html lang="null"> 対策）
  function isValidLangCode(code) {
    if (!code) return false;
    const lower = String(code).trim().toLowerCase();
    return !!lower && !INVALID_LANG_CODES.has(lower);
  }

  function getLangDisplayName(code) {
    if (!isValidLangCode(code)) return 'Unknown';
    // BCP47違反のアンダースコア区切り（例: ja_JP）も吸収するため _ を - に正規化
    const lower = String(code).trim().toLowerCase().replace(/_/g, '-');
    return LANG_NAMES[lower] || LANG_NAMES[lower.split('-')[0]] || code;
  }

  // ─── 翻訳API呼び出し（background経由） ──────────────────────────────
  function translate(text, tl, sl = 'auto') {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'translate', text, tl, sl }, (res) => {
        if (chrome.runtime.lastError) { resolve({ text: t('error'), detectedLang: null }); return; }
        if (res?.ok) {
          // Apple フォールバック発生時の通知（ページ life cycle 内 1 回まで）
          if (res.result?.fallback && !state.fallbackToastShown) {
            state.fallbackToastShown = true;
            showToast(t('fallbackToApple'), false, 5000);
          }
          resolve(res.result);
        } else {
          // res.error にネイティブハンドラや background.js からのエラー詳細が含まれる場合は表示する
          const detail = res?.error ? ` — ${res.error}` : '';
          resolve({ text: t('translateFailed') + detail, detectedLang: null });
        }
      });
    });
  }

  // ─── 言語コード比較（正規化） ──────────────────────────────────────
  function langMatches(detected, target) {
    if (!detected) return false;
    // ja_JP のようなアンダースコア区切り（BCP47違反だが実在）にも対応
    const d = detected.toLowerCase().replace(/_/g, '-').split('-')[0];
    const tgt = target.toLowerCase().replace(/_/g, '-').split('-')[0];
    return d === tgt;
  }

  // ─── ユーティリティ ────────────────────────────────────────────────
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // テキストを文単位に分割する。
  // - CJK の文末記号（`。` / `．` / `！` / `？`）の直後で常に分割
  //   （読点 `、` は文の途切れではないので分割対象に含めない）
  // - Latin の `.!?` は、直後が空白＋大文字相当（A-Z / ひらがな / カタカナ / 漢字 / Latin 大文字）の場合のみ分割
  //   ※ 略語（Mr. e.g.）や小数（3.14）での誤分割を抑制
  // - 文末の句点も保持する
  // - 結果は前後空白を trim、空要素を除外
  function splitSentences(text) {
    if (!text || typeof text !== 'string') return [];
    const parts = [];
    let buf = '';
    const len = text.length;
    for (let i = 0; i < len; i++) {
      const c = text[i];
      buf += c;
      if (c === '。' || c === '．' || c === '！' || c === '？') {
        // CJK 句点: 連続する句点・閉じ括弧などはまとめてから区切る
        while (i + 1 < len && /[）｝］」』）)\]}"'’”]/.test(text[i + 1])) {
          i++;
          buf += text[i];
        }
        parts.push(buf.trim());
        buf = '';
      } else if (c === '.' || c === '!' || c === '?') {
        // Latin: 直後の状況で判定
        const next = text[i + 1];
        if (!next) {
          // 文末: 区切る
          parts.push(buf.trim());
          buf = '';
        } else if (/\s/.test(next)) {
          // 後続文の開始文字を確認（空白を読み飛ばす）
          let j = i + 1;
          while (j < len && /\s/.test(text[j])) j++;
          // Wikipedia 等の脚注番号 [数字] を検出してスキップ
          // 脚注は前の文への注釈なのでバッファに取り込んでから区切る
          let footnoteEnd = -1;
          if (text[j] === '[') {
            let k = j + 1;
            while (k < len && /\d/.test(text[k])) k++;
            if (k < len && text[k] === ']') {
              footnoteEnd = k;
              j = k + 1;
              while (j < len && /\s/.test(text[j])) j++;
            }
          }
          const nextNonSpace = text[j];
          if (nextNonSpace && /[A-Z぀-ゟ゠-ヿ一-鿿]/.test(nextNonSpace)) {
            if (footnoteEnd >= 0) {
              // 脚注番号をバッファに取り込んでから区切る（例: "sentence. [10]" → 1文目末尾）
              buf += text.slice(i + 1, footnoteEnd + 1);
              i = footnoteEnd;
            }
            parts.push(buf.trim());
            buf = '';
          }
        }
      }
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts.filter(s => s.length > 0);
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

  // ─── 音声読み上げ ──────────────────────────────────────────────────
  // Web Speech API (window.speechSynthesis) を用いた訳文の読み上げ。
  // 各翻訳ブロックの読み上げボタンから speak() を呼ぶ。
  // 同時再生は不可: 別ボタンを押した時点で前の再生を停止して新規再生に切り替える。

  // 翻訳先言語コード → BCP47 タグへのマッピング
  // SpeechSynthesisVoice.lang は通常 'ja-JP' 形式で公開されているので、
  // popup の言語コード（'ja' 等）を BCP47 に正規化してから音声選択に使う。
  const SPEAK_LANG_MAP = {
    ja: 'ja-JP', en: 'en-US',
    'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW',
    ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE',
    es: 'es-ES', pt: 'pt-PT', ru: 'ru-RU', ar: 'ar-SA',
  };

  function resolveSpeakLang(lang) {
    if (!lang) return '';
    return SPEAK_LANG_MAP[lang.toLowerCase()] || lang;
  }

  // 現在再生中のボタン / utterance（停止時の状態復元・重複再生検知に使う）
  let speakingButton = null;
  let speakingUtterance = null;

  function isSpeechSupported() {
    return typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function';
  }

  // 翻訳先言語の音声がインストールされているかを判定する。
  // 注意: 一部環境（Chrome 起動直後など）では getVoices() が非同期ロードされ、
  //       初回呼び出し時に空配列を返す。そのときは「未対応」と判定すると常に未対応扱い
  //       になってしまうので、空配列なら楽観的に true を返して speak() の onerror で捕捉する。
  function hasVoiceFor(bcp47) {
    if (!isSpeechSupported()) return false;
    let voices = [];
    try { voices = window.speechSynthesis.getVoices() || []; } catch (e) { return true; }
    if (voices.length === 0) return true;
    const target = (bcp47 || '').toLowerCase();
    const base = target.split('-')[0];
    return voices.some(v => {
      const vlang = (v.lang || '').toLowerCase();
      return vlang === target || vlang.split('-')[0] === base;
    });
  }

  // ボタン UI 状態の更新（再生中は ⏹ アイコン + aria-label / title を切替）
  function setSpeakButtonState(btn, speaking) {
    if (!btn) return;
    const iconSpan = btn.querySelector('.dvt-speak-icon');
    if (speaking) {
      btn.dataset.dvtSpeaking = 'true';
      const label = t('stopSpeakBtn');
      btn.setAttribute('aria-label', label);
      btn.title = label;
      if (iconSpan) iconSpan.textContent = '⏹';
    } else {
      delete btn.dataset.dvtSpeaking;
      const label = t('speakBtn');
      btn.setAttribute('aria-label', label);
      btn.title = label;
      if (iconSpan) iconSpan.textContent = '🔊';
    }
  }

  function stopSpeak() {
    if (isSpeechSupported()) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
    }
    if (speakingButton) {
      setSpeakButtonState(speakingButton, false);
      speakingButton = null;
    }
    speakingUtterance = null;
  }

  function speak(text, lang, button) {
    if (!text) return;
    if (!isSpeechSupported()) {
      showToast(t('speakUnsupported', { lang: getLangDisplayName(lang) }), false, 3500);
      return;
    }
    // 同じボタンの再クリック → 停止のみ
    if (button && button === speakingButton) {
      stopSpeak();
      return;
    }
    // 別ボタンで再生中 → 現状を停止して新規再生へ
    if (speakingButton) stopSpeak();

    const bcp47 = resolveSpeakLang(lang);
    if (!hasVoiceFor(bcp47)) {
      showToast(t('speakUnsupported', { lang: getLangDisplayName(lang) }), false, 3500);
      return;
    }

    const u = new window.SpeechSynthesisUtterance(text);
    if (bcp47) u.lang = bcp47;
    const reset = () => {
      if (speakingUtterance === u) {
        speakingUtterance = null;
        if (speakingButton === button) {
          setSpeakButtonState(button, false);
          speakingButton = null;
        }
      }
    };
    u.onend = reset;
    u.onerror = reset;

    speakingUtterance = u;
    speakingButton = button || null;
    if (button) setSpeakButtonState(button, true);

    try {
      window.speechSynthesis.speak(u);
    } catch (e) {
      stopSpeak();
      showToast(t('speakUnsupported', { lang: getLangDisplayName(lang) }), false, 3500);
    }
  }

  // 読み上げボタン生成ヘルパ。各 content-* から共通利用する。
  // getText / getLang は値か関数を受け付ける（クリック時点で最新のテキストを取りたいケース対応）。
  function createSpeakButton(getText, getLang, extraClass = '') {
    const btn = document.createElement('button');
    btn.className = ('dvt-speak-btn ' + extraClass).trim();
    btn.setAttribute('data-dvt', 'true');
    // form 内挿入時の暗黙 submit を防ぐ
    btn.setAttribute('type', 'button');
    const label = t('speakBtn');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    const iconSpan = document.createElement('span');
    iconSpan.className = 'dvt-speak-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = '🔊';
    btn.appendChild(iconSpan);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const text = typeof getText === 'function' ? getText() : getText;
      const lang = typeof getLang === 'function' ? getLang() : getLang;
      speak(text, lang, btn);
    });
    return btn;
  }

  // ESC で停止 / ページ非表示・離脱時に停止（バックグラウンドで読み続けるのを防ぐ）
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && speakingButton) stopSpeak();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && speakingButton) stopSpeak();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (speakingButton) stopSpeak();
    });
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
    // macOS Safari は同期 sendResponse + return true でチャンネルがハングするため、
    // 全アクション同期応答のここでは return true を返さない（= 非同期応答にしない）。
  });

  // ─── 公開API ───────────────────────────────────────────────────────
  return {
    state,
    translate,
    langMatches,
    escapeHtml,
    splitSentences,
    showToast,
    updateToast,
    getLangDisplayName,
    isValidLangCode,
    speak,
    stopSpeak,
    createSpeakButton,
    isSpeechSupported,
  };
})();
