// Copyright (c) Orangesoft Inc
// 端末間同期（issue #205）のミラーロジックテスト。
// background.js は Service Worker 用スクリプトで直接 import できないため、
// 該当の純粋関数を正規表現で抽出して実体をテストする（background.test.js と同様の手法）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let deepEqualSync;
let pickSyncMirrorPayload;
let pickLocalUpdateFromSync;
let planInitialSyncMerge;
let SYNC_KEYS;

beforeAll(() => {
  const code = readFileSync(resolve(import.meta.dirname, '..', 'background.js'), 'utf-8');

  // SYNC_KEYS 定数を抽出
  const keysMatch = code.match(/const SYNC_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  if (!keysMatch) throw new Error('SYNC_KEYS not found in background.js');
  SYNC_KEYS = new Function(`return [${keysMatch[1]}];`)();

  // 各純粋関数を抽出して実関数として注入
  function extractFn(name, params) {
    const re = new RegExp(`function ${name}\\(([^)]*)\\)\\s*\\{[\\s\\S]*?\\n\\}`);
    const m = code.match(re);
    if (!m) throw new Error(`${name} not found in background.js`);
    const body = m[0].replace(/^function[^{]+\{/, '').replace(/\}$/, '');
    return new Function(...params, body);
  }
  // 依存関係: pickSyncMirrorPayload, pickLocalUpdateFromSync, planInitialSyncMerge は
  // SYNC_KEYS と deepEqualSync を参照する。Function コンストラクタでクロージャに渡す。
  deepEqualSync = extractFn('deepEqualSync', ['a', 'b']);

  // 他関数は SYNC_KEYS / deepEqualSync をスコープに含めて生成
  function extractFnWithDeps(name, params) {
    const re = new RegExp(`function ${name}\\(([^)]*)\\)\\s*\\{[\\s\\S]*?\\n\\}`);
    const m = code.match(re);
    if (!m) throw new Error(`${name} not found`);
    return new Function('SYNC_KEYS', 'deepEqualSync', ...params,
      `${m[0]} return ${name}(${params.join(', ')});`);
  }
  const _pickMirror = extractFnWithDeps('pickSyncMirrorPayload', ['changes']);
  pickSyncMirrorPayload = (changes) => _pickMirror(SYNC_KEYS, deepEqualSync, changes);

  const _pickLocal = extractFnWithDeps('pickLocalUpdateFromSync', ['changes', 'currentLocal']);
  pickLocalUpdateFromSync = (c, cur) => _pickLocal(SYNC_KEYS, deepEqualSync, c, cur);

  const _planMerge = extractFnWithDeps('planInitialSyncMerge', ['localData', 'syncData']);
  planInitialSyncMerge = (l, s) => _planMerge(SYNC_KEYS, deepEqualSync, l, s);
});

describe('SYNC_KEYS 定数', () => {
  it('期待される 6 キーを含む', () => {
    expect(SYNC_KEYS).toEqual([
      'targetLang', 'translateEngine', 'llmEngine',
      'autoRules', 'dismissedDomains', 'uiLang'
    ]);
  });

  it('API キーは含まれない（漏洩防止）', () => {
    expect(SYNC_KEYS).not.toContain('deeplApiKey');
    expect(SYNC_KEYS).not.toContain('claudeApiKey');
    expect(SYNC_KEYS).not.toContain('geminiApiKey');
  });

  it('端末固有キー (dvtTheme / appleAvailable) は含まれない', () => {
    expect(SYNC_KEYS).not.toContain('dvtTheme');
    expect(SYNC_KEYS).not.toContain('appleAvailable');
  });
});

describe('local → sync ミラー (pickSyncMirrorPayload)', () => {
  it('SYNC_KEYS の変更のみが sync 側に書き出される', () => {
    const { toSet, toRemove } = pickSyncMirrorPayload({
      targetLang: { newValue: 'en', oldValue: 'ja' },
      autoRules: { newValue: [{ id: 'r1', urlPattern: '*' }], oldValue: [] },
      deeplApiKey: { newValue: 'secret-key', oldValue: '' },
      cacheHitStats: { newValue: { tcHits: 1 }, oldValue: null },
    });
    expect(toSet.targetLang).toBe('en');
    expect(toSet.autoRules).toEqual([{ id: 'r1', urlPattern: '*' }]);
    expect(toSet.deeplApiKey).toBeUndefined();
    expect(toSet.cacheHitStats).toBeUndefined();
    expect(toRemove).toEqual([]);
  });

  it('newValue が undefined のキーは sync 側から削除する', () => {
    const { toSet, toRemove } = pickSyncMirrorPayload({
      autoRules: { newValue: undefined, oldValue: [] },
    });
    expect(toSet.autoRules).toBeUndefined();
    expect(toRemove).toEqual(['autoRules']);
  });

  it('SYNC_KEYS が無い変更では何も書き出さない', () => {
    const { toSet, toRemove } = pickSyncMirrorPayload({
      deeplApiKey: { newValue: 'k', oldValue: '' },
      'tc:abc': { newValue: 'x', oldValue: null },
    });
    expect(toSet).toEqual({});
    expect(toRemove).toEqual([]);
  });
});

describe('sync → local ミラー (pickLocalUpdateFromSync, 無限ループ防止)', () => {
  it('同値変更は無視される（ループ防止）', () => {
    const toSet = pickLocalUpdateFromSync({
      targetLang: { newValue: 'en', oldValue: 'ja' },
      autoRules: { newValue: [{ id: 'r1', urlPattern: '*' }], oldValue: [] },
    }, { targetLang: 'en', autoRules: [{ id: 'r1', urlPattern: '*' }] });
    expect(toSet).toEqual({});
  });

  it('異なる値だけが反映される', () => {
    const toSet = pickLocalUpdateFromSync({
      targetLang: { newValue: 'fr', oldValue: 'en' },
      uiLang: { newValue: 'ja', oldValue: 'ja' },
    }, { targetLang: 'en', uiLang: 'ja' });
    expect(toSet).toEqual({ targetLang: 'fr' });
  });

  it('SYNC_KEYS 以外の sync 変更は無視', () => {
    const toSet = pickLocalUpdateFromSync({
      maliciousKey: { newValue: 'evil', oldValue: null },
    }, {});
    expect(toSet).toEqual({});
  });

  it('newValue が undefined （sync 側削除）は反映しない', () => {
    const toSet = pickLocalUpdateFromSync({
      autoRules: { newValue: undefined, oldValue: [{ id: 'r1', urlPattern: '*' }] },
    }, { autoRules: [{ id: 'r1', urlPattern: '*' }] });
    expect(toSet).toEqual({});
  });
});

describe('初回合流 (planInitialSyncMerge)', () => {
  it('クラウドに既存値があればローカルへ反映、ローカル独自はクラウドへ push', () => {
    const { toLocal, toSync } = planInitialSyncMerge(
      { targetLang: 'ja', autoRules: [{ id: 'local', urlPattern: '*' }] },
      { targetLang: 'en', uiLang: 'en' }
    );
    expect(toLocal.targetLang).toBe('en');
    expect(toSync.autoRules).toEqual([{ id: 'local', urlPattern: '*' }]);
    expect(toSync.targetLang).toBeUndefined();
  });

  it('クラウド・ローカルとも空ならどちらも変化なし', () => {
    const { toLocal, toSync } = planInitialSyncMerge({}, {});
    expect(toLocal).toEqual({});
    expect(toSync).toEqual({});
  });

  it('クラウドが完全に空ならローカル全件を push', () => {
    const localData = {
      targetLang: 'ja', translateEngine: 'deepl', autoRules: [{ id: 'r1', urlPattern: '*' }]
    };
    const { toLocal, toSync } = planInitialSyncMerge(localData, {});
    expect(toLocal).toEqual({});
    expect(toSync).toEqual(localData);
  });

  it('既に同値ならローカル書き換えしない', () => {
    const { toLocal, toSync } = planInitialSyncMerge(
      { targetLang: 'ja' },
      { targetLang: 'ja' }
    );
    expect(toLocal).toEqual({});
    expect(toSync).toEqual({});
  });
});

describe('deepEqualSync', () => {
  it('オブジェクト/配列を JSON 経由で正しく比較', () => {
    expect(deepEqualSync([{ id: 'r1' }], [{ id: 'r1' }])).toBe(true);
    expect(deepEqualSync([{ id: 'r1' }], [{ id: 'r2' }])).toBe(false);
    expect(deepEqualSync({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('undefined 同士は equal', () => {
    expect(deepEqualSync(undefined, undefined)).toBe(true);
  });

  it('片方だけ undefined は false', () => {
    expect(deepEqualSync(undefined, 'x')).toBe(false);
    expect(deepEqualSync('x', undefined)).toBe(false);
  });

  it('null と undefined は区別する', () => {
    expect(deepEqualSync(null, null)).toBe(true);
    expect(deepEqualSync(null, undefined)).toBe(false);
  });
});
