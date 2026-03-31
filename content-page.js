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
  }

  function undoPageTranslate() {
    DVT.state.pageTranslateActive = false;
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

  // ─── 範囲選択翻訳 ──────────────────────────────────────────────────
  function enterRegionMode() {
    DVT.state.regionMode = true;
    document.body.style.cursor = 'crosshair';
    const hint = document.createElement('div');
    hint.className = 'dvt-region-hint';
    hint.setAttribute('data-dvt', 'true');
    hint.textContent = t('regionHint');
    document.body.appendChild(hint);

    function onMousedown(e) {
      if (e.target.closest('[data-dvt]')) return;
      DVT.state.regionStart = { x: e.clientX, y: e.clientY };

      DVT.state.regionOverlay = document.createElement('div');
      DVT.state.regionOverlay.className = 'dvt-region-overlay';
      DVT.state.regionOverlay.setAttribute('data-dvt', 'true');
      document.body.appendChild(DVT.state.regionOverlay);

      function onMousemove(e) {
        const x = Math.min(e.clientX, DVT.state.regionStart.x);
        const y = Math.min(e.clientY, DVT.state.regionStart.y);
        const w = Math.abs(e.clientX - DVT.state.regionStart.x);
        const h = Math.abs(e.clientY - DVT.state.regionStart.y);
        DVT.state.regionOverlay.style.left = x + window.scrollX + 'px';
        DVT.state.regionOverlay.style.top = y + window.scrollY + 'px';
        DVT.state.regionOverlay.style.width = w + 'px';
        DVT.state.regionOverlay.style.height = h + 'px';
      }

      function onMouseup(e) {
        document.removeEventListener('mousemove', onMousemove);
        document.removeEventListener('mouseup', onMouseup);

        const rectData = {
          left: Math.min(DVT.state.regionStart.x, e.clientX),
          top: Math.min(DVT.state.regionStart.y, e.clientY),
          right: Math.max(DVT.state.regionStart.x, e.clientX),
          bottom: Math.max(DVT.state.regionStart.y, e.clientY),
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

  function exitRegionMode(hint) {
    DVT.state.regionMode = false;
    document.body.style.cursor = '';
    if (hint) hint.remove();
    if (DVT.state.regionOverlay) { DVT.state.regionOverlay.remove(); DVT.state.regionOverlay = null; }
    if (hint?._cleanup) hint._cleanup();
  }

  async function translateRegion(rect) {
    const REGION_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div';
    const elements = Array.from(document.querySelectorAll(REGION_SELECTORS)).filter(el => {
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
      DVT.showToast(t('toastNoText'), false, 2500);
      return;
    }

    // 範囲選択は逐次翻訳（表示順序を保つため）
    const toast = DVT.showToast(t('toastTranslating', { done: 0, total: leafElements.length }), true);
    let done = 0;

    for (const el of leafElements) {
      if (el.dataset.dvtId) continue;
      const originalText = el.innerText.trim();
      insertDualView(el, 'dvt-r-');

      DVT.translate(originalText, DVT.state.targetLang).then(({ text: result, detectedLang }) => {
        applyTranslation(el, result, detectedLang, DVT.state.targetLang);
        done++;
        DVT.updateToast(toast, t('toastTranslating', { done, total: leafElements.length }));
        if (done >= leafElements.length) {
          DVT.updateToast(toast, t('toastDone', { count: done }));
          setTimeout(() => toast.remove(), 2500);
        }
      });
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
