// content-core.js のユニットテスト（純粋関数 + DOMロジック）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers.js';

describe('DVT (content-core)', () => {
  beforeAll(() => {
    loadScript('i18n.js', 'content-core.js');
  });

  describe('escapeHtml()', () => {
    it('< を &lt; にエスケープ', () => {
      expect(DVT.escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('& を &amp; にエスケープ', () => {
      expect(DVT.escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('" を &quot; にエスケープ', () => {
      expect(DVT.escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('XSS攻撃文字列をエスケープ', () => {
      const result = DVT.escapeHtml('<script>alert("xss")</script>');
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('通常テキストはそのまま', () => {
      expect(DVT.escapeHtml('Hello World')).toBe('Hello World');
    });

    it('空文字はそのまま', () => {
      expect(DVT.escapeHtml('')).toBe('');
    });
  });

  describe('langMatches()', () => {
    it('同一言語コードはマッチ', () => {
      expect(DVT.langMatches('ja', 'ja')).toBe(true);
    });

    it('大文字小文字は無視', () => {
      expect(DVT.langMatches('EN', 'en')).toBe(true);
    });

    it('サブタグは無視してベース言語で比較', () => {
      expect(DVT.langMatches('en-US', 'en')).toBe(true);
      expect(DVT.langMatches('en', 'en-US')).toBe(true);
    });

    it('zh-CN と zh-TW はマッチ（ベース言語zhで比較）', () => {
      expect(DVT.langMatches('zh-CN', 'zh-TW')).toBe(true);
    });

    it('異なる言語はマッチしない', () => {
      expect(DVT.langMatches('ja', 'en')).toBe(false);
    });

    it('detected が null の場合は false', () => {
      expect(DVT.langMatches(null, 'ja')).toBe(false);
    });

    it('detected が undefined の場合は false', () => {
      expect(DVT.langMatches(undefined, 'ja')).toBe(false);
    });

    it('detected が空文字の場合は false', () => {
      expect(DVT.langMatches('', 'ja')).toBe(false);
    });
  });

  describe('getLangDisplayName()', () => {
    it('ja → 日本語', () => {
      expect(DVT.getLangDisplayName('ja')).toBe('日本語');
    });

    it('en → English', () => {
      expect(DVT.getLangDisplayName('en')).toBe('English');
    });

    it('大文字でも正しく取得', () => {
      expect(DVT.getLangDisplayName('JA')).toBe('日本語');
    });

    it('サブタグ付きでも取得可能', () => {
      expect(DVT.getLangDisplayName('en-US')).toBe('English');
    });

    it('未知の言語コードはそのまま返す', () => {
      expect(DVT.getLangDisplayName('xx')).toBe('xx');
    });

    it('null は Unknown を返す', () => {
      expect(DVT.getLangDisplayName(null)).toBe('Unknown');
    });
  });
});
