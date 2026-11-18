// content-bar.js の自動翻訳ルール機能テスト
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadScript } from './helpers.js';

describe('DVT_BAR.matchesUrlPattern', () => {
  beforeEach(() => {
    loadScript('i18n.js');
    // DVT_PAGEのモック
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn(),
      translateAndSummarizeClickedElement: vi.fn(),
    };
    // DVT のモック
    globalThis.DVT = {
      state: { targetLang: 'ja', pageTranslateActive: false },
    };
    loadScript('content-bar.js');
  });

  it('完全一致パターンにマッチする', () => {
    expect(DVT_BAR.matchesUrlPattern('https://example.com/page', 'https://example.com/page')).toBe(true);
  });

  it('ワイルドカード * でマッチする', () => {
    expect(DVT_BAR.matchesUrlPattern('https://example.com/foo', '*://example.com/*')).toBe(true);
  });

  it('スキームのワイルドカードが機能する', () => {
    expect(DVT_BAR.matchesUrlPattern('http://example.com/foo', '*://example.com/*')).toBe(true);
    expect(DVT_BAR.matchesUrlPattern('https://example.com/foo', '*://example.com/*')).toBe(true);
  });

  it('パターンにマッチしないURLはfalseを返す', () => {
    expect(DVT_BAR.matchesUrlPattern('https://other.com/page', '*://example.com/*')).toBe(false);
  });

  it('複数の * が機能する', () => {
    expect(DVT_BAR.matchesUrlPattern('https://github.com/user/repo/issues/1', '*://github.com/*/issues/*')).toBe(true);
    expect(DVT_BAR.matchesUrlPattern('https://github.com/user/repo/pulls/1', '*://github.com/*/issues/*')).toBe(false);
  });

  it('正規表現の特殊文字をエスケープする', () => {
    expect(DVT_BAR.matchesUrlPattern('https://example.com/path.html', '*://example.com/path.html')).toBe(true);
    // ドットがワイルドカードにならないことを確認
    expect(DVT_BAR.matchesUrlPattern('https://example.com/pathXhtml', '*://example.com/path.html')).toBe(false);
  });
});

describe('DVT_BAR.checkAutoRules', () => {
  // querySelectorのモック管理（テスト間の汚染を防ぐためafterEachで復元）
  const qs = { orig: null };
  beforeEach(() => {
    qs.orig = document.querySelector.bind(document);
    loadScript('i18n.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      // Promise を返すようにモック（fn(el).then() に対応）
      translateClickedElement: vi.fn().mockResolvedValue(undefined),
      translateAndSummarizeClickedElement: vi.fn().mockResolvedValue(undefined),
    };
    globalThis.DVT = {
      state: { targetLang: 'ja', pageTranslateActive: false },
    };
    // location.href のモック
    Object.defineProperty(globalThis, 'location', {
      value: { href: 'https://example.com/page' },
      writable: true,
      configurable: true,
    });
    loadScript('content-bar.js');
  });

  afterEach(() => {
    document.querySelector = qs.orig;
  });

  it('マッチするルールがない場合はfalseを返す', async () => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({ autoRules: [] }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(false);
  });

  it('無効なルールはスキップする', async () => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: '', mode: 'translate', enabled: false }]
    }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(false);
    expect(DVT_PAGE.translatePage).not.toHaveBeenCalled();
  });

  it('マッチするルールがある場合はページ全体を翻訳してtrueを返す', async () => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: '', mode: 'translate', enabled: true }]
    }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(true);
    expect(DVT_PAGE.translatePage).toHaveBeenCalledWith('ja');
  });

  it('モードがsummarizeの場合は翻訳＆要約を実行する', async () => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: '', mode: 'summarize', enabled: true }]
    }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(true);
    expect(DVT_PAGE.translatePageAndSummarize).toHaveBeenCalledWith('ja');
  });

  it('セレクタが指定されている場合は要素翻訳を実行する', async () => {
    const mockEl = document.createElement('div');
    document.querySelector = vi.fn().mockReturnValue(mockEl);
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: 'div.content', mode: 'translate', enabled: true }]
    }));
    const result = await DVT_BAR.checkAutoRules();
    expect(result).toBe(true);
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(mockEl);
  });

  it('セレクタが指定されているがDOM上に存在しない場合はタイムアウト後にfalseを返す', async () => {
    vi.useFakeTimers();
    document.querySelector = vi.fn().mockReturnValue(null);
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({
      autoRules: [{ id: '1', urlPattern: '*://example.com/*', selector: 'div.not-exist', mode: 'translate', enabled: true }]
    }));
    const promise = DVT_BAR.checkAutoRules();
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe(false);
    vi.useRealTimers();
  });
});

describe('DVT_BAR.waitForElement', () => {
  beforeEach(() => {
    loadScript('i18n.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn(),
      translateAndSummarizeClickedElement: vi.fn(),
    };
    globalThis.DVT = { state: { targetLang: 'ja' } };
    loadScript('content-bar.js');
  });

  it('既に存在する要素はすぐに返す', async () => {
    const el = document.createElement('div');
    el.className = 'dvt-test-existing';
    document.body.appendChild(el);
    const result = await DVT_BAR.waitForElement('.dvt-test-existing');
    expect(result).toBe(el);
    el.remove();
  });

  it('後から追加された要素をMutationObserverで検出する', async () => {
    const promise = DVT_BAR.waitForElement('.dvt-test-dynamic');
    // MutationObserver が検出できるよう要素を追加
    const el = document.createElement('div');
    el.className = 'dvt-test-dynamic';
    document.body.appendChild(el);
    const result = await promise;
    expect(result).not.toBeNull();
    el.remove();
  });

  it('タイムアウト後にnullを返す', async () => {
    vi.useFakeTimers();
    const promise = DVT_BAR.waitForElement('.dvt-test-timeout', 500);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeNull();
    vi.useRealTimers();
  });
});

describe('DVT_BAR.startAutoRuleObserver', () => {
  beforeEach(() => {
    loadScript('i18n.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn().mockResolvedValue(undefined),
      translateAndSummarizeClickedElement: vi.fn().mockResolvedValue(undefined),
    };
    globalThis.DVT = { state: { targetLang: 'ja' } };
    loadScript('content-bar.js');
  });

  it('startAutoRuleObserverが存在する', () => {
    expect(typeof DVT_BAR.startAutoRuleObserver).toBe('function');
  });

  it('コンテンツ変更時に再翻訳を呼び出す', async () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    el.innerHTML = '<p>original</p>';
    document.body.appendChild(el);
    const rule = { mode: 'translate', selector: 'div' };

    DVT_BAR.startAutoRuleObserver(el, rule);

    // 外部からのコンテンツ書き換えをシミュレート
    el.innerHTML = '<p>new content</p>';

    // デバウンス（500ms）を経過させる
    await vi.runAllTimersAsync();

    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(el);
    // 監視を停止してから要素を外す（body 監視が残ると後続テストに干渉するため）
    DVT_BAR.stopAutoRuleObserver(rule.id);
    el.remove();
    vi.useRealTimers();
  });
});

// 回帰防止: issue #260 — スリープ復帰後にページ側が対象要素を作り直すと自動翻訳が止まった
describe('DVT_BAR.startAutoRuleObserver — 対象要素の差し替え追従', () => {
  const rule = { id: 'r260', urlPattern: '*', mode: 'translate', selector: '.dvt-test-mailbody', enabled: true };
  // chrome.storage.local に保存されている自動ルール（再探索時に採用ルールを再評価するため参照される）
  let storedRules = [];

  beforeEach(() => {
    vi.useFakeTimers();
    storedRules = [rule];
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      const result = { autoRules: storedRules };
      if (cb) cb(result);
      return Promise.resolve(result);
    });
    loadScript('i18n.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn().mockResolvedValue(undefined),
      translateAndSummarizeClickedElement: vi.fn().mockResolvedValue(undefined),
    };
    globalThis.DVT = { state: { targetLang: 'ja' } };
    loadScript('content-bar.js');
    document.body.innerHTML = '<div class="dvt-test-wrap"><div class="dvt-test-mailbody"><p>hello</p></div></div>';
  });

  afterEach(() => {
    DVT_BAR.stopAutoRuleObserver(rule.id);
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  // ページ側の再描画: 対象要素ごと新しい要素に置き換える
  function replaceTarget(html) {
    const wrap = document.querySelector('.dvt-test-wrap');
    wrap.innerHTML = html;
    return wrap.querySelector('.dvt-test-mailbody');
  }

  it('対象要素が作り直されたら新しい要素を翻訳する', async () => {
    const oldEl = document.querySelector('.dvt-test-mailbody');
    DVT_BAR.startAutoRuleObserver(oldEl, rule);

    const newEl = replaceTarget('<div class="dvt-test-mailbody"><p>new mail</p></div>');
    await vi.runAllTimersAsync();

    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(newEl);
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalledWith(oldEl);
  });

  it('差し替え後の要素の中身が書き換わっても再翻訳する', async () => {
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), rule);
    const newEl = replaceTarget('<div class="dvt-test-mailbody"><p>new mail</p></div>');
    await vi.runAllTimersAsync();
    DVT_PAGE.translateClickedElement.mockClear();

    newEl.innerHTML = '<p>another mail</p>';
    await vi.runAllTimersAsync();

    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(newEl);
  });

  it('作り直された要素が空なら翻訳せず、中身が入った時点で翻訳する', async () => {
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), rule);
    const newEl = replaceTarget('<div class="dvt-test-mailbody"></div>');
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();

    newEl.innerHTML = '<p>loaded later</p>';
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(newEl);
  });

  it('要素がいったん消えて後から出現しても追従する', async () => {
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), rule);
    replaceTarget('<p>loading...</p>');
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();

    const newEl = replaceTarget('<div class="dvt-test-mailbody"><p>back</p></div>');
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(newEl);
  });

  it('タブ再表示（visibilitychange）時にも差し替えをチェックする', async () => {
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), rule);
    // body 監視のデバウンス前にタブ再表示が来るケース
    const newEl = replaceTarget('<div class="dvt-test-mailbody"><p>new mail</p></div>');
    document.dispatchEvent(new Event('visibilitychange'));
    // ストレージ読み出し（Promise）の解決を待つ。タイマーは進めない
    await vi.advanceTimersByTimeAsync(0);
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(newEl);
    await vi.runAllTimersAsync();
    // デバウンス後の再チェックで二重翻訳しない
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledTimes(1);
  });

  it('URL がルールの条件から外れていたら再探索せず監視を停止する', async () => {
    const offRule = { ...rule, urlPattern: '*://dvt-no-match.example/*' };
    storedRules = [offRule];
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), offRule);

    const newEl = replaceTarget('<div class="dvt-test-mailbody"><p>contacts</p></div>');
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();

    // 監視は停止済みなので、その後の書き換えにも反応しない
    newEl.innerHTML = '<p>changed</p>';
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
  });

  it('URL がルールの条件に一致していれば再探索する', async () => {
    const onRule = { ...rule, urlPattern: location.href };
    storedRules = [onRule];
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), onRule);
    const newEl = replaceTarget('<div class="dvt-test-mailbody"><p>new mail</p></div>');
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(newEl);
  });

  it('無関係な DOM 更新が短い間隔で続いても再探索が延期され続けない', async () => {
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), rule);
    const ticker = document.createElement('span');
    document.body.appendChild(ticker);
    const newEl = replaceTarget('<div class="dvt-test-mailbody"><p>new mail</p></div>');

    // 200ms ごとに無関係な要素を更新し続ける（デバウンスだと永久に発火しない間隔）
    for (let i = 0; i < 5; i++) {
      ticker.textContent = String(i);
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(newEl);
  });

  it('SPA 遷移で優先度の高いルールが採用されるページでは再探索せず停止する', async () => {
    // 先頭に別セレクタのルールがあり、そのセレクタ要素が現れた（＝そちらが採用される）
    storedRules = [
      { id: 'high', urlPattern: '*', mode: 'translate', selector: '.dvt-test-other', enabled: true },
      rule,
    ];
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), rule);
    replaceTarget('<div class="dvt-test-other"><p>contacts</p></div><div class="dvt-test-mailbody"><p>x</p></div>');
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
    expect(DVT_PAGE.translateAndSummarizeClickedElement).not.toHaveBeenCalled();
  });

  it('ルールのモード変更は保存済みの最新ルールで反映する', async () => {
    storedRules = [{ ...rule, mode: 'summarize' }];
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), rule);
    const newEl = replaceTarget('<div class="dvt-test-mailbody"><p>new mail</p></div>');
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateAndSummarizeClickedElement).toHaveBeenCalledWith(newEl);
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
  });

  it('body 自体が差し替えられても新しい要素を翻訳する', async () => {
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), rule);
    const newBody = document.createElement('body');
    const wrap = document.createElement('div');
    wrap.className = 'dvt-test-wrap';
    const newEl = document.createElement('div');
    newEl.className = 'dvt-test-mailbody';
    newEl.textContent = 'new mail';
    wrap.appendChild(newEl);
    newBody.appendChild(wrap);
    document.documentElement.replaceChild(newBody, document.body);
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(newEl);
  });

  it('監視開始時点ですでに対象要素が作り直されていても追従する', async () => {
    // checkAutoRules の翻訳処理中に要素が作り直されたケース
    const oldEl = document.querySelector('.dvt-test-mailbody');
    const newEl = replaceTarget('<div class="dvt-test-mailbody"><p>new mail</p></div>');
    DVT_BAR.startAutoRuleObserver(oldEl, rule);
    // DOM 更新もタブ再表示も起きない状態で、ストレージ読み出しの解決だけを待つ
    await vi.advanceTimersByTimeAsync(0);
    expect(DVT_PAGE.translateClickedElement).toHaveBeenCalledWith(newEl);
  });

  it('checkAutoRules でどのルールも採用されなければ既存の監視を停止する', async () => {
    const el = document.querySelector('.dvt-test-mailbody');
    DVT_BAR.startAutoRuleObserver(el, rule);
    storedRules = [];
    await DVT_BAR.checkAutoRules();

    el.innerHTML = '<p>changed</p>';
    await vi.runAllTimersAsync();
    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
  });

  it('stopAutoRuleObserver 後は差し替えに追従しない', async () => {
    DVT_BAR.startAutoRuleObserver(document.querySelector('.dvt-test-mailbody'), rule);
    DVT_BAR.stopAutoRuleObserver(rule.id);

    replaceTarget('<div class="dvt-test-mailbody"><p>new mail</p></div>');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.runAllTimersAsync();

    expect(DVT_PAGE.translateClickedElement).not.toHaveBeenCalled();
  });
});

// 回帰防止: issue #195 — <html lang="null"> のサイトで翻訳バーに "null" と表示された
describe('DVT_BAR.detectPageLanguage — 不正な <html lang> 値の扱い', () => {
  beforeEach(() => {
    // 本物の DVT / i18n をロード（モック DVT では isValidLangCode が無いため）
    loadScript('i18n.js', 'content-core.js');
    globalThis.DVT_PAGE = {
      translatePage: vi.fn(),
      translatePageAndSummarize: vi.fn(),
      translateClickedElement: vi.fn(),
      translateAndSummarizeClickedElement: vi.fn(),
    };
    DVT.state.targetLang = 'ja';
    DVT.state.translateBar = null;
    // ストレージ・API モック（showTranslateBar 内部の chrome.storage.local.get と detectLang 呼び出し）
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({}));
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: false }));
    // body は短文にして API 検出経路が early return する状態にする
    document.body.innerHTML = '<p>short</p>';
    loadScript('content-bar.js');
  });

  afterEach(() => {
    // バー残骸を片付けて他テストへの汚染を防ぐ
    document.querySelectorAll('.dvt-translate-bar').forEach(el => el.remove());
    document.documentElement.lang = '';
    document.body.innerHTML = '';
    DVT.state.translateBar = null;
  });

  // body 短すぎ ＋ API 検出失敗の組み合わせ: 不正な lang のときは「言語不明」バーを出す
  it('<html lang="null"> + body 短文では「言語不明」バーが表示される', async () => {
    document.documentElement.lang = 'null';
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    // 表示テキストに 'null' / 'undefined' が含まれていないこと
    expect(bar.textContent).not.toContain('null');
    expect(bar.textContent).not.toContain('undefined');
    // 翻訳バーの「翻訳する」ボタンが含まれること
    expect(bar.querySelector('.dvt-translate-bar-accept')).not.toBeNull();
  });

  it('<html lang="und"> + body 短文でも「言語不明」バーが表示される', async () => {
    document.documentElement.lang = 'und';
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).not.toContain('und');
  });

  it('<html lang="unknown"> + body 短文でも「言語不明」バーが表示される', async () => {
    document.documentElement.lang = 'unknown';
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).not.toContain('unknown');
  });

  it('<html lang="undefined"> + body 短文でも「言語不明」バーが表示される', async () => {
    document.documentElement.lang = 'undefined';
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).not.toContain('undefined');
  });

  it('<html lang> が空（属性無し）+ body 短文ではバーが出ない（過剰干渉防止）', async () => {
    document.documentElement.lang = '';
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });

  it('<html lang="en"> でターゲットが ja のときバーが表示される（回帰検知）', async () => {
    document.documentElement.lang = 'en';
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    const text = bar.textContent;
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
    expect(text).toContain('English');
  });

  it('API 検出結果が "null" 文字列のとき、元の <html lang> が不正なら「言語不明」バーが出る', async () => {
    // <html lang="null"> + body 長文 → API 検出経路で result が "null" 文字列
    document.documentElement.lang = 'null';
    document.body.innerHTML = '<p>' + 'a'.repeat(200) + '</p>';
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: true, detectedLang: 'null' }));
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).not.toContain('null');
  });

  it('<html lang> 空 + API 検出結果が "null" のときはバーが出ない', async () => {
    // 過剰干渉を避ける: <html lang> 自体が無いケースでは API 検出失敗時もバーを出さない
    document.documentElement.lang = '';
    document.body.innerHTML = '<p>' + 'a'.repeat(200) + '</p>';
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: true, detectedLang: 'null' }));
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });

  it('<html lang="null"> + API 検出が成功して有効な言語を返したら、その言語名で表示される', async () => {
    document.documentElement.lang = 'null';
    document.body.innerHTML = '<p>' + 'a'.repeat(200) + '</p>';
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: true, detectedLang: 'en' }));
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('English');
    expect(bar.textContent).not.toContain('null');
  });

  // 回帰防止: issue #197 — 言語コード正規化漏れ
  it('<html lang="en "> （前後空白付き）+ ターゲット ja でバーが正しく表示される', async () => {
    document.documentElement.lang = 'en ';
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('English');
  });

  it('<html lang=" ja "> （前後空白付き）+ ターゲット ja は同言語と判定してバーが出ない', async () => {
    // issue #197 修正前は trim せずに "ja " と "ja" が不一致になりバーが出ていた
    document.documentElement.lang = ' ja ';
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });

  it('<html lang="   "> （空白のみ）+ body 短文ではバーが出ない（過剰干渉防止）', async () => {
    // issue #197 修正前は hadBogusHtmlLang が true になり「言語不明」バーが出ていた
    document.documentElement.lang = '   ';
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });

  it('API 検出結果が "en " （前後空白付き）でも正しく "English" で表示される', async () => {
    document.documentElement.lang = '';
    document.body.innerHTML = '<p>' + 'a'.repeat(200) + '</p>';
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: true, detectedLang: 'en ' }));
    await DVT_BAR.detectPageLanguage();
    const bar = document.querySelector('.dvt-translate-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('English');
  });

  it('API 検出結果が " ja "（前後空白付き）+ ターゲット ja のときはバーが出ない（同言語扱い）', async () => {
    document.documentElement.lang = '';
    document.body.innerHTML = '<p>' + 'a'.repeat(200) + '</p>';
    chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb({ ok: true, detectedLang: ' ja ' }));
    await DVT_BAR.detectPageLanguage();
    expect(document.querySelector('.dvt-translate-bar')).toBeNull();
  });
});

describe('翻訳バー — APIキー未設定時のボタン非表示', () => {
  // showTranslateBar はIIFE内部関数で直接テストできないため、
  // コードの静的検証でAPIキーチェックの存在を確認する。
  it('content-bar.js にLLM APIキーチェックが含まれる', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const code = readFileSync(resolve(__dirname, '..', 'content-bar.js'), 'utf-8');
    expect(code).toContain('claudeApiKey');
    expect(code).toContain('geminiApiKey');
    expect(code).toContain("style.display = 'none'");
  });

  it('content-bar.js にDeepL APIキーチェックが含まれる', () => {
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const code = readFileSync(resolve(__dirname, '..', 'content-bar.js'), 'utf-8');
    expect(code).toContain('translateEngine');
    expect(code).toContain('deeplApiKey');
    // DeepL未設定時に翻訳ボタンも非表示にするロジックが存在
    expect(code).toContain('dvt-translate-bar-accept');
  });
});
