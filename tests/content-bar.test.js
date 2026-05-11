// content-bar.js の自動翻訳ルール機能テスト
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  // querySelectorのモック管理（テスト間の汚染を防ぐためafterEachで復元）
  const qs = { orig: null };
  beforeEach(() => {
    qs.orig = document.querySelector.bind(document);
    loadScript('i18n.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      // Promise を返すようにモック（fn(el).then() に対応）
      translateClickedElement: vi.fn().mockResolvedValue(undefined),
      translateAndSummarizeClickedElement: vi.fn().mockResolvedValue(undefined),
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

  afterEach(() => {
    document.querySelector = qs.orig;
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
    document.querySelector = vi.fn().mockReturnValue(mockEl);
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: 'div.content', mode: 'translate', enabled: true }]
    }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(true);
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(mockEl);
  });

  it('セレクタが指定されているがDOM上に存在しない場合はタイムアウト後にfalseを返す', async () => {
    vi.useFakeTimers();
    document.querySelector = vi.fn().mockReturnValue(null);
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: 'div.not-exist', mode: 'translate', enabled: true }]
    }));
    const promise = DVT_BAR.checkAutoRules();
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(false);
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

describe('DVT_BAR.startAutoRuleObserver', () => {
  beforeEach(() => {
    loadScript('i18n.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn().mockResolvedValue(undefined),
      translateAndSummarizeClickedElement: vi.fn().mockResolvedValue(undefined),
    };
    globalThis.DVT = { state: { targetLang: 'ja' } };
    loadScript('content-bar.js');
  });

  it('startAutoRuleObserverが存在する', () => {
    expect(typeof DVT_BAR.startAutoRuleObserver).toBe('function');
  });

  it('コンテンツ変更時に再翻訳を呼び出す', async () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    el.innerHTML = '<p>original</p>';
    document.body.appendChild(el);
    const rule = { mode: 'translate', selector: 'div' };

    DVT_BAR.startAutoRuleObserver(el, rule);

    // 外部からのコンテンツ書き換えをシミュレート
    el.innerHTML = '<p>new content</p>';

    // デバウンス（500ms）を経過させる
    await vi.runAllTimersAsync();

    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(el);
    el.remove();
    vi.useRealTimers();
  });
});

// 回帰防止: issue #195 — <html lang="null"> のサイトで翻訳バーに "null" と表示された
describe('DVT_BAR.detectPageLanguage — 不正な <html lang> 値の除外', () => {
  beforeEach(() => {
    // 本物の DVT / i18n をロード（モック DVT では isValidLangCode が無いため）
    loadScript('i18n.js', 'content-core.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn(),
      translateAndSummarizeClickedElement: vi.fn(),
    };
    DVT.state.targetLang = 'ja';
    DVT.state.translateBar = null;
    // ストレージ・API モック（showTranslateBar 内部の chrome.storage.local.get と detectLang 呼び出し）
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({}));
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: false }));
    // body は短文にして API 検出経路が early return する状態にする
    document.body.innerHTML = '<p>short</p>';
    loadScript('content-bar.js');
  });

  afterEach(() => {
    // バー残骸を片付けて他テストへの汚染を防ぐ
    document.querySelectorAll('.dvt-translate-bar').forEach(el => el.remove());
    document.documentElement.lang = '';
    document.body.innerHTML = '';
    DVT.state.translateBar = null;
  });

  it('<html lang="null"> ではバーが表示されない', async () => {
    document.documentElement.lang = 'null';
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });

  it('<html lang="und"> ではバーが表示されない', async () => {
    document.documentElement.lang = 'und';
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });

  it('<html lang="unknown"> ではバーが表示されない', async () => {
    document.documentElement.lang = 'unknown';
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });

  it('<html lang="undefined"> ではバーが表示されない', async () => {
    document.documentElement.lang = 'undefined';
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });

  it('<html lang="en"> でターゲットが ja のときバーが表示される（回帰検知）', async () => {
    document.documentElement.lang = 'en';
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    // 表示テキストに 'null' / 'undefined' が含まれていないこと
    const text = bar.textContent;
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
    // 言語名（"English"）が埋め込まれていること
    expect(text).toContain('English');
  });

  it('API 検出結果が "null" 文字列でもバーが表示されない', async () => {
    // <html lang> 無し → API 検出に進む。長文を用意して API 経路を発火させる
    document.documentElement.lang = '';
    document.body.innerHTML = '<p>' + 'a'.repeat(200) + '</p>';
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: true, detectedLang: 'null' }));
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });
});

describe('翻訳バー — APIキー未設定時のボタン非表示', () => {
  // showTranslateBar はIIFE内部関数で直接テストできないため、
  // コードの静的検証でAPIキーチェックの存在を確認する。
  it('content-bar.js にLLM APIキーチェックが含まれる', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const code = readFileSync(resolve(__dirname, '..', 'content-bar.js'), 'utf-8');
    expect(code).toContain('claudeApiKey');
    expect(code).toContain('geminiApiKey');
    expect(code).toContain("style.display = 'none'");
  });

  it('content-bar.js にDeepL APIキーチェックが含まれる', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const code = readFileSync(resolve(__dirname, '..', 'content-bar.js'), 'utf-8');
    expect(code).toContain('translateEngine');
    expect(code).toContain('deeplApiKey');
    // DeepL未設定時に翻訳ボタンも非表示にするロジックが存在
    expect(code).toContain('dvt-translate-bar-accept');
  });
});
