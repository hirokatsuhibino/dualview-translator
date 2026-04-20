// Copyright (c) Orangesoft Inc
// Safari / iOS Safari 互換性テスト
// - contextMenus / commands が未定義でも background.js が起動できる
// - popup-init.js が commands 未定義時に dvt-no-shortcuts クラスを付与する
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const bgPath = resolve(import.meta.dirname, '..', 'background.js');
const popupInitPath = resolve(import.meta.dirname, '..', 'popup-init.js');

// background.js の top-level をサンドボックス内で実行する
// （chrome オブジェクトを差し替えてSafari/iOS環境を模擬）
function runBackground(chromeStub) {
  const code = readFileSync(bgPath, 'utf-8');
  const fn = new Function('chrome', 'fetch', code);
  fn(chromeStub, () => Promise.resolve({ ok: true, json: () => ({}) }));
}

function makeChromeStub({ contextMenus, commands } = {}) {
  const stub = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: () => {} },
      lastError: null,
    },
    storage: {
      local: {
        get: (_k, cb) => cb && cb({}),
        set: (_d, cb) => cb && cb(),
      },
      onChanged: { addListener: () => {} },
    },
    tabs: {
      query: () => Promise.resolve([]),
      sendMessage: () => Promise.resolve({ ok: true }),
    },
  };
  if (contextMenus) {
    stub.contextMenus = {
      create: () => {},
      update: () => {},
      onClicked: { addListener: () => {} },
    };
  }
  if (commands) {
    stub.commands = {
      onCommand: { addListener: () => {} },
    };
  }
  return stub;
}

describe('background.js Safari / iOS 互換', () => {
  it('chrome.contextMenus / chrome.commands 両方が存在しても例外が出ない（macOS Safari想定）', () => {
    expect(() => runBackground(makeChromeStub({ contextMenus: true, commands: true }))).not.toThrow();
  });

  it('chrome.contextMenus が未定義でも例外が出ない（iOS Safari想定）', () => {
    expect(() => runBackground(makeChromeStub({ contextMenus: false, commands: false }))).not.toThrow();
  });

  it('chrome.commands のみ未定義でも例外が出ない', () => {
    expect(() => runBackground(makeChromeStub({ contextMenus: true, commands: false }))).not.toThrow();
  });

  it('chrome.contextMenus のみ未定義でも例外が出ない', () => {
    expect(() => runBackground(makeChromeStub({ contextMenus: false, commands: true }))).not.toThrow();
  });
});

describe('popup-init.js Safari / iOS 互換', () => {
  let originalCommands;

  beforeEach(() => {
    // 初期化前に documentElement のクラスをリセット
    document.documentElement.className = '';
    originalCommands = globalThis.chrome.commands;
  });

  afterEach(() => {
    globalThis.chrome.commands = originalCommands;
    document.documentElement.className = '';
  });

  function runPopupInit() {
    const code = readFileSync(popupInitPath, 'utf-8');
    const fn = new Function(code);
    fn();
  }

  it('chrome.commands が存在する場合は dvt-no-shortcuts クラスを付与しない', () => {
    runPopupInit();
    expect(document.documentElement.classList.contains('dvt-no-shortcuts')).toBe(false);
  });

  it('chrome.commands が未定義の場合は dvt-no-shortcuts クラスを付与する（iOS Safari想定）', () => {
    delete globalThis.chrome.commands;
    runPopupInit();
    expect(document.documentElement.classList.contains('dvt-no-shortcuts')).toBe(true);
  });
});

describe('manifest.json Safari 互換', () => {
  it('host_permissions から <all_urls> を除去済み', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '..', 'manifest.json'), 'utf-8')
    );
    expect(manifest.host_permissions).not.toContain('<all_urls>');
  });

  it('翻訳・要約エンジンのAPIホストはhost_permissionsに残っている', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '..', 'manifest.json'), 'utf-8')
    );
    expect(manifest.host_permissions).toContain('https://translate.googleapis.com/*');
    expect(manifest.host_permissions).toContain('https://api.anthropic.com/*');
    expect(manifest.host_permissions).toContain('https://generativelanguage.googleapis.com/*');
  });
});
