// Copyright (c) Orangesoft Inc.
// background.js の設定ミラー機構（chrome.storage.local → App Group UserDefaults）テスト

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let MIRRORED_KEYS;
let pickMirroredEntries;
let mirrorSettingsToNative;
let initSettingsMirror;

beforeAll(() => {
  const code = readFileSync(resolve(import.meta.dirname, '..', 'background.js'), 'utf-8');

  // MIRRORED_KEYS（const Object.freeze 配列）
  const keysMatch = code.match(/const MIRRORED_KEYS\s*=\s*Object\.freeze\(\[[\s\S]*?\]\);/);
  if (!keysMatch) throw new Error('background-mirror-settings.test.js: MIRRORED_KEYS の正規表現抽出に失敗');

  // pickMirroredEntries（純粋関数）
  const pickMatch = code.match(/function pickMirroredEntries\(changes\)\s*\{[\s\S]*?\n\}/);
  if (!pickMatch) throw new Error('pickMirroredEntries の正規表現抽出に失敗');
  const pickFn = new Function(`${keysMatch[0]}\n${pickMatch[0]}\nreturn { MIRRORED_KEYS, pickMirroredEntries };`);
  ({ MIRRORED_KEYS, pickMirroredEntries } = pickFn());

  // mirrorSettingsToNative（async / chrome.runtime.sendNativeMessage 利用）
  const mirrorFnMatch = code.match(/async function mirrorSettingsToNative\(entries\)\s*\{[\s\S]*?\n\}/);
  if (!mirrorFnMatch) throw new Error('mirrorSettingsToNative の正規表現抽出に失敗');
  // NATIVE_ACTIONS / NATIVE_HOST_ID / HAS_NATIVE_MESSAGING も注入しないと動かない
  const consts = `
    const HAS_NATIVE_MESSAGING = typeof chrome.runtime?.sendNativeMessage === 'function';
    const NATIVE_HOST_ID = 'jp.co.orangesoft.dualview-translator';
    const NATIVE_ACTIONS = { MIRROR_SETTINGS: 'mirrorSettings' };
  `;
  const mirrorWrapper = new Function('chrome', `${consts}\n${mirrorFnMatch[0]}\nreturn mirrorSettingsToNative;`);
  mirrorSettingsToNative = (entries, fakeChrome) => mirrorWrapper(fakeChrome ?? globalThis.chrome)(entries);

  // initSettingsMirror（chrome.storage.local.get + mirrorSettingsToNative 利用）
  const initMatch = code.match(/async function initSettingsMirror\(\)\s*\{[\s\S]*?\n\}/);
  if (!initMatch) throw new Error('initSettingsMirror の正規表現抽出に失敗');
  const initWrapper = new Function('chrome', `
    ${consts}
    ${keysMatch[0]}
    ${mirrorFnMatch[0]}
    ${initMatch[0]}
    return initSettingsMirror;
  `);
  initSettingsMirror = (fakeChrome) => initWrapper(fakeChrome ?? globalThis.chrome)();
});

describe('MIRRORED_KEYS', () => {
  it('共有対象キーが期待される 8 件揃っている', () => {
    expect(MIRRORED_KEYS).toEqual([
      'targetLang', 'uiLang', 'dvtTheme',
      'translateEngine', 'deeplApiKey',
      'llmEngine', 'claudeApiKey', 'geminiApiKey',
    ]);
  });

  it('Object.freeze で凍結されている（誤改変防止）', () => {
    expect(Object.isFrozen(MIRRORED_KEYS)).toBe(true);
  });
});

describe('pickMirroredEntries()', () => {
  it('対象キーの newValue を entries に拾う', () => {
    const changes = {
      uiLang: { oldValue: 'ja', newValue: 'en' },
      targetLang: { oldValue: 'en', newValue: 'ja' },
    };
    expect(pickMirroredEntries(changes)).toEqual({
      uiLang: 'en',
      targetLang: 'ja',
    });
  });

  it('非対象キー（dismissedDomains / autoRules / appleAvailable）は除外', () => {
    const changes = {
      dismissedDomains: { newValue: ['example.com'] },
      autoRules: { newValue: [] },
      appleAvailable: { newValue: true },
      'tc:google:ja:en:abc': { newValue: { translated: 'x' } },
    };
    expect(pickMirroredEntries(changes)).toEqual({});
  });

  it('対象と非対象が混在しているとき対象のみ拾う', () => {
    const changes = {
      uiLang: { newValue: 'ko' },
      autoRules: { newValue: [] },
      claudeApiKey: { newValue: 'sk-test' },
    };
    expect(pickMirroredEntries(changes)).toEqual({
      uiLang: 'ko',
      claudeApiKey: 'sk-test',
    });
  });

  it('newValue が undefined（キー削除）のときは null として扱う', () => {
    const changes = {
      deeplApiKey: { oldValue: 'old-key', newValue: undefined },
    };
    expect(pickMirroredEntries(changes)).toEqual({
      deeplApiKey: null,
    });
  });

  it('変更が空のとき空オブジェクトを返す', () => {
    expect(pickMirroredEntries({})).toEqual({});
  });

  it('全 8 つの対象キーを 1 度の changes で拾える', () => {
    const changes = {};
    for (const key of MIRRORED_KEYS) {
      changes[key] = { newValue: `value-${key}` };
    }
    const result = pickMirroredEntries(changes);
    expect(Object.keys(result)).toHaveLength(8);
    for (const key of MIRRORED_KEYS) {
      expect(result[key]).toBe(`value-${key}`);
    }
  });
});

describe('mirrorSettingsToNative()', () => {
  let fakeChrome;
  let sendNativeMessageMock;

  beforeEach(() => {
    sendNativeMessageMock = vi.fn().mockResolvedValue({ ok: true, applied: 2 });
    fakeChrome = {
      runtime: {
        sendNativeMessage: sendNativeMessageMock,
      },
    };
  });

  it('sendNativeMessage を action=mirrorSettings で呼ぶ', async () => {
    await mirrorSettingsToNative({ uiLang: 'en' }, fakeChrome);
    expect(sendNativeMessageMock).toHaveBeenCalledTimes(1);
    const [hostId, payload] = sendNativeMessageMock.mock.calls[0];
    expect(hostId).toBe('jp.co.orangesoft.dualview-translator');
    expect(payload.action).toBe('mirrorSettings');
    expect(payload.entries).toEqual({ uiLang: 'en' });
  });

  it('entries が空なら呼ばない（無駄な native 通信を抑止）', async () => {
    await mirrorSettingsToNative({}, fakeChrome);
    expect(sendNativeMessageMock).not.toHaveBeenCalled();
  });

  it('entries が null/undefined でも例外を投げない', async () => {
    await expect(mirrorSettingsToNative(null, fakeChrome)).resolves.toBeUndefined();
    await expect(mirrorSettingsToNative(undefined, fakeChrome)).resolves.toBeUndefined();
    expect(sendNativeMessageMock).not.toHaveBeenCalled();
  });

  it('Native 側エラーでもアプリ機能を止めない（throw しない）', async () => {
    sendNativeMessageMock.mockRejectedValue(new Error('Native host disconnected'));
    // console.warn は呼ばれるが throw しないこと
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(mirrorSettingsToNative({ uiLang: 'en' }, fakeChrome)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('sendNativeMessage が無い環境（Chrome 等）では何もしない', async () => {
    const noNativeChrome = { runtime: {} };
    await expect(mirrorSettingsToNative({ uiLang: 'en' }, noNativeChrome)).resolves.toBeUndefined();
  });

  it('複数キーをまとめて送れる', async () => {
    const entries = {
      uiLang: 'fr',
      targetLang: 'de',
      claudeApiKey: 'sk-xxx',
    };
    await mirrorSettingsToNative(entries, fakeChrome);
    const [, payload] = sendNativeMessageMock.mock.calls[0];
    expect(payload.entries).toEqual(entries);
  });
});

describe('initSettingsMirror()', () => {
  let fakeChrome;
  let sendNativeMessageMock;
  let storageGetMock;

  beforeEach(() => {
    sendNativeMessageMock = vi.fn().mockResolvedValue({ ok: true });
    storageGetMock = vi.fn();
    fakeChrome = {
      runtime: {
        sendNativeMessage: sendNativeMessageMock,
      },
      storage: {
        local: {
          get: storageGetMock,
        },
      },
    };
  });

  it('既存値があれば 1 回だけまとめて送る', async () => {
    storageGetMock.mockImplementation((_keys, cb) => {
      cb({ uiLang: 'ja', targetLang: 'en', claudeApiKey: 'sk-init' });
    });
    await initSettingsMirror(fakeChrome);
    expect(storageGetMock).toHaveBeenCalledTimes(1);
    expect(sendNativeMessageMock).toHaveBeenCalledTimes(1);
    const [, payload] = sendNativeMessageMock.mock.calls[0];
    expect(payload.entries).toEqual({
      uiLang: 'ja',
      targetLang: 'en',
      claudeApiKey: 'sk-init',
    });
  });

  it('既存値が空なら sendNativeMessage は呼ばない', async () => {
    storageGetMock.mockImplementation((_keys, cb) => cb({}));
    await initSettingsMirror(fakeChrome);
    expect(sendNativeMessageMock).not.toHaveBeenCalled();
  });

  it('storage.local.get 失敗でも例外を投げない', async () => {
    storageGetMock.mockImplementation(() => {
      throw new Error('storage broken');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(initSettingsMirror(fakeChrome)).resolves.toBeUndefined();
    warnSpy.mockRestore();
  });

  it('sendNativeMessage 不在の環境では何もしない', async () => {
    const noNativeChrome = {
      runtime: {},
      storage: { local: { get: storageGetMock } },
    };
    await initSettingsMirror(noNativeChrome);
    // Native messaging 不在のため early return → storage も触らない（無駄な I/O 削減）
    expect(storageGetMock).not.toHaveBeenCalled();
  });
});
