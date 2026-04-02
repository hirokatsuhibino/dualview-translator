// content-bar.js の自動翻訳ルール機能テスト
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadScript } from './helpers.js';

describe('DVT_BAR.matchesUrlPattern', () => {
  beforeEach(() => {
    loadScript('i18n.js');
    // DVT_PAGEのモック
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn(),
      translateAndSummarizeClickedElement: vi.fn(),
    };
    // DVT のモック
    globalThis.DVT = {
      state: { targetLang: 'ja', pageTranslateActive: false },
    };
    loadScript('content-bar.js');
  });

  it('完全一致パターンにマッチする', () => {
    expect(DVT_BAR.matchesUrlPattern('https://example.com/page', 'https://example.com/page')).toBe(true);
  });

  it('ワイルドカード * でマッチする', () => {
    expect(DVT_BAR.matchesUrlPattern('https://example.com/foo', '*://example.com/*')).toBe(true);
  });

  it('スキームのワイルドカードが機能する', () => {
    expect(DVT_BAR.matchesUrlPattern('http://example.com/foo', '*://example.com/*')).toBe(true);
    expect(DVT_BAR.matchesUrlPattern('https://example.com/foo', '*://example.com/*')).toBe(true);
  });

  it('パターンにマッチしないURLはfalseを返す', () => {
    expect(DVT_BAR.matchesUrlPattern('https://other.com/page', '*://example.com/*')).toBe(false);
  });

  it('複数の * が機能する', () => {
    expect(DVT_BAR.matchesUrlPattern('https://github.com/user/repo/issues/1', '*://github.com/*/issues/*')).toBe(true);
    expect(DVT_BAR.matchesUrlPattern('https://github.com/user/repo/pulls/1', '*://github.com/*/issues/*')).toBe(false);
  });

  it('正規表現の特殊文字をエスケープする', () => {
    expect(DVT_BAR.matchesUrlPattern('https://example.com/path.html', '*://example.com/path.html')).toBe(true);
    // ドットがワイルドカードにならないことを確認
    expect(DVT_BAR.matchesUrlPattern('https://example.com/pathXhtml', '*://example.com/path.html')).toBe(false);
  });
});

describe('DVT_BAR.checkAutoRules', () => {
  beforeEach(() => {
    loadScript('i18n.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn(),
      translateAndSummarizeClickedElement: vi.fn(),
    };
    globalThis.DVT = {
      state: { targetLang: 'ja', pageTranslateActive: false },
    };
    // location.href のモック
    Object.defineProperty(globalThis, 'location', {
      value: { href: 'https://example.com/page' },
      writable: true,
      configurable: true,
    });
    loadScript('content-bar.js');
  });

  it('マッチするルールがない場合はfalseを返す', async () => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({ autoRules: [] }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(false);
  });

  it('無効なルールはスキップする', async () => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: '', mode: 'translate', enabled: false }]
    }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(false);
    expect(DVT_PAGE.translatePage).not.toHaveBeenCalled();
  });

  it('マッチするルールがある場合はページ全体を翻訳してtrueを返す', async () => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: '', mode: 'translate', enabled: true }]
    }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(true);
    expect(DVT_PAGE.translatePage).toHaveBeenCalledWith('ja');
  });

  it('モードがsummarizeの場合は翻訳＆要約を実行する', async () => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: '', mode: 'summarize', enabled: true }]
    }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(true);
    expect(DVT_PAGE.translatePageAndSummarize).toHaveBeenCalledWith('ja');
  });

  it('セレクタが指定されている場合は要素翻訳を実行する', async () => {
    const mockEl = document.createElement('div');
    const origQS = document.querySelector.bind(document);
    document.querySelector = vi.fn().mockReturnValue(mockEl);
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: 'div.content', mode: 'translate', enabled: true }]
    }));
    const result = await DVT_BAR.checkAutoRules();
    document.querySelector = origQS; // モックを復元
    expect(result).toBe(true);
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(mockEl);
  });

  it('セレクタが指定されているがDOM上に存在しない場合はタイムアウト後にfalseを返す', async () => {
    vi.useFakeTimers();
    const origQS = document.querySelector.bind(document);
    document.querySelector = vi.fn().mockReturnValue(null);
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: 'div.not-exist', mode: 'translate', enabled: true }]
    }));
    const promise = DVT_BAR.checkAutoRules();
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(false);
    document.querySelector = origQS;
    vi.useRealTimers();
  });
});

describe('DVT_BAR.waitForElement', () => {
  beforeEach(() => {
    loadScript('i18n.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn(),
      translateAndSummarizeClickedElement: vi.fn(),
    };
    globalThis.DVT = { state: { targetLang: 'ja' } };
    loadScript('content-bar.js');
  });

  it('既に存在する要素はすぐに返す', async () => {
    const el = document.createElement('div');
    el.className = 'dvt-test-existing';
    document.body.appendChild(el);
    const result = await DVT_BAR.waitForElement('.dvt-test-existing');
    expect(result).toBe(el);
    el.remove();
  });

  it('後から追加された要素をMutationObserverで検出する', async () => {
    const promise = DVT_BAR.waitForElement('.dvt-test-dynamic');
    // MutationObserver が検出できるよう要素を追加
    const el = document.createElement('div');
    el.className = 'dvt-test-dynamic';
    document.body.appendChild(el);
    const result = await promise;
    expect(result).not.toBeNull();
    el.remove();
  });

  it('タイムアウト後にnullを返す', async () => {
    vi.useFakeTimers();
    const promise = DVT_BAR.waitForElement('.dvt-test-timeout', 500);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeNull();
    vi.useRealTimers();
  });
});
