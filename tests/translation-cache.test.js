// Copyright (c) Orangesoft Inc
// 翻訳キャッシュのロジックテスト
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
    'hashText', 'buildCacheKey', 'getCached', 'setCached',
    'evictIfNeeded', 'clearTranslationCache', 'getCacheStats',
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

// chrome.storage.local モック（background.js の挙動に合わせた最小実装）
function createChromeStub() {
  const data = {};
  return {
    _data: data,
    storage: {
      local: {
        get(keys) {
          if (keys === null) return Promise.resolve({ ...data });
          if (typeof keys === 'string') {
            return Promise.resolve(keys in data ? { [keys]: data[keys] } : {});
          }
          if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) if (k in data) out[k] = data[k];
            return Promise.resolve(out);
          }
          return Promise.resolve({});
        },
        set(obj) {
          Object.assign(data, obj);
          return Promise.resolve();
        },
        remove(keys) {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete data[k];
          return Promise.resolve();
        },
      },
    },
  };
}

describe('翻訳キャッシュ', () => {
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

  describe('clearTranslationCache', () => {
    it('tc: プレフィックスのキーのみ削除、他キーは残る', async () => {
      chromeStub._data['tc:google:en:ja:1111111111111111'] = { translated: 'v1', ts: Date.now() };
      chromeStub._data['tc:deepl:auto:ja:2222222222222222'] = { translated: 'v2', ts: Date.now() };
      chromeStub._data['autoRules'] = [{ id: 'rule-1' }];
      chromeStub._data['targetLang'] = 'ja';
      const cleared = await mod.clearTranslationCache();
      expect(cleared).toBe(2);
      expect(chromeStub._data['autoRules']).toBeDefined();
      expect(chromeStub._data['targetLang']).toBe('ja');
      expect(Object.keys(chromeStub._data).filter(k => k.startsWith('tc:')).length).toBe(0);
    });

    it('キャッシュが空のときは 0 を返す', async () => {
      const cleared = await mod.clearTranslationCache();
      expect(cleared).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('tc: プレフィックスのキー数を返す', async () => {
      chromeStub._data['tc:google:en:ja:1'] = { ts: Date.now() };
      chromeStub._data['tc:deepl:en:ja:2'] = { ts: Date.now() };
      chromeStub._data['autoRules'] = [];
      const stats = await mod.getCacheStats();
      expect(stats.entries).toBe(2);
    });

    it('空キャッシュでは 0 を返す', async () => {
      const stats = await mod.getCacheStats();
      expect(stats.entries).toBe(0);
    });
  });
});
