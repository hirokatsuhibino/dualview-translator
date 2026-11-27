// Copyright (c) Orangesoft Inc.
// 自動翻訳ルールの「要素の出現待ち」テスト（Issue #271）
// 再現した流れ: Web メールがログイン画面の時点で拡張が更新・再読み込みされ、content script が
// 入れ直される → checkAutoRules が本文要素（#msgtext）を待つが 10 秒でタイムアウト →
// ログインしても URL は変わらないため、リロードするまで翻訳されなかった。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadScript } from './helpers.js';

describe('DVT_BAR.checkAutoRules — 要素の出現待ち（Issue #271）', () => {
  const rule = { id: 'r271', urlPattern: '*://mail.example.com/*', mode: 'translate', selector: '#msgtext', enabled: true };
  let storedRules;
  let wrap;

  // ログイン後に表示される本文要素
  function showMailBody(text = 'Hello from the mail body') {
    const body = document.createElement('div');
    body.id = 'msgtext';
    const p = document.createElement('p');
    p.textContent = text;
    body.appendChild(p);
    wrap.replaceChildren(body);
    return body;
  }

  // ログイン画面
  function showLoginScreen() {
    const form = document.createElement('form');
    form.className = 'login';
    const input = document.createElement('input');
    form.appendChild(input);
    wrap.replaceChildren(form);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    storedRules = [rule];
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      const result = { autoRules: storedRules };
      if (cb) cb(result);
      return Promise.resolve(result);
    });
    Object.defineProperty(globalThis, 'location', {
      value: { href: 'https://mail.example.com/b/' },
      writable: true,
      configurable: true,
    });
    loadScript('i18n.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      ensurePageTranslate: vi.fn(),
      translateClickedElement: vi.fn().mockResolvedValue(undefined),
      translateAndSummarizeClickedElement: vi.fn().mockResolvedValue(undefined),
    };
    globalThis.DVT = { state: { targetLang: 'ja' } };
    loadScript('content-bar.js');
    wrap = document.createElement('div');
    document.body.replaceChildren(wrap);
    showLoginScreen();
  });

  afterEach(() => {
    DVT_BAR.stopAutoRuleObserver(rule.id);
    // 出現待ちが残らないよう、URL を外したチェックで後始末する
    storedRules = [];
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('ログイン画面で要素待ちがタイムアウトしても、ログイン後に本文が現れたら翻訳する', async () => {
    const result = DVT_BAR.checkAutoRules();
    await vi.advanceTimersByTimeAsync(10000); // waitForElement のタイムアウト
    expect(await result).toBe(false);
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();

    // ユーザーがログインする（URL は変わらない）
    await vi.advanceTimersByTimeAsync(30000);
    const body = showMailBody();
    await vi.advanceTimersByTimeAsync(600);

    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(body);
  });

  it('本文が現れた後は通常の監視に移り、メールの切り替えも翻訳する', async () => {
    DVT_BAR.checkAutoRules();
    await vi.advanceTimersByTimeAsync(10000);
    const body = showMailBody();
    await vi.advanceTimersByTimeAsync(600);
    DVT_PAGE.translateClickedElement.mockClear();

    // 別のメールを開く（本文要素の中身が入れ替わる）
    const p = document.createElement('p');
    p.textContent = 'Another mail';
    body.replaceChildren(p);
    await vi.advanceTimersByTimeAsync(600);

    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(body);
  });

  it('タブの再表示でも出現を確認する', async () => {
    DVT_BAR.checkAutoRules();
    await vi.advanceTimersByTimeAsync(10000);
    // DOM 変更のスロットル前に再表示イベントが来るケース
    const body = showMailBody();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(body);
  });

  it('本文が現れるまでは無関係な DOM 変更で翻訳しない', async () => {
    DVT_BAR.checkAutoRules();
    await vi.advanceTimersByTimeAsync(10000);
    for (let i = 0; i < 3; i++) {
      showLoginScreen();
      await vi.advanceTimersByTimeAsync(600);
    }
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
  });

  it('URL がルールに一致しないページでは出現待ちをしない', async () => {
    location.href = 'https://other.example.com/';
    await DVT_BAR.checkAutoRules();
    // 一致しないので待機すらせず即終了。後から同じ id の要素が出ても翻訳しない
    showMailBody();
    await vi.advanceTimersByTimeAsync(600);
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
  });

  it('待機中にルールが削除されたら、要素が現れても翻訳しない', async () => {
    DVT_BAR.checkAutoRules();
    await vi.advanceTimersByTimeAsync(10000);
    storedRules = [];
    showMailBody();
    await vi.advanceTimersByTimeAsync(600);
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
  });

  it('要素待ちの間に新しいチェックが始まっても、本文は 1 回だけ翻訳する', async () => {
    DVT_BAR.checkAutoRules();
    await vi.advanceTimersByTimeAsync(5000);
    // SPA 遷移などで 2 回目のチェックが始まる
    DVT_BAR.checkAutoRules();
    await vi.advanceTimersByTimeAsync(10000);
    const body = showMailBody();
    await vi.advanceTimersByTimeAsync(600);

    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledTimes(1);
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(body);
  });
  it('複数ルールで、後続ルールを待っている間に先のルールの要素が現れても翻訳する', async () => {
    const second = { id: 'r271b', urlPattern: '*://mail.example.com/*', mode: 'translate', selector: '#other', enabled: true };
    storedRules = [rule, second];
    DVT_BAR.checkAutoRules();
    // 先のルール（#msgtext）がタイムアウト
    await vi.advanceTimersByTimeAsync(10000);
    // 後続ルール（#other）を待っている間に #msgtext が現れる
    const body = showMailBody();
    await vi.advanceTimersByTimeAsync(10000);
    // 監視の登録後は DOM 変更もタブ再表示も起きない
    await vi.advanceTimersByTimeAsync(0);

    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(body);
  });
  describe('古いチェックの中止（PR #272 レビュー対応）', () => {
    it('要素待ちの間にルールが削除されたら、要素が現れても旧ルールで翻訳しない', async () => {
      DVT_BAR.checkAutoRules();
      await vi.advanceTimersByTimeAsync(1000);
      // ルール削除 → popup の reapplyAutoRule 相当で新しいチェックが走る
      storedRules = [];
      await DVT_BAR.checkAutoRules();
      // 古いチェックの waitForElement が要素を見つける
      showMailBody();
      await vi.advanceTimersByTimeAsync(10000);

      expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
    });

    it('初回翻訳の間に新しいチェックが始まったら、旧チェックは監視を張らない', async () => {
      const body = showMailBody();
      let finish;
      DVT_PAGE.translateClickedElement.mockImplementationOnce(() => new Promise(r => { finish = r; }));
      DVT_BAR.checkAutoRules();
      await vi.advanceTimersByTimeAsync(0);
      expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledTimes(1);

      // 翻訳中にルールが削除され、新しいチェックが走る
      storedRules = [];
      await DVT_BAR.checkAutoRules();
      finish();
      await vi.advanceTimersByTimeAsync(0);

      // 旧チェックが監視を張っていれば、本文の書き換えで再翻訳される
      const p = document.createElement('p');
      p.textContent = 'Another mail';
      body.replaceChildren(p);
      await vi.advanceTimersByTimeAsync(600);
      expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledTimes(1);
    });

    it('URL が変わった後に要素待ちが終わった古いチェックは翻訳しない', async () => {
      DVT_BAR.checkAutoRules();
      await vi.advanceTimersByTimeAsync(1000);
      location.href = 'https://other.example.com/';
      showMailBody();
      await vi.advanceTimersByTimeAsync(600);
      expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
    });
  });
});
