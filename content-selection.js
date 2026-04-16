// Copyright (c) Orangesoft Inc
// DualView Translator — テキスト選択翻訳パネル + コンテキストメニュー翻訳

// eslint-disable-next-line no-var
var DVT_SEL = (function () {
  'use strict';

  const SVG_TRANSLATE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 3l14 0M12 3v4M3 10h8m0 0-3 3m3-3-3-3M16 10h5M16 14l5 0M16 17l5 0"/></svg>';
  const SVG_COPY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';

  // 言語オプション定義
  const LANG_OPTIONS = [
    ['ja', '🇯🇵 日本語'], ['en', '🇺🇸 English'],
    ['zh-CN', '🇨🇳 中文（簡）'], ['zh-TW', '🇹🇼 中文（繁）'],
    ['ko', '🇰🇷 한국어'], ['fr', '🇫🇷 Français'],
    ['de', '🇩🇪 Deutsch'], ['es', '🇪🇸 Español'],
    ['pt', '🇵🇹 Português'], ['ru', '🇷🇺 Русский'],
    ['ar', '🇸🇦 العربية'],
  ];

  // SVG文字列をDOM要素に変換
  function parseSvg(svgStr) {
    const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
    return document.importNode(doc.documentElement, true);
  }

  // DOM要素生成ヘルパー
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else if (c) el.appendChild(c);
    }
    return el;
  }

  // ─── テキスト選択イベント ───────────────────────────────────────────
  document.addEventListener('mouseup', (e) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (DVT.state.selectionPanel && DVT.state.selectionPanel.contains(e.target)) return;
    removeSelectionPanel();
    if (text && text.length > 1) {
      showSelectionPanel(sel, text);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeSelectionPanel();
  });

  function removeSelectionPanel() {
    if (DVT.state.selectionPanel) {
      DVT.state.selectionPanel.remove();
      DVT.state.selectionPanel = null;
    }
  }

  // ─── 選択パネル表示 ────────────────────────────────────────────────
  function showSelectionPanel(sel, text) {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const panel = document.createElement('div');
    panel.className = 'dvt-sel-panel';
    panel.setAttribute('data-dvt', 'true');
    panel.appendChild(buildSelectionPanelDOM(text));

    const top = rect.bottom + window.scrollY + 10;
    const left = Math.min(Math.max(rect.left + window.scrollX, 8), window.innerWidth - 360 + window.scrollX);
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';

    document.body.appendChild(panel);
    DVT.state.selectionPanel = panel;

    wireUpPanelEvents(panel, text);
  }

  // ─── コンテキストメニューからの翻訳パネル表示 ──────────────────────
  function showContextMenuPanel(text) {
    removeSelectionPanel();

    const panel = document.createElement('div');
    panel.className = 'dvt-sel-panel';
    panel.setAttribute('data-dvt', 'true');
    panel.appendChild(buildSelectionPanelDOM(text));

    // 選択範囲の位置を取得（可能なら）
    const sel = window.getSelection();
    let top, left;
    if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      top = rect.bottom + window.scrollY + 10;
      left = Math.min(Math.max(rect.left + window.scrollX, 8), window.innerWidth - 360 + window.scrollX);
    } else {
      top = window.scrollY + 80;
      left = Math.max((window.innerWidth - 340) / 2 + window.scrollX, 8);
    }
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';

    document.body.appendChild(panel);
    DVT.state.selectionPanel = panel;

    wireUpPanelEvents(panel, text);

    // 即座に翻訳開始
    runSelectionTranslate(panel, text, DVT.state.targetLang);
  }

  // ─── パネルイベント登録（共通） ────────────────────────────────────
  function wireUpPanelEvents(panel, text) {
    panel.querySelector('.dvt-sel-lang').value = DVT.state.targetLang;

    panel.querySelector('.dvt-sel-btn').addEventListener('click', async () => {
      const tl = panel.querySelector('.dvt-sel-lang').value;
      DVT.state.targetLang = tl;
      chrome.storage.local.set({ targetLang: tl });
      await runSelectionTranslate(panel, text, tl);
    });

    panel.querySelector('.dvt-sel-close').addEventListener('click', removeSelectionPanel);

    panel.querySelector('.dvt-sel-lang').addEventListener('change', (e) => {
      DVT.state.targetLang = e.target.value;
    });

    initDragBehavior(panel);
  }

  // ─── ドラッグ移動 ─────────────────────────────────────────────────
  function initDragBehavior(panel) {
    const header = panel.querySelector('.dvt-sel-header');
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', onMouseDown);

    function onMouseDown(e) {
      if (e.button !== 0) return;                       // 左クリックのみ
      if (e.target.closest('.dvt-sel-close')) return;    // 閉じるボタンは除外

      isDragging = true;
      offsetX = e.pageX - parseFloat(panel.style.left);
      offsetY = e.pageY - parseFloat(panel.style.top);

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      panel.style.animation = 'none';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!isDragging) return;

      let newLeft = e.pageX - offsetX;
      let newTop  = e.pageY - offsetY;

      // ビューポート境界内にクランプ
      const panelW = panel.offsetWidth;
      const panelH = panel.offsetHeight;
      const minLeft = window.scrollX;
      const minTop  = window.scrollY;
      const maxLeft = window.scrollX + window.innerWidth  - panelW;
      const maxTop  = window.scrollY + window.innerHeight - panelH;

      newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
      newTop  = Math.max(minTop,  Math.min(newTop,  maxTop));

      panel.style.left = newLeft + 'px';
      panel.style.top  = newTop  + 'px';
    }

    function onMouseUp() {
      if (!isDragging) return;
      isDragging = false;

      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }

  // ─── パネルDOM生成 ─────────────────────────────────────────────────
  function buildSelectionPanelDOM(text) {
    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
    const frag = document.createDocumentFragment();

    // ヘッダー
    frag.appendChild(h('div', { class: 'dvt-sel-header' },
      h('span', { class: 'dvt-sel-label' }, t('dualviewTitle')),
      h('button', { class: 'dvt-sel-close', title: t('close') }, '✕')
    ));

    // 原文表示
    frag.appendChild(h('div', { class: 'dvt-sel-original' },
      h('span', { class: 'dvt-badge dvt-badge-orig' }, t('original')),
      h('div', { class: 'dvt-sel-orig-text' }, preview)
    ));

    // 言語選択 + 翻訳ボタン
    const select = h('select', { class: 'dvt-sel-lang' });
    LANG_OPTIONS.forEach(([val, label]) => {
      select.appendChild(h('option', { value: val }, label));
    });
    frag.appendChild(h('div', { class: 'dvt-sel-controls' },
      select,
      h('button', { class: 'dvt-sel-btn' }, parseSvg(SVG_TRANSLATE), t('translateBtn'))
    ));

    // 翻訳結果
    frag.appendChild(h('div', { class: 'dvt-sel-result', style: 'display:none' },
      h('span', { class: 'dvt-badge dvt-badge-trans' }, t('translated')),
      h('div', { class: 'dvt-sel-trans-text' }),
      h('div', { class: 'dvt-sel-actions' },
        h('button', { class: 'dvt-copy-btn', title: t('copyBtn') }, parseSvg(SVG_COPY), t('copyBtn'))
      )
    ));

    return frag;
  }

  // ─── 選択テキスト翻訳実行 ──────────────────────────────────────────
  async function runSelectionTranslate(panel, text, tl) {
    const btn = panel.querySelector('.dvt-sel-btn');
    const result = panel.querySelector('.dvt-sel-result');
    const transText = panel.querySelector('.dvt-sel-trans-text');

    btn.disabled = true;
    btn.textContent = t('translating');
    result.style.display = 'block';
    transText.textContent = '';
    transText.appendChild(h('span', { class: 'dvt-spinner' }));

    const { text: translated, detectedLang } = await DVT.translate(text, tl);

    if (DVT.langMatches(detectedLang, tl)) {
      transText.textContent = '';
      transText.appendChild(h('span', { class: 'dvt-same-lang' }, t('sameLang', { lang: detectedLang })));
    } else {
      transText.textContent = translated;
    }

    btn.disabled = false;
    btn.textContent = '';
    btn.appendChild(parseSvg(SVG_TRANSLATE));
    btn.appendChild(document.createTextNode(' ' + t('retranslateBtn')));

    panel.querySelector('.dvt-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(translated).then(() => {
        const cb = panel.querySelector('.dvt-copy-btn');
        cb.textContent = t('copied');
        setTimeout(() => {
          cb.textContent = '';
          cb.appendChild(parseSvg(SVG_COPY));
          cb.appendChild(document.createTextNode(' ' + t('copyBtn')));
        }, 2000);
      });
    });
  }

  return { showContextMenuPanel, removeSelectionPanel };
})();
