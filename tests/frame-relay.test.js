// content-core.js の cross-origin iframe メッセージリレー機能のテスト
// （Disqus 等の iframe 内コメント翻訳対応のため追加された機構）
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript } from './helpers.js';

describe('frame relay (postMessage受信)', () => {
  let translatePage, translatePageAndSummarize, undoPageTranslate;

  let enterRegionMode, exitRegionMode;

  beforeAll(() => {
    // DVT_PAGE を事前にモックしておく（content-core.js のガード `typeof DVT_PAGE !== 'undefined'` を通すため）
    translatePage = vi.fn();
    translatePageAndSummarize = vi.fn();
    undoPageTranslate = vi.fn();
    enterRegionMode = vi.fn();
    exitRegionMode = vi.fn();
    globalThis.DVT_PAGE = {
      translatePage,
      translatePageAndSummarize,
      undoPageTranslate,
      enterRegionMode,
      exitRegionMode,
      enterSelectorPickMode: vi.fn(),
      translateElement: vi.fn(),
      translateAndSummarizeElement: vi.fn(),
    };
    loadScript('i18n.js', 'content-core.js');
  });

  beforeEach(() => {
    translatePage.mockClear();
    translatePageAndSummarize.mockClear();
    undoPageTranslate.mockClear();
    enterRegionMode.mockClear();
    exitRegionMode.mockClear();
  });

  function send(data) {
    // jsdom の MessageEvent は source/origin の指定が制限されるため data のみで発火
    window.dispatchEvent(new MessageEvent('message', { data }));
  }

  it('シグネチャ付き translatePage で DVT_PAGE.translatePage が呼ばれる', () => {
    send({ __dvt_relay: true, action: 'translatePage', payload: { lang: 'ja' } });
    expect(translatePage).toHaveBeenCalledWith('ja');
  });

  it('シグネチャ付き translatePageAndSummarize で DVT_PAGE.translatePageAndSummarize が呼ばれる', () => {
    send({ __dvt_relay: true, action: 'translatePageAndSummarize', payload: { lang: 'en' } });
    expect(translatePageAndSummarize).toHaveBeenCalledWith('en');
  });

  it('シグネチャ付き undoPage で DVT_PAGE.undoPageTranslate が呼ばれる', () => {
    send({ __dvt_relay: true, action: 'undoPage' });
    expect(undoPageTranslate).toHaveBeenCalled();
  });

  it('シグネチャ無しメッセージは無視される（外部ページからの模倣を防ぐ）', () => {
    send({ action: 'translatePage', payload: { lang: 'ja' } });
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('シグネチャ偽装でも __dvt_relay が true でなければ無視される', () => {
    send({ __dvt_relay: 'yes', action: 'translatePage', payload: { lang: 'ja' } });
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('シグネチャ付き enterRegionMode で DVT_PAGE.enterRegionMode が呼ばれる', () => {
    send({ __dvt_relay: true, action: 'enterRegionMode', payload: { mode: 'translate' } });
    expect(enterRegionMode).toHaveBeenCalledWith('translate');
  });

  it('シグネチャ付き exitRegionMode で DVT_PAGE.exitRegionMode(true) が呼ばれる（リレー由来）', () => {
    send({ __dvt_relay: true, action: 'exitRegionMode', payload: {} });
    expect(exitRegionMode).toHaveBeenCalledWith(true);
  });

  it('許可リスト外の action は無視される（任意関数の呼び出しを遮断）', () => {
    send({ __dvt_relay: true, action: 'eval', payload: { code: 'alert(1)' } });
    send({ __dvt_relay: true, action: '__proto__' });
    send({ __dvt_relay: true, action: 'enterSelectorPickMode', payload: {} });
    expect(translatePage).not.toHaveBeenCalled();
    expect(translatePageAndSummarize).not.toHaveBeenCalled();
    expect(undoPageTranslate).not.toHaveBeenCalled();
  });

  it('action が文字列以外なら無視される', () => {
    send({ __dvt_relay: true, action: null });
    send({ __dvt_relay: true, action: 123 });
    send({ __dvt_relay: true });
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('togglePageTranslate: pageTranslateActive が false なら translatePage が呼ばれる', () => {
    DVT.state.pageTranslateActive = false;
    send({ __dvt_relay: true, action: 'togglePageTranslate', payload: { lang: 'ja' } });
    expect(translatePage).toHaveBeenCalledWith('ja');
    expect(undoPageTranslate).not.toHaveBeenCalled();
  });

  it('togglePageTranslate: pageTranslateActive が true なら undoPageTranslate が呼ばれる', () => {
    DVT.state.pageTranslateActive = true;
    send({ __dvt_relay: true, action: 'togglePageTranslate', payload: { lang: 'ja' } });
    expect(undoPageTranslate).toHaveBeenCalled();
    expect(translatePage).not.toHaveBeenCalled();
    DVT.state.pageTranslateActive = false;
  });

  it('data が null/非オブジェクトでもクラッシュしない', () => {
    expect(() => send(null)).not.toThrow();
    expect(() => send('string')).not.toThrow();
    expect(() => send(42)).not.toThrow();
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('自フレーム内からの postMessage 偽装は無視される（event.source === window）', () => {
    // 自フレーム送信を再現するため event.source を明示的に window にセット
    const before = translatePage.mock.calls.length;
    window.dispatchEvent(new MessageEvent('message', {
      data: { __dvt_relay: true, action: 'translatePage', payload: { lang: 'ja' } },
      source: window,
    }));
    expect(translatePage.mock.calls.length).toBe(before);
  });

  it('dvt-region-exit イベントで子 iframe に exitRegionMode がブロードキャストされる（トップフレーム）', () => {
    // トップフレーム想定（jsdom では window.top === window.self）。
    // 子 iframe を1つ用意し、contentWindow.postMessage が呼ばれることを検証する。
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const postSpy = vi.fn();
    // contentWindow は read-only なので postMessage だけ差し替え
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      get: () => ({ postMessage: postSpy }),
    });

    document.dispatchEvent(new CustomEvent('dvt-region-exit'));

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ __dvt_relay: true, action: 'exitRegionMode' }),
      '*'
    );
    iframe.remove();
  });
});

describe('manifest.json: Disqus iframe エントリ', () => {
  it('disqus.com/embed/comments/* に all_frames: true で content_scripts が登録されている', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const manifestPath = path.resolve(import.meta.dirname, '..', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const disqus = manifest.content_scripts.find(cs =>
      cs.matches.some(m => m.includes('disqus.com/embed/comments'))
    );
    expect(disqus).toBeDefined();
    expect(disqus.all_frames).toBe(true);
    // iframe 内では翻訳バーや選択翻訳は不要なため i18n / core / page のみ
    expect(disqus.js).toContain('i18n.js');
    expect(disqus.js).toContain('content-core.js');
    expect(disqus.js).toContain('content-page.js');
    expect(disqus.js).not.toContain('content-bar.js');
    expect(disqus.js).not.toContain('content-selection.js');
  });
});
