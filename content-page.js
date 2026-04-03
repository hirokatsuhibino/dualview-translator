// Copyright (c) Orangesoft Inc
// DualView Translator — ページ全体翻訳・範囲選択翻訳・要素翻訳

// eslint-disable-next-line no-var
var DVT_PAGE = (function () {
  'use strict';

  // ─── 定数 ─────────────────────────────────────────────────────────────────
  const MIN_TEXT_LENGTH = 4;                // 翻訳対象とする最小テキスト長
  const CONCURRENCY = 6;                    // 並列翻訳ワーカー数
  const OBSERVER_DEBOUNCE_MS = 500;         // MutationObserver デバウンス間隔(ms)
  const TOAST_DONE_DURATION_MS = 2500;      // 翻訳完了トースト表示時間(ms)
  const TOAST_SHORT_DURATION_MS = 2000;     // リセット完了トースト表示時間(ms)
  const TOAST_NOTEXT_DURATION_MS = 2500;    // テキストなしエラートースト表示時間(ms)
  const SELECTOR_PICK_DONE_DURATION_MS = 4000; // セレクタ選択完了トースト表示時間(ms)

  // ページ全体翻訳対象セレクタ
  const PAGE_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, figcaption, blockquote, dt, dd';
  // 要素内翻訳対象セレクタ（領域選択・自動ルール翻訳）
  const REGION_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div';
  // ブロック要素タグ一覧（右クリック翻訳でコンテナを特定するために使用）
  const BLOCK_TAGS = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'NAV',
    'HEADER', 'FOOTER', 'BLOCKQUOTE', 'FIGURE', 'DETAILS', 'TD', 'TH', 'LI'];

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
      if (transEl) {
        transEl.textContent = result;
        // 個別リセットボタン（×）を翻訳テキストの末尾に追加
        const undoBtn = document.createElement('button');
        undoBtn.className = 'dvt-undo-btn';
        undoBtn.setAttribute('data-dvt', 'true');
        undoBtn.title = t('undoElement');
        undoBtn.textContent = '×';
        undoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          // 元のHTMLを復元してdata-dvt-idを削除
          const origEl = el.querySelector('.dvt-orig');
          if (origEl) {
            el.innerHTML = origEl.innerHTML;
            delete el.dataset.dvtId;
          }
        });
        transEl.appendChild(undoBtn);
      }
    }
  }

  // ─── 翻訳可能な要素のフィルタリング ────────────────────────────────
  function filterTranslatableElements(container, selectors) {
    return Array.from(container.querySelectorAll(selectors || PAGE_SELECTORS)).filter(el => {
      if (el.closest('[data-dvt]')) return false;
      if (el.dataset.dvtId) return false;
      const text = el.innerText?.trim();
      return text && text.length >= MIN_TEXT_LENGTH;
    });
  }

  // ─── 並列翻訳ワーカー ──────────────────────────────────────────────
  async function runConcurrentTranslation(elements, tl, idPrefix) {
    const toast = DVT.showToast(t('toastTranslating', { done: 0, total: elements.length }), true);
    let done = 0;

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
          setTimeout(() => toast.remove(), TOAST_DONE_DURATION_MS);
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
      }, OBSERVER_DEBOUNCE_MS);
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
    await runSummarize(elements, document.body, true);

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
    DVT.showToast(t('toastReset'), false, TOAST_SHORT_DURATION_MS);
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

  // ─── 領域内要素の抽出（共通処理） ────────────────────────────────────
  // コンテナ内の翻訳対象葉要素を抽出する。なければコンテナ自体を返す。
  // テキストなし・翻訳済みの場合は null を返す。
  function extractRegionElements(container) {
    if (!container || container === document.body) return null;

    let elements = Array.from(container.querySelectorAll(REGION_SELECTORS)).filter(el => {
      if (el.closest('[data-dvt]')) return false;
      if (el.dataset.dvtId) return false;
      return el.innerText?.trim().length >= MIN_TEXT_LENGTH;
    });

    // 葉要素のみ抽出（親子重複を除外）
    elements = elements.filter(el =>
      !elements.some(other => other !== el && el.contains(other))
    );

    // 子要素がなければコンテナ自体を翻訳対象に
    if (elements.length === 0) {
      if (container.dataset.dvtId || container.closest('[data-dvt]')) return null;
      const text = container.innerText?.trim();
      if (!text || text.length < MIN_TEXT_LENGTH) {
        DVT.showToast(t('toastNoText'), false, TOAST_NOTEXT_DURATION_MS);
        return null;
      }
      return [container];
    }

    return elements;
  }

  // クリックされた要素とその子要素を翻訳
  async function translateClickedElement(container) {
    const elements = extractRegionElements(container);
    if (!elements) return;
    await runConcurrentTranslation(elements, DVT.state.targetLang, 'dvt-r-');
  }

  // クリックされた要素とその子要素を翻訳＆要約
  async function translateAndSummarizeClickedElement(container) {
    const elements = extractRegionElements(container);
    if (!elements) return;

    // ステップ1: 翻訳
    await runConcurrentTranslation(elements, DVT.state.targetLang, 'dvt-rs-');

    // ステップ2: 翻訳結果を結合してLLMで要約
    await runSummarize(elements, container);
  }

  // ─── ブロック要素コンテナの特定（右クリック翻訳） ──────────────────────
  // 右クリック位置の要素から親方向にさかのぼり、最初のブロック要素を返す。
  function findBlockContainer(target) {
    let container = target;
    while (container && container !== document.body) {
      if (container.closest('[data-dvt]')) { container = container.parentElement; continue; }
      if (BLOCK_TAGS.includes(container.tagName) || container.tagName === 'P') break;
      container = container.parentElement;
    }
    return (container && container !== document.body) ? container : null;
  }

  // ─── 要素翻訳（右クリックメニュー） ────────────────────────────────
  async function translateElement() {
    const container = findBlockContainer(DVT.state.lastContextMenuTarget);
    if (!container) return;

    let elements = filterTranslatableElements(container);
    if (elements.length === 0) {
      if (container.dataset.dvtId || container.closest('[data-dvt]')) return;
      const text = container.innerText?.trim();
      if (!text || text.length < MIN_TEXT_LENGTH) {
        DVT.showToast(t('toastNoText'), false, TOAST_NOTEXT_DURATION_MS);
        return;
      }
      elements = [container];
    }

    await runConcurrentTranslation(elements, DVT.state.targetLang, 'dvt-ctx-');
  }

  // ─── 要素翻訳＆要約（右クリックメニュー） ──────────────────────────
  async function translateAndSummarizeElement() {
    const container = findBlockContainer(DVT.state.lastContextMenuTarget);
    if (!container) return;

    let elements = filterTranslatableElements(container);
    if (elements.length === 0) {
      if (container.dataset.dvtId || container.closest('[data-dvt]')) return;
      const text = container.innerText?.trim();
      if (!text || text.length < MIN_TEXT_LENGTH) {
        DVT.showToast(t('toastNoText'), false, TOAST_NOTEXT_DURATION_MS);
        return;
      }
      elements = [container];
    }

    // ステップ1: 各文のデュアルビュー翻訳
    await runConcurrentTranslation(elements, DVT.state.targetLang, 'dvt-sum-');

    // ステップ2: 全テキストを結合してLLMで要約
    await runSummarize(elements, container);
  }

  // ─── 要約ブロックの挿入とLLM要約の実行（共通処理） ────────────────────
  // elements:      翻訳済み要素の配列
  // insertTarget:  要約ブロックを挿入する親要素
  // isPageSummary: trueの場合は dvt-page-summary IDを付与（undo時に削除するため）
  async function runSummarize(elements, insertTarget, isPageSummary = false) {
    // LLM APIキー未設定時はトーストで通知して早期リターン（フォールバック）
    const llmConfig = await new Promise(resolve => {
      chrome.storage.local.get(['claudeApiKey', 'geminiApiKey'], resolve);
    });
    if (!llmConfig.claudeApiKey && !llmConfig.geminiApiKey) {
      DVT.showToast(t('llmApiKeyMissing'), false, 4000);
      return;
    }

    // 翻訳テキストを収集（翻訳があればそれを、同一言語でスキップされた場合は原文を使用）
    const texts = [];
    elements.forEach(el => {
      const transEl = el.querySelector('.dvt-trans');
      const origEl = el.querySelector('.dvt-orig');
      if (transEl) texts.push(transEl.textContent);
      else if (origEl) texts.push(origEl.textContent);
    });
    if (texts.length === 0) return;

    const fullText = texts.join('\n');

    // 要約ブロックを挿入（ローディング状態）
    const summaryBlock = document.createElement('div');
    summaryBlock.className = 'dvt-summary';
    summaryBlock.setAttribute('data-dvt', 'true');
    if (isPageSummary) summaryBlock.id = 'dvt-page-summary';
    summaryBlock.innerHTML = `
      <span class="dvt-badge dvt-badge-summary">${DVT.escapeHtml(t('summaryBadge'))}</span>
      <div class="dvt-summary-text"><span class="dvt-spinner"></span> ${DVT.escapeHtml(t('summarizing'))}</div>
    `;
    insertTarget.insertBefore(summaryBlock, insertTarget.firstChild);
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

  // ─── セレクタ選択モード ────────────────────────────────────────────
  // 要素をクリックしてCSSセレクタを自動生成、storageに一時保存する
  function enterSelectorPickMode(urlPattern) {
    if (DVT.state.regionMode) return;
    DVT.state.regionMode = true;

    // ヒントバナーを表示
    const hint = document.createElement('div');
    hint.className = 'dvt-region-hint';
    hint.setAttribute('data-dvt', 'true');
    hint.textContent = t('selectorPickHint');
    document.body.appendChild(hint);

    let lastHighlighted = null;

    function onMouseOver(e) {
      const el = e.target.closest('[data-dvt]') ? null : e.target;
      if (!el || el === document.body || el === document.documentElement) return;
      if (lastHighlighted && lastHighlighted !== el) {
        lastHighlighted.classList.remove('dvt-region-highlight');
      }
      lastHighlighted = el;
      el.classList.add('dvt-region-highlight');
    }

    function cleanup() {
      DVT.state.regionMode = false;
      hint.remove();
      if (lastHighlighted) lastHighlighted.classList.remove('dvt-region-highlight');
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown);
    }

    // ─── CSSセレクタを自動生成 ─────────────────────────────────────
    function generateSelector(el) {
      // IDが付いている場合は最優先
      if (el.id) {
        try { return '#' + CSS.escape(el.id); } catch(e) { return '#' + el.id; }
      }
      const tag = el.tagName.toLowerCase();
      // 拡張自身のクラスを除外してクラスセレクタを生成
      const classes = Array.from(el.classList)
        .filter(c => !c.startsWith('dvt-'))
        .slice(0, 2);
      if (classes.length > 0) {
        try {
          return tag + classes.map(c => '.' + CSS.escape(c)).join('');
        } catch(e) {
          return tag + '.' + classes.join('.');
        }
      }
      // 親要素と組み合わせてセレクタを生成（深さ上限2）
      const parent = el.parentElement;
      if (parent && parent !== document.body && parent !== document.documentElement) {
        return generateSelector(parent) + ' > ' + tag;
      }
      return tag;
    }

    function onClick(e) {
      const el = e.target.closest('[data-dvt]') ? null : e.target;
      if (!el || el === document.body) return;
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      const selector = generateSelector(el);
      // セレクタとURLパターンをstorageに一時保存（ポップアップで復元するため）
      chrome.storage.local.set({
        pendingRuleSelector: selector,
        pendingRuleUrlPattern: urlPattern || '',
      });
      DVT.showToast(t('selectorPickDone'), false, SELECTOR_PICK_DONE_DURATION_MS);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') cleanup();
    }

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown);
  }

  return { translatePage, translatePageAndSummarize, undoPageTranslate, enterRegionMode, translateElement, translateAndSummarizeElement, translateClickedElement, translateAndSummarizeClickedElement, enterSelectorPickMode };
})();
