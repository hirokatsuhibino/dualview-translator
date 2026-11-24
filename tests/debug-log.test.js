// Copyright (c) Orangesoft Inc.
// 調査用デバッグログ（Issue #271）のテスト
// - storage の debugLog が true のときだけ出力し、既定では何も出さない
// - 本文（翻訳対象テキスト）をログに出さない
// - 自動翻訳ルールの監視状態（翻訳中のまま止まっているか等）をスナップショットで出せる
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadScript } from './helpers.js';

// chrome.storage.onChanged に登録されたリスナーへ変更を流す
function emitStorageChange(changes) {
  for (const [listener] of chrome.storage.onChanged.addListener.mock.calls) {
    listener(changes, 'local');
  }
}

function dvtLogs(spy) {
  return spy.mock.calls
    .filter(args => typeof args[0] === 'string' && args[0].startsWith('[DVT debug '))
    .map(args => args.slice(1).join(' '));
}

// <div id="msgtext"><p>text</p></div> を作る
function makeMsgText(text) {
  const div = document.createElement('div');
  div.id = 'msgtext';
  const p = document.createElement('p');
  p.textContent = text;
  div.appendChild(p);
  return div;
}

describe('DVT.debugLog（content-core）', () => {
  let logSpy;

  beforeEach(() => {
    __resetMockStorage();
    chrome.storage.onChanged.addListener.mockClear();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('既定（debugLog 未設定）では何も出力しない', () => {
    loadScript('i18n.js', 'content-core.js');
    DVT.debugLog('hello');
    expect(dvtLogs(logSpy)).toEqual([]);
    expect(DVT.isDebugEnabled()).toBe(false);
  });

  it('debugLog: true なら時刻付きの接頭辞で出力する', () => {
    chrome.storage.local.set({ debugLog: true });
    loadScript('i18n.js', 'content-core.js');
    DVT.debugLog('hello', 1);
    const call = logSpy.mock.calls.find(args => String(args[0]).startsWith('[DVT debug '));
    expect(call[0]).toMatch(/^\[DVT debug \d{4}-\d{2}-\d{2}T[\d:.]+Z\]$/);
    expect(call.slice(1)).toEqual(['hello', 1]);
  });

  it('storage の変更で再読み込みなしに有効・無効を切り替えられる', () => {
    loadScript('i18n.js', 'content-core.js');
    emitStorageChange({ debugLog: { newValue: true } });
    DVT.debugLog('on');
    emitStorageChange({ debugLog: { newValue: false } });
    DVT.debugLog('off');
    expect(dvtLogs(logSpy)).toEqual(['on']);
  });

  it('translate() の開始と応答を所要時間付きで出し、本文は出さない', async () => {
    chrome.storage.local.set({ debugLog: true });
    loadScript('i18n.js', 'content-core.js');
    await DVT.translate('SECRET MAIL BODY', 'ja');
    const logs = dvtLogs(logSpy);
    expect(logs.some(l => /translate#\d+ 開始 len=16 tl=ja/.test(l))).toBe(true);
    expect(logs.some(l => /translate#\d+ 応答 \d+ms ok=true/.test(l))).toBe(true);
    expect(logs.join('\n')).not.toContain('SECRET MAIL BODY');
  });

  it('応答が返らないときは待ち時間の経過をログに出す（スリープ復帰後のハング検知用）', async () => {
    vi.useFakeTimers();
    try {
      chrome.storage.local.set({ debugLog: true });
      loadScript('i18n.js', 'content-core.js');
      // 応答を返さない sendMessage（ハング）
      chrome.runtime.sendMessage.mockImplementationOnce(() => {});
      DVT.translate('hello', 'ja');
      await vi.advanceTimersByTimeAsync(30000);
      const logs = dvtLogs(logSpy);
      expect(logs.some(l => /応答待ち 10s 経過/.test(l))).toBe(true);
      expect(logs.some(l => /応答待ち 30s 経過/.test(l))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('describeEl はタグ・id・class・接続状態・テキスト長だけを返す', () => {
    loadScript('i18n.js', 'content-core.js');
    const el = document.createElement('div');
    el.id = 'msgtext';
    el.className = 'a b';
    el.textContent = 'SECRET';
    document.body.replaceChildren(el);
    const s = DVT.describeEl(el);
    expect(s).toBe('div#msgtext.a.b [connected=true textLen=6]');
    expect(s).not.toContain('SECRET');
    document.body.replaceChildren();
  });
});

describe('自動翻訳ルール監視のデバッグログ（content-bar）', () => {
  const rule = { id: 'r271', urlPattern: '*', mode: 'translate', selector: '#msgtext', enabled: true };
  let logSpy;
  let wrap;

  beforeEach(() => {
    vi.useFakeTimers();
    __resetMockStorage();
    chrome.storage.local.set({ debugLog: true, autoRules: [rule] });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    loadScript('i18n.js', 'content-core.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn().mockResolvedValue(undefined),
      translateAndSummarizeClickedElement: vi.fn().mockResolvedValue(undefined),
    };
    loadScript('content-bar.js');
    wrap = document.createElement('div');
    wrap.appendChild(makeMsgText('hello'));
    document.body.replaceChildren(wrap);
  });

  afterEach(() => {
    DVT_BAR.stopAutoRuleObserver(rule.id);
    document.body.replaceChildren();
    logSpy.mockRestore();
    vi.useRealTimers();
  });

  it('翻訳が終わらない間はスナップショットに translating=true が出る', async () => {
    // 応答が返らない翻訳（スリープ復帰直後のハングを再現）
    DVT_PAGE.translateClickedElement.mockImplementation(() => new Promise(() => {}));
    const el = document.getElementById('msgtext');
    DVT_BAR.startAutoRuleObserver(el, rule, { translateNow: true });
    await vi.advanceTimersByTimeAsync(0);

    DVT_BAR.logAutoRuleSnapshot('test');
    const logs = dvtLogs(logSpy);
    expect(logs.some(l => l.includes('再翻訳 開始 rule=r271'))).toBe(true);
    expect(logs.some(l => /snapshot\(test\): rule=r271 translating=true .*同一=true/.test(l))).toBe(true);
  });

  it('子ノード変更の検知と再翻訳の開始・終了を記録し、本文は出さない', async () => {
    const el = document.getElementById('msgtext');
    DVT_BAR.startAutoRuleObserver(el, rule);
    const p = document.createElement('p');
    p.textContent = 'new mail';
    el.replaceChildren(p);
    await vi.advanceTimersByTimeAsync(600);

    const logs = dvtLogs(logSpy);
    expect(logs.some(l => l.includes('子ノード変更を検知 rule=r271'))).toBe(true);
    expect(logs.some(l => /再翻訳 終了 rule=r271 \d+ms active=true .*子ノード監視再開=true/.test(l))).toBe(true);
    expect(logs.join('\n')).not.toContain('new mail');
  });

  it('対象要素が作り直されたら、スナップショットに監視中の要素とセレクタの要素の不一致が出る', () => {
    // 差し替え検知が動く前（スロットル待ち）の状態を確認する
    DVT_BAR.startAutoRuleObserver(document.getElementById('msgtext'), rule);
    wrap.replaceChildren(makeMsgText('other'));
    DVT_BAR.logAutoRuleSnapshot('test');
    const logs = dvtLogs(logSpy);
    expect(logs.some(l => /snapshot\(test\): rule=r271 translating=false 監視中el=div#msgtext \[connected=false.*同一=false/.test(l))).toBe(true);
  });

  it('debugLog が無効ならスナップショットも出さない', () => {
    emitStorageChange({ debugLog: { newValue: false } });
    logSpy.mockClear();
    DVT_BAR.startAutoRuleObserver(document.getElementById('msgtext'), rule);
    DVT_BAR.logAutoRuleSnapshot('test');
    expect(dvtLogs(logSpy)).toEqual([]);
  });
});

describe('ページ全体翻訳のデバッグログ（content-page）', () => {
  let logSpy;

  beforeEach(() => {
    __resetMockStorage();
    chrome.storage.local.set({ debugLog: true });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    loadScript('i18n.js', 'content-core.js', 'content-page.js');
    DVT.state.pageTranslateActive = false;
    DVT.state.pageTranslateMode = null;
  });

  afterEach(() => {
    if (DVT.state.pageTranslateActive) DVT_PAGE.undoPageTranslate();
    document.body.replaceChildren();
    logSpy.mockRestore();
  });

  it('翻訳対象 0 件で終わったことと、ページ監視を開始しないことを記録する', async () => {
    document.body.replaceChildren();
    await DVT_PAGE.translatePage('ja');
    const logs = dvtLogs(logSpy);
    expect(logs.some(l => l.includes('[page] ページ全体翻訳 開始 tl=ja 対象 0 件'))).toBe(true);
    expect(logs.some(l => l.includes('対象 0 件のため終了（ページ監視は開始しない）'))).toBe(true);
    // 状態: 翻訳は有効扱いなのにページ監視が無い
    expect(DVT_PAGE.getDebugState()).toMatch(/pageTranslateActive=true mode=translate ページ監視=false/);
  });

  it('翻訳後はページ監視が動いていることを状態に出す', async () => {
    const p = document.createElement('p');
    p.textContent = 'Hello world from the page';
    document.body.replaceChildren(p);
    await DVT_PAGE.translatePage('ja');
    const state = DVT_PAGE.getDebugState();
    expect(state).toMatch(/pageTranslateActive=true mode=translate ページ監視=true 監視中body=現在のbody:true/);
    expect(state).toMatch(/翻訳済み要素=1/);
  });

  it('body が差し替えられたら 監視中body=現在のbody:false になる', async () => {
    const p = document.createElement('p');
    p.textContent = 'Hello world from the page';
    document.body.replaceChildren(p);
    await DVT_PAGE.translatePage('ja');
    const oldBody = document.body;
    document.documentElement.replaceChild(document.createElement('body'), oldBody);
    try {
      expect(DVT_PAGE.getDebugState()).toMatch(/監視中body=現在のbody:false/);
    } finally {
      document.documentElement.replaceChild(oldBody, document.body);
    }
  });

  it('受信したメッセージの action を記録する', () => {
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    listener({ action: 'getState' }, {}, () => {});
    expect(dvtLogs(logSpy).some(l => l.includes('メッセージ受信 action=getState'))).toBe(true);
  });
});
