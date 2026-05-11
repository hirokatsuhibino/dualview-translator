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

    // 回帰防止: issue #195 — プレースホルダ値が null のとき "null" 文字列が露出していた
    describe('プレースホルダ値の null 安全性', () => {
      it('lang が null のとき "null" 文字列が含まれない', () => {
        DVT_I18N.setLang('ja');
        const result = DVT_I18N.t('translateBarMsg', { lang: null });
        expect(result).not.toContain('null');
        expect(result).toContain('このページは');
        expect(result).toContain('翻訳しますか？');
      });

      it('lang が undefined のとき "undefined" 文字列が含まれない', () => {
        DVT_I18N.setLang('ja');
        const result = DVT_I18N.t('translateBarMsg', { lang: undefined });
        expect(result).not.toContain('undefined');
      });

      it('英語ロケールでも null が "null" にならない', () => {
        DVT_I18N.setLang('en');
        const result = DVT_I18N.t('translateBarMsg', { lang: null });
        expect(result).not.toContain('null');
        expect(result).toContain('This page');
      });

      it('正常な値は従来通り展開される（回帰検知）', () => {
        DVT_I18N.setLang('ja');
        const result = DVT_I18N.t('translateBarMsg', { lang: '英語' });
        expect(result).toContain('英語');
        expect(result).toContain('このページは');
      });

      it('値が 0 や空文字でも文字列化される（値ありとして扱う）', () => {
        DVT_I18N.setLang('ja');
        // 0 は falsy だが意図的に値があるケース。null/undefined だけを除外する
        const r0 = DVT_I18N.t('toastTranslating', { done: 0, total: 10 });
        expect(r0).toBe('0 / 10 翻訳中…');
        // 空文字は空のまま埋め込み（"null" にはならない）
        const rEmpty = DVT_I18N.t('toastTranslating', { done: '', total: 10 });
        expect(rEmpty).toBe(' / 10 翻訳中…');
      });
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
      'engineApple', 'fallbackToApple',
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
