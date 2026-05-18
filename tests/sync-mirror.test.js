// Copyright (c) Orangesoft Inc
// 端末間同期（issue #205）のミラーロジックテスト。
// background.js は Service Worker 用スクリプトで直接 import できないため、
// 同等のロジックを本ファイルで再実装して検証する。
// **background.js を更新したら本ファイルの定数・関数も必ず同期すること**。
import { describe, it, expect } from 'vitest';

const SYNC_KEYS = [
  'targetLang', 'translateEngine', 'llmEngine',
  'autoRules', 'dismissedDomains', 'uiLang'
];

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// local 変更を sync にミラーする処理（background.js と同等）
function buildSyncMirrorPayload(changes) {
  const toSet = {};
  const toRemove = [];
  for (const key of SYNC_KEYS) {
    if (changes[key]) {
      const newValue = changes[key].newValue;
      if (newValue === undefined) {
        toRemove.push(key);
      } else {
        toSet[key] = newValue;
      }
    }
  }
  return { toSet, toRemove };
}

// sync 変更を local に取り込む処理（無限ループ防止: 同値なら skip）
function buildLocalUpdateFromSync(changes, currentLocal) {
  const toSet = {};
  for (const key of Object.keys(changes)) {
    if (!SYNC_KEYS.includes(key)) continue;
    const newValue = changes[key].newValue;
    if (newValue === undefined) continue;
    if (!deepEqual(currentLocal[key], newValue)) {
      toSet[key] = newValue;
    }
  }
  return toSet;
}

// 初回合流ロジック（クラウド優先、ローカルに無いものは sync へ push）
function planInitialMerge(localData, syncData) {
  const toLocal = {};
  const toSync = {};
  for (const key of SYNC_KEYS) {
    if (syncData[key] !== undefined) {
      if (!deepEqual(localData[key], syncData[key])) {
        toLocal[key] = syncData[key];
      }
    } else if (localData[key] !== undefined) {
      toSync[key] = localData[key];
    }
  }
  return { toLocal, toSync };
}

describe('端末間同期: local → sync ミラー（issue #205）', () => {
  it('SYNC_KEYS の変更のみが sync 側に書き出される', () => {
    const changes = {
      targetLang: { newValue: 'en', oldValue: 'ja' },
      autoRules: { newValue: [{ id: 'r1', urlPattern: '*' }], oldValue: [] },
      deeplApiKey: { newValue: 'secret-key', oldValue: '' }, // 同期対象外
      cacheHitStats: { newValue: { tcHits: 1 }, oldValue: null }, // 同期対象外
    };
    const { toSet, toRemove } = buildSyncMirrorPayload(changes);
    expect(toSet.targetLang).toBe('en');
    expect(toSet.autoRules).toEqual([{ id: 'r1', urlPattern: '*' }]);
    expect(toSet.deeplApiKey).toBeUndefined();
    expect(toSet.cacheHitStats).toBeUndefined();
    expect(toRemove).toEqual([]);
  });

  it('newValue が undefined のキーは sync 側から削除する', () => {
    const changes = {
      autoRules: { newValue: undefined, oldValue: [] },
    };
    const { toSet, toRemove } = buildSyncMirrorPayload(changes);
    expect(toSet.autoRules).toBeUndefined();
    expect(toRemove).toEqual(['autoRules']);
  });

  it('SYNC_KEYS が無い変更では何も書き出さない', () => {
    const changes = {
      deeplApiKey: { newValue: 'k', oldValue: '' },
      'tc:abc': { newValue: 'x', oldValue: null },
    };
    const { toSet, toRemove } = buildSyncMirrorPayload(changes);
    expect(toSet).toEqual({});
    expect(toRemove).toEqual([]);
  });
});

describe('端末間同期: sync → local ミラー（無限ループ防止）', () => {
  it('同値変更は無視される（ループ防止）', () => {
    const currentLocal = { targetLang: 'en', autoRules: [{ id: 'r1', urlPattern: '*' }] };
    const changes = {
      targetLang: { newValue: 'en', oldValue: 'ja' }, // 既に同じ
      autoRules: { newValue: [{ id: 'r1', urlPattern: '*' }], oldValue: [] }, // 既に同じ
    };
    const toSet = buildLocalUpdateFromSync(changes, currentLocal);
    expect(toSet).toEqual({});
  });

  it('異なる値だけが反映される', () => {
    const currentLocal = { targetLang: 'en', uiLang: 'ja' };
    const changes = {
      targetLang: { newValue: 'fr', oldValue: 'en' },
      uiLang: { newValue: 'ja', oldValue: 'ja' }, // 同値
    };
    const toSet = buildLocalUpdateFromSync(changes, currentLocal);
    expect(toSet).toEqual({ targetLang: 'fr' });
  });

  it('SYNC_KEYS 以外の sync 変更は無視', () => {
    const changes = {
      maliciousKey: { newValue: 'evil', oldValue: null },
    };
    const toSet = buildLocalUpdateFromSync(changes, {});
    expect(toSet).toEqual({});
  });

  it('newValue が undefined （sync 側削除）は反映しない', () => {
    const currentLocal = { autoRules: [{ id: 'r1', urlPattern: '*' }] };
    const changes = {
      autoRules: { newValue: undefined, oldValue: [{ id: 'r1', urlPattern: '*' }] },
    };
    const toSet = buildLocalUpdateFromSync(changes, currentLocal);
    expect(toSet).toEqual({});
  });
});

describe('端末間同期: 初回合流（クラウド優先）', () => {
  it('クラウドに既存値があればローカルへ反映、ローカル独自はクラウドへ push', () => {
    const localData = { targetLang: 'ja', autoRules: [{ id: 'local', urlPattern: '*' }] };
    const syncData = { targetLang: 'en', uiLang: 'en' };
    const { toLocal, toSync } = planInitialMerge(localData, syncData);
    // クラウド優先で targetLang は en へ
    expect(toLocal.targetLang).toBe('en');
    // クラウドに無い uiLang は反映なし
    // ローカル独自の autoRules はクラウドへ push
    expect(toSync.autoRules).toEqual([{ id: 'local', urlPattern: '*' }]);
    // クラウド側に既にある targetLang は再 push しない
    expect(toSync.targetLang).toBeUndefined();
  });

  it('クラウド・ローカルとも空ならどちらも変化なし', () => {
    const { toLocal, toSync } = planInitialMerge({}, {});
    expect(toLocal).toEqual({});
    expect(toSync).toEqual({});
  });

  it('クラウドが完全に空ならローカル全件を push', () => {
    const localData = {
      targetLang: 'ja', translateEngine: 'deepl', autoRules: [{ id: 'r1', urlPattern: '*' }]
    };
    const { toLocal, toSync } = planInitialMerge(localData, {});
    expect(toLocal).toEqual({});
    expect(toSync).toEqual(localData);
  });

  it('既に同値ならローカル書き換えしない', () => {
    const localData = { targetLang: 'ja' };
    const syncData = { targetLang: 'ja' };
    const { toLocal, toSync } = planInitialMerge(localData, syncData);
    expect(toLocal).toEqual({});
    expect(toSync).toEqual({});
  });
});

describe('deepEqual ヘルパ', () => {
  it('オブジェクト/配列を JSON 経由で正しく比較', () => {
    expect(deepEqual([{ id: 'r1' }], [{ id: 'r1' }])).toBe(true);
    expect(deepEqual([{ id: 'r1' }], [{ id: 'r2' }])).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('undefined 同士は equal（両方 「値なし」 とみなす）', () => {
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it('片方だけ undefined は false', () => {
    expect(deepEqual(undefined, 'x')).toBe(false);
    expect(deepEqual('x', undefined)).toBe(false);
  });

  it('null と undefined は区別する', () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
  });
});
