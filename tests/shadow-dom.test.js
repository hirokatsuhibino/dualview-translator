// Shadow DOM 貫通翻訳のテスト（#252）
// Hyvor Talk 等の open Shadow DOM 内コメントを翻訳対象にする機構を検証する。
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers.js';

// data-dvt-id を持つ翻訳済み要素（.dvt-orig / .dvt-trans）を DOM API で構築する。
// （innerHTML は使わない方針）
function makeTranslatedP(id, origText, transText) {
  const p = document.createElement('p');
  p.setAttribute('data-dvt-id', id);
  const orig = document.createElement('span');
  orig.className = 'dvt-orig';
  orig.textContent = origText;
  const trans = document.createElement('span');
  trans.className = 'dvt-trans';
  trans.textContent = transText;
  p.append(orig, trans);
  return p;
}

function makeSummaryBlock() {
  const div = document.createElement('div');
  div.className = 'dvt-summary';
  div.setAttribute('data-dvt', 'true');
  div.textContent = '要約ブロック';
  return div;
}

describe('DVT.deepQuerySelectorAll / forEachShadowRoot（content-core）', () => {
  beforeAll(() => {
    loadScript('i18n.js', 'content-core.js');
  });

  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('light DOM のマッチを返す（従来どおり）', () => {
    const p = document.createElement('p');
    p.textContent = 'light';
    document.body.appendChild(p);
    const hits = DVT.deepQuerySelectorAll(document, 'p');
    expect(hits.length).toBe(1);
    expect(hits[0]).toBe(p);
  });

  it('open shadow root 内のマッチも貫通して返す', () => {
    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'open' });
    const p = document.createElement('p');
    p.textContent = 'shadow comment';
    sr.appendChild(p);
    document.body.appendChild(host);

    // 通常の querySelectorAll は shadow を貫通しない
    expect(document.querySelectorAll('p').length).toBe(0);
    // deepQuerySelectorAll は貫通する
    const hits = DVT.deepQuerySelectorAll(document, 'p');
    expect(hits.length).toBe(1);
    expect(hits[0].textContent).toBe('shadow comment');
  });

  it('light + shadow の両方を合算して返す', () => {
    const lp = document.createElement('p');
    lp.textContent = 'light';
    document.body.appendChild(lp);

    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'open' });
    const sp = document.createElement('p');
    sp.textContent = 'shadow';
    sr.appendChild(sp);
    document.body.appendChild(host);

    const hits = DVT.deepQuerySelectorAll(document, 'p');
    expect(hits.length).toBe(2);
    expect(hits.map(e => e.textContent).sort()).toEqual(['light', 'shadow']);
  });

  it('ネストした shadow root も再帰的に辿る', () => {
    const outer = document.createElement('div');
    const osr = outer.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    osr.appendChild(inner);
    const isr = inner.attachShadow({ mode: 'open' });
    const p = document.createElement('p');
    p.textContent = 'deep';
    isr.appendChild(p);
    document.body.appendChild(outer);

    const hits = DVT.deepQuerySelectorAll(document, 'p');
    expect(hits.length).toBe(1);
    expect(hits[0].textContent).toBe('deep');
  });

  it('closed shadow root は到達できないため無視される（仕様どおり）', () => {
    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'closed' });
    const p = document.createElement('p');
    p.textContent = 'closed';
    sr.appendChild(p);
    document.body.appendChild(host);
    // closed は host.shadowRoot === null のため拾えない（クラッシュしないこと）
    const hits = DVT.deepQuerySelectorAll(document, 'p');
    expect(hits.length).toBe(0);
  });

  it('forEachShadowRoot は全 open shadow root を列挙する', () => {
    const h1 = document.createElement('div');
    h1.attachShadow({ mode: 'open' });
    const h2 = document.createElement('div');
    h2.attachShadow({ mode: 'open' });
    document.body.append(h1, h2);

    const roots = [];
    DVT.forEachShadowRoot(document, sr => roots.push(sr));
    expect(roots.length).toBe(2);
    expect(roots).toContain(h1.shadowRoot);
    expect(roots).toContain(h2.shadowRoot);
  });
});

describe('DVT_PAGE — Shadow DOM 貫通翻訳（#252）', () => {
  beforeAll(() => {
    loadScript('i18n.js', 'content-core.js', 'content-page.js');
  });

  beforeEach(() => {
    document.body.replaceChildren();
    DVT.state.pageTranslateActive = false;
  });

  it('deepQuerySelectorAll で shadow 内の翻訳対象段落も拾える（Hyvor Talk 構造）', () => {
    const lp = document.createElement('p');
    lp.textContent = 'This is a light DOM paragraph.';
    document.body.appendChild(lp);

    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'open' });
    const c1 = document.createElement('p');
    c1.textContent = 'Great insight, thanks!';
    const c2 = document.createElement('p');
    c2.textContent = 'I totally agree with this.';
    sr.append(c1, c2);
    document.body.appendChild(host);

    const hits = DVT.deepQuerySelectorAll(document, 'p');
    expect(hits.length).toBe(3);
  });

  it('undoPageTranslate は shadow root 内の翻訳済み要素・要約も復元/撤去する', () => {
    // shadow 内に要約ブロックと翻訳済み要素
    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'open' });
    sr.append(makeSummaryBlock(), makeTranslatedP('dvt-r-shadow-1', 'Original comment', '翻訳されたコメント'));
    document.body.appendChild(host);

    // light DOM 側にも翻訳済み要素1件
    document.body.appendChild(makeTranslatedP('dvt-r-light-1', 'Light original', 'ライト翻訳'));

    expect(DVT.deepQuerySelectorAll(document, '[data-dvt-id]').length).toBe(2);
    DVT_PAGE.undoPageTranslate();
    // shadow 内・light 両方の翻訳済み要素が復元され data-dvt-id が消える
    expect(DVT.deepQuerySelectorAll(document, '[data-dvt-id]').length).toBe(0);
    // shadow 内の要約ブロックも撤去される
    expect(DVT.deepQuerySelectorAll(document, '.dvt-summary').length).toBe(0);
  });
});

describe('DVT_PAGE — 領域選択の composedPath 対応（#252）', () => {
  beforeAll(() => {
    loadScript('i18n.js', 'content-core.js', 'content-page.js');
  });

  beforeEach(() => {
    document.body.replaceChildren();
    DVT.state.regionMode = false;
    DVT_PAGE.exitRegionMode(true); // 残存モードを解除
  });

  it('ホバー時、composedPath()[0] の実要素（shadow 内）をハイライトする（e.target の host ではなく）', () => {
    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'open' });
    const comment = document.createElement('p');
    comment.textContent = 'Shadow comment to translate';
    sr.appendChild(comment);
    document.body.appendChild(host);

    DVT_PAGE.enterRegionMode('translate');
    try {
      // document に登録された onMousemove へ届くよう document.dispatchEvent（e.target は document）。
      // composedPath()[0] を shadow 内 comment に固定 → eventTarget が composedPath を使えば comment が拾われる。
      // もし e.target（=document）を見ていれば要素ノードでないため何もハイライトされない。
      const ev = new MouseEvent('mousemove', { bubbles: true });
      Object.defineProperty(ev, 'composedPath', {
        value: () => [comment, sr, host, document.body, document.documentElement, document],
      });
      document.dispatchEvent(ev);

      // composedPath 経由で shadow 内 comment にハイライトクラスが付く
      expect(comment.classList.contains('dvt-region-highlight')).toBe(true);
    } finally {
      DVT_PAGE.exitRegionMode(true);
    }
  });

  it('クリック確定で領域選択モードが解除される（composed イベント経由）', () => {
    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'open' });
    const comment = document.createElement('p');
    comment.textContent = 'Shadow comment';
    sr.appendChild(comment);
    document.body.appendChild(host);

    DVT_PAGE.enterRegionMode('translate');
    expect(DVT.state.regionMode).toBe(true);

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'composedPath', {
      value: () => [comment, sr, host, document.body, document.documentElement, document],
    });
    document.dispatchEvent(ev);

    // composedPath で実要素が取れ、クリックが確定処理に進む → モード解除
    expect(DVT.state.regionMode).toBe(false);
  });
});
