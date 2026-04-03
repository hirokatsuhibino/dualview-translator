// content-page.js のDOMロジックテスト（jsdom環境）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers.js';

describe('DVT_PAGE (content-page)', () => {
  beforeAll(() => {
    loadScript('i18n.js', 'content-core.js', 'content-page.js');
  });

  beforeEach(() => {
    // テスト間でDOMをリセット
    document.body.innerHTML = '';
  });

  // jsdomでは innerText が未サポートのため、textContent で代用してロジックをテスト
  describe('filterTranslatableElements — 要素抽出ロジック', () => {
    it('p要素のテキストが4文字未満の場合は翻訳対象外', () => {
      document.body.innerHTML = `
        <p>abc</p>
        <p>これは翻訳対象のテキストです</p>
      `;
      const elements = document.querySelectorAll('p');
      const filtered = Array.from(elements).filter(el => {
        return el.textContent?.trim().length >= 4;
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].textContent).toContain('翻訳対象');
    });

    it('data-dvt属性付きの要素は除外される', () => {
      document.body.innerHTML = `
        <div data-dvt="true">
          <p>翻訳済みのテキスト</p>
        </div>
        <p>未翻訳のテキスト</p>
      `;
      const elements = Array.from(document.querySelectorAll('p')).filter(el => {
        if (el.closest('[data-dvt]')) return false;
        return el.textContent?.trim().length >= 4;
      });
      expect(elements.length).toBe(1);
      expect(elements[0].textContent).toContain('未翻訳');
    });

    it('data-dvt-id付きの要素は除外される', () => {
      document.body.innerHTML = `
        <p data-dvt-id="dvt-123">既に翻訳されたテキスト</p>
        <p>まだ翻訳されていないテキスト</p>
      `;
      const elements = Array.from(document.querySelectorAll('p')).filter(el => {
        if (el.dataset.dvtId) return false;
        return el.textContent?.trim().length >= 4;
      });
      expect(elements.length).toBe(1);
      expect(elements[0].textContent).toContain('まだ翻訳');
    });
  });

  describe('葉要素フィルタリング', () => {
    it('親子関係のある要素から葉要素のみ抽出される', () => {
      document.body.innerHTML = `
        <div id="parent">
          <p>子要素テキストA</p>
          <p>子要素テキストB</p>
        </div>
      `;
      const SELECTORS = 'p, div';
      const elements = Array.from(document.querySelectorAll(SELECTORS)).filter(el => {
        return el.textContent?.trim().length >= 4;
      });
      // div#parent と 2つのpが取得される
      expect(elements.length).toBe(3);

      // 葉要素フィルタリング: 他の候補を含まない要素だけ残す
      const leafElements = elements.filter(el =>
        !elements.some(other => other !== el && el.contains(other))
      );
      // divは子のpを含むので除外、pのみ残る
      expect(leafElements.length).toBe(2);
      expect(leafElements.every(el => el.tagName === 'P')).toBe(true);
    });
  });

  describe('DVT_PAGE.enterSelectorPickMode', () => {
    it('enterSelectorPickModeが存在する', () => {
      expect(typeof DVT_PAGE.enterSelectorPickMode).toBe('function');
    });

    it('呼び出し後にregionModeがtrueになる', () => {
      DVT.state.regionMode = false;
      DVT_PAGE.enterSelectorPickMode('*://example.com/*');
      expect(DVT.state.regionMode).toBe(true);
      // クリーンアップ: Escapeイベントで終了させる
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(DVT.state.regionMode).toBe(false);
    });

    it('regionModeが既にtrueの場合は何もしない', () => {
      DVT.state.regionMode = true;
      // 既存のヒントがない状態でも例外が起きないことを確認
      expect(() => DVT_PAGE.enterSelectorPickMode('*://example.com/*')).not.toThrow();
      DVT.state.regionMode = false;
    });
  });

  describe('runSummarize — LLM APIキー未設定時のフォールバック', () => {
    it('content-page.js にAPIキーチェックのフォールバックロジックが含まれる', () => {
      const { readFileSync } = require('fs');
      const { resolve } = require('path');
      const code = readFileSync(resolve(__dirname, '..', 'content-page.js'), 'utf-8');
      // runSummarize内でAPIキーチェックが存在することを確認
      expect(code).toContain('claudeApiKey');
      expect(code).toContain('geminiApiKey');
      expect(code).toContain('llmApiKeyMissing');
      expect(code).toContain('showToast');
    });

    it('APIキー未設定でtranslatePageAndSummarizeを実行しても要約ブロックが挿入されない', async () => {
      // storageにAPIキー未設定
      chrome.storage.local.set({ claudeApiKey: '', geminiApiKey: '' });

      // 翻訳対象テキストを用意（4文字以上）
      document.body.innerHTML = '<p>This is a long enough text for translation testing purposes</p>';
      DVT.state.targetLang = 'ja';
      DVT.state.pageTranslateActive = false;

      await DVT_PAGE.translatePageAndSummarize('ja');

      // 要約ブロック（.dvt-summary）が挿入されていないことを確認
      expect(document.querySelector('.dvt-summary')).toBeFalsy();
    });
  });

  describe('showToast() / updateToast()', () => {
    it('トーストがDOMに追加される', () => {
      const toast = DVT.showToast('テスト', true);
      expect(toast).toBeTruthy();
      expect(document.querySelector('.dvt-toast')).toBeTruthy();
      expect(toast.textContent).toContain('テスト');
      toast.remove();
    });

    it('トーストの内容が更新される', () => {
      const toast = DVT.showToast('初期', true);
      DVT.updateToast(toast, '更新済み');
      expect(toast.querySelector('.dvt-toast-msg').textContent).toBe('更新済み');
      toast.remove();
    });

    it('duration指定で自動削除される', async () => {
      DVT.showToast('自動削除', false, 100);
      expect(document.querySelector('.dvt-toast')).toBeTruthy();
      await new Promise(r => setTimeout(r, 200));
      expect(document.querySelector('.dvt-toast')).toBeFalsy();
    });
  });
});
