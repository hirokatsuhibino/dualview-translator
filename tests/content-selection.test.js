// content-selection.js のドラッグ移動・リサイズ機能テスト
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
