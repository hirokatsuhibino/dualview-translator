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
