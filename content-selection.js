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
  // 選択直後はフルパネルを開かず、小さなアイコンだけを表示する。
  // クリックすると初めてフルパネルに展開する（コピー目的の選択を妨げないため）。

  // selectionchange のデバウンス用タイマー（タッチデバイスのみで使用）
  let selectionChangeTimer = null;

  function clearSelectionChangeTimer() {
    if (selectionChangeTimer) {
      clearTimeout(selectionChangeTimer);
      selectionChangeTimer = null;
    }
  }

  // 共通: 現在の選択テキストを評価してミニアイコンを再表示する
  function handleSelectionForMiniBtn() {
    const sel = window.getSelection();
    // sel が null のときに .trim() で例外にならないよう optional chaining を二段にする
    const text = sel?.toString()?.trim();

    removeSelectionMiniBtn();

    // sel が有効で範囲があり、テキストが 2 文字以上のときだけ表示
    if (sel && sel.rangeCount > 0 && text && text.length > 1) {
      showSelectionMiniBtn(sel, text);
    }
  }

  // デスクトップ系（Chrome / Firefox / macOS Safari）: mouseup ベース
  document.addEventListener('mouseup', (e) => {
    // 左クリック以外（右クリックや中クリックの mouseup）は無視。
    // 右クリックでミニアイコンが出てしまうとコンテキストメニュー操作の邪魔になる
    if (e.button !== 0) return;
    // ミニアイコン or パネル内のクリックは無視（クリックで展開／操作するため）
    if (DVT.state.selectionMiniBtn && DVT.state.selectionMiniBtn.contains(e.target)) return;
    if (DVT.state.selectionPanel && DVT.state.selectionPanel.contains(e.target)) return;

    // mouseup は「別箇所をクリックして選択を解除」したケースも兼ねるので、
    // フルパネルが開いていれば閉じる
    removeSelectionPanel();
    handleSelectionForMiniBtn();
  });

  // iOS Safari など mouseup が期待通り発火しないタッチデバイス向けに selectionchange でも検知。
  // タッチデバイスのみに限定する理由:
  //   デスクトップで selectionchange を有効にすると、Shift+Arrow などキーボード選択でも
  //   ミニアイコンが出てしまい、手動シナリオ SMI-013（キーボード選択では出さない）と矛盾する。
  // selectionchange は選択中の連続発火が頻繁なため 300ms デバウンスして「選択完了後」に判定する。
  const isTouchDevice = (
    typeof document !== 'undefined' &&
    'ontouchstart' in document.documentElement
  );
  if (isTouchDevice) {
    document.addEventListener('selectionchange', () => {
      clearSelectionChangeTimer();
      selectionChangeTimer = setTimeout(() => {
        selectionChangeTimer = null;
        // フルパネルが開いている間（パネル内テキスト選択など）は無視
        if (DVT.state.selectionPanel) return;
        handleSelectionForMiniBtn();
      }, 300);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // 保留中の selectionchange タイマーで意図せず再表示されないよう先にクリア
      clearSelectionChangeTimer();
      removeSelectionPanel();
      removeSelectionMiniBtn();
    }
  });

  function removeSelectionPanel() {
    // パネルを閉じるタイミングで保留中の selectionchange タイマーもクリアしておくと、
    // 「パネル閉じる → 0.3 秒後に古い選択範囲でアイコン再表示」のような副作用を防げる
    clearSelectionChangeTimer();
    if (DVT.state.selectionPanel) {
      // パネル内で再生中の読み上げのみ停止する。インライン翻訳・要約側で再生中の読み上げは
      // パネルを閉じても継続させたいので、明示的にパネル内のボタン状態を確認する。
      if (DVT.state.selectionPanel.querySelector('.dvt-speak-btn[data-dvt-speaking="true"]')) {
        DVT.stopSpeak();
      }
      DVT.state.selectionPanel.remove();
      DVT.state.selectionPanel = null;
    }
  }

  function removeSelectionMiniBtn() {
    if (DVT.state.selectionMiniBtn) {
      DVT.state.selectionMiniBtn.remove();
      DVT.state.selectionMiniBtn = null;
    }
  }

  // ─── ミニアイコン表示（選択直後） ────────────────────────────────
  // ミニアイコンサイズ（CSS の width/height と一致させること）
  const MINI_BTN_SIZE = 28;
  const MINI_BTN_GAP = 4;

  // rect の右下端基準でミニアイコンの top/left を決め、ビューポート内にクランプする
  function computeMiniBtnPosition(rect) {
    const top = rect.bottom + window.scrollY + MINI_BTN_GAP;
    const rawLeft = rect.right + window.scrollX + MINI_BTN_GAP;
    const maxLeft = window.scrollX + window.innerWidth - MINI_BTN_SIZE - MINI_BTN_GAP;
    const minLeft = window.scrollX + MINI_BTN_GAP;
    const maxTop = window.scrollY + window.innerHeight - MINI_BTN_SIZE - MINI_BTN_GAP;
    const minTop = window.scrollY + MINI_BTN_GAP;
    return {
      top: Math.max(minTop, Math.min(top, maxTop)),
      left: Math.max(minLeft, Math.min(rawLeft, maxLeft)),
    };
  }

  function showSelectionMiniBtn(sel, text) {
    // クリック時にスクロール／リサイズで位置がずれないよう、Range を保持して
    // クリック時点で再度 getBoundingClientRect() を呼べるようにする
    const range = sel.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();

    // 翻訳アイコンだけの小さな角丸正方形ボタン
    const btn = document.createElement('button');
    btn.className = 'dvt-sel-mini-btn';
    btn.setAttribute('data-dvt', 'true');
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', t('translateSelection'));
    btn.setAttribute('title', t('translateSelection'));
    // ホストページの SVG 関連 CSS（例: `svg path { stroke: none !important }`）で
    // SVG ストロークが描画されないサイトがあるため、フォントベースの絵文字を使用する。
    // 絵文字はフォントレンダリングを通るので CSS による消失リスクが極めて低い。
    const iconSpan = document.createElement('span');
    iconSpan.className = 'dvt-sel-mini-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = '🌐';
    btn.appendChild(iconSpan);

    const pos = computeMiniBtnPosition(rect);
    btn.style.top = pos.top + 'px';
    btn.style.left = pos.left + 'px';

    // 左クリック以外は無視（右クリック後の click 連鎖などで誤発火しないよう）
    btn.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      // ミニアイコン上での mousedown は document の mouseup を即座に通すと
      // 選択解除→消去となってしまうため、mousedown 段階で停止させる
      ev.preventDefault();
      ev.stopPropagation();
    });

    btn.addEventListener('click', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      removeSelectionMiniBtn();
      // クリック時点でスクロール・リサイズが発生している可能性があるため、
      // 保持していた Range から rect を再取得する
      const freshRect = range.getBoundingClientRect();
      // 選択が完全に解除されて Range が無効化された場合のフォールバック
      const safeRect = (freshRect.width === 0 && freshRect.height === 0) ? rect : freshRect;
      showSelectionPanelAtRect(safeRect, text);
    });

    document.body.appendChild(btn);
    DVT.state.selectionMiniBtn = btn;
  }

  // ─── 選択パネル表示（ミニアイコンクリックから呼ばれる） ───────────
  function showSelectionPanelAtRect(rect, text) {
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
    // アイコンクリック時も即翻訳開始（コンテキストメニューと同じ動作）
    runSelectionTranslate(panel, text, DVT.state.targetLang);
  }

  // ─── コンテキストメニューからの翻訳パネル表示 ──────────────────────
  function showContextMenuPanel(text) {
    removeSelectionPanel();
    removeSelectionMiniBtn();

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

    const isSameLang = DVT.langMatches(detectedLang, tl);
    if (isSameLang) {
      transText.textContent = '';
      transText.appendChild(h('span', { class: 'dvt-same-lang' }, t('sameLang', { lang: detectedLang })));
    } else {
      transText.textContent = translated;
    }

    btn.disabled = false;
    btn.textContent = '';
    btn.appendChild(parseSvg(SVG_TRANSLATE));
    btn.appendChild(document.createTextNode(' ' + t('retranslateBtn')));

    // 読み上げボタンは初回翻訳時に追加（再翻訳ではそのまま使い回す）。
    // 同一言語スキップ時は再生対象がないので非表示にし、進行中の再生は停止する。
    const actions = panel.querySelector('.dvt-sel-actions');
    if (DVT.isSpeechSupported() && !actions.querySelector('.dvt-speak-btn')) {
      const speakBtn = DVT.createSpeakButton(
        () => panel.querySelector('.dvt-sel-trans-text').textContent,
        () => panel.querySelector('.dvt-sel-lang').value,
        'dvt-speak-btn-panel'
      );
      actions.insertBefore(speakBtn, actions.firstChild);
    }
    const existingSpeakBtn = actions.querySelector('.dvt-speak-btn');
    if (existingSpeakBtn) {
      existingSpeakBtn.style.display = isSameLang ? 'none' : '';
      // 同一言語スキップでこのパネル内ボタンが再生中だった場合のみ停止
      // （他ブロックの再生中の読み上げは止めない）
      if (isSameLang && existingSpeakBtn.dataset.dvtSpeaking === 'true') {
        DVT.stopSpeak();
      }
    }

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

  return { showContextMenuPanel, removeSelectionPanel, removeSelectionMiniBtn };
})();
