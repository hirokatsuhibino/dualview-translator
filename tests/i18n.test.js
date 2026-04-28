// i18n.js のユニットテスト
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers.js';

describe('DVT_I18N', () => {
  beforeAll(() => {
    loadScript('i18n.js');
  });

  beforeEach(() => {
    // デフォルト言語にリセット
    DVT_I18N.setLang('ja');
  });

  describe('t() — メッセージ取得', () => {
    it('日本語キーを取得できる', () => {
      DVT_I18N.setLang('ja');
      expect(DVT_I18N.t('translateBtn')).toBe('翻訳する');
    });

    it('英語キーを取得できる', () => {
      DVT_I18N.setLang('en');
      expect(DVT_I18N.t('translateBtn')).toBe('Translate');
    });

    it('プレースホルダが展開される', () => {
      DVT_I18N.setLang('ja');
      const result = DVT_I18N.t('toastTranslating', { done: 3, total: 10 });
      expect(result).toBe('3 / 10 翻訳中…');
    });

    it('複数のプレースホルダが展開される', () => {
      DVT_I18N.setLang('ja');
      const result = DVT_I18N.t('sameLang', { lang: 'ja' });
      expect(result).toBe('原文と翻訳先の言語が同じです（ja）');
    });

    it('存在しないキーはキー名をそのまま返す', () => {
      expect(DVT_I18N.t('nonExistentKey')).toBe('nonExistentKey');
    });
  });

  describe('setLang() / getLang()', () => {
    it('言語を切り替えできる', () => {
      DVT_I18N.setLang('en');
      expect(DVT_I18N.getLang()).toBe('en');
    });

    it('サポートされていない言語は無視される', () => {
      DVT_I18N.setLang('ja');
      DVT_I18N.setLang('xx-invalid');
      expect(DVT_I18N.getLang()).toBe('ja');
    });

    it('全11言語が設定できる', () => {
      const langs = ['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar'];
      for (const lang of langs) {
        DVT_I18N.setLang(lang);
        expect(DVT_I18N.getLang()).toBe(lang);
      }
    });
  });

  describe('全言語のメッセージ整合性', () => {
    const langs = ['ja', 'en', 'zh-CN', 'zh-TW', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar'];

    // 日本語をベースに全言語で同じキーが存在するか確認
    const requiredKeys = [
      'translateBtn', 'regionHint', 'regionHintSummarize',
      'tabTranslate', 'tabRules', 'tabSettings',
      'translateAndSummarize', 'translateRegionSummarize',
      'autoRuleAdd', 'autoRuleUpdate', 'autoRuleCancel', 'autoRuleNotFound',
      'cacheSectionLabel', 'cacheEntriesLabel', 'cacheClearBtn', 'cacheLoading', 'cacheClearedToast',
      'translateSelection',
      'undoElement', 'undoSummary',
    ];

    for (const lang of langs) {
      for (const key of requiredKeys) {
        it(`${lang} に "${key}" が存在する`, () => {
          DVT_I18N.setLang(lang);
          const result = DVT_I18N.t(key);
          // キー名そのままが返されたら未定義
          expect(result).not.toBe(key);
          expect(result.length).toBeGreaterThan(0);
        });
      }
    }
  });
});

// グローバルの t() ヘルパー関数もテスト
describe('t() グローバルヘルパー', () => {
  it('DVT_I18N.t と同じ結果を返す', () => {
    DVT_I18N.setLang('ja');
    expect(t('translateBtn')).toBe(DVT_I18N.t('translateBtn'));
  });
});
