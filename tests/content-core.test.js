// content-core.js のユニットテスト（純粋関数 + DOMロジック）
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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

    // 回帰防止: issue #195 — <html lang="null"> のサイトで翻訳バーに "null" と表示された
    it('文字列 "null" は Unknown を返す', () => {
      expect(DVT.getLangDisplayName('null')).toBe('Unknown');
    });

    it('文字列 "undefined" は Unknown を返す', () => {
      expect(DVT.getLangDisplayName('undefined')).toBe('Unknown');
    });

    it('BCP 47 の "und"（未定義）は Unknown を返す', () => {
      expect(DVT.getLangDisplayName('und')).toBe('Unknown');
    });

    it('"unknown" / "x-unknown" は Unknown を返す', () => {
      expect(DVT.getLangDisplayName('unknown')).toBe('Unknown');
      expect(DVT.getLangDisplayName('x-unknown')).toBe('Unknown');
    });

    it('空文字や空白のみは Unknown を返す', () => {
      expect(DVT.getLangDisplayName('')).toBe('Unknown');
      expect(DVT.getLangDisplayName('   ')).toBe('Unknown');
    });

    it('大文字混じりの不正コード（"NULL"）も Unknown を返す', () => {
      expect(DVT.getLangDisplayName('NULL')).toBe('Unknown');
    });
  });

  describe('isValidLangCode()', () => {
    it('通常の言語コードは true', () => {
      expect(DVT.isValidLangCode('ja')).toBe(true);
      expect(DVT.isValidLangCode('en-US')).toBe(true);
      expect(DVT.isValidLangCode('zh-CN')).toBe(true);
    });

    it('未知の言語コードも形式的には true', () => {
      // 未知のコードは Unknown 表示には落とさないが、langMatches などには通す
      expect(DVT.isValidLangCode('xx')).toBe(true);
    });

    it('null / undefined / 空文字は false', () => {
      expect(DVT.isValidLangCode(null)).toBe(false);
      expect(DVT.isValidLangCode(undefined)).toBe(false);
      expect(DVT.isValidLangCode('')).toBe(false);
      expect(DVT.isValidLangCode('   ')).toBe(false);
    });

    it('"null" / "undefined" / "und" / "unknown" / "x-unknown" は false', () => {
      expect(DVT.isValidLangCode('null')).toBe(false);
      expect(DVT.isValidLangCode('undefined')).toBe(false);
      expect(DVT.isValidLangCode('und')).toBe(false);
      expect(DVT.isValidLangCode('unknown')).toBe(false);
      expect(DVT.isValidLangCode('x-unknown')).toBe(false);
    });

    it('大文字小文字を区別しない', () => {
      expect(DVT.isValidLangCode('NULL')).toBe(false);
      expect(DVT.isValidLangCode('Und')).toBe(false);
    });
  });

  describe('translate() — オフラインフォールバック通知', () => {
    let originalSendMessage;
    beforeEach(() => {
      originalSendMessage = chrome.runtime.sendMessage;
      // ページ life cycle 内 1 度だけ表示するフラグをリセット
      DVT.state.fallbackToastShown = false;
      // 既存のトースト要素をクリア
      document.querySelectorAll('.dvt-toast').forEach(el => el.remove());
      // showToast 内の setTimeout(5000) が他テストに残らないよう fake timers を使う
      vi.useFakeTimers();
    });

    afterEach(() => {
      chrome.runtime.sendMessage = originalSendMessage;
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('result.fallback が true のとき .dvt-toast が DOM に追加される', async () => {
      chrome.runtime.sendMessage = (_msg, cb) => {
        cb({ ok: true, result: { text: 'こんにちは', detectedLang: 'en', engineUsed: 'apple', fallback: true, fallbackReason: 'network-error' } });
      };
      await DVT.translate('Hello', 'ja', 'en');
      expect(document.querySelectorAll('.dvt-toast').length).toBe(1);
      expect(DVT.state.fallbackToastShown).toBe(true);
    });

    it('result.fallback が無いときはトースト表示されない', async () => {
      chrome.runtime.sendMessage = (_msg, cb) => {
        cb({ ok: true, result: { text: 'こんにちは', detectedLang: 'en', engineUsed: 'google' } });
      };
      await DVT.translate('Hello', 'ja', 'en');
      expect(document.querySelectorAll('.dvt-toast').length).toBe(0);
      expect(DVT.state.fallbackToastShown).toBe(false);
    });

    it('連続で fallback が起きてもトーストは 1 回のみ', async () => {
      chrome.runtime.sendMessage = (_msg, cb) => {
        cb({ ok: true, result: { text: 'こんにちは', detectedLang: 'en', engineUsed: 'apple', fallback: true } });
      };
      await DVT.translate('Hello 1', 'ja', 'en');
      await DVT.translate('Hello 2', 'ja', 'en');
      await DVT.translate('Hello 3', 'ja', 'en');
      expect(document.querySelectorAll('.dvt-toast').length).toBe(1);
    });
  });
});
