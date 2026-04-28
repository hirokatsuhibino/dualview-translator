// Copyright (c) Orangesoft Inc.
// _locales/<lang>/messages.json と manifest.json の整合性を検証する

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LOCALES_DIR = join(ROOT, '_locales');
const MANIFEST_PATH = join(ROOT, 'manifest.json');

// _locales 配下の全言語ディレクトリを列挙
function listLocales() {
  return readdirSync(LOCALES_DIR)
    .filter((name) => statSync(join(LOCALES_DIR, name)).isDirectory())
    .sort();
}

function loadMessages(locale) {
  const path = join(LOCALES_DIR, locale, 'messages.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

// manifest.json から __MSG_<key>__ を抽出
function extractMsgKeys(obj, acc = new Set()) {
  if (typeof obj === 'string') {
    const m = obj.match(/^__MSG_(\w+)__$/);
    if (m) acc.add(m[1]);
  } else if (Array.isArray(obj)) {
    for (const v of obj) extractMsgKeys(v, acc);
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) extractMsgKeys(v, acc);
  }
  return acc;
}

describe('_locales — 拡張機能の i18n 化', () => {
  const locales = listLocales();

  // 期待する言語リスト（i18n.js の DVT_I18N と対応するが、Chrome locale 命名規則に従う）
  const EXPECTED_LOCALES = [
    'ar',
    'de',
    'en',
    'es',
    'fr',
    'ja',
    'ko',
    'pt_BR',
    'ru',
    'zh_CN',
    'zh_TW',
  ];

  it('11 言語分のディレクトリが揃っている', () => {
    expect(locales).toEqual(EXPECTED_LOCALES);
  });

  it('manifest.json の default_locale は _locales 配下に存在する', () => {
    const manifest = loadManifest();
    expect(manifest.default_locale).toBeDefined();
    expect(locales).toContain(manifest.default_locale);
  });

  it('manifest.json で参照される全 __MSG_*__ キーが default_locale に存在する', () => {
    const manifest = loadManifest();
    const referenced = [...extractMsgKeys(manifest)];
    expect(referenced.length).toBeGreaterThan(0);

    const defaultMessages = loadMessages(manifest.default_locale);
    for (const key of referenced) {
      expect(defaultMessages[key], `default locale に ${key} が無い`).toBeDefined();
      expect(defaultMessages[key].message).toBeTruthy();
    }
  });

  it('全 locale が default_locale と同じキーセットを持つ', () => {
    const manifest = loadManifest();
    const baseKeys = Object.keys(loadMessages(manifest.default_locale)).sort();
    expect(baseKeys.length).toBeGreaterThan(0);

    for (const locale of locales) {
      const keys = Object.keys(loadMessages(locale)).sort();
      expect(keys, `${locale} のキーセットが ${manifest.default_locale} と一致しない`).toEqual(baseKeys);
    }
  });

  it('全 locale の全エントリに非空の message プロパティがある', () => {
    for (const locale of locales) {
      const messages = loadMessages(locale);
      for (const [key, value] of Object.entries(messages)) {
        // toBeTypeOf('object') は null も通すため、null でないことを明示的に検証する
        expect(value, `${locale}.${key} が null`).not.toBeNull();
        expect(value, `${locale}.${key} がオブジェクトでない`).toBeTypeOf('object');
        // toBeTruthy() だと空白のみの文字列も通ってしまうため、文字列として trim 後の長さで検証する
        const message = value.message;
        expect(typeof message, `${locale}.${key}.message が文字列でない`).toBe('string');
        expect(message.trim().length, `${locale}.${key}.message が空または空白のみ`).toBeGreaterThan(0);
      }
    }
  });

  it('manifest.json の name と action.default_title はブランド名のまま (__MSG_*__ 化しない)', () => {
    const manifest = loadManifest();
    expect(manifest.name).toBe('DualView Translator');
    expect(manifest.action.default_title).toBe('DualView Translator');
  });

  it('manifest.json の commands.*.description は全て __MSG_*__ 化されている', () => {
    const manifest = loadManifest();
    for (const [name, def] of Object.entries(manifest.commands)) {
      expect(def.description, `commands.${name}.description が __MSG_*__ 形式でない`)
        .toMatch(/^__MSG_\w+__$/);
    }
  });

  // Apple Safari Web Extension のアップロードバリデーションは
  // _locales/<lang>/messages.json の各エントリの description を必須かつ 112 文字以下に制限する。
  // Chrome / Firefox では optional / 制限なしのため、これを超えても気付きにくい（実際 #119 で発覚）。
  it('全 locale の全エントリに 112 文字以下の description プロパティがある（Apple Safari 制限）', () => {
    const APPLE_DESCRIPTION_LIMIT = 112;
    for (const locale of locales) {
      const messages = loadMessages(locale);
      for (const [key, value] of Object.entries(messages)) {
        expect(typeof value.description, `${locale}.${key}.description が文字列でない`).toBe('string');
        expect(value.description.length, `${locale}.${key}.description が ${APPLE_DESCRIPTION_LIMIT} 文字を超えている (${value.description.length} chars)`)
          .toBeLessThanOrEqual(APPLE_DESCRIPTION_LIMIT);
      }
    }
  });
});
