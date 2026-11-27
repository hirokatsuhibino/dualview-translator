// Copyright (c) Orangesoft Inc.
// ページ全体翻訳が「翻訳中」のまま止まらないことのテスト（Issue #271）
// - 対象 0 件で開始してもページ監視を始め、後から追加された要素を翻訳する
//   （SPA の初期描画前・拡張の再読み込みで content script が入れ直された場合）
// - 自動翻訳ルールからの再評価（SPA の URL 変更）で翻訳が解除されない
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadScript } from './helpers.js';

describe('ページ全体翻訳の継続（Issue #271）', () => {
  let innerTextDescriptor;

  // 翻訳対象になる段落を追加する
  function addParagraph(text) {
    const p = document.createElement('p');
    p.textContent = text;
    document.body.appendChild(p);
    return p;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    __resetMockStorage();
    chrome.storage.local.set({ translateEngine: 'google' });
    // jsdom は innerText を実装していないため textContent で代用する
    innerTextDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() { return this.textContent; },
      set(v) { this.textContent = v; },
    });
    loadScript('i18n.js', 'content-core.js', 'content-page.js');
    // 検出言語は翻訳先（ja / en）と異なる値にして、同一言語スキップに入らないようにする
    DVT.translate = vi.fn(async (text) => ({ text: `訳:${text}`, detectedLang: 'fr' }));
    DVT.state.pageTranslateActive = false;
    DVT.state.pageTranslateMode = null;
    DVT.state.targetLang = 'ja';
    document.body.replaceChildren();
  });

  afterEach(() => {
    if (DVT.state.pageTranslateActive) DVT_PAGE.undoPageTranslate();
    document.body.replaceChildren();
    if (innerTextDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'innerText', innerTextDescriptor);
    } else {
      delete HTMLElement.prototype.innerText;
    }
    vi.useRealTimers();
  });

  describe('対象 0 件で開始した場合', () => {
    it('ページが空でも、後から追加された要素を翻訳する（SPA の初期描画前）', async () => {
      await DVT_PAGE.translatePage('ja');
      expect(DVT.state.pageTranslateActive).toBe(true);

      const p = addParagraph('Article loaded later by the SPA');
      await vi.advanceTimersByTimeAsync(600);

      expect(DVT.translate).toHaveBeenCalledWith('Article loaded later by the SPA', 'ja');
      expect(p.querySelector('.dvt-trans')).toBeTruthy();
    });

    it('前の content script の翻訳済み要素しか無くても、新しい記事を翻訳する（拡張の再読み込み後）', async () => {
      // 前の content script が翻訳した要素（data-dvt-id 付き）だけが残っている状態
      const old = addParagraph('Old article');
      old.dataset.dvtId = 'dvt-old';

      await DVT_PAGE.translatePage('ja');
      expect(DVT.translate).not.toHaveBeenCalled();

      const p = addParagraph('New article after reload');
      await vi.advanceTimersByTimeAsync(600);

      expect(DVT.translate).toHaveBeenCalledWith('New article after reload', 'ja');
      expect(p.querySelector('.dvt-trans')).toBeTruthy();
    });

    it('翻訳＆要約モードでも、0 件ならページ監視を開始する', async () => {
      await DVT_PAGE.translatePageAndSummarize('ja');
      expect(DVT_PAGE.getDebugState()).toMatch(/pageTranslateActive=true mode=summarize ページ監視=true/);
    });
  });

  describe('ensurePageTranslate（自動翻訳ルール用）', () => {
    it('未翻訳ならページ全体翻訳を開始する', async () => {
      const p = addParagraph('Hello from the first page');
      await DVT_PAGE.ensurePageTranslate('ja', 'translate');
      expect(DVT.state.pageTranslateActive).toBe(true);
      expect(DVT.state.pageTranslateMode).toBe('translate');
      expect(p.querySelector('.dvt-trans')).toBeTruthy();
    });

    it('同じモードで翻訳中に再度呼んでも解除せず、新しい要素だけ翻訳する（SPA の URL 変更）', async () => {
      const first = addParagraph('Hello from the first page');
      await DVT_PAGE.ensurePageTranslate('ja', 'translate');
      DVT.translate.mockClear();

      const second = addParagraph('Hello from the next page');
      await DVT_PAGE.ensurePageTranslate('ja', 'translate');

      expect(DVT.state.pageTranslateActive).toBe(true);
      // 既存の訳文は残っている（解除されていない）
      expect(first.querySelector('.dvt-trans')).toBeTruthy();
      expect(second.querySelector('.dvt-trans')).toBeTruthy();
      // 既訳の要素は翻訳し直さない
      expect(DVT.translate).toHaveBeenCalledTimes(1);
      expect(DVT.translate).toHaveBeenCalledWith('Hello from the next page', 'ja');
    });

    it('何度呼んでも ON/OFF を繰り返さない', async () => {
      addParagraph('Hello from the page');
      for (let i = 0; i < 3; i++) {
        await DVT_PAGE.ensurePageTranslate('ja', 'translate');
        expect(DVT.state.pageTranslateActive).toBe(true);
      }
      expect(document.querySelectorAll('.dvt-trans').length).toBe(1);
    });

    it('翻訳中にページ監視が止まっていたら再開する', async () => {
      addParagraph('Hello from the page');
      await DVT_PAGE.ensurePageTranslate('ja', 'translate');
      // 旧実装で 0 件開始したときのように、翻訳中なのにページ監視が無い状態を作る
      DVT_PAGE.undoPageTranslate();
      DVT.state.pageTranslateActive = true;
      DVT.state.pageTranslateMode = 'translate';
      expect(DVT_PAGE.getDebugState()).toMatch(/ページ監視=false/);

      await DVT_PAGE.ensurePageTranslate('ja', 'translate');
      expect(DVT_PAGE.getDebugState()).toMatch(/ページ監視=true/);
    });

    it('翻訳先が変わったら解除してから新しい翻訳先で翻訳し直す', async () => {
      const p = addParagraph('Hello from the page');
      await DVT_PAGE.ensurePageTranslate('ja', 'translate');
      DVT.translate.mockClear();

      await DVT_PAGE.ensurePageTranslate('en', 'translate');

      expect(DVT.state.pageTranslateActive).toBe(true);
      expect(DVT.state.targetLang).toBe('en');
      expect(DVT.translate).toHaveBeenCalledWith('Hello from the page', 'en');
      expect(p.querySelectorAll('.dvt-trans').length).toBe(1);
    });

    it('手動のトグル（translatePage）は従来どおり翻訳中なら解除する', async () => {
      addParagraph('Hello from the page');
      await DVT_PAGE.translatePage('ja');
      await DVT_PAGE.translatePage('ja');
      expect(DVT.state.pageTranslateActive).toBe(false);
      expect(document.querySelectorAll('.dvt-trans').length).toBe(0);
    });
  });
  describe('PR #272 レビュー対応', () => {
    // 要約メッセージへの応答を返す（他のメッセージは setup.js の既定応答）
    function mockSummarizeResponse() {
      const calls = [];
      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        if (msg.action === 'summarize') {
          calls.push(msg);
          const res = { ok: true, summary: 'まとめ' };
          if (cb) cb(res);
          return Promise.resolve(res);
        }
        const res = { ok: true, result: { text: 'mock', detectedLang: 'fr' } };
        if (cb) cb(res);
        return Promise.resolve(res);
      });
      return calls;
    }

    it('ポップアップで翻訳先を変えた後の再評価では、新しい翻訳先で翻訳し直す', async () => {
      const p = addParagraph('Hello from the page');
      await DVT_PAGE.ensurePageTranslate('ja', 'translate');
      DVT.translate.mockClear();

      // ポップアップの言語変更（setLang）は DVT.state.targetLang を先に書き換える
      DVT.state.targetLang = 'en';
      // 自動ルールの再評価（checkAutoRules は DVT.state.targetLang を渡す）
      await DVT_PAGE.ensurePageTranslate(DVT.state.targetLang, 'translate');

      expect(DVT.translate).toHaveBeenCalledWith('Hello from the page', 'en');
      expect(p.querySelectorAll('.dvt-trans').length).toBe(1);
    });

    it('前の content script が残した処理中マークを回収して翻訳する（拡張の再注入後）', async () => {
      // 前の content script の遅延翻訳で予約されたまま、IntersectionObserver を失った要素
      const stale = addParagraph('Reserved by the previous content script');
      stale.dataset.dvtId = 'dvt-pending';
      // 前の content script が翻訳済みの要素は保持する
      const done = addParagraph('Already translated before reload');
      done.dataset.dvtId = 'dvt-old';

      await DVT_PAGE.ensurePageTranslate('ja', 'translate');

      expect(DVT.translate).toHaveBeenCalledWith('Reserved by the previous content script', 'ja');
      expect(DVT.translate).not.toHaveBeenCalledWith('Already translated before reload', 'ja');
      expect(stale.querySelector('.dvt-trans')).toBeTruthy();
      expect(done.dataset.dvtId).toBe('dvt-old');
    });

    it('自分が翻訳中の要素の処理中マークは回収しない', async () => {
      // 翻訳が終わらない状態で、同じ要素を別の経路から翻訳しようとしても二重翻訳しない
      let release;
      DVT.translate.mockImplementation(() => new Promise(r => { release = r; }));
      const p = addParagraph('Translating right now');
      const region = DVT_PAGE.translateClickedElement(p);
      await vi.advanceTimersByTimeAsync(0);
      expect(p.dataset.dvtId).toMatch(/^dvt-/);

      await DVT_PAGE.translatePage('ja');
      expect(DVT.translate).toHaveBeenCalledTimes(1);
      release({ text: '訳', detectedLang: 'fr' });
      await region;
    });

    it('翻訳＆要約を対象 0 件で始めたら、本文が現れたときに要約を 1 回だけ作る', async () => {
      chrome.storage.local.set({ claudeApiKey: 'test-key' });
      const calls = mockSummarizeResponse();
      await DVT_PAGE.translatePageAndSummarize('ja');
      expect(calls.length).toBe(0);

      addParagraph('Article rendered later by the SPA');
      await vi.advanceTimersByTimeAsync(600);
      expect(calls.length).toBe(1);
      expect(document.getElementById('dvt-page-summary')).toBeTruthy();

      // 以降の追加では要約を作り直さない
      addParagraph('Another article loaded later');
      await vi.advanceTimersByTimeAsync(600);
      expect(calls.length).toBe(1);
    });

    it('前の content script の要約ブロックが残っていれば、要約を作り直さない', async () => {
      chrome.storage.local.set({ claudeApiKey: 'test-key' });
      const calls = mockSummarizeResponse();
      const old = document.createElement('div');
      old.id = 'dvt-page-summary';
      old.setAttribute('data-dvt', 'true');
      document.body.appendChild(old);

      await DVT_PAGE.translatePageAndSummarize('ja');
      addParagraph('Article rendered later by the SPA');
      await vi.advanceTimersByTimeAsync(600);
      expect(calls.length).toBe(0);
    });
  });
  describe('解除の世代管理（PR #272 レビュー対応）', () => {
    // 翻訳先ごとに応答を制御できる DVT.translate
    function deferredTranslate() {
      const pending = [];
      DVT.translate.mockImplementation((text, tl) => new Promise(resolve => {
        pending.push({ text, tl, resolve });
      }));
      return pending;
    }

    it('応答待ちの間に翻訳先を変えても、旧言語の応答で新しい訳文を上書きしない', async () => {
      const p = addParagraph('Hello from the page');
      const pending = deferredTranslate();
      const first = DVT_PAGE.ensurePageTranslate('ja', 'translate');
      await vi.advanceTimersByTimeAsync(0);
      expect(pending.map(x => x.tl)).toEqual(['ja']);

      // 応答待ちの間に翻訳先を en に変えて再評価
      DVT.state.targetLang = 'en';
      const second = DVT_PAGE.ensurePageTranslate('en', 'translate');
      await vi.advanceTimersByTimeAsync(0);
      pending.find(x => x.tl === 'en').resolve({ text: 'EN訳', detectedLang: 'fr' });
      await second;
      // 旧言語の応答が後から届く
      pending.find(x => x.tl === 'ja').resolve({ text: 'JA訳', detectedLang: 'fr' });
      await first;

      const trans = p.querySelectorAll('.dvt-trans');
      expect(trans.length).toBe(1);
      expect(trans[0].textContent).toContain('EN訳');
      expect(trans[0].textContent).not.toContain('JA訳');
    });

    it('翻訳中に解除したら、旧処理がページ監視を始めない', async () => {
      addParagraph('Hello from the page');
      const pending = deferredTranslate();
      const run = DVT_PAGE.translatePage('ja');
      await vi.advanceTimersByTimeAsync(0);
      DVT_PAGE.undoPageTranslate();
      pending.forEach(x => x.resolve({ text: '訳', detectedLang: 'fr' }));
      await run;

      expect(DVT_PAGE.getDebugState()).toMatch(/pageTranslateActive=false .*ページ監視=false/);
      expect(document.querySelectorAll('.dvt-trans').length).toBe(0);
    });

    it('翻訳＆要約の翻訳中に解除したら、旧処理は要約しない', async () => {
      chrome.storage.local.set({ claudeApiKey: 'test-key' });
      addParagraph('Hello from the page');
      const pending = deferredTranslate();
      const summarizeCalls = [];
      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        if (msg.action === 'summarize') summarizeCalls.push(msg);
        const res = { ok: true, summary: 'まとめ' };
        if (cb) cb(res);
        return Promise.resolve(res);
      });
      const run = DVT_PAGE.translatePageAndSummarize('ja');
      await vi.advanceTimersByTimeAsync(0);
      DVT_PAGE.undoPageTranslate();
      pending.forEach(x => x.resolve({ text: '訳', detectedLang: 'fr' }));
      await run;

      expect(summarizeCalls.length).toBe(0);
      expect(document.getElementById('dvt-page-summary')).toBeNull();
    });
  });
});
