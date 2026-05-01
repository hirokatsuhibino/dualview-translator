// Copyright (c) Orangesoft Inc
// 翻訳・要約キャッシュのロジックテスト（tc: / sc: 両プレフィックス）
// background.js から pure 関数・クラス非依存ロジックを抽出して検証する
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// background.js の該当関数を sandbox で実行するためのローダー
function loadCacheModule() {
  const src = readFileSync(resolve(import.meta.dirname, '..', 'background.js'), 'utf-8');
  // キャッシュ関連の関数と定数をまとめて extract して eval
  const names = [
    'TC_PREFIX', 'TC_MAX_ENTRIES', 'TC_TTL_MS', 'TC_EVICT_RATIO',
    'SC_PREFIX', 'SC_MAX_ENTRIES', 'SC_TTL_MS', 'SC_EVICT_RATIO',
    'HIT_STATS_KEY', 'CLAUDE_SUMMARY_MODEL',
    '_hitStatsQueue',
    'storageGet', 'storageSet', 'storageRemove', 'storageGetKeys',
    'recordCacheAccess', 'calcHitRate',
    'hashText', 'buildCacheKey', 'buildSummaryCacheKey', 'getCached', 'setCached',
    'getCacheEntriesByPrefix', 'pickEntriesByPrefix', 'evictEntries',
    'evictByPrefix', 'evictIfNeeded', 'clearCache', 'getCacheStats',
  ];
  const defs = names.map(n => {
    // const / async function / function いずれのパターンでも拾う
    const re = new RegExp(
      `(?:const|let|async function|function)\\s+${n}[\\s\\S]*?(?=\\n(?:const|let|async function|function|\\/\\/ ─))`
    );
    const m = src.match(re);
    if (!m) throw new Error(`定義が見つからない: ${n}`);
    return m[0];
  }).join('\n');

  // crypto.subtle / chrome を差し込む Function を返す
  const fn = new Function('chrome', 'crypto', `
    ${defs}
    return { ${names.join(', ')} };
  `);
  return fn;
}

// chrome.storage.local モック（Promise / callback 両形式に対応）
function createChromeStub() {
  const data = {};
  function resolveOrCallback(result, cb) {
    if (typeof cb === 'function') { cb(result); return undefined; }
    return Promise.resolve(result);
  }
  return {
    _data: data,
    storage: {
      local: {
        get(keys, cb) {
          let result;
          if (keys === null) result = { ...data };
          else if (typeof keys === 'string') result = keys in data ? { [keys]: data[keys] } : {};
          else if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) if (k in data) out[k] = data[k];
            result = out;
          } else result = {};
          return resolveOrCallback(result, cb);
        },
        set(obj, cb) {
          Object.assign(data, obj);
          return resolveOrCallback(undefined, cb);
        },
        remove(keys, cb) {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete data[k];
          return resolveOrCallback(undefined, cb);
        },
      },
    },
  };
}

describe('翻訳・要約キャッシュ', () => {
  let mod;
  let chromeStub;

  beforeAll(() => {
    const loader = loadCacheModule();
    chromeStub = createChromeStub();
    mod = loader(chromeStub, globalThis.crypto);
  });

  beforeEach(() => {
    // ストレージをリセット
    for (const k of Object.keys(chromeStub._data)) delete chromeStub._data[k];
  });

  describe('buildCacheKey', () => {
    it('同じ入力なら同じキーを返す（決定性）', async () => {
      const k1 = await mod.buildCacheKey('google', 'en', 'ja', 'Hello world');
      const k2 = await mod.buildCacheKey('google', 'en', 'ja', 'Hello world');
      expect(k1).toBe(k2);
    });

    it('tc: プレフィックス付き engine / sl / tl / 16文字ハッシュの構造', async () => {
      const k = await mod.buildCacheKey('google', 'en', 'ja', 'Hello');
      expect(k).toMatch(/^tc:google:en:ja:[0-9a-f]{16}$/);
    });

    it('エンジンが違えばキーも違う', async () => {
      const a = await mod.buildCacheKey('google', 'en', 'ja', 'Hello');
      const b = await mod.buildCacheKey('deepl', 'en', 'ja', 'Hello');
      expect(a).not.toBe(b);
    });

    it('ターゲット言語が違えばキーも違う', async () => {
      const a = await mod.buildCacheKey('google', 'en', 'ja', 'Hello');
      const b = await mod.buildCacheKey('google', 'en', 'zh-CN', 'Hello');
      expect(a).not.toBe(b);
    });

    it('テキストが違えばキーも違う', async () => {
      const a = await mod.buildCacheKey('google', 'en', 'ja', 'Hello');
      const b = await mod.buildCacheKey('google', 'en', 'ja', 'World');
      expect(a).not.toBe(b);
    });
  });

  describe('getCached / setCached', () => {
    it('未登録キーは null を返す', async () => {
      const v = await mod.getCached('tc:google:en:ja:0000000000000000');
      expect(v).toBeNull();
    });

    it('setCached → getCached で保存した値が戻る', async () => {
      const key = await mod.buildCacheKey('google', 'en', 'ja', 'Hello');
      await mod.setCached(key, { translated: 'こんにちは', detectedLang: 'en' });
      const v = await mod.getCached(key);
      expect(v.translated).toBe('こんにちは');
      expect(v.detectedLang).toBe('en');
      expect(typeof v.ts).toBe('number');
    });

    it('TTL 切れ（31日前）のエントリは miss 扱いで削除される', async () => {
      const key = await mod.buildCacheKey('google', 'en', 'ja', 'Stale');
      const staleTs = Date.now() - 31 * 24 * 60 * 60 * 1000;
      chromeStub._data[key] = { translated: '古い', detectedLang: 'en', ts: staleTs };
      const v = await mod.getCached(key);
      expect(v).toBeNull();
      expect(chromeStub._data[key]).toBeUndefined();
    });

    it('TTL 未満（29日前）のエントリはそのまま返り、ts が更新される（LRU）', async () => {
      const key = await mod.buildCacheKey('google', 'en', 'ja', 'Fresh');
      const oldTs = Date.now() - 29 * 24 * 60 * 60 * 1000;
      chromeStub._data[key] = { translated: '新しい', detectedLang: 'en', ts: oldTs };
      const v = await mod.getCached(key);
      expect(v.translated).toBe('新しい');
      // LRU 更新は非同期（待たない）仕様なので、setImmediate 待ちの代替として 1tick 待つ
      await new Promise(r => setTimeout(r, 0));
      expect(chromeStub._data[key].ts).toBeGreaterThan(oldTs);
    });
  });

  describe('evictIfNeeded', () => {
    it('MAX 件以下では何も削除しない', async () => {
      for (let i = 0; i < 10; i++) {
        chromeStub._data[`tc:google:en:ja:${i.toString(16).padStart(16, '0')}`] = {
          translated: `v${i}`, detectedLang: 'en', ts: Date.now() - i * 1000,
        };
      }
      await mod.evictIfNeeded();
      expect(Object.keys(chromeStub._data).length).toBe(10);
    });

    it('MAX 超過時は古い順に 10% 削除される', async () => {
      const max = mod.TC_MAX_ENTRIES;
      // max + 100 件を作り、ts を古い順に並べる
      const total = max + 100;
      for (let i = 0; i < total; i++) {
        chromeStub._data[`tc:google:en:ja:${i.toString(16).padStart(16, '0')}`] = {
          translated: `v${i}`, detectedLang: 'en', ts: 1000000 + i, // 小さいほど古い
        };
      }
      await mod.evictIfNeeded();
      const remaining = Object.keys(chromeStub._data).length;
      const toEvict = Math.ceil(total * 0.1);
      expect(remaining).toBe(total - toEvict);
      // 最も古い ts=1000000 のエントリは削除済みであるはず
      const removedKey = `tc:google:en:ja:${(0).toString(16).padStart(16, '0')}`;
      expect(chromeStub._data[removedKey]).toBeUndefined();
    });

    it('tc: プレフィックス以外（他のストレージキー）は evict 対象外', async () => {
      chromeStub._data['autoRules'] = [{ id: 'rule-1' }];
      chromeStub._data['targetLang'] = 'ja';
      const max = mod.TC_MAX_ENTRIES;
      for (let i = 0; i < max + 10; i++) {
        chromeStub._data[`tc:google:en:ja:${i.toString(16).padStart(16, '0')}`] = {
          translated: `v${i}`, ts: 1000000 + i,
        };
      }
      await mod.evictIfNeeded();
      expect(chromeStub._data['autoRules']).toBeDefined();
      expect(chromeStub._data['targetLang']).toBe('ja');
    });
  });

  describe('clearCache', () => {
    it('tc: プレフィックスのキーのみ削除、他キーは残る', async () => {
      chromeStub._data['tc:google:en:ja:1111111111111111'] = { translated: 'v1', ts: Date.now() };
      chromeStub._data['tc:deepl:auto:ja:2222222222222222'] = { translated: 'v2', ts: Date.now() };
      chromeStub._data['autoRules'] = [{ id: 'rule-1' }];
      chromeStub._data['targetLang'] = 'ja';
      const cleared = await mod.clearCache();
      expect(cleared).toBe(2);
      expect(chromeStub._data['autoRules']).toBeDefined();
      expect(chromeStub._data['targetLang']).toBe('ja');
      expect(Object.keys(chromeStub._data).filter(k => k.startsWith('tc:')).length).toBe(0);
    });

    it('キャッシュが空のときは 0 を返す', async () => {
      const cleared = await mod.clearCache();
      expect(cleared).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('tc: と sc: を別々にカウントし合計も返す', async () => {
      chromeStub._data['tc:google:en:ja:1'] = { ts: Date.now() };
      chromeStub._data['tc:deepl:en:ja:2'] = { ts: Date.now() };
      chromeStub._data['sc:claude:ja:abc'] = { ts: Date.now() };
      chromeStub._data['autoRules'] = [];
      const stats = await mod.getCacheStats();
      expect(stats.tcEntries).toBe(2);
      expect(stats.scEntries).toBe(1);
      expect(stats.entries).toBe(3);
    });

    it('空キャッシュでは全て 0 を返す', async () => {
      const stats = await mod.getCacheStats();
      expect(stats.tcEntries).toBe(0);
      expect(stats.scEntries).toBe(0);
      expect(stats.entries).toBe(0);
    });
  });

  describe('ヒット率統計', () => {
    it('calcHitRate: ヒットのみの場合 100 を返す', () => {
      expect(mod.calcHitRate(10, 0)).toBe(100);
    });

    it('calcHitRate: アクセスなし（hits=0, misses=0）は null を返す', () => {
      expect(mod.calcHitRate(0, 0)).toBeNull();
    });

    it('calcHitRate: ミスのみの場合 0 を返す', () => {
      expect(mod.calcHitRate(0, 5)).toBe(0);
    });

    it('calcHitRate: 3/4 ヒットは 75 を返す', () => {
      expect(mod.calcHitRate(3, 1)).toBe(75);
    });

    it('getCacheStats がヒット率を返す', async () => {
      chromeStub._data[mod.HIT_STATS_KEY] = { tcHits: 8, tcMisses: 2, scHits: 0, scMisses: 0 };
      const stats = await mod.getCacheStats();
      expect(stats.tcHitRate).toBe(80);
      expect(stats.scHitRate).toBeNull();
    });

    // キューの非同期処理が完了するまで待つヘルパー
    const flushQueue = () => new Promise(r => setTimeout(r, 0));

    it('getCached: 未登録キーで miss → tcMisses が増える', async () => {
      await mod.getCached('tc:google:en:ja:notexist');
      await flushQueue();
      const data = await mod.storageGet(mod.HIT_STATS_KEY);
      expect(data[mod.HIT_STATS_KEY]?.tcMisses).toBeGreaterThanOrEqual(1);
    });

    it('getCached: TTL切れエントリで miss → tcMisses が増える', async () => {
      const key = 'tc:google:en:ja:expired_test';
      chromeStub._data[key] = { translated: 'old', ts: Date.now() - (mod.TC_TTL_MS + 1000) };
      await mod.getCached(key);
      await flushQueue();
      const data = await mod.storageGet(mod.HIT_STATS_KEY);
      expect(data[mod.HIT_STATS_KEY]?.tcMisses).toBeGreaterThanOrEqual(1);
    });

    it('getCached: 有効エントリで hit → tcHits が増える', async () => {
      const key = 'tc:google:en:ja:valid_test';
      chromeStub._data[key] = { translated: 'test', ts: Date.now() };
      await mod.getCached(key);
      await flushQueue();
      const data = await mod.storageGet(mod.HIT_STATS_KEY);
      expect(data[mod.HIT_STATS_KEY]?.tcHits).toBeGreaterThanOrEqual(1);
    });
  });

  describe('要約キャッシュ（sc: プレフィックス）', () => {
    it('buildSummaryCacheKey が sc: プレフィックスのキーを返す', async () => {
      const key = await mod.buildSummaryCacheKey('claude', 'ja', 'テスト');
      expect(key).toMatch(/^sc:claude:ja:[0-9a-f]{16}$/);
    });

    it('エンジンまたは言語が違えば異なるキーになる', async () => {
      const k1 = await mod.buildSummaryCacheKey('claude', 'ja', 'テスト');
      const k2 = await mod.buildSummaryCacheKey('gemini', 'ja', 'テスト');
      const k3 = await mod.buildSummaryCacheKey('claude', 'en', 'テスト');
      expect(k1).not.toBe(k2);
      expect(k1).not.toBe(k3);
    });

    it('setCached → getCached で要約が取得できる', async () => {
      const key = await mod.buildSummaryCacheKey('claude', 'ja', 'キャッシュテスト本文');
      await mod.setCached(key, { summary: 'テスト要約' });
      const entry = await mod.getCached(key, mod.SC_TTL_MS);
      expect(entry).not.toBeNull();
      expect(entry.summary).toBe('テスト要約');
    });

    it('TTL切れの要約エントリは miss 扱い', async () => {
      const key = await mod.buildSummaryCacheKey('gemini', 'en', '古いテキスト');
      const expired = Date.now() - (mod.SC_TTL_MS + 1000);
      chromeStub._data[key] = { summary: '古い要約', ts: expired };
      const entry = await mod.getCached(key, mod.SC_TTL_MS);
      expect(entry).toBeNull();
    });

    it('clearTranslationCache が sc: プレフィックスも削除する', async () => {
      chromeStub._data['tc:google:en:ja:1'] = { ts: Date.now() };
      chromeStub._data['sc:claude:ja:abc'] = { ts: Date.now(), summary: '要約' };
      chromeStub._data['autoRules'] = [];
      const count = await mod.clearCache();
      expect(count).toBe(2);
      expect(chromeStub._data['autoRules']).toBeDefined();
      expect(chromeStub._data['sc:claude:ja:abc']).toBeUndefined();
    });

    it('clearCache がヒット率統計（HIT_STATS_KEY）もリセットする', async () => {
      chromeStub._data[mod.HIT_STATS_KEY] = { tcHits: 10, tcMisses: 2, scHits: 5, scMisses: 3 };
      chromeStub._data['tc:google:en:ja:1'] = { ts: Date.now() };
      await mod.clearCache();
      expect(chromeStub._data[mod.HIT_STATS_KEY]).toBeUndefined();
    });

    it('evictIfNeeded が sc: プレフィックスを独立して evict する（削除件数・削除順を検証）', async () => {
      // SC_MAX_ENTRIES=500 を超える 505 件を追加（ts=0 が最古）
      for (let i = 0; i < 505; i++) {
        chromeStub._data[`sc:claude:ja:${String(i).padStart(3, '0')}`] = { ts: i };
      }
      await mod.evictIfNeeded();
      const remaining = Object.keys(chromeStub._data).filter(k => k.startsWith('sc:'));
      // 期待削除件数: ceil(505 * 0.1) = 51
      expect(remaining.length).toBe(505 - Math.ceil(505 * mod.SC_EVICT_RATIO));
      // 最古キー（ts=0〜50）が削除されていること
      for (let i = 0; i < Math.ceil(505 * mod.SC_EVICT_RATIO); i++) {
        expect(chromeStub._data[`sc:claude:ja:${String(i).padStart(3, '0')}`]).toBeUndefined();
      }
      // 最新キー（ts=504）は残っていること
      expect(chromeStub._data['sc:claude:ja:504']).toBeDefined();
    });
  });
});
