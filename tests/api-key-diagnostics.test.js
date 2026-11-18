// Copyright (c) Orangesoft Inc.
// APIキーの検証・エラー分類（Issue #262）のテスト
// - i18n.js の DVT_APIKEY（正規化・不正文字検出・オリジン・文言整形）
// - background.js の fetchApi / testApiKey（送信前検査・権限不足/通信不可の分類・HTTP ステータス分類）
// - content-core.js の translate() が errorCode を UI 言語の文言で表示すること
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';
import { loadScript } from './helpers.js';

const bgPath = resolve(import.meta.dirname, '..', 'background.js');
const bgCode = readFileSync(bgPath, 'utf-8');

// background.js からトップレベルの関数 / 定数宣言を名前で切り出す。
// 見つからなければ即座に失敗させ、フォーマット変更でテストが無音で壊れるのを防ぐ。
function extractDecl(name) {
  const fnMatch = bgCode.match(new RegExp(`^(async )?function ${name}\\(`, 'm'));
  if (fnMatch) {
    const end = bgCode.indexOf('\n}\n', fnMatch.index);
    if (end < 0) throw new Error(`関数 ${name} の終端が見つかりません`);
    return bgCode.slice(fnMatch.index, end + 2);
  }
  const constMatch = bgCode.match(new RegExp(`^const ${name} = [^\\n]*;$`, 'm'));
  if (constMatch) return constMatch[0];
  throw new Error(`background.js から ${name} を抽出できません`);
}

const BG_DECLS = [
  'API_KEY_STRIP_RE', 'CLAUDE_SUMMARY_MODEL', 'CLAUDE_ORIGIN', 'GEMINI_ORIGIN',
  'normalizeApiKey', 'findInvalidKeyChar', 'apiError', 'errorResponse',
  'hasHostPermission', 'fetchApi', 'isNetworkError',
  'getDeepLEndpoint', 'getDeepLOrigin', 'deepLHttpError', 'testApiKey',
];

// 抽出した宣言を fetch / chrome を引数に取る関数として同一 realm で評価する
// （同一 realm にしておくと TypeError の instanceof 判定がテストと一致する）
const bgFactory = vm.runInThisContext(
  '(function (fetch, chrome) {\n' + BG_DECLS.map(extractDecl).join('\n\n') +
  '\nreturn { normalizeApiKey, findInvalidKeyChar, errorResponse, fetchApi, testApiKey };\n})',
  { filename: 'background.js (extracted)' }
);
const loadBackground = ({ fetch, chrome }) => bgFactory(fetch, chrome);

const okResponse = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
const statusResponse = (status) => () => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) });
// Firefox で host 権限が無いとき / オフラインのときに fetch が投げるエラー
const firefoxNetworkError = () => Promise.reject(new TypeError('NetworkError when attempting to fetch resource.'));

beforeAll(() => {
  loadScript('i18n.js');
});

describe('DVT_APIKEY（i18n.js）', () => {
  beforeEach(() => DVT_I18N.setLang('ja'));

  describe('normalizeApiKey()', () => {
    it('前後・途中の空白、全角スペース、ゼロ幅文字、BOM を除去する', () => {
      expect(DVT_APIKEY.normalizeApiKey('  abc-123:fx \n')).toBe('abc-123:fx');
      expect(DVT_APIKEY.normalizeApiKey('\u3000abc\u200Bdef\uFEFF\u2060')).toBe('abcdef');
      expect(DVT_APIKEY.normalizeApiKey('ab c\td')).toBe('abcd');
    });

    it('文字列以外は空文字にする', () => {
      expect(DVT_APIKEY.normalizeApiKey(undefined)).toBe('');
      expect(DVT_APIKEY.normalizeApiKey(null)).toBe('');
      expect(DVT_APIKEY.normalizeApiKey(123)).toBe('');
    });
  });

  describe('findInvalidKeyChar()', () => {
    it('印字可能 ASCII のみなら null', () => {
      expect(DVT_APIKEY.findInvalidKeyChar('00000000-0000-0000-0000-000000000000:fx')).toBeNull();
      expect(DVT_APIKEY.findInvalidKeyChar('')).toBeNull();
    });

    it('全角カタカナを位置（1始まり）とコードポイント付きで返す（実際に起きた「テ」混入）', () => {
      expect(DVT_APIKEY.findInvalidKeyChar('abcテdef')).toEqual({ pos: 4, char: 'テ', cp: 'U+30C6' });
    });

    it('サロゲートペア（絵文字）は 1 文字として数える', () => {
      expect(DVT_APIKEY.findInvalidKeyChar('😀a')).toEqual({ pos: 1, char: '😀', cp: 'U+1F600' });
      expect(DVT_APIKEY.findInvalidKeyChar('abé')).toEqual({ pos: 3, char: 'é', cp: 'U+00E9' });
    });

    it('空白・制御文字も不正とみなす', () => {
      expect(DVT_APIKEY.findInvalidKeyChar('a b')).toEqual({ pos: 2, char: ' ', cp: 'U+0020' });
      expect(DVT_APIKEY.findInvalidKeyChar('a\u007f')).toEqual({ pos: 2, char: '\u007f', cp: 'U+007F' });
    });
  });

  describe('originFor()', () => {
    it('DeepL は :fx の有無で Free / Pro のオリジンを返す', () => {
      expect(DVT_APIKEY.originFor('deepl', 'xxx:fx')).toBe('https://api-free.deepl.com/*');
      expect(DVT_APIKEY.originFor('deepl', ' xxx:fx ')).toBe('https://api-free.deepl.com/*');
      expect(DVT_APIKEY.originFor('deepl', 'xxx')).toBe('https://api.deepl.com/*');
    });

    it('Claude / Gemini / 不明エンジン', () => {
      expect(DVT_APIKEY.originFor('claude', 'k')).toBe('https://api.anthropic.com/*');
      expect(DVT_APIKEY.originFor('gemini', 'k')).toBe('https://generativelanguage.googleapis.com/*');
      expect(DVT_APIKEY.originFor('google', 'k')).toBeNull();
    });

    it('返すオリジンはすべて manifest の host_permissions に含まれる（permissions.request の前提）', () => {
      const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'manifest.json'), 'utf-8'));
      const origins = [
        DVT_APIKEY.originFor('deepl', 'x:fx'), DVT_APIKEY.originFor('deepl', 'x'),
        DVT_APIKEY.originFor('claude', 'x'), DVT_APIKEY.originFor('gemini', 'x'),
      ];
      origins.forEach(o => expect(manifest.host_permissions).toContain(o));
    });
  });

  describe('formatApiError()', () => {
    it('errorCode を UI 言語の文言に変換し、パラメータを埋め込む', () => {
      const msg = DVT_APIKEY.formatApiError({ ok: false, error: 'raw', errorCode: 'invalidChars', errorParams: { pos: 27, char: 'テ', cp: 'U+30C6' } });
      expect(msg).toContain('27文字目');
      expect(msg).toContain('U+30C6');
      expect(msg).not.toContain('raw');
    });

    it('権限不足はホスト名を含めて案内する（英語 UI）', () => {
      DVT_I18N.setLang('en');
      const msg = DVT_APIKEY.formatApiError({ ok: false, errorCode: 'noPermission', errorParams: { host: 'api-free.deepl.com' } });
      expect(msg).toContain('api-free.deepl.com');
      expect(msg).toContain('Permissions');
    });

    it('errorCode が無い・未知なら background の生メッセージを返す', () => {
      expect(DVT_APIKEY.formatApiError({ ok: false, error: 'DeepL: HTTP 500' })).toBe('DeepL: HTTP 500');
      expect(DVT_APIKEY.formatApiError({ ok: false, error: 'x', errorCode: 'unknownCode' })).toBe('x');
      expect(DVT_APIKEY.formatApiError(undefined)).toBe('');
    });

    it('全 errorCode に対応する文言が全11言語にあり、プレースホルダが埋まる', () => {
      const codes = ['invalidKey', 'invalidChars', 'noPermission', 'network', 'quota', 'rateLimit'];
      const langs = DVT_I18N.supportedLangs();
      expect(langs).toHaveLength(11);
      langs.forEach(lang => {
        DVT_I18N.setLang(lang);
        codes.forEach(code => {
          const msg = DVT_APIKEY.formatApiError({ errorCode: code, errorParams: { pos: 1, char: 'x', cp: 'U+0078', host: 'h' } });
          expect(msg, `${lang}/${code}`).not.toMatch(/^apiErr/);
          expect(msg, `${lang}/${code}`).not.toMatch(/\{(pos|char|cp|host)\}/);
        });
      });
    });
  });
});

describe('background.js と i18n.js の正規化・検出ロジックが一致する', () => {
  const bg = loadBackground({ fetch: okResponse, chrome: undefined });
  const samples = ['', ' abc ', 'abcテ', '\u3000x\u200By', 'a\tb', '😀', 'abcd-1234:fx', 'é', '\u007f'];
  it.each(samples)('入力 %j', (s) => {
    expect(bg.normalizeApiKey(s)).toBe(DVT_APIKEY.normalizeApiKey(s));
    expect(bg.findInvalidKeyChar(s)).toEqual(DVT_APIKEY.findInvalidKeyChar(s));
  });
});

describe('background.js testApiKey() のエラー分類', () => {
  it('キーに全角文字があれば送信せず invalidChars を返す', async () => {
    const fetch = vi.fn(okResponse);
    const bg = loadBackground({ fetch, chrome: undefined });
    const err = await bg.testApiKey('deepl', 'abcテdef:fx').catch(e => e);
    expect(err.code).toBe('invalidChars');
    expect(err.params).toEqual({ pos: 4, char: 'テ', cp: 'U+30C6' });
    expect(fetch).not.toHaveBeenCalled();
    expect(bg.errorResponse(err)).toMatchObject({ ok: false, errorCode: 'invalidChars', errorParams: { pos: 4 } });
  });

  it('前後の空白・ゼロ幅文字は除去してから送信する', async () => {
    const fetch = vi.fn(okResponse);
    const bg = loadBackground({ fetch, chrome: undefined });
    await bg.testApiKey('deepl', '\u200B abc:fx \n');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api-free.deepl.com/v2/translate');
    expect(init.headers.Authorization).toBe('DeepL-Auth-Key abc:fx');
  });

  it('通信失敗かつ host 権限なし（Firefox で未許可）→ noPermission とホスト名', async () => {
    const contains = vi.fn(() => Promise.resolve(false));
    const bg = loadBackground({ fetch: firefoxNetworkError, chrome: { permissions: { contains } } });
    const err = await bg.testApiKey('deepl', 'abc:fx').catch(e => e);
    expect(err.code).toBe('noPermission');
    expect(err.params).toEqual({ host: 'api-free.deepl.com' });
    expect(contains).toHaveBeenCalledWith({ origins: ['https://api-free.deepl.com/*'] });
    // Apple フォールバック判定（isNetworkError）を壊さないよう元の TypeError のまま投げ直す
    expect(err).toBeInstanceOf(TypeError);
  });

  it('通信失敗で権限はある → network', async () => {
    const bg = loadBackground({ fetch: firefoxNetworkError, chrome: { permissions: { contains: () => Promise.resolve(true) } } });
    const err = await bg.testApiKey('claude', 'sk-test').catch(e => e);
    expect(err.code).toBe('network');
  });

  it('permissions API が無い環境（Safari 等）では権限ありとみなし network に分類', async () => {
    const bg = loadBackground({ fetch: firefoxNetworkError, chrome: {} });
    const err = await bg.testApiKey('gemini', 'AIza-test').catch(e => e);
    expect(err.code).toBe('network');
  });

  it('permissions.contains が例外でも network に分類（誤って権限不足と案内しない）', async () => {
    const bg = loadBackground({ fetch: firefoxNetworkError, chrome: { permissions: { contains: () => Promise.reject(new Error('x')) } } });
    const err = await bg.testApiKey('deepl', 'abc').catch(e => e);
    expect(err.code).toBe('network');
  });

  it('ネットワーク以外の TypeError には code を付けない', async () => {
    const bg = loadBackground({ fetch: () => Promise.reject(new TypeError('Invalid header value')), chrome: {} });
    const err = await bg.testApiKey('deepl', 'abc').catch(e => e);
    expect(err.code).toBeUndefined();
  });

  it.each([
    ['deepl', 'abc:fx', 403, 'invalidKey'],
    ['deepl', 'abc:fx', 456, 'quota'],
    ['deepl', 'abc:fx', 429, 'rateLimit'],
    ['claude', 'sk', 401, 'invalidKey'],
    ['gemini', 'AIza', 400, 'invalidKey'],
    ['gemini', 'AIza', 429, 'rateLimit'],
  ])('%s HTTP %i → %s', async (engine, key, status, code) => {
    const bg = loadBackground({ fetch: statusResponse(status), chrome: {} });
    const err = await bg.testApiKey(engine, key).catch(e => e);
    expect(err.code).toBe(code);
  });

  it('分類できない HTTP エラーは code なし（従来どおりメッセージのみ）', async () => {
    const bg = loadBackground({ fetch: statusResponse(500), chrome: {} });
    const err = await bg.testApiKey('deepl', 'abc').catch(e => e);
    expect(err.code).toBeUndefined();
    expect(err.message).toContain('500');
    expect(bg.errorResponse(err)).toEqual({ ok: false, error: err.message });
  });
});

describe('content-core translate() の失敗表示', () => {
  let originalSendMessage;
  beforeAll(() => {
    loadScript('content-core.js');
  });
  beforeEach(() => {
    originalSendMessage = chrome.runtime.sendMessage;
    DVT_I18N.setLang('ja');
  });
  afterEach(() => {
    chrome.runtime.sendMessage = originalSendMessage;
  });

  it('errorCode 付きなら原因別の文言を出す', async () => {
    chrome.runtime.sendMessage = (_msg, cb) => cb({ ok: false, error: 'NetworkError when attempting to fetch resource.', errorCode: 'noPermission', errorParams: { host: 'api.deepl.com' } });
    const res = await DVT.translate('Hello', 'ja', 'en');
    expect(res.text).toContain(t('translateFailed'));
    expect(res.text).toContain('api.deepl.com へのアクセスが許可されていません');
    expect(res.text).not.toContain('NetworkError');
  });

  it('errorCode が無ければ従来どおり生メッセージ', async () => {
    chrome.runtime.sendMessage = (_msg, cb) => cb({ ok: false, error: 'Apple Translation: failed' });
    const res = await DVT.translate('Hello', 'ja', 'en');
    expect(res.text).toBe(`${t('translateFailed')} — Apple Translation: failed`);
  });
});
