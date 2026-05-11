// Copyright (c) Orangesoft Inc
// DualView Translator — ページ読み込み時の翻訳バー + 言語検出

// eslint-disable-next-line no-var
var DVT_BAR = (function () {
  'use strict';

  // ─── 定数 ─────────────────────────────────────────────────────────────────
  const WAIT_FOR_ELEMENT_TIMEOUT = 10000;  // 要素出現待機タイムアウト(ms)
  const RETRANSLATE_DEBOUNCE_MS = 500;     // コンテンツ変更後の再翻訳デバウンス(ms)
  const SPA_RECHECK_DELAY_MS = 300;        // SPA遷移後のルール再チェック遅延(ms)

  // ─── ページ言語検出 ────────────────────────────────────────────────
  async function detectPageLanguage() {
    // <html lang> がゴミ値（"null" / "und" / "unknown" 等）の場合は「無い」扱いにして
    // API 検出にフォールバックする（issue #195）。
    const htmlLang = document.documentElement.lang;
    const htmlLangValid = DVT.isValidLangCode(htmlLang);
    if (htmlLangValid && !DVT.langMatches(htmlLang, DVT.state.targetLang)) {
      showTranslateBar(htmlLang);
      return;
    }
    if (htmlLangValid && DVT.langMatches(htmlLang, DVT.state.targetLang)) return;

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
      if (DVT.isValidLangCode(result) && !DVT.langMatches(result, DVT.state.targetLang)) {
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
    const barText = document.createElement('span');
    barText.className = 'dvt-translate-bar-text';
    // <strong>タグを含むメッセージをDOM要素に変換
    const msgParts = t('translateBarMsg', { lang: langName }).split(/(<strong>.*?<\/strong>)/);
    msgParts.forEach(part => {
      const m = part.match(/^<strong>(.*)<\/strong>$/);
      if (m) {
        const strong = document.createElement('strong');
        strong.textContent = m[1];
        barText.appendChild(strong);
      } else if (part) {
        barText.appendChild(document.createTextNode(part));
      }
    });
    bar.appendChild(barText);
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'dvt-translate-bar-btn dvt-translate-bar-accept';
    acceptBtn.textContent = t('translateBarAccept');
    bar.appendChild(acceptBtn);
    const summarizeBtn = document.createElement('button');
    summarizeBtn.className = 'dvt-translate-bar-btn dvt-translate-bar-summarize';
    summarizeBtn.textContent = t('translateBarSummarize');
    bar.appendChild(summarizeBtn);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dvt-translate-bar-btn dvt-translate-bar-close';
    closeBtn.title = t('close');
    closeBtn.textContent = '✕';
    bar.appendChild(closeBtn);
    document.body.appendChild(bar);
    DVT.state.translateBar = bar;

    // APIキー未設定時はボタンを無効化・非表示
    chrome.storage.local.get(['claudeApiKey', 'geminiApiKey', 'translateEngine', 'deeplApiKey'], (data) => {
      // DeepL選択時にAPIキー未設定なら翻訳ボタンも非表示
      if (data.translateEngine === 'deepl' && !data.deeplApiKey) {
        const acceptBtn = bar.querySelector('.dvt-translate-bar-accept');
        if (acceptBtn) acceptBtn.style.display = 'none';
        const sumBtn = bar.querySelector('.dvt-translate-bar-summarize');
        if (sumBtn) sumBtn.style.display = 'none';
        return;
      }
      // LLM APIキー未設定時は要約ボタンを非表示
      if (!data.claudeApiKey && !data.geminiApiKey) {
        const sumBtn = bar.querySelector('.dvt-translate-bar-summarize');
        if (sumBtn) sumBtn.style.display = 'none';
      }
    });

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

  // ─── 要素が出現するまでMutationObserverで待機 ────────────────────────
  // 動的に追加されるDOM要素（AJAX・遅延ロード等）に対応するため
  function waitForElement(selector, timeout = WAIT_FOR_ELEMENT_TIMEOUT) {
    return new Promise(resolve => {
      // 既に存在する場合はすぐに返す
      const existing = document.querySelector(selector);
      if (existing) { resolve(existing); return; }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });

      // タイムアウト（デフォルト10秒）後にnullで解決
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // ─── アクティブなルールObserverの管理 ──────────────────────────────
  // ruleId → MutationObserver のマップ。削除・無効化時に切断するために保持する。
  const activeRuleObservers = new Map();

  // ─── 要素の再翻訳監視 ────────────────────────────────────────────────
  // 翻訳済み要素のコンテンツが外部から書き換えられたとき（webメール等）に再翻訳する。
  // 翻訳中はObserverを一時切断して自分の変更を無視し、完了後に再接続する。
  function startAutoRuleObserver(el, rule) {
    // 同じルールの既存Observerがあれば先に停止（重複防止）
    stopAutoRuleObserver(rule.id);

    let retranslateTimer = null;

    async function retranslate() {
      // 翻訳中はObserverを停止して自分の変更を無視
      observer.disconnect();
      try {
        if (rule.mode === 'summarize') {
          await DVT_PAGE.translateAndSummarizeClickedElement(el);
        } else {
          await DVT_PAGE.translateClickedElement(el);
        }
      } catch (e) {
        // 再翻訳失敗は無視
      } finally {
        // ルールが削除・無効化されていなければ監視を再開
        if (activeRuleObservers.has(rule.id) && document.contains(el)) {
          observer.observe(el, { childList: true });
        }
      }
    }

    // 直接の子ノード変更を監視（subtree不要: 中身全体の入れ替えを検出すれば十分）
    const observer = new MutationObserver(() => {
      clearTimeout(retranslateTimer);
      retranslateTimer = setTimeout(retranslate, RETRANSLATE_DEBOUNCE_MS);
    });

    observer.observe(el, { childList: true });
    activeRuleObservers.set(rule.id, observer);
  }

  // ─── 自動ルールObserverの停止 ────────────────────────────────────────
  // ルール削除・無効化時にpopup.jsから呼び出される
  function stopAutoRuleObserver(ruleId) {
    const observer = activeRuleObservers.get(ruleId);
    if (observer) {
      observer.disconnect();
      activeRuleObservers.delete(ruleId);
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
        // 要素セレクタ指定: 即座に存在しない場合はDOMに追加されるまで待機
        const el = await waitForElement(rule.selector);
        if (!el) continue; // タイムアウト後も見つからなければスキップ

        // 翻訳完了後にコンテンツ変更監視を開始（webメール等の書き換えに対応）
        // Promise.resolve()で同期・非同期どちらの戻り値にも対応
        const fn = rule.mode === 'summarize'
          ? DVT_PAGE.translateAndSummarizeClickedElement
          : DVT_PAGE.translateClickedElement;
        Promise.resolve(fn(el))
          .then(() => startAutoRuleObserver(el, rule))
          .catch(() => {});
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

  // ─── SPA対応: URL変更を検知して自動翻訳ルールを再チェック ───────────
  // history.pushState / replaceState と popstate イベントを監視
  (function watchSpaNavigation() {
    let lastUrl = location.href;

    function onUrlChange() {
      const newUrl = location.href;
      if (newUrl === lastUrl) return;
      lastUrl = newUrl;
      // URL変更後に少し待ってからルールをチェック（DOMの更新を待つ）
      setTimeout(() => checkAutoRules(), SPA_RECHECK_DELAY_MS);
    }

    // history API のラップ
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = function (...args) {
      origPush(...args);
      onUrlChange();
    };
    history.replaceState = function (...args) {
      origReplace(...args);
      onUrlChange();
    };

    // ブラウザの戻る/進む
    window.addEventListener('popstate', onUrlChange);
  })();

  return { detectPageLanguage, checkAutoRules, matchesUrlPattern, waitForElement, startAutoRuleObserver, stopAutoRuleObserver };
})();
