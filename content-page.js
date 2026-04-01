// DualView Translator — ページ全体翻訳・範囲選択翻訳・要素翻訳

// eslint-disable-next-line no-var
var DVT_PAGE = (function () {
  'use strict';

  // ─── デュアルビュー挿入（共通処理） ────────────────────────────────
  function insertDualView(el, idPrefix) {
    const originalHTML = el.innerHTML;
    const id = idPrefix + Math.random().toString(36).slice(2);
    el.dataset.dvtId = id;

    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-dvt', 'true');
    wrapper.innerHTML = `
      <span class="dvt-orig" data-dvt="true">${originalHTML}</span>
      <span class="dvt-trans" data-dvt="true"><span class="dvt-spinner"></span></span>
    `;
    el.innerHTML = '';
    el.appendChild(wrapper);
    return el;
  }

  // ─── 翻訳結果の反映（共通処理） ────────────────────────────────────
  function applyTranslation(el, result, detectedLang, tl) {
    const transEl = el.querySelector('.dvt-trans');
    if (DVT.langMatches(detectedLang, tl)) {
      if (transEl) transEl.remove();
    } else {
      if (transEl) transEl.textContent = result;
    }
  }

  // ─── 翻訳可能な要素のフィルタリング ────────────────────────────────
  const PAGE_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, figcaption, blockquote, dt, dd';

  function filterTranslatableElements(container, selectors) {
    return Array.from(container.querySelectorAll(selectors || PAGE_SELECTORS)).filter(el => {
      if (el.closest('[data-dvt]')) return false;
      if (el.dataset.dvtId) return false;
      const text = el.innerText?.trim();
      return text && text.length >= 4;
    });
  }

  // ─── 並列翻訳ワーカー ──────────────────────────────────────────────
  async function runConcurrentTranslation(elements, tl, idPrefix) {
    const toast = DVT.showToast(t('toastTranslating', { done: 0, total: elements.length }), true);
    let done = 0;

    const CONCURRENCY = 6;
    const queue = [...elements];

    async function worker() {
      while (queue.length > 0) {
        const el = queue.shift();
        if (!el) break;

        const originalText = el.innerText.trim();
        insertDualView(el, idPrefix);

        const { text: result, detectedLang } = await DVT.translate(originalText, tl);
        applyTranslation(el, result, detectedLang, tl);

        done++;
        DVT.updateToast(toast, t('toastTranslating', { done, total: elements.length }));
        if (done >= elements.length) {
          DVT.updateToast(toast, t('toastDone', { count: done }));
          setTimeout(() => toast.remove(), 2500);
        }
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);
  }

  // ─── 動的コンテンツ監視（MutationObserver） ────────────────────────
  let pageObserver = null;
  let observerDebounceTimer = null;

  function startPageObserver(tl) {
    if (pageObserver) return;
    pageObserver = new MutationObserver(() => {
      // デバウンス: 短時間に大量のDOM変更があっても1回だけ処理
      if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
      observerDebounceTimer = setTimeout(() => {
        translateNewElements(tl);
      }, 500);
    });
    pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function stopPageObserver() {
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
    if (observerDebounceTimer) {
      clearTimeout(observerDebounceTimer);
      observerDebounceTimer = null;
    }
  }

  // 未翻訳の新規要素のみ翻訳
  async function translateNewElements(tl) {
    if (!DVT.state.pageTranslateActive) return;
    const elements = filterTranslatableElements(document);
    if (elements.length === 0) return;
    await runConcurrentTranslation(elements, tl, 'dvt-');
  }

  // ─── ページ全体翻訳 ────────────────────────────────────────────────
  async function translatePage(tl) {
    if (DVT.state.pageTranslateActive) {
      undoPageTranslate();
      return;
    }

    DVT.state.pageTranslateActive = true;
    DVT.state.targetLang = tl;

    const elements = filterTranslatableElements(document);
    if (elements.length === 0) return;

    await runConcurrentTranslation(elements, tl, 'dvt-');

    // 翻訳完了後、動的コンテンツの監視を開始
    startPageObserver(tl);
  }

  // ─── ページ全体翻訳＆要約 ────────────────────────────────────────────
  async function translatePageAndSummarize(tl) {
    if (DVT.state.pageTranslateActive) {
      undoPageTranslate();
      return;
    }

    DVT.state.pageTranslateActive = true;
    DVT.state.targetLang = tl;

    const elements = filterTranslatableElements(document);
    if (elements.length === 0) return;

    // ステップ1: 各文のデュアルビュー翻訳
    await runConcurrentTranslation(elements, tl, 'dvt-');

    // ステップ2: 全翻訳テキストを結合してLLMで要約
    const textsForSummary = [];
    elements.forEach(el => {
      const transEl = el.querySelector('.dvt-trans');
      const origEl = el.querySelector('.dvt-orig');
      if (transEl) {
        textsForSummary.push(transEl.textContent);
      } else if (origEl) {
        textsForSummary.push(origEl.textContent);
      }
    });

    if (textsForSummary.length === 0) return;

    const fullText = textsForSummary.join('\n');

    // 要約ブロックをページ先頭に挿入（ローディング状態）
    const summaryBlock = document.createElement('div');
    summaryBlock.className = 'dvt-summary';
    summaryBlock.setAttribute('data-dvt', 'true');
    summaryBlock.id = 'dvt-page-summary';
    summaryBlock.innerHTML = `
      <span class="dvt-badge dvt-badge-summary">${DVT.escapeHtml(t('summaryBadge'))}</span>
      <div class="dvt-summary-text"><span class="dvt-spinner"></span> ${DVT.escapeHtml(t('summarizing'))}</div>
    `;
    document.body.insertBefore(summaryBlock, document.body.firstChild);
    summaryBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // LLM APIで要約
    try {
      const summary = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'summarize',
          text: fullText,
          targetLang: DVT.state.targetLang,
        }, (res) => {
          if (chrome.runtime.lastError) { reject(new Error(t('error'))); return; }
          if (res?.ok) resolve(res.summary);
          else reject(new Error(res?.error || t('translateFailed')));
        });
      });

      summaryBlock.querySelector('.dvt-summary-text').textContent = summary;
      summaryBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      summaryBlock.querySelector('.dvt-summary-text').innerHTML =
        `<span class="dvt-same-lang">${DVT.escapeHtml(e.message)}</span>`;
    }

    // 翻訳＆要約完了後、動的コンテンツの監視を開始
    startPageObserver(tl);
  }

  function undoPageTranslate() {
    DVT.state.pageTranslateActive = false;
    // 動的コンテンツ監視を停止
    stopPageObserver();
    // ページ要約ブロックを削除
    const pageSummary = document.getElementById('dvt-page-summary');
    if (pageSummary) pageSummary.remove();
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
    DVT.showToast(t('toastReset'), false, 2000);
  }

  // ─── 要素クリック選択翻訳 ────────────────────────────────────────────
  // mode: 'translate' = 翻訳のみ, 'summarize' = 翻訳＆要約
  function enterRegionMode(mode) {
    const summarize = (mode === 'summarize');
    DVT.state.regionMode = true;
    document.body.style.cursor = 'crosshair';
    let highlightedEl = null;

    const hint = document.createElement('div');
    hint.className = 'dvt-region-hint';
    hint.setAttribute('data-dvt', 'true');
    hint.textContent = t(summarize ? 'regionHintSummarize' : 'regionHint');
    document.body.appendChild(hint);

    // ホバー中の要素をハイライト
    function onMousemove(e) {
      const target = e.target;
      if (target.closest('[data-dvt]')) return;
      if (target === highlightedEl) return;
      if (highlightedEl) highlightedEl.classList.remove('dvt-region-highlight');
      highlightedEl = target;
      highlightedEl.classList.add('dvt-region-highlight');
    }

    // クリックで要素を確定して翻訳（＆要約）
    function onClick(e) {
      if (e.target.closest('[data-dvt]')) return;
      e.preventDefault();
      e.stopPropagation();
      const targetEl = e.target;
      exitRegionMode();
      if (summarize) {
        translateAndSummarizeClickedElement(targetEl);
      } else {
        translateClickedElement(targetEl);
      }
    }

    function onKeydown(e) {
      if (e.key === 'Escape') exitRegionMode();
    }

    function exitRegionMode() {
      DVT.state.regionMode = false;
      document.body.style.cursor = '';
      if (highlightedEl) {
        highlightedEl.classList.remove('dvt-region-highlight');
        highlightedEl = null;
      }
      hint.remove();
      document.removeEventListener('mousemove', onMousemove);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeydown);
    }

    document.addEventListener('mousemove', onMousemove);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown);
  }

  // クリックされた要素とその子要素を翻訳
  async function translateClickedElement(container) {
    if (!container || container === document.body) return;

    const REGION_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div';
    let elements = Array.from(container.querySelectorAll(REGION_SELECTORS)).filter(el => {
      if (el.closest('[data-dvt]')) return false;
      if (el.dataset.dvtId) return false;
      return el.innerText?.trim().length >= 4;
    });

    // 葉要素のみ抽出
    elements = elements.filter(el =>
      !elements.some(other => other !== el && el.contains(other))
    );

    // 子要素がなければコンテナ自体を翻訳対象に
    if (elements.length === 0) {
      if (container.dataset.dvtId || container.closest('[data-dvt]')) return;
      const text = container.innerText?.trim();
      if (!text || text.length < 4) {
        DVT.showToast(t('toastNoText'), false, 2500);
        return;
      }
      elements = [container];
    }

    await runConcurrentTranslation(elements, DVT.state.targetLang, 'dvt-r-');
  }

  // クリックされた要素とその子要素を翻訳＆要約
  async function translateAndSummarizeClickedElement(container) {
    if (!container || container === document.body) return;

    const REGION_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div';
    let elements = Array.from(container.querySelectorAll(REGION_SELECTORS)).filter(el => {
      if (el.closest('[data-dvt]')) return false;
      if (el.dataset.dvtId) return false;
      return el.innerText?.trim().length >= 4;
    });

    // 葉要素のみ抽出
    elements = elements.filter(el =>
      !elements.some(other => other !== el && el.contains(other))
    );

    // 子要素がなければコンテナ自体を翻訳対象に
    if (elements.length === 0) {
      if (container.dataset.dvtId || container.closest('[data-dvt]')) return;
      const text = container.innerText?.trim();
      if (!text || text.length < 4) {
        DVT.showToast(t('toastNoText'), false, 2500);
        return;
      }
      elements = [container];
    }

    // ステップ1: 翻訳
    await runConcurrentTranslation(elements, DVT.state.targetLang, 'dvt-rs-');

    // ステップ2: 翻訳結果を結合してLLMで要約
    const textsForSummary = [];
    elements.forEach(el => {
      const transEl = el.querySelector('.dvt-trans');
      const origEl = el.querySelector('.dvt-orig');
      if (transEl) {
        textsForSummary.push(transEl.textContent);
      } else if (origEl) {
        textsForSummary.push(origEl.textContent);
      }
    });

    if (textsForSummary.length === 0) return;

    const fullText = textsForSummary.join('\n');

    // 要約ブロックを挿入（ローディング状態）
    const summaryBlock = document.createElement('div');
    summaryBlock.className = 'dvt-summary';
    summaryBlock.setAttribute('data-dvt', 'true');
    summaryBlock.innerHTML = `
      <span class="dvt-badge dvt-badge-summary">${DVT.escapeHtml(t('summaryBadge'))}</span>
      <div class="dvt-summary-text"><span class="dvt-spinner"></span> ${DVT.escapeHtml(t('summarizing'))}</div>
    `;
    container.insertBefore(summaryBlock, container.firstChild);

    // LLM APIで要約
    try {
      const summary = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'summarize',
          text: fullText,
          targetLang: DVT.state.targetLang,
        }, (res) => {
          if (chrome.runtime.lastError) { reject(new Error(t('error'))); return; }
          if (res?.ok) resolve(res.summary);
          else reject(new Error(res?.error || t('translateFailed')));
        });
      });

      summaryBlock.querySelector('.dvt-summary-text').textContent = summary;
      summaryBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      summaryBlock.querySelector('.dvt-summary-text').innerHTML =
        `<span class="dvt-same-lang">${DVT.escapeHtml(e.message)}</span>`;
    }
  }

  // ─── 要素翻訳（右クリックメニュー） ────────────────────────────────
  async function translateElement() {
    if (!DVT.state.lastContextMenuTarget) return;

    const BLOCK_TAGS = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'NAV',
      'HEADER', 'FOOTER', 'BLOCKQUOTE', 'FIGURE', 'DETAILS', 'TD', 'TH', 'LI'];
    let container = DVT.state.lastContextMenuTarget;

    while (container && container !== document.body) {
      if (container.closest('[data-dvt]')) { container = container.parentElement; continue; }
      if (BLOCK_TAGS.includes(container.tagName) || container.tagName === 'P') break;
      container = container.parentElement;
    }
    if (!container || container === document.body) return;

    let elements = filterTranslatableElements(container);

    if (elements.length === 0) {
      if (container.dataset.dvtId || container.closest('[data-dvt]')) return;
      const text = container.innerText?.trim();
      if (!text || text.length < 4) {
        DVT.showToast(t('toastNoText'), false, 2500);
        return;
      }
      elements = [container];
    }

    await runConcurrentTranslation(elements, DVT.state.targetLang, 'dvt-ctx-');
  }

  // ─── 要素翻訳＆要約（右クリックメニュー） ──────────────────────────
  async function translateAndSummarizeElement() {
    if (!DVT.state.lastContextMenuTarget) return;

    // ブロック要素を特定（translateElementと同じロジック）
    const BLOCK_TAGS = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'NAV',
      'HEADER', 'FOOTER', 'BLOCKQUOTE', 'FIGURE', 'DETAILS', 'TD', 'TH', 'LI'];
    let container = DVT.state.lastContextMenuTarget;

    while (container && container !== document.body) {
      if (container.closest('[data-dvt]')) { container = container.parentElement; continue; }
      if (BLOCK_TAGS.includes(container.tagName) || container.tagName === 'P') break;
      container = container.parentElement;
    }
    if (!container || container === document.body) return;

    let elements = filterTranslatableElements(container);

    if (elements.length === 0) {
      if (container.dataset.dvtId || container.closest('[data-dvt]')) return;
      const text = container.innerText?.trim();
      if (!text || text.length < 4) {
        DVT.showToast(t('toastNoText'), false, 2500);
        return;
      }
      elements = [container];
    }

    // ステップ1: 各文のデュアルビュー翻訳
    await runConcurrentTranslation(elements, DVT.state.targetLang, 'dvt-sum-');

    // ステップ2: 全テキストを結合してLLMで要約
    // 翻訳結果があればそれを、同一言語で翻訳が省略された場合は原文を使用
    const textsForSummary = [];
    elements.forEach(el => {
      const transEl = el.querySelector('.dvt-trans');
      const origEl = el.querySelector('.dvt-orig');
      if (transEl) {
        textsForSummary.push(transEl.textContent);
      } else if (origEl) {
        textsForSummary.push(origEl.textContent);
      }
    });

    if (textsForSummary.length === 0) return;

    const fullText = textsForSummary.join('\n');

    // 要約ブロックを挿入（ローディング状態）
    const summaryBlock = document.createElement('div');
    summaryBlock.className = 'dvt-summary';
    summaryBlock.setAttribute('data-dvt', 'true');
    summaryBlock.innerHTML = `
      <span class="dvt-badge dvt-badge-summary">${DVT.escapeHtml(t('summaryBadge'))}</span>
      <div class="dvt-summary-text"><span class="dvt-spinner"></span> ${DVT.escapeHtml(t('summarizing'))}</div>
    `;
    container.insertBefore(summaryBlock, container.firstChild);

    // LLM APIで要約
    try {
      const summary = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'summarize',
          text: fullText,
          targetLang: DVT.state.targetLang,
        }, (res) => {
          if (chrome.runtime.lastError) { reject(new Error(t('error'))); return; }
          if (res?.ok) resolve(res.summary);
          else reject(new Error(res?.error || t('translateFailed')));
        });
      });

      summaryBlock.querySelector('.dvt-summary-text').textContent = summary;
      summaryBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      summaryBlock.querySelector('.dvt-summary-text').innerHTML =
        `<span class="dvt-same-lang">${DVT.escapeHtml(e.message)}</span>`;
    }
  }

  return { translatePage, translatePageAndSummarize, undoPageTranslate, enterRegionMode, translateElement, translateAndSummarizeElement };
})();
