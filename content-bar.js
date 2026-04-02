// DualView Translator — ページ読み込み時の翻訳バー + 言語検出

// eslint-disable-next-line no-var
var DVT_BAR = (function () {
  'use strict';

  // ─── ページ言語検出 ────────────────────────────────────────────────
  async function detectPageLanguage() {
    const htmlLang = document.documentElement.lang;
    if (htmlLang && !DVT.langMatches(htmlLang, DVT.state.targetLang)) {
      showTranslateBar(htmlLang);
      return;
    }
    if (htmlLang && DVT.langMatches(htmlLang, DVT.state.targetLang)) return;

    // lang属性がない場合はAPIで検出
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
      if (result && !DVT.langMatches(result, DVT.state.targetLang)) {
        showTranslateBar(result);
      }
    } catch (e) {
      // 検出失敗は無視
    }
  }

  // ─── 翻訳バー表示 ──────────────────────────────────────────────────
  function showTranslateBar(detectedLang) {
    if (DVT.state.translateBar) return;
    const langName = DVT.getLangDisplayName(detectedLang);

    const bar = document.createElement('div');
    bar.className = 'dvt-translate-bar';
    bar.setAttribute('data-dvt', 'true');
    bar.innerHTML = `
      <span class="dvt-translate-bar-text">
        ${t('translateBarMsg', { lang: DVT.escapeHtml(langName) })}
      </span>
      <button class="dvt-translate-bar-btn dvt-translate-bar-accept">${DVT.escapeHtml(t('translateBarAccept'))}</button>
      <button class="dvt-translate-bar-btn dvt-translate-bar-summarize">${DVT.escapeHtml(t('translateBarSummarize'))}</button>
      <button class="dvt-translate-bar-btn dvt-translate-bar-close" title="${DVT.escapeHtml(t('close'))}">✕</button>
    `;
    document.body.appendChild(bar);
    DVT.state.translateBar = bar;

    bar.querySelector('.dvt-translate-bar-accept').addEventListener('click', () => {
      removeTranslateBar();
      DVT_PAGE.translatePage(DVT.state.targetLang);
    });

    bar.querySelector('.dvt-translate-bar-summarize').addEventListener('click', () => {
      removeTranslateBar();
      DVT_PAGE.translatePageAndSummarize(DVT.state.targetLang);
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
    if (DVT.state.translateBar) {
      DVT.state.translateBar.remove();
      DVT.state.translateBar = null;
    }
  }

  // ─── URLパターンマッチング（ワイルドカード対応） ─────────────────────
  function matchesUrlPattern(url, pattern) {
    // ワイルドカード(*)を正規表現に変換してURLと照合
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try {
      return new RegExp('^' + escaped + '$').test(url);
    } catch (e) {
      return false;
    }
  }

  // ─── 自動翻訳ルールのチェックと実行 ────────────────────────────────
  async function checkAutoRules() {
    const data = await new Promise(resolve =>
      chrome.storage.local.get('autoRules', resolve)
    );
    const rules = (data.autoRules || []).filter(r => r.enabled);
    const url = location.href;

    for (const rule of rules) {
      if (!matchesUrlPattern(url, rule.urlPattern)) continue;

      if (rule.selector) {
        // 要素セレクタが指定されている場合は要素のみ翻訳
        const el = document.querySelector(rule.selector);
        if (!el) continue;
        if (rule.mode === 'summarize') {
          DVT_PAGE.translateAndSummarizeClickedElement(el);
        } else {
          DVT_PAGE.translateClickedElement(el);
        }
      } else {
        // セレクタなしはページ全体翻訳
        if (rule.mode === 'summarize') {
          DVT_PAGE.translatePageAndSummarize(DVT.state.targetLang);
        } else {
          DVT_PAGE.translatePage(DVT.state.targetLang);
        }
      }
      return true; // マッチしたルールで処理済み
    }
    return false; // マッチするルールなし
  }

  return { detectPageLanguage, checkAutoRules, matchesUrlPattern };
})();
