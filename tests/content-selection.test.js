// content-selection.js のドラッグ移動・リサイズ機能テスト
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
    expect(jsCode).toContain('showSelectionPanelAtRect(rect, text)');
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
    expect(cssCode).toContain('border-radius: 50%');
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

  it('SVG に aria-hidden を付与してスクリーンリーダーでの二重読み上げを防いでいる', () => {
    expect(jsCode).toMatch(/svg\.setAttribute\('aria-hidden'/);
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
});
