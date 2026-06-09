// content-core.js の cross-origin iframe メッセージリレー機能のテスト
// （Disqus 等の iframe 内コメント翻訳対応のため追加された機構）
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadScript } from './helpers.js';

let translatePage, translatePageAndSummarize, undoPageTranslate, enterRegionMode, exitRegionMode;

// window.top を差し替えて「トップフレーム」「子iframe」を切り替える。
// content-core.js のハンドラは window.top をメッセージ受信時に live で参照する。
const fakeTop = { postMessage: vi.fn() };
function asIframe() {
  Object.defineProperty(window, 'top', { configurable: true, get: () => fakeTop });
}
function asTop() {
  Object.defineProperty(window, 'top', { configurable: true, get: () => window });
}

// 既定では event.source を null にして「別フレームからの送信」を再現
// （自フレーム送信ガード `event.source === window` を通過させる）
function send(data, source = null) {
  window.dispatchEvent(new MessageEvent('message', { data, source }));
}

beforeAll(() => {
  // DVT_PAGE を事前にモック（content-core.js のガード `typeof DVT_PAGE !== 'undefined'` を通すため）
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
  fakeTop.postMessage.mockClear();
});

afterEach(() => {
  asTop(); // 既定状態に戻す
});

describe('子 iframe: トップからリレーされたアクションを実行', () => {
  beforeEach(() => { asIframe(); });

  it('translatePage で DVT_PAGE.translatePage が呼ばれる', () => {
    send({ __dvt_relay: true, action: 'translatePage', payload: { lang: 'ja' } });
    expect(translatePage).toHaveBeenCalledWith('ja');
  });

  it('translatePageAndSummarize で DVT_PAGE.translatePageAndSummarize が呼ばれる', () => {
    send({ __dvt_relay: true, action: 'translatePageAndSummarize', payload: { lang: 'en' } });
    expect(translatePageAndSummarize).toHaveBeenCalledWith('en');
  });

  it('undoPage で DVT_PAGE.undoPageTranslate が呼ばれる', () => {
    send({ __dvt_relay: true, action: 'undoPage' });
    expect(undoPageTranslate).toHaveBeenCalled();
  });

  it('enterRegionMode で DVT_PAGE.enterRegionMode が呼ばれる', () => {
    send({ __dvt_relay: true, action: 'enterRegionMode', payload: { mode: 'translate' } });
    expect(enterRegionMode).toHaveBeenCalledWith('translate');
  });

  it('exitRegionMode で DVT_PAGE.exitRegionMode(true) が呼ばれる（リレー由来）', () => {
    send({ __dvt_relay: true, action: 'exitRegionMode', payload: {} });
    expect(exitRegionMode).toHaveBeenCalledWith(true);
  });

  it('togglePageTranslate: pageTranslateActive が false なら translatePage', () => {
    DVT.state.pageTranslateActive = false;
    send({ __dvt_relay: true, action: 'togglePageTranslate', payload: { lang: 'ja' } });
    expect(translatePage).toHaveBeenCalledWith('ja');
    expect(undoPageTranslate).not.toHaveBeenCalled();
  });

  it('togglePageTranslate: pageTranslateActive が true なら undoPageTranslate', () => {
    DVT.state.pageTranslateActive = true;
    send({ __dvt_relay: true, action: 'togglePageTranslate', payload: { lang: 'ja' } });
    expect(undoPageTranslate).toHaveBeenCalled();
    expect(translatePage).not.toHaveBeenCalled();
    DVT.state.pageTranslateActive = false;
  });

  it('シグネチャ無しメッセージは無視される', () => {
    send({ action: 'translatePage', payload: { lang: 'ja' } });
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('__dvt_relay が true でなければ無視される', () => {
    send({ __dvt_relay: 'yes', action: 'translatePage', payload: { lang: 'ja' } });
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('許可リスト外の action は無視される（任意関数の呼び出しを遮断）', () => {
    send({ __dvt_relay: true, action: 'eval', payload: { code: 'alert(1)' } });
    send({ __dvt_relay: true, action: '__proto__' });
    send({ __dvt_relay: true, action: 'enterSelectorPickMode', payload: {} });
    expect(translatePage).not.toHaveBeenCalled();
    expect(translatePageAndSummarize).not.toHaveBeenCalled();
    expect(undoPageTranslate).not.toHaveBeenCalled();
    expect(enterRegionMode).not.toHaveBeenCalled();
  });

  it('action が文字列以外なら無視される', () => {
    send({ __dvt_relay: true, action: null });
    send({ __dvt_relay: true, action: 123 });
    send({ __dvt_relay: true });
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('自フレーム内からの postMessage 偽装は無視される（event.source === window）', () => {
    send({ __dvt_relay: true, action: 'translatePage', payload: { lang: 'ja' } }, window);
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('data が null/非オブジェクトでもクラッシュしない', () => {
    expect(() => send(null)).not.toThrow();
    expect(() => send('string')).not.toThrow();
    expect(() => send(42)).not.toThrow();
    expect(translatePage).not.toHaveBeenCalled();
  });
});

describe('トップフレーム: postMessage 由来の翻訳アクションは実行しない（セキュリティ）', () => {
  beforeEach(() => { asTop(); });

  it('子 iframe からの translatePage を実行しない（任意ページからの操作を遮断）', () => {
    // ホストページが作った子 iframe からトップへ postMessage する攻撃を想定。
    // event.source は別 window なので source ガードは通過するが、トップでは実行しない。
    send({ __dvt_relay: true, action: 'translatePage', payload: { lang: 'ja' } }, { postMessage: vi.fn() });
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('子 iframe からの enterRegionMode / undoPage も実行しない', () => {
    send({ __dvt_relay: true, action: 'enterRegionMode', payload: { mode: 'translate' } }, { postMessage: vi.fn() });
    send({ __dvt_relay: true, action: 'undoPage' }, { postMessage: vi.fn() });
    expect(enterRegionMode).not.toHaveBeenCalled();
    expect(undoPageTranslate).not.toHaveBeenCalled();
  });

  it('__dvtReady: ページ翻訳がアクティブなら送信元に現状態を返す', () => {
    DVT.state.pageTranslateActive = true;
    DVT.state.targetLang = 'ja';
    const source = { postMessage: vi.fn() };
    send({ __dvt_relay: true, action: '__dvtReady' }, source);
    expect(source.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ __dvt_relay: true, action: 'translatePage', payload: { lang: 'ja' } }),
      '*'
    );
    DVT.state.pageTranslateActive = false;
  });

  it('__dvtReady: ページ翻訳が非アクティブなら何も返さない', () => {
    DVT.state.pageTranslateActive = false;
    const source = { postMessage: vi.fn() };
    send({ __dvt_relay: true, action: '__dvtReady' }, source);
    expect(source.postMessage).not.toHaveBeenCalled();
  });
});

describe('dvt-region-exit ブロードキャスト', () => {
  it('トップフレーム: 子 iframe に exitRegionMode がブロードキャストされる', () => {
    asTop();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const postSpy = vi.fn();
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

  it('子 iframe: window.top に __dvtRegionExitBroadcast を送る', () => {
    asIframe();
    document.dispatchEvent(new CustomEvent('dvt-region-exit'));
    expect(fakeTop.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ __dvt_relay: true, action: '__dvtRegionExitBroadcast' }),
      '*'
    );
  });
});

describe('manifest.json: content_scripts エントリ', () => {
  let manifest;
  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const manifestPath = path.resolve(import.meta.dirname, '..', 'manifest.json');
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  });

  it('disqus.com/embed/comments/* に all_frames: true で登録されている', () => {
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

  it('<all_urls> エントリは Disqus embed を exclude_matches で除外している（二重注入防止）', () => {
    const allUrls = manifest.content_scripts.find(cs => cs.matches.includes('<all_urls>'));
    expect(allUrls).toBeDefined();
    expect(allUrls.exclude_matches || []).toContain('https://disqus.com/embed/comments/*');
  });
});
