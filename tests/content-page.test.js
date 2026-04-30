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

  describe('runConcurrentTranslation — DeepL APIキー未設定時のフォールバック', () => {
    it('content-page.js にDeepL APIキーチェックのフォールバックロジックが含まれる', () => {
      const { readFileSync } = require('fs');
      const { resolve } = require('path');
      const code = readFileSync(resolve(__dirname, '..', 'content-page.js'), 'utf-8');
      expect(code).toContain('translateEngine');
      expect(code).toContain('deeplApiKey');
      expect(code).toContain('deeplApiKeyMissing');
    });

    it('DeepL選択＋APIキー未設定でtranslatePageを実行しても翻訳されない', async () => {
      chrome.storage.local.set({ translateEngine: 'deepl', deeplApiKey: '' });

      document.body.innerHTML = '<p>This is a long enough text for translation testing purposes</p>';
      DVT.state.targetLang = 'ja';
      DVT.state.pageTranslateActive = false;

      await DVT_PAGE.translatePage('ja');

      // デュアルビュー要素が挿入されていないことを確認
      expect(document.querySelector('.dvt-trans')).toBeFalsy();
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

  describe('runConcurrentTranslation — 二重翻訳防止（dvt-pendingマーカー）', () => {
    it('翻訳開始直後に要素が dvt-pending マークされ filterTranslatableElements から除外される', async () => {
      // jsdom は innerText 未サポートのため textContent で代用するモックを設定
      Object.defineProperty(HTMLElement.prototype, 'innerText', {
        get() { return this.textContent; },
        configurable: true,
      });

      chrome.storage.local.set({ translateEngine: 'google', deeplApiKey: '' });
      document.body.innerHTML = '<p>This is a long enough text for translation testing</p>';
      const el = document.querySelector('p');
      DVT.state.pageTranslateActive = false;
      DVT.state.targetLang = 'ja';

      // translatePage を開始（await しない）
      // 非同期関数は最初の await まで同期的に実行されるため、
      // runConcurrentTranslation 冒頭の forEach（dvt-pending セット）も同期で完了する
      const promise = DVT_PAGE.translatePage('ja');

      // この時点で dvt-pending がセットされているはず
      expect(el.dataset.dvtId).toBe('dvt-pending');

      // filterTranslatableElements に相当するロジック: data-dvt-id があれば除外
      const reFiltered = Array.from(document.querySelectorAll('p')).filter(e => !e.dataset.dvtId);
      expect(reFiltered.length).toBe(0); // 同じ要素は二重取得されない

      // 後処理（テスト環境では翻訳APIが未実装のため翻訳完了は期待しない）
      try { await promise; } catch (_) { /* ignore */ }
      delete HTMLElement.prototype.innerText;
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

  describe('applyTranslation — 翻訳結果が原文と完全一致なら表示しない（#138）', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const code = readFileSync(resolve(__dirname, '..', 'content-page.js'), 'utf-8');

    it('applyTranslation 内で原文と翻訳結果の完全一致をチェックする分岐がある', () => {
      expect(code).toMatch(/translatedText\s*===\s*originalText/);
    });

    it('isUnchanged フラグは originalText.length > 0 の前提で評価される（空文字での誤一致を避ける）', () => {
      expect(code).toMatch(/originalText\.length\s*>\s*0\s*&&\s*translatedText\s*===\s*originalText/);
    });

    it('一致時または同一言語時は wrapper 全体を解体して元の DOM 構造に戻す（#140）', () => {
      // .dvt-trans の remove だけだと block 化された .dvt-orig が残って空行が出るため、
      // origEl の中身を el に直接戻す処理が含まれること
      expect(code).toMatch(/isSameLanguage\s*\|\|\s*isUnchanged[\s\S]{0,400}while\s*\(\s*origEl\.firstChild\s*\)\s*el\.appendChild\(origEl\.firstChild\)/);
    });

    it('一致しない場合は従来通り transEl.textContent = result が呼ばれる', () => {
      expect(code).toMatch(/transEl\.textContent\s*=\s*result/);
    });

    it('翻訳要素の × ボタンは type=\"button\" + aria-label が設定される（要約 × と一貫）', () => {
      // dvt-undo-btn 生成箇所に type=\"button\" と aria-label 設定が含まれる
      expect(code).toMatch(/dvt-undo-btn[\s\S]{0,400}setAttribute\(\s*['"]type['"]\s*,\s*['"]button['"]/);
      expect(code).toMatch(/dvt-undo-btn[\s\S]{0,400}setAttribute\(\s*['"]aria-label['"]\s*,\s*undoLabel/);
    });
  });

  describe('applyTranslation — jsdom 統合（#138 PR レビュー対応）', () => {
    // jsdom は innerText を完全サポートしないため、HTMLElement.prototype.innerText を
    // textContent で代用するモックを差し込んで translatePage パイプラインを実走させる。
    let innerTextDescriptor;
    let originalTranslate;
    let originalLangMatches;

    beforeEach(() => {
      innerTextDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
      Object.defineProperty(HTMLElement.prototype, 'innerText', {
        configurable: true,
        get() { return this.textContent; },
        set(v) { this.textContent = v; },
      });

      originalTranslate = DVT.translate;
      originalLangMatches = DVT.langMatches;
      // 同一言語パスを通さず、純粋に「文字列一致での remove」を検証する
      DVT.langMatches = () => false;
    });

    afterEach(() => {
      if (innerTextDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'innerText', innerTextDescriptor);
      } else {
        delete HTMLElement.prototype.innerText;
      }
      DVT.translate = originalTranslate;
      DVT.langMatches = originalLangMatches;
      DVT.state.pageTranslateActive = false;
    });

    it('翻訳結果が原文と完全一致した場合、wrapper 全体が解体されて元の DOM 構造に戻る', async () => {
      // #140: .dvt-trans だけ remove だと .dvt-orig (display: block) や wrapper span が
      // 残ってレイアウトに空行が出るため、wrapper 全体を解体する仕様
      DVT.translate = async (text) => ({ text, detectedLang: 'auto' });
      chrome.storage.local.set({ translateEngine: 'google' });
      document.body.innerHTML = '<p id="target">&gt;***********</p>';
      DVT.state.targetLang = 'ja';

      await DVT_PAGE.translatePage('ja');

      const target = document.getElementById('target');
      expect(target).toBeTruthy();
      // .dvt-trans / .dvt-orig / wrapper span のいずれも残っていないこと（空行が出ない構造）
      expect(target.querySelector('.dvt-trans')).toBeNull();
      expect(target.querySelector('.dvt-orig')).toBeNull();
      expect(target.querySelector('[data-dvt]')).toBeNull();
      // 元のテキストはそのまま残る
      expect(target.textContent.trim()).toBe('>***********');
    });

    it('翻訳結果が原文と異なる場合、.dvt-trans に結果が反映される', async () => {
      DVT.translate = async () => ({ text: 'こんにちは世界', detectedLang: 'en' });
      chrome.storage.local.set({ translateEngine: 'google' });
      document.body.innerHTML = '<p id="target">Hello world</p>';
      DVT.state.targetLang = 'ja';

      await DVT_PAGE.translatePage('ja');

      const target = document.getElementById('target');
      const trans = target?.querySelector('.dvt-trans');
      expect(trans).toBeTruthy();
      expect(trans.textContent).toContain('こんにちは世界');
    });
  });

  describe('要約ブロックの個別 × ボタン（#134）', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const code = readFileSync(resolve(__dirname, '..', 'content-page.js'), 'utf-8');
    const cssCode = readFileSync(resolve(__dirname, '..', 'content.css'), 'utf-8');

    it('runSummarize 内で要約ブロックに dvt-summary-undo-btn を生成している', () => {
      expect(code).toMatch(/runSummarize[\s\S]*?dvt-summary-undo-btn/);
    });

    it('要約 × クリックで summaryBlock.remove() が呼ばれる', () => {
      expect(code).toMatch(/dvt-summary-undo-btn[\s\S]{0,800}summaryBlock\.remove\(\)/);
    });

    it('要約 × ボタンには title と aria-label の両方に i18n キー undoSummary が設定される', () => {
      // SR 上で「multiplication sign」等で読み上げられないよう aria-label も明示
      expect(code).toMatch(/summaryUndoBtn\.title\s*=\s*t\('undoSummary'\)/);
      expect(code).toMatch(/setAttribute\(\s*['"]aria-label['"]\s*,\s*t\('undoSummary'\)/);
    });

    it('要約 × ボタンには type="button" が設定される（form 内 submit 回避）', () => {
      expect(code).toMatch(/setAttribute\(\s*['"]type['"]\s*,\s*['"]button['"]/);
    });

    it('CSS で .dvt-summary-undo-btn が定義されている', () => {
      expect(cssCode).toContain('.dvt-summary-undo-btn');
      expect(cssCode).toContain('position: absolute');
    });

    it('CSS の .dvt-summary は [data-dvt] でスコープ限定されている（ホストページ汚染防止）', () => {
      expect(cssCode).toMatch(/\.dvt-summary\[data-dvt\]\s*\{[\s\S]{0,200}position:\s*relative/);
    });
  });

  describe('undoPageTranslate — 領域選択時の要約ブロックも撤去（#134）', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const code = readFileSync(resolve(__dirname, '..', 'content-page.js'), 'utf-8');

    it('undoPageTranslate は ID 指定ではなくクラス指定で .dvt-summary 全削除する（拡張挿入要素に限定）', () => {
      // ホストページの偶然の同名クラス汚染を避けるため [data-dvt="true"] でスコープ
      expect(code).toMatch(/undoPageTranslate[\s\S]{0,400}querySelectorAll\([^)]*data-dvt[^)]*dvt-summary/);
    });

    it('undoPageTranslate 実行で document 上の .dvt-summary が消える（jsdom 統合）', () => {
      // 領域選択翻訳の要約ブロック（ID なし）と data-dvt-id を持つ翻訳要素を仕込む
      document.body.innerHTML = `
        <div class="dvt-summary" data-dvt="true">
          <span class="dvt-badge dvt-badge-summary">要約</span>
          <div class="dvt-summary-text">サンプル要約</div>
        </div>
        <p data-dvt-id="dvt-r-1">
          <span class="dvt-orig">Original</span>
          <span class="dvt-trans">翻訳</span>
        </p>
      `;
      expect(document.querySelectorAll('.dvt-summary').length).toBe(1);
      DVT_PAGE.undoPageTranslate();
      expect(document.querySelectorAll('.dvt-summary').length).toBe(0);
      expect(document.querySelectorAll('[data-dvt-id]').length).toBe(0);
    });
  });
});
