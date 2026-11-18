// Copyright (c) Orangesoft Inc.
// popup の APIキー入力欄（Issue #262）の jsdom 統合テスト
// popup.html の body と popup.js を実際に読み込み、入力・クリックで生成される DOM を検証する。
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadScript } from './helpers.js';

const html = readFileSync(resolve(import.meta.dirname, '..', 'popup.html'), 'utf-8');
const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');

// popup.js が使うが setup.js に無い API を一時的に足す（テスト終了時に元へ戻す）
const saved = {};
const calls = [];
let testApiKeyResponse;
// 指定すると testApiKey の応答を遅らせ、テスト側から呼び出せるようにする
let deferTestApiKey = false;
let pendingTestApiKey = [];

beforeAll(async () => {
  saved.runtime = { ...chrome.runtime };
  saved.tabs = { ...chrome.tabs };
  saved.storageLocal = { ...chrome.storage.local };
  saved.management = chrome.management;
  saved.permissions = chrome.permissions;

  // 実ブラウザ同様 storage.get のコールバックを非同期にする（同期だと popup.js の初期化順が実機と変わる）
  const syncGet = saved.storageLocal.get;
  chrome.storage.local.get = vi.fn((keys, cb) => {
    const p = syncGet(keys);
    if (cb) p.then(cb);
    return p;
  });
  chrome.runtime.getManifest = () => ({ version: '0.0.0-test' });
  chrome.runtime.sendMessage = vi.fn((msg, cb) => {
    calls.push(['sendMessage', msg.action]);
    if (msg.action === 'testApiKey' && deferTestApiKey) {
      const res = testApiKeyResponse;
      pendingTestApiKey.push(() => cb && cb(res));
      return;
    }
    const res = msg.action === 'testApiKey' ? testApiKeyResponse : { ok: true };
    if (cb) cb(res);
  });
  chrome.tabs.query = vi.fn((_q, cb) => { const tabs = [{ id: 1, url: 'https://example.com/' }]; if (cb) cb(tabs); return Promise.resolve(tabs); });
  chrome.tabs.sendMessage = vi.fn((_id, _msg, cb) => { if (cb) cb(undefined); return Promise.resolve(); });
  chrome.storage.local.remove = vi.fn((_k, cb) => { if (cb) cb(); return Promise.resolve(); });
  chrome.management = { getSelf: (cb) => cb({ installType: 'normal' }) };
  chrome.permissions = {
    request: vi.fn((req) => { calls.push(['request', req.origins[0]]); return Promise.resolve(true); }),
  };

  globalThis.__resetMockStorage();
  document.body.innerHTML = bodyHtml;
  loadScript('i18n.js', 'popup.js');
  await new Promise(r => setTimeout(r, 0));
  DVT_I18N.setLang('ja');
});

afterAll(() => {
  Object.assign(chrome.runtime, saved.runtime);
  Object.assign(chrome.tabs, saved.tabs);
  Object.assign(chrome.storage.local, saved.storageLocal);
  chrome.management = saved.management;
  chrome.permissions = saved.permissions;
  document.body.innerHTML = '';
});

beforeEach(() => {
  calls.length = 0;
  deferTestApiKey = false;
  pendingTestApiKey = [];
  chrome.permissions = {
    request: vi.fn((req) => { calls.push(['request', req.origins[0]]); return Promise.resolve(true); }),
  };
});

const $ = (id) => document.getElementById(id);
const msgFor = (inputId) => $(inputId).closest('.lang-row').nextElementSibling;
function typeKey(inputId, value) {
  const input = $(inputId);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe('APIキー入力欄（popup）', () => {
  it('3 つのキー入力欄それぞれに表示切替ボタンと理由表示欄が付く', () => {
    ['deeplApiKey', 'claudeApiKey', 'geminiApiKey'].forEach(id => {
      const wrap = $(id).closest('.dvt-api-key-wrap');
      expect(wrap.querySelector('.dvt-api-key-toggle')).not.toBeNull();
      const msg = msgFor(id);
      expect(msg.classList.contains('dvt-api-key-msg')).toBe(true);
      expect(msg.getAttribute('aria-live')).toBe('polite');
      expect(msg.hidden).toBe(true);
    });
  });

  it('表示切替ボタンで password ⇔ text を切り替え、aria-pressed / aria-label も追従する', () => {
    const input = $('deeplApiKey');
    const toggle = input.closest('.dvt-api-key-wrap').querySelector('.dvt-api-key-toggle');
    expect(input.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe(t('apiKeyHide'));
    toggle.click();
    expect(input.type).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe(t('apiKeyShow'));
  });

  it('全角文字を含むキーを入力すると位置付きで警告し、空白・ゼロ幅文字は除いて保存する', async () => {
    typeKey('deeplApiKey', ' abcテ\u200Bd:fx ');
    const msg = msgFor('deeplApiKey');
    expect(msg.hidden).toBe(false);
    expect(msg.textContent).toContain('4文字目');
    expect(msg.textContent).toContain('U+30C6');
    expect(msg.classList.contains('dvt-api-key-msg-ng')).toBe(true);
    const saved = await chrome.storage.local.get('deeplApiKey');
    expect(saved.deeplApiKey).toBe('abcテd:fx');

    // 不正文字のままテストを押しても送信しない
    $('deeplTestBtn').click();
    expect(calls.find(c => c[0] === 'sendMessage')).toBeUndefined();
    expect($('deeplTestBtn').classList.contains('dvt-test-ng')).toBe(true);

    // 正しいキーに直すと警告が消える
    typeKey('deeplApiKey', 'abcd:fx');
    expect(msg.hidden).toBe(true);
  });

  it('テスト時は検証メッセージ送信より前に host 権限を要求し、権限不足の理由を入力欄の下に残す', async () => {
    testApiKeyResponse = { ok: false, error: 'NetworkError when attempting to fetch resource.', errorCode: 'noPermission', errorParams: { host: 'api-free.deepl.com' } };
    typeKey('deeplApiKey', 'abcd:fx');
    $('deeplTestBtn').click();
    // permissions.request はクリックの同期区間内で呼ばれている（Firefox のユーザー操作要件）
    expect(chrome.permissions.request.mock.calls[0][0]).toEqual({ origins: ['https://api-free.deepl.com/*'] });
    await flush();
    expect(calls.map(c => c[0])).toEqual(['request', 'sendMessage']);
    const msg = msgFor('deeplApiKey');
    expect(msg.hidden).toBe(false);
    expect(msg.textContent).toContain('api-free.deepl.com へのアクセスが許可されていません');
    expect($('deeplTestBtn').textContent).toBe(t('apiKeyInvalid'));
  });

  it('Claude のテストは Anthropic のオリジンを要求し、成功時は理由表示を消す', async () => {
    testApiKeyResponse = { ok: true };
    typeKey('claudeApiKey', 'sk-ant-test');
    $('claudeTestBtn').click();
    expect(chrome.permissions.request.mock.calls[0][0]).toEqual({ origins: ['https://api.anthropic.com/*'] });
    await flush();
    expect($('claudeTestBtn').textContent).toBe(t('apiKeyValid'));
    expect(msgFor('claudeApiKey').hidden).toBe(true);
  });

  it('permissions API が無い環境でもテストは実行される', async () => {
    const perms = chrome.permissions;
    chrome.permissions = undefined;
    try {
      testApiKeyResponse = { ok: false, error: 'Gemini: x', errorCode: 'invalidKey' };
      typeKey('geminiApiKey', 'AIza-test');
      $('geminiTestBtn').click();
      await flush();
      expect(calls.map(c => c[0])).toEqual(['sendMessage']);
      expect(msgFor('geminiApiKey').textContent).toBe(t('apiErrInvalidKey'));
    } finally {
      chrome.permissions = perms;
    }
  });

  it('Firefox のコールバック式 permissions.request でも、許可ダイアログに回答するまで検証を送らない', async () => {
    let answer;
    chrome.permissions = {
      request: vi.fn((req, cb) => { calls.push(['request', req.origins[0]]); answer = cb; return undefined; }),
    };
    testApiKeyResponse = { ok: true };
    typeKey('deeplApiKey', 'abcd:fx');
    $('deeplTestBtn').click();
    await flush();
    expect(calls.map(c => c[0])).toEqual(['request']); // まだ送っていない
    answer(true);
    await flush();
    expect(calls.map(c => c[0])).toEqual(['request', 'sendMessage']);
    expect($('deeplTestBtn').textContent).toBe(t('apiKeyValid'));
  });

  it('テスト中にキーを編集したら、古いキーの結果を表示しない', async () => {
    deferTestApiKey = true;
    testApiKeyResponse = { ok: false, errorCode: 'invalidKey' };
    typeKey('deeplApiKey', 'wrong:fx');
    $('deeplTestBtn').click();
    await flush();
    expect(pendingTestApiKey).toHaveLength(1);
    expect($('deeplTestBtn').disabled).toBe(true);

    // 応答待ちの間に正しいキーへ修正 → ボタンは初期状態に戻る
    typeKey('deeplApiKey', 'right:fx');
    expect($('deeplTestBtn').textContent).toBe(t('apiKeyTest'));
    expect($('deeplTestBtn').disabled).toBe(false);

    // 旧キーの失敗が遅れて届いても表示は変わらない
    pendingTestApiKey[0]();
    expect(msgFor('deeplApiKey').hidden).toBe(true);
    expect($('deeplTestBtn').textContent).toBe(t('apiKeyTest'));
    expect($('deeplTestBtn').classList.contains('dvt-test-ng')).toBe(false);
  });

  it('結果表示から 3 秒後のリセットは、その後のテスト結果を消さない', async () => {
    vi.useFakeTimers();
    try {
      testApiKeyResponse = { ok: true };
      typeKey('claudeApiKey', 'sk-1');
      $('claudeTestBtn').click();
      await vi.advanceTimersByTimeAsync(0);
      expect($('claudeTestBtn').textContent).toBe(t('apiKeyValid'));
      await vi.advanceTimersByTimeAsync(2000);
      // 2 回目のテスト（1 回目のタイマーは無効化される）
      testApiKeyResponse = { ok: false, errorCode: 'invalidKey' };
      $('claudeTestBtn').click();
      await vi.advanceTimersByTimeAsync(0);
      expect($('claudeTestBtn').textContent).toBe(t('apiKeyInvalid'));
      await vi.advanceTimersByTimeAsync(1500); // 1 回目のタイマー発火時刻を過ぎる
      expect($('claudeTestBtn').textContent).toBe(t('apiKeyInvalid'));
      await vi.advanceTimersByTimeAsync(2000);
      expect($('claudeTestBtn').textContent).toBe(t('apiKeyTest'));
      expect(msgFor('claudeApiKey').textContent).toBe(t('apiErrInvalidKey')); // 理由表示は残る
    } finally {
      vi.useRealTimers();
    }
  });
});

// 理由表示の文字色が WCAG AA（通常テキスト 4.5:1）を満たすか、popup.html の CSS 変数から計算して検証する
describe('APIキー理由表示の色コントラスト（WCAG AA）', () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  // 指定ブロック内の CSS 変数値を取る
  function varsIn(blockStart) {
    const i = css.indexOf(blockStart);
    expect(i, blockStart).toBeGreaterThanOrEqual(0);
    const body = css.slice(i, css.indexOf('}', i));
    const get = (name) => (body.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
    return { bg: get('bg'), bg2: get('bg2'), err: get('dvt-err-text'), ok: get('dvt-ok-text') };
  }
  function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  }

  it.each([
    ['ダーク（:root）', ':root {'],
    ['ライト（prefers-color-scheme）', '@media (prefers-color-scheme: light) {\n      :root {'],
    ['ライト（.dvt-light フォールバック）', ':root.dvt-light {'],
  ])('%s: エラー色・成功色が背景に対して 4.5:1 以上', (_label, block) => {
    const v = varsIn(block);
    expect(v.err).toBeTruthy();
    expect(v.ok).toBeTruthy();
    [v.bg, v.bg2].forEach(bg => {
      expect(contrast(v.err, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v.ok, bg)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('理由表示は CSS 変数の色を使う（固定色を使わない）', () => {
    expect(css).toMatch(/\.dvt-api-key-msg\.dvt-api-key-msg-ng\s*\{\s*color:\s*var\(--dvt-err-text\)/);
    expect(css).toMatch(/\.dvt-api-key-msg\.dvt-api-key-msg-ok\s*\{\s*color:\s*var\(--dvt-ok-text\)/);
  });
});

