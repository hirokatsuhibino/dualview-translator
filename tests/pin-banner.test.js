// Copyright (c) Orangesoft Inc
// popup-init.js のピン留め誘導バナー表示ロジックのテスト（#244 / #247）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadScript } from './helpers.js';

// popup.html のバナー部分の最小 DOM を用意する
function setupDom() {
  document.body.innerHTML = `
    <div class="dvt-pin-banner" id="pinBanner">
      <span class="dvt-pin-banner-text" data-i18n="pinBannerText"></span>
      <button class="dvt-pin-banner-close" id="pinBannerClose"></button>
    </div>
  `;
}

// マイクロタスク（getUserSettings の Promise 解決）をフラッシュする
function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

describe('ピン留め誘導バナー（popup-init.js / #244）', () => {
  beforeEach(() => {
    globalThis.__resetMockStorage();
    setupDom();
  });

  afterEach(() => {
    delete globalThis.chrome.action;
    document.body.innerHTML = '';
  });

  it('未ピン留め（isOnToolbar=false）のときバナーを表示する', async () => {
    globalThis.chrome.action = { getUserSettings: () => Promise.resolve({ isOnToolbar: false }) };
    loadScript('popup-init.js');
    await flush();
    expect(document.getElementById('pinBanner').classList.contains('show')).toBe(true);
  });

  it('ピン留め済み（isOnToolbar=true）のときバナーを表示しない', async () => {
    globalThis.chrome.action = { getUserSettings: () => Promise.resolve({ isOnToolbar: true }) };
    loadScript('popup-init.js');
    await flush();
    expect(document.getElementById('pinBanner').classList.contains('show')).toBe(false);
  });

  it('一度閉じた（pinBannerDismissed=true）あとは表示しない', async () => {
    globalThis.chrome.storage.local.set({ pinBannerDismissed: true });
    globalThis.chrome.action = { getUserSettings: () => Promise.resolve({ isOnToolbar: false }) };
    loadScript('popup-init.js');
    await flush();
    expect(document.getElementById('pinBanner').classList.contains('show')).toBe(false);
  });

  it('非対応環境（getUserSettings 無し）でも表示し、例外を投げない（#247）', async () => {
    // chrome.action 自体が無い
    expect(() => loadScript('popup-init.js')).not.toThrow();
    await flush();
    expect(document.getElementById('pinBanner').classList.contains('show')).toBe(true);
  });

  it('非対応環境では表示回数が上限(3回)に達すると出さなくなる（#247）', async () => {
    // 1〜3 回目は表示され、カウントが進む
    for (let i = 1; i <= 3; i++) {
      setupDom();
      loadScript('popup-init.js');
      await flush();
      expect(document.getElementById('pinBanner').classList.contains('show')).toBe(true);
      const s = await globalThis.chrome.storage.local.get('pinBannerShownCount');
      expect(s.pinBannerShownCount).toBe(i);
    }
    // 4 回目は上限到達で非表示
    setupDom();
    loadScript('popup-init.js');
    await flush();
    expect(document.getElementById('pinBanner').classList.contains('show')).toBe(false);
  });

  it('検出可能な環境では回数カウントを進めない（#247）', async () => {
    globalThis.chrome.action = { getUserSettings: () => Promise.resolve({ isOnToolbar: false }) };
    loadScript('popup-init.js');
    await flush();
    const s = await globalThis.chrome.storage.local.get('pinBannerShownCount');
    expect(s.pinBannerShownCount).toBeUndefined();
  });

  it('閉じるボタンでバナーを隠し、dismissed フラグを永続化する', async () => {
    globalThis.chrome.action = { getUserSettings: () => Promise.resolve({ isOnToolbar: false }) };
    loadScript('popup-init.js');
    await flush();
    const banner = document.getElementById('pinBanner');
    expect(banner.classList.contains('show')).toBe(true);

    document.getElementById('pinBannerClose').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(banner.classList.contains('show')).toBe(false);

    const stored = await globalThis.chrome.storage.local.get('pinBannerDismissed');
    expect(stored.pinBannerDismissed).toBe(true);
  });
});
