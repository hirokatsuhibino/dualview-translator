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
  chrome.permissions.request.mockClear();
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
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://api-free.deepl.com/*'] });
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
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://api.anthropic.com/*'] });
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
});
