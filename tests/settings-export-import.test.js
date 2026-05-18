// Copyright (c) Orangesoft Inc
// 設定のエクスポート/インポート（issue #206）のロジックテスト。
// popup.js はブラウザ拡張の popup 専用スクリプトで直接 import できないため、
// 同等のデータ整形・バリデーションロジックを本ファイルでも保持する。
// **popup.js を更新したら本ファイルの定数も必ず同期すること**（コピペ重複のため）。
import { describe, it, expect } from 'vitest';

const SETTINGS_EXPORT_KEYS = [
  'targetLang', 'translateEngine', 'llmEngine',
  'autoRules', 'dismissedDomains', 'uiLang'
  // dvtTheme は content-core.js が prefers-color-scheme から上書きするため対象外
];
const SETTINGS_API_KEYS = ['deeplApiKey', 'claudeApiKey', 'geminiApiKey'];
const SETTINGS_EXPORT_FORMAT = 'dualview-translator-settings';
const SETTINGS_EXPORT_VERSION = 1;
const SETTINGS_VALIDATORS = {
  targetLang: (v) => typeof v === 'string' && /^[a-zA-Z-]{2,10}$/.test(v),
  translateEngine: (v) => ['google', 'deepl', 'apple'].includes(v),
  llmEngine: (v) => ['claude', 'gemini'].includes(v),
  uiLang: (v) => ['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar'].includes(v),
  autoRules: (v) => Array.isArray(v),
  dismissedDomains: (v) => Array.isArray(v),
  deeplApiKey: (v) => typeof v === 'string',
  claudeApiKey: (v) => typeof v === 'string',
  geminiApiKey: (v) => typeof v === 'string',
};

// popup.js の export ロジックに相当
function buildExportPayload(storage, { includeKeys }) {
  const keys = includeKeys
    ? [...SETTINGS_EXPORT_KEYS, ...SETTINGS_API_KEYS]
    : [...SETTINGS_EXPORT_KEYS];
  const cleaned = {};
  for (const k of keys) {
    if (storage[k] !== undefined) cleaned[k] = storage[k];
  }
  return {
    format: SETTINGS_EXPORT_FORMAT,
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    includesApiKeys: includeKeys,
    data: cleaned
  };
}

// popup.js の import フィルタに相当
function filterImportData(payload) {
  if (!payload || payload.format !== SETTINGS_EXPORT_FORMAT) return null;
  if (typeof payload.data !== 'object' || payload.data === null || Array.isArray(payload.data)) return null;
  if (payload.version !== SETTINGS_EXPORT_VERSION) return null;
  const allowed = new Set([...SETTINGS_EXPORT_KEYS, ...SETTINGS_API_KEYS]);
  const out = {};
  for (const [k, v] of Object.entries(payload.data)) {
    if (!allowed.has(k)) continue;
    const validator = SETTINGS_VALIDATORS[k];
    if (validator && !validator(v)) continue;
    out[k] = v;
  }
  return out;
}

describe('設定のエクスポート（issue #206）', () => {
  const storage = {
    targetLang: 'ja',
    translateEngine: 'deepl',
    llmEngine: 'claude',
    deeplApiKey: 'secret-deepl',
    claudeApiKey: 'secret-claude',
    geminiApiKey: 'secret-gemini',
    autoRules: [{ id: 'r1', urlPattern: '*://example.com/*', mode: 'translate' }],
    dismissedDomains: ['example.com'],
    uiLang: 'ja',
    dvtTheme: 'dark',
    // 除外対象（含まれてはいけない）
    'tc:abc': { translated: 'x' },
    cacheHitStats: { tcHits: 1 },
    appleAvailable: true,
    pendingRuleSelector: 'div'
  };

  it('APIキー opt-in OFF のときキーは含まれない', () => {
    const payload = buildExportPayload(storage, { includeKeys: false });
    expect(payload.data.deeplApiKey).toBeUndefined();
    expect(payload.data.claudeApiKey).toBeUndefined();
    expect(payload.data.geminiApiKey).toBeUndefined();
    expect(payload.includesApiKeys).toBe(false);
  });

  it('APIキー opt-in ON のときキーが含まれる', () => {
    const payload = buildExportPayload(storage, { includeKeys: true });
    expect(payload.data.deeplApiKey).toBe('secret-deepl');
    expect(payload.data.claudeApiKey).toBe('secret-claude');
    expect(payload.data.geminiApiKey).toBe('secret-gemini');
    expect(payload.includesApiKeys).toBe(true);
  });

  it('キャッシュ・統計・一時状態は常に除外', () => {
    const payload = buildExportPayload(storage, { includeKeys: true });
    expect(payload.data['tc:abc']).toBeUndefined();
    expect(payload.data.cacheHitStats).toBeUndefined();
    expect(payload.data.appleAvailable).toBeUndefined();
    expect(payload.data.pendingRuleSelector).toBeUndefined();
  });

  // dvtTheme は content-core.js が prefers-color-scheme から毎ページ書き直すため
  // エクスポートしても次ページ表示で上書きされる → 混乱を避けて対象外
  it('dvtTheme はエクスポート対象外（content-core.js が常に上書きするため）', () => {
    const payload = buildExportPayload(storage, { includeKeys: false });
    expect(payload.data.dvtTheme).toBeUndefined();
  });

  it('未設定キー (undefined) は出力に現れない', () => {
    const sparse = { targetLang: 'ja' };
    const payload = buildExportPayload(sparse, { includeKeys: true });
    expect(Object.keys(payload.data)).toEqual(['targetLang']);
  });

  it('format / version / exportedAt が含まれる', () => {
    const payload = buildExportPayload(storage, { includeKeys: false });
    expect(payload.format).toBe('dualview-translator-settings');
    expect(payload.version).toBe(1);
    expect(typeof payload.exportedAt).toBe('string');
    expect(() => new Date(payload.exportedAt).toISOString()).not.toThrow();
  });

  it('autoRules / dismissedDomains などの複雑な値も保持される', () => {
    const payload = buildExportPayload(storage, { includeKeys: false });
    expect(payload.data.autoRules).toEqual(storage.autoRules);
    expect(payload.data.dismissedDomains).toEqual(storage.dismissedDomains);
  });
});

describe('設定のインポート（issue #206）', () => {
  const validPayload = (data) => ({
    format: SETTINGS_EXPORT_FORMAT,
    version: SETTINGS_EXPORT_VERSION,
    data
  });

  it('format フィールドが一致しない JSON は拒否', () => {
    expect(filterImportData({ format: 'other', version: 1, data: { targetLang: 'ja' } })).toBeNull();
    expect(filterImportData({ version: 1, data: { targetLang: 'ja' } })).toBeNull();
  });

  it('data フィールドが無い / オブジェクトでない / 配列の場合は拒否', () => {
    expect(filterImportData({ format: SETTINGS_EXPORT_FORMAT, version: 1 })).toBeNull();
    expect(filterImportData({ format: SETTINGS_EXPORT_FORMAT, version: 1, data: null })).toBeNull();
    expect(filterImportData({ format: SETTINGS_EXPORT_FORMAT, version: 1, data: 'string' })).toBeNull();
    expect(filterImportData({ format: SETTINGS_EXPORT_FORMAT, version: 1, data: [] })).toBeNull();
  });

  it('未知バージョンは拒否（将来 v2 を v1 クライアントで誤適用しない）', () => {
    expect(filterImportData({ format: SETTINGS_EXPORT_FORMAT, version: 2, data: { targetLang: 'ja' } })).toBeNull();
    expect(filterImportData({ format: SETTINGS_EXPORT_FORMAT, data: { targetLang: 'ja' } })).toBeNull();
  });

  it('既知のキーだけ取り込む（不明キーは無視）', () => {
    const out = filterImportData(validPayload({
      targetLang: 'en',
      unknownKey: 'malicious',
      '__proto__': { evil: true },
      autoRules: []
    }));
    expect(out).toEqual({ targetLang: 'en', autoRules: [] });
    expect(out.unknownKey).toBeUndefined();
  });

  it('不正値（型違反・許可外文字列）は静かに無視', () => {
    const out = filterImportData(validPayload({
      targetLang: '<script>alert(1)</script>', // 正規表現で弾く
      translateEngine: 'evil-engine', // 許可リストで弾く
      llmEngine: 'claude', // 許可
      autoRules: 'not-an-array', // 型違反
      dismissedDomains: ['a.com'], // 許可
    }));
    expect(out.targetLang).toBeUndefined();
    expect(out.translateEngine).toBeUndefined();
    expect(out.llmEngine).toBe('claude');
    expect(out.autoRules).toBeUndefined();
    expect(out.dismissedDomains).toEqual(['a.com']);
  });

  it('APIキーも既知キーなので含まれていれば取り込む', () => {
    const out = filterImportData(validPayload({
      deeplApiKey: 'imported-key', claudeApiKey: 'imported-c'
    }));
    expect(out.deeplApiKey).toBe('imported-key');
    expect(out.claudeApiKey).toBe('imported-c');
  });

  it('null / undefined は拒否', () => {
    expect(filterImportData(null)).toBeNull();
    expect(filterImportData(undefined)).toBeNull();
  });
});

describe('エクスポート→インポートの往復', () => {
  it('opt-in OFF でエクスポート → インポートで元の非APIキー設定が復元される', () => {
    const original = {
      targetLang: 'ja',
      translateEngine: 'google',
      llmEngine: 'gemini',
      deeplApiKey: 'should-not-leak',
      autoRules: [{ id: 'r1' }],
      dismissedDomains: ['a.com'],
      uiLang: 'ja',
      dvtTheme: 'light'
    };
    const payload = buildExportPayload(original, { includeKeys: false });
    const imported = filterImportData(payload);
    expect(imported.targetLang).toBe('ja');
    expect(imported.translateEngine).toBe('google');
    expect(imported.autoRules).toEqual([{ id: 'r1' }]);
    expect(imported.deeplApiKey).toBeUndefined();
  });

  it('opt-in ON でエクスポート → APIキーも復元される', () => {
    const original = {
      targetLang: 'en',
      deeplApiKey: 'k1', claudeApiKey: 'k2', geminiApiKey: 'k3'
    };
    const payload = buildExportPayload(original, { includeKeys: true });
    const imported = filterImportData(payload);
    expect(imported.deeplApiKey).toBe('k1');
    expect(imported.claudeApiKey).toBe('k2');
    expect(imported.geminiApiKey).toBe('k3');
  });
});
