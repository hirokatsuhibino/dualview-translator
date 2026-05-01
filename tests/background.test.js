// background.js のユニットテスト（純粋関数のみ）
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// background.jsはService Worker用なのでtop-levelでchrome APIを呼ぶ
// テスト対象の純粋関数だけ抽出してevalする
let getDeepLEndpoint;
let splitIntoChunks;
let getMenuTitles;
let hasLLMApiKey;
let isTranslateAvailable;
let testApiKey;
let isNetworkError;

beforeAll(() => {
  const code = readFileSync(resolve(import.meta.dirname, '..', 'background.js'), 'utf-8');

  // getDeepLEndpoint を抽出
  const deepLMatch = code.match(/function getDeepLEndpoint\(apiKey\)\s*\{[\s\S]*?\n\}/);
  if (deepLMatch) getDeepLEndpoint = new Function('apiKey', deepLMatch[0].replace(/^function.*?\{/, '').replace(/\}$/, ''));

  // splitIntoChunks を抽出
  const chunksMatch = code.match(/function splitIntoChunks\(text, maxLen\)\s*\{[\s\S]*?\n\}/);
  if (chunksMatch) splitIntoChunks = new Function('text', 'maxLen', chunksMatch[0].replace(/^function.*?\{/, '').replace(/\}$/, ''));

  // getMenuTitles を抽出（CONTEXT_MENU_TITLES も含む）
  const titlesMatch = code.match(/const CONTEXT_MENU_TITLES[\s\S]*?function getMenuTitles\(lang\)\s*\{[\s\S]*?\n\}/);
  if (titlesMatch) {
    const fn = new Function(titlesMatch[0] + '\n return getMenuTitles;');
    getMenuTitles = fn();
  }

  // hasLLMApiKey を抽出
  const hasKeyMatch = code.match(/function hasLLMApiKey\(data\)\s*\{[\s\S]*?\n\}/);
  if (hasKeyMatch) hasLLMApiKey = new Function('data', hasKeyMatch[0].replace(/^function.*?\{/, '').replace(/\}$/, ''));

  // isTranslateAvailable を抽出（ENGINES 定数を参照するので一緒に eval する）。
  // どちらかの正規表現が match 失敗するとテスト全体が無音で壊れるため fail-fast にする。
  const enginesMatch = code.match(/const\s+ENGINES\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/);
  const translateMatch = code.match(/function\s+isTranslateAvailable\s*\(data\)\s*\{[\s\S]*?\n\}/);
  if (!enginesMatch) throw new Error('background.test.js: ENGINES 定数の正規表現抽出に失敗（background.js のフォーマット変更を確認）');
  if (!translateMatch) throw new Error('background.test.js: isTranslateAvailable の正規表現抽出に失敗（background.js のフォーマット変更を確認）');
  const combined = `${enginesMatch[0]}\n${translateMatch[0]}\nreturn isTranslateAvailable;`;
  isTranslateAvailable = new Function(combined)();

  // isNetworkError を抽出
  const networkErrorMatch = code.match(/function isNetworkError\(err\)\s*\{[\s\S]*?\n\}/);
  if (networkErrorMatch) isNetworkError = new Function('err', networkErrorMatch[0].replace(/^function.*?\{/, '').replace(/\}$/, ''));

  // testApiKey を抽出（getDeepLEndpointに依存するため一緒にeval）
  const testApiKeyMatch = code.match(/async function testApiKey\(engine, apiKey\)\s*\{[\s\S]*?\n\}/);
  if (testApiKeyMatch && deepLMatch) {
    const combined = deepLMatch[0] + '\n' + testApiKeyMatch[0] + '\n return testApiKey;';
    testApiKey = new Function('fetch', combined)();
  }
});

describe('getDeepLEndpoint()', () => {
  it(':fx で終わるキーはFree APIを返す', () => {
    const result = getDeepLEndpoint('abc123:fx');
    expect(result).toBe('https://api-free.deepl.com/v2/translate');
  });

  it(':fx で終わらないキーはPro APIを返す', () => {
    const result = getDeepLEndpoint('abc123');
    expect(result).toBe('https://api.deepl.com/v2/translate');
  });

  it('空文字はPro APIを返す', () => {
    const result = getDeepLEndpoint('');
    expect(result).toBe('https://api.deepl.com/v2/translate');
  });
});

describe('splitIntoChunks()', () => {
  it('短いテキストは分割しない', () => {
    const result = splitIntoChunks('Hello world', 4500);
    expect(result).toEqual(['Hello world']);
  });

  it('最大長ちょうどは分割しない', () => {
    const text = 'a'.repeat(4500);
    const result = splitIntoChunks(text, 4500);
    expect(result).toEqual([text]);
  });

  it('最大長を超えるテキストは分割される', () => {
    const text = 'a'.repeat(9000);
    const result = splitIntoChunks(text, 4500);
    expect(result.length).toBe(2);
    expect(result.join('')).toBe(text);
  });

  it('ピリオド+スペースの位置で分割される', () => {
    // 「. 」をチャンク境界付近に配置
    const sentence1 = 'a'.repeat(4000) + '. ';
    const sentence2 = 'b'.repeat(3000);
    const text = sentence1 + sentence2;
    const result = splitIntoChunks(text, 4500);
    expect(result.length).toBe(2);
    // 最初のチャンクはピリオドの位置で分割される
    expect(result[0].endsWith('.')).toBe(true);
  });

  it('空文字は1要素の配列を返す', () => {
    const result = splitIntoChunks('', 4500);
    expect(result).toEqual(['']);
  });

  it('分割されたチャンクを結合すると元のテキストに戻る', () => {
    const text = 'Hello. World. This is a test. '.repeat(200);
    const result = splitIntoChunks(text, 100);
    expect(result.join('')).toBe(text);
  });
});

describe('getMenuTitles()', () => {
  it('日本語のメニュータイトルを取得', () => {
    const titles = getMenuTitles('ja');
    expect(titles.selection).toContain('翻訳');
    expect(titles.element).toContain('この要素を翻訳');
    expect(titles.elementSummary).toContain('翻訳＆要約');
  });

  it('英語のメニュータイトルを取得', () => {
    const titles = getMenuTitles('en');
    expect(titles.selection).toContain('Translate');
    expect(titles.element).toContain('Translate this element');
  });

  it('未サポート言語は英語にフォールバック', () => {
    const titles = getMenuTitles('xx-unknown');
    expect(titles).toEqual(getMenuTitles('en'));
  });

  it('全11言語でselection/element/elementSummaryが存在', () => {
    const langs = ['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar'];
    for (const lang of langs) {
      const titles = getMenuTitles(lang);
      expect(titles.selection, `${lang}.selection`).toBeTruthy();
      expect(titles.element, `${lang}.element`).toBeTruthy();
      expect(titles.elementSummary, `${lang}.elementSummary`).toBeTruthy();
    }
  });
});

describe('hasLLMApiKey()', () => {
  it('claudeApiKeyのみ設定されている場合はtrue', () => {
    expect(hasLLMApiKey({ claudeApiKey: 'sk-test', geminiApiKey: '' })).toBe(true);
  });

  it('geminiApiKeyのみ設定されている場合はtrue', () => {
    expect(hasLLMApiKey({ claudeApiKey: '', geminiApiKey: 'ai-test' })).toBe(true);
  });

  it('両方設定されている場合はtrue', () => {
    expect(hasLLMApiKey({ claudeApiKey: 'sk-test', geminiApiKey: 'ai-test' })).toBe(true);
  });

  it('両方未設定の場合はfalse', () => {
    expect(hasLLMApiKey({ claudeApiKey: '', geminiApiKey: '' })).toBe(false);
  });

  it('undefinedの場合はfalse', () => {
    expect(hasLLMApiKey({})).toBe(false);
  });
});

describe('isTranslateAvailable()', () => {
  it('Google翻訳選択時はAPIキー不要でtrue', () => {
    expect(isTranslateAvailable({ translateEngine: 'google' })).toBe(true);
  });

  it('エンジン未指定（デフォルト）はtrue', () => {
    expect(isTranslateAvailable({})).toBe(true);
  });

  it('DeepL選択＋APIキーありはtrue', () => {
    expect(isTranslateAvailable({ translateEngine: 'deepl', deeplApiKey: 'test-key' })).toBe(true);
  });

  it('DeepL選択＋APIキーなしはfalse', () => {
    expect(isTranslateAvailable({ translateEngine: 'deepl', deeplApiKey: '' })).toBe(false);
  });

  it('DeepL選択＋APIキーundefinedはfalse', () => {
    expect(isTranslateAvailable({ translateEngine: 'deepl' })).toBe(false);
  });

  it('Apple選択＋appleAvailable=trueはtrue（Safari環境）', () => {
    expect(isTranslateAvailable({ translateEngine: 'apple', appleAvailable: true })).toBe(true);
  });

  it('Apple選択＋appleAvailable=falseはfalse（Chrome / Firefox）', () => {
    expect(isTranslateAvailable({ translateEngine: 'apple', appleAvailable: false })).toBe(false);
  });

  it('Apple選択＋appleAvailable未定義はfalse（未検出）', () => {
    expect(isTranslateAvailable({ translateEngine: 'apple' })).toBe(false);
  });

  it('Apple選択＋appleAvailable=undefined（chrome.storage.local.getに含まれていなかった）はfalse', () => {
    // PR #152 レビュー指摘 #1 のリグレッションガード:
    // chrome.storage.local.get の取得キーから appleAvailable が漏れた場合、data が
    // { translateEngine: 'apple' } のみでも安全側（false）に倒す
    expect(isTranslateAvailable({ translateEngine: 'apple', deeplApiKey: 'x' })).toBe(false);
  });
});

describe('mapWithConcurrency()', () => {
  // Issue #173: fetchChunkedWithCache の並列度制御コア。Promise.all は無制限なので
  // レート対策のために自作した。順序保持と並列度上限の両方を保証する必要がある。
  let mapWithConcurrency;
  beforeAll(() => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const code = readFileSync(resolve(import.meta.dirname, '..', 'background.js'), 'utf-8');
    const m = code.match(/async function mapWithConcurrency\(items, concurrency, fn\)\s*\{[\s\S]*?\n\}/);
    if (!m) throw new Error('mapWithConcurrency の正規表現抽出に失敗');
    mapWithConcurrency = new Function(`${m[0]}\nreturn mapWithConcurrency;`)();
  });

  it('入力順を保持して結果を返す', async () => {
    const items = [10, 20, 30, 40, 50];
    const result = await mapWithConcurrency(items, 2, async (n) => n * 2);
    expect(result).toEqual([20, 40, 60, 80, 100]);
  });

  it('並列度を超えて同時実行しない', async () => {
    const items = [1, 2, 3, 4, 5, 6];
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency(items, 2, async () => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      // microtask 1 つ進めて他のワーカーが起動できる隙を作る
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight--;
    });
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBeGreaterThan(0);
  });

  it('items.length < concurrency でも全件処理される', async () => {
    const result = await mapWithConcurrency([1, 2], 10, async (n) => n + 100);
    expect(result).toEqual([101, 102]);
  });

  it('空配列はすぐに空配列を返す', async () => {
    const result = await mapWithConcurrency([], 4, async (n) => n);
    expect(result).toEqual([]);
  });
});

describe('isNetworkError()', () => {
  it('TypeError + "Failed to fetch" は network error 扱い（fetch ネットワーク不通の典型）', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('TypeError + "Network request failed" は network error', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
  });

  it('TypeError + "Load failed" (Safari) は network error', () => {
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true);
  });

  it('Error（非TypeError）は network error ではない（コードバグ隠蔽防止）', () => {
    // PR #153 レビュー指摘 #1 — fetch 以外のエラーまで apple フォールバックで
    // 隠蔽してしまう問題への対処。TypeError 以外は明示的に false にする。
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(false);
    expect(isNetworkError(new Error('Network request failed'))).toBe(false);
    expect(isNetworkError(new Error('Load failed'))).toBe(false);
  });

  it('TypeError でもネットワーク系メッセージでなければ false（実装バグの隠蔽防止）', () => {
    expect(isNetworkError(new TypeError("Cannot read property 'x' of undefined"))).toBe(false);
  });

  it('HTTP 4xx/5xx 系のメッセージは network error ではない', () => {
    expect(isNetworkError(new Error('Google HTTP 503'))).toBe(false);
    expect(isNetworkError(new Error('DeepL HTTP 403'))).toBe(false);
  });

  it('null / undefined は false', () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });

  it('メッセージなしの TypeError は false', () => {
    expect(isNetworkError(new TypeError())).toBe(false);
  });
});

describe('testApiKey()', () => {
  it('APIキーが空の場合はエラー', async () => {
    await expect(testApiKey('deepl', '')).rejects.toThrow('APIキーが入力されていません');
  });

  it('APIキーがundefinedの場合はエラー', async () => {
    await expect(testApiKey('claude', undefined)).rejects.toThrow('APIキーが入力されていません');
  });

  it('不明なエンジンの場合はエラー', async () => {
    const mockFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    await expect(testApiKey('unknown', 'test-key')).rejects.toThrow('不明なエンジン: unknown');
  });

  it('DeepL成功時はresolve', async () => {
    const mockFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    const fn = new Function('fetch', `
      function getDeepLEndpoint(apiKey) {
        return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
      }
      async function testApiKey(engine, apiKey) {
        if (!apiKey) throw new Error('APIキーが入力されていません');
        if (engine === 'deepl') {
          const endpoint = getDeepLEndpoint(apiKey);
          const res = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': 'DeepL-Auth-Key ' + apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: ['test'], target_lang: 'JA' }) });
          if (!res.ok) { if (res.status === 403) throw new Error('APIキーが無効です'); throw new Error('HTTP ' + res.status); }
          return;
        }
        throw new Error('不明なエンジン: ' + engine);
      }
      return testApiKey;
    `)(mockFetch);
    await expect(fn('deepl', 'valid-key')).resolves.toBeUndefined();
  });

  it('DeepL 403エラー時はreject', async () => {
    const mockFetch = () => Promise.resolve({ ok: false, status: 403 });
    const fn = new Function('fetch', `
      function getDeepLEndpoint(apiKey) {
        return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
      }
      async function testApiKey(engine, apiKey) {
        if (!apiKey) throw new Error('APIキーが入力されていません');
        if (engine === 'deepl') {
          const endpoint = getDeepLEndpoint(apiKey);
          const res = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': 'DeepL-Auth-Key ' + apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: ['test'], target_lang: 'JA' }) });
          if (!res.ok) { if (res.status === 403) throw new Error('APIキーが無効です'); throw new Error('HTTP ' + res.status); }
          return;
        }
        throw new Error('不明なエンジン: ' + engine);
      }
      return testApiKey;
    `)(mockFetch);
    await expect(fn('deepl', 'invalid-key')).rejects.toThrow('APIキーが無効です');
  });
});
