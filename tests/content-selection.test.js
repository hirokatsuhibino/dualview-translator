// content-selection.js のドラッグ移動・リサイズ機能テスト
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadScript } from './helpers.js';

describe('選択翻訳パネル — ドラッグ移動', () => {
  const jsCode = readFileSync(resolve(import.meta.dirname, '..', 'content-selection.js'), 'utf-8');

  it('initDragBehavior関数が定義されている', () => {
    expect(jsCode).toContain('function initDragBehavior');
  });

  it('ヘッダー要素をドラッグハンドルとして使用している', () => {
    expect(jsCode).toContain('.dvt-sel-header');
    expect(jsCode).toContain('mousedown');
    expect(jsCode).toContain('mousemove');
    expect(jsCode).toContain('mouseup');
  });

  it('閉じるボタンクリック時はドラッグを開始しない', () => {
    expect(jsCode).toContain('.dvt-sel-close');
  });

  it('ビューポート境界内にクランプしている', () => {
    expect(jsCode).toContain('window.scrollX');
    expect(jsCode).toContain('window.scrollY');
    expect(jsCode).toContain('window.innerWidth');
    expect(jsCode).toContain('window.innerHeight');
  });

  it('ドラッグ中はテキスト選択を抑制している', () => {
    expect(jsCode).toContain('userSelect');
  });

  it('wireUpPanelEventsからinitDragBehaviorを呼び出している', () => {
    // wireUpPanelEvents内でinitDragBehavior(panel)が呼ばれていることを確認
    expect(jsCode).toContain('initDragBehavior(panel)');
  });
});

describe('選択翻訳パネル — リサイズ', () => {
  const cssCode = readFileSync(resolve(import.meta.dirname, '..', 'content.css'), 'utf-8');

  it('パネルにresizeプロパティが設定されている', () => {
    expect(cssCode).toContain('resize: both');
  });

  it('パネルに最小幅が設定されている', () => {
    expect(cssCode).toContain('min-width: 240px');
  });

  it('ヘッダーにgrabカーソルが設定されている', () => {
    expect(cssCode).toContain('cursor: grab');
    expect(cssCode).toContain('cursor: grabbing');
  });
});

describe('選択翻訳 — ミニアイコン方式', () => {
  const jsCode = readFileSync(resolve(import.meta.dirname, '..', 'content-selection.js'), 'utf-8');
  const cssCode = readFileSync(resolve(import.meta.dirname, '..', 'content.css'), 'utf-8');

  it('mouseup ハンドラはフルパネルではなくミニアイコンを表示する', () => {
    // 選択直後に直接フルパネルを開く showSelectionPanel(...) は呼ばれない
    expect(jsCode).toContain('showSelectionMiniBtn(sel, text)');
  });

  it('showSelectionMiniBtn 関数が定義されている', () => {
    expect(jsCode).toContain('function showSelectionMiniBtn');
  });

  it('ミニアイコンのクリックで showSelectionPanelAtRect が呼ばれる', () => {
    // click リスナー登録から showSelectionPanelAtRect 呼び出しまでがハンドラ内に存在することを正規表現で確認
    // （単純な toContain では関数定義文字列にもマッチしてしまうため）
    expect(jsCode).toMatch(/btn\.addEventListener\(\s*['"]click['"][\s\S]*?showSelectionPanelAtRect\(/);
  });

  it('document の mouseup ハンドラが左クリック以外を早期 return している', () => {
    expect(jsCode).toMatch(/document\.addEventListener\(\s*['"]mouseup['"][\s\S]{0,200}e\.button !== 0/);
  });

  it('selectionchange イベントもデバウンス付きで購読している（iOS Safari 対応）', () => {
    expect(jsCode).toMatch(/document\.addEventListener\(\s*['"]selectionchange['"]/);
    expect(jsCode).toMatch(/setTimeout\([\s\S]{0,200}300\)/);
  });

  it('selectionchange はタッチデバイス判定でゲートされている（デスクトップで Shift+Arrow と衝突しない）', () => {
    // `'ontouchstart' in document.documentElement` の判定で true のときだけ登録される
    expect(jsCode).toMatch(/['"]ontouchstart['"][\s\S]{0,80}document\.documentElement/);
    expect(jsCode).toMatch(/if\s*\(\s*isTouchDevice\s*\)[\s\S]{0,200}selectionchange/);
  });

  it('Escape ハンドラで保留中の selectionchange タイマーをクリアしている', () => {
    expect(jsCode).toMatch(/Escape[\s\S]{0,400}clearSelectionChangeTimer/);
  });

  it('ミニアイコン上の mousedown は伝播停止する（document mouseup での消去を防ぐ）', () => {
    // mousedown ハンドラ内で stopPropagation していることを確認
    expect(jsCode).toMatch(/btn\.addEventListener\('mousedown'[\s\S]*?stopPropagation/);
  });

  it('Escape キーでミニアイコンも消える', () => {
    expect(jsCode).toMatch(/Escape[\s\S]*?removeSelectionMiniBtn/);
  });

  it('removeSelectionMiniBtn 関数が定義されている', () => {
    expect(jsCode).toContain('function removeSelectionMiniBtn');
  });

  it('コンテキストメニュー経由のフルパネル表示時はミニアイコンを除去する', () => {
    expect(jsCode).toMatch(/function showContextMenuPanel[\s\S]*?removeSelectionMiniBtn\(\)/);
  });

  it('aria-label / title は i18n キー translateSelection から取得する', () => {
    expect(jsCode).toContain("t('translateSelection')");
  });

  it('CSS にミニアイコンのスタイルが定義されている', () => {
    expect(cssCode).toContain('.dvt-sel-mini-btn');
    // 角丸正方形（白背景 + 軽い影）。border-radius は丸ではなく数 px の角丸
    expect(cssCode).toMatch(/\.dvt-sel-mini-btn[\s\S]{0,600}border-radius:\s*\d+px/);
  });

  it('ホストページの幅指定で横に伸びないよう min/max-width を固定している', () => {
    expect(cssCode).toMatch(/\.dvt-sel-mini-btn[\s\S]{0,800}min-width:\s*28px[\s\S]{0,400}max-width:\s*28px/);
    expect(cssCode).toMatch(/\.dvt-sel-mini-btn[\s\S]{0,800}flex:\s*0\s+0\s+28px/);
  });

  it('CSS にミニアイコン表示アニメーションが定義されている', () => {
    expect(cssCode).toContain('@keyframes dvt-mini-in');
  });

  it('CSS で prefers-reduced-motion 時にアニメーションを抑制している', () => {
    expect(cssCode).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.dvt-sel-mini-btn/);
  });

  it('CSS で :focus-visible のアウトラインが定義されている', () => {
    expect(cssCode).toContain('.dvt-sel-mini-btn:focus-visible');
  });

  it('右クリック時のミニアイコン誤発火を防止している（button !== 0 ガード）', () => {
    expect(jsCode).toMatch(/click[\s\S]{0,200}ev\.button !== 0/);
    expect(jsCode).toMatch(/mousedown[\s\S]{0,200}ev\.button !== 0/);
  });

  it('クリック時に Range から rect を再取得して位置ズレに対応している', () => {
    expect(jsCode).toContain('range.getBoundingClientRect()');
    // 初期化時に1度、クリック時に再取得で計2回以上呼ばれることを確認
    const matches = jsCode.match(/getBoundingClientRect\(\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('アイコン要素に aria-hidden を付与してスクリーンリーダーでの二重読み上げを防いでいる', () => {
    expect(jsCode).toMatch(/iconSpan\.setAttribute\('aria-hidden'|aria-hidden.*true/);
  });

  it('ホストページの SVG 関連 CSS の影響を避けるため絵文字ベースのアイコンを使用している', () => {
    expect(jsCode).toContain('dvt-sel-mini-icon');
    expect(jsCode).toMatch(/textContent\s*=\s*['"]🌐['"]/);
  });

  it('縦方向もビューポート内にクランプしている', () => {
    expect(jsCode).toContain('window.innerHeight');
    expect(jsCode).toMatch(/maxTop|minTop/);
  });
});

// ─── jsdom で実 DOM の挙動を検証する統合テスト ───────────────────────
describe('選択翻訳 — ミニアイコン jsdom 統合', () => {
  beforeAll(() => {
    loadScript('i18n.js', 'content-core.js', 'content-selection.js');
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    if (globalThis.DVT && DVT.state) {
      DVT.state.selectionMiniBtn = null;
      DVT.state.selectionPanel = null;
    }
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  });

  function selectTextOf(node, start, end) {
    const range = document.createRange();
    range.setStart(node.firstChild, start);
    range.setEnd(node.firstChild, end);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  it('テキスト選択直後の mouseup でミニアイコンが生成される', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello world translation';
    document.body.appendChild(p);

    selectTextOf(p, 0, 11); // "Hello world"

    const ev = new MouseEvent('mouseup', { bubbles: true, button: 0 });
    document.dispatchEvent(ev);

    const btn = document.querySelector('.dvt-sel-mini-btn');
    expect(btn).toBeTruthy();
    expect(document.querySelector('.dvt-sel-panel')).toBeNull();
    // ホストページの CSS で消えにくい絵文字ベースのアイコンが入っていること
    const icon = btn.querySelector('.dvt-sel-mini-icon');
    expect(icon).toBeTruthy();
    expect(icon.textContent).toBe('🌐');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('右クリックの mouseup ではミニアイコンが出ない', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello world';
    document.body.appendChild(p);

    selectTextOf(p, 0, 11);
    // button=2 は右クリック
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 }));

    expect(document.querySelector('.dvt-sel-mini-btn')).toBeNull();
  });

  it('1 文字以下の選択ではミニアイコンが出ない', () => {
    const p = document.createElement('p');
    p.textContent = 'x';
    document.body.appendChild(p);

    selectTextOf(p, 0, 1);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    expect(document.querySelector('.dvt-sel-mini-btn')).toBeNull();
  });

  it('Escape キーでミニアイコンが消える', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello world';
    document.body.appendChild(p);

    selectTextOf(p, 0, 11);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    expect(document.querySelector('.dvt-sel-mini-btn')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.dvt-sel-mini-btn')).toBeNull();
  });

  it('連続選択でミニアイコンが置き換わり 1 つだけ残る', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello world translation';
    document.body.appendChild(p);

    selectTextOf(p, 0, 5);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    selectTextOf(p, 6, 11);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    const btns = document.querySelectorAll('.dvt-sel-mini-btn');
    expect(btns.length).toBe(1);
  });

  it('ミニアイコンの aria-label / title が i18n から正しい値で設定される', () => {
    DVT_I18N.setLang('en');
    const p = document.createElement('p');
    p.textContent = 'Hello world';
    document.body.appendChild(p);

    selectTextOf(p, 0, 11);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    const btn = document.querySelector('.dvt-sel-mini-btn');
    expect(btn.getAttribute('aria-label')).toBe('Translate selection');
    expect(btn.getAttribute('title')).toBe('Translate selection');
  });

  it('ミニアイコンをクリックするとフルパネルが展開し、ミニアイコンは消える', () => {
    DVT_I18N.setLang('ja');
    const p = document.createElement('p');
    p.textContent = 'Hello world';
    document.body.appendChild(p);

    selectTextOf(p, 0, 11);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    const btn = document.querySelector('.dvt-sel-mini-btn');
    expect(btn).toBeTruthy();

    // 実 DOM でクリック → showSelectionPanelAtRect が呼ばれフルパネルが生成される
    btn.click();

    expect(document.querySelector('.dvt-sel-mini-btn')).toBeNull();
    const panel = document.querySelector('.dvt-sel-panel');
    expect(panel).toBeTruthy();
    // パネル内に主要な構成要素が揃っていること
    expect(panel.querySelector('.dvt-sel-header')).toBeTruthy();
    expect(panel.querySelector('.dvt-sel-lang')).toBeTruthy();
    expect(panel.querySelector('.dvt-sel-btn')).toBeTruthy();
  });

  it('ミニアイコンをクリックするとパネル展開と同時に翻訳が即時開始される', async () => {
    DVT_I18N.setLang('ja');
    const p = document.createElement('p');
    p.textContent = 'Hello world';
    document.body.appendChild(p);

    // sendMessage の呼び出し回数をリセットして確認できるようにする
    chrome.runtime.sendMessage.mockClear();

    selectTextOf(p, 0, 11);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

    const btn = document.querySelector('.dvt-sel-mini-btn');
    expect(btn).toBeTruthy();

    btn.click();

    const panel = document.querySelector('.dvt-sel-panel');
    expect(panel).toBeTruthy();

    // クリック直後（翻訳非同期待ち）: 翻訳ボタンが disabled になる
    const transBtn = panel.querySelector('.dvt-sel-btn');
    expect(transBtn.disabled).toBe(true);

    // 結果欄がすでに visible になっている
    const result = panel.querySelector('.dvt-sel-result');
    expect(result.style.display).toBe('block');

    // sendMessage が translate アクションで呼ばれている
    const calls = chrome.runtime.sendMessage.mock.calls;
    const translateCall = calls.find(([msg]) => msg?.action === 'translate');
    expect(translateCall).toBeTruthy();

    // 非同期処理完了後: ボタンが再有効化される
    await vi.waitFor(() => !transBtn.disabled);
    expect(transBtn.disabled).toBe(false);
  });

  it('selectionchange イベント経路でもミニアイコンが生成される（iOS Safari 対応の動作保証）', () => {
    vi.useFakeTimers();
    try {
      const p = document.createElement('p');
      p.textContent = 'Hello world';
      document.body.appendChild(p);

      selectTextOf(p, 0, 11);
      // iOS Safari ではテキスト選択完了で selectionchange が発火する。
      // mouseup を発火させずに selectionchange だけを送る → デバウンス後にアイコンが生成されるはず。
      document.dispatchEvent(new Event('selectionchange'));
      // デバウンス完了まで時間を進める
      vi.advanceTimersByTime(300);

      const btn = document.querySelector('.dvt-sel-mini-btn');
      expect(btn).toBeTruthy();
      expect(btn.querySelector('.dvt-sel-mini-icon')?.textContent).toBe('🌐');
    } finally {
      vi.useRealTimers();
    }
  });

  it('selectionchange のデバウンス中は連続発火を 1 回にまとめる', () => {
    vi.useFakeTimers();
    try {
      const p = document.createElement('p');
      p.textContent = 'Hello world translation';
      document.body.appendChild(p);

      selectTextOf(p, 0, 5);
      document.dispatchEvent(new Event('selectionchange'));
      // デバウンス内で再選択 → 旧タイマーがクリアされて新タイマー開始
      vi.advanceTimersByTime(100);
      selectTextOf(p, 6, 11);
      document.dispatchEvent(new Event('selectionchange'));
      vi.advanceTimersByTime(300);

      const btns = document.querySelectorAll('.dvt-sel-mini-btn');
      expect(btns.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('フルパネル展開中は selectionchange を無視してアイコンを再生成しない', () => {
    DVT_I18N.setLang('ja');
    const p = document.createElement('p');
    p.textContent = 'Hello world translation';
    document.body.appendChild(p);

    // 1) 選択 → mouseup でミニアイコン → クリックでフルパネル展開
    selectTextOf(p, 0, 5);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    document.querySelector('.dvt-sel-mini-btn').click();
    expect(document.querySelector('.dvt-sel-panel')).toBeTruthy();

    // 2) パネル展開中に別範囲を選択 → selectionchange
    vi.useFakeTimers();
    try {
      selectTextOf(p, 6, 11);
      document.dispatchEvent(new Event('selectionchange'));
      vi.advanceTimersByTime(300);

      // パネルは閉じず、ミニアイコンも生成されないこと
      expect(document.querySelector('.dvt-sel-panel')).toBeTruthy();
      expect(document.querySelector('.dvt-sel-mini-btn')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Escape は保留中の selectionchange タイマーもキャンセルする', () => {
    vi.useFakeTimers();
    try {
      const p = document.createElement('p');
      p.textContent = 'Hello world';
      document.body.appendChild(p);

      // selectionchange でタイマー予約（まだ満了させない）
      selectTextOf(p, 0, 11);
      document.dispatchEvent(new Event('selectionchange'));
      vi.advanceTimersByTime(100); // 300ms 未満

      // Escape を押す
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      // 残り時間を進めても、Escape でクリアされたタイマーは発火しない
      vi.advanceTimersByTime(500);

      expect(document.querySelector('.dvt-sel-mini-btn')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
