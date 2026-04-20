// Copyright (c) Orangesoft Inc
// 自動翻訳ルールの編集フロー（select-to-edit）のテスト
// popup.js のロジックに相当する状態遷移を再現して検証する
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// popup.js と同じデータ形状（id/urlPattern/selector/mode/enabled）
// ID生成は決定的にする（Math.random 衝突・テスト非決定性の回避）
let __ruleIdCounter = 0;
function resetRuleIdCounter() { __ruleIdCounter = 0; }
function makeRule(overrides = {}) {
  return {
    id: 'r' + (++__ruleIdCounter),
    urlPattern: '*://example.com/*',
    selector: '',
    mode: 'translate',
    enabled: true,
    ...overrides,
  };
}

// popup.js の enterEditMode / exitEditMode / btnAddRule 挙動を抽出
function createRuleStore(initialRules = []) {
  const state = {
    rules: [...initialRules],
    editingRuleId: null,
    form: { urlPattern: '', selector: '', mode: 'translate' },
  };

  function enterEditMode(ruleId) {
    const rule = state.rules.find(r => r.id === ruleId);
    if (!rule) return;
    state.editingRuleId = ruleId;
    state.form.urlPattern = rule.urlPattern;
    state.form.selector = rule.selector || '';
    state.form.mode = rule.mode || 'translate';
  }

  function exitEditMode() {
    state.editingRuleId = null;
    state.form.urlPattern = '';
    state.form.selector = '';
    state.form.mode = 'translate';
  }

  function submitForm() {
    const urlPattern = state.form.urlPattern.trim();
    if (!urlPattern) return { ok: false, reason: 'empty-url' };

    if (state.editingRuleId) {
      const idx = state.rules.findIndex(r => r.id === state.editingRuleId);
      if (idx === -1) return { ok: false, reason: 'not-found' };
      const prev = state.rules[idx];
      const newSelector = state.form.selector.trim();
      const newMode = state.form.mode;
      state.rules[idx] = {
        ...prev,
        urlPattern,
        selector: newSelector,
        mode: newMode,
      };
      // urlPattern/selector/mode のいずれかが変わったら再適用が必要
      const needsReapply = prev.urlPattern !== urlPattern
        || prev.selector !== newSelector
        || prev.mode !== newMode;
      exitEditMode();
      return { ok: true, action: 'update', needsReapply };
    }

    state.rules.push(makeRule({
      urlPattern,
      selector: state.form.selector.trim(),
      mode: state.form.mode,
    }));
    state.form.urlPattern = '';
    state.form.selector = '';
    return { ok: true, action: 'add' };
  }

  return { state, enterEditMode, exitEditMode, submitForm };
}

describe('自動翻訳ルールの編集フロー', () => {
  let store;
  const existingRule = makeRule({
    id: 'rule-1',
    urlPattern: '*://foo.com/*',
    selector: 'div.main',
    mode: 'summarize',
  });

  beforeEach(() => {
    resetRuleIdCounter();
    store = createRuleStore([existingRule]);
  });

  it('初期状態では編集モードでない', () => {
    expect(store.state.editingRuleId).toBeNull();
  });

  it('enterEditMode で対象ルールの値がフォームにセットされる', () => {
    store.enterEditMode('rule-1');
    expect(store.state.editingRuleId).toBe('rule-1');
    expect(store.state.form.urlPattern).toBe('*://foo.com/*');
    expect(store.state.form.selector).toBe('div.main');
    expect(store.state.form.mode).toBe('summarize');
  });

  it('存在しないIDの enterEditMode は何もしない', () => {
    store.enterEditMode('nonexistent');
    expect(store.state.editingRuleId).toBeNull();
  });

  it('exitEditMode でフォームがクリアされて追加モードに戻る', () => {
    store.enterEditMode('rule-1');
    store.exitEditMode();
    expect(store.state.editingRuleId).toBeNull();
    expect(store.state.form.urlPattern).toBe('');
    expect(store.state.form.selector).toBe('');
    expect(store.state.form.mode).toBe('translate');
  });

  it('編集モードで submitForm すると既存ルールが更新される（新規追加されない）', () => {
    store.enterEditMode('rule-1');
    store.state.form.urlPattern = '*://foo.com/page/*';
    store.state.form.selector = 'article';
    store.state.form.mode = 'translate';
    const result = store.submitForm();
    expect(result).toEqual({ ok: true, action: 'update', needsReapply: true });
    expect(store.state.rules).toHaveLength(1);
    expect(store.state.rules[0].urlPattern).toBe('*://foo.com/page/*');
    expect(store.state.rules[0].selector).toBe('article');
    expect(store.state.rules[0].mode).toBe('translate');
    expect(store.state.rules[0].id).toBe('rule-1'); // IDは維持
  });

  it('URLパターンだけ変えても needsReapply は true（開いているページで再評価が必要）', () => {
    store.enterEditMode('rule-1');
    store.state.form.urlPattern = '*://foo.com/different/*';
    const result = store.submitForm();
    expect(result.needsReapply).toBe(true);
  });

  it('全フィールド同一なら needsReapply は false', () => {
    store.enterEditMode('rule-1');
    // 値を変えずに送信
    const result = store.submitForm();
    expect(result.needsReapply).toBe(false);
  });

  it('更新後は編集モードが解除される', () => {
    store.enterEditMode('rule-1');
    store.submitForm();
    expect(store.state.editingRuleId).toBeNull();
    expect(store.state.form.urlPattern).toBe('');
  });

  it('追加モード（編集モードでない）で submitForm すると新規ルールが追加される', () => {
    store.state.form.urlPattern = '*://new.example/*';
    store.state.form.selector = '.content';
    store.state.form.mode = 'translate';
    const result = store.submitForm();
    expect(result).toEqual({ ok: true, action: 'add' });
    expect(store.state.rules).toHaveLength(2);
    expect(store.state.rules[1].urlPattern).toBe('*://new.example/*');
    expect(store.state.rules[1].enabled).toBe(true); // デフォルトで有効
  });

  it('URLパターンが空だと submitForm は失敗する', () => {
    store.state.form.urlPattern = '   ';
    const result = store.submitForm();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty-url');
    expect(store.state.rules).toHaveLength(1); // 追加されていない
  });

  it('編集中のルールIDが消えていた場合（削除済み等）は更新に失敗する', () => {
    store.enterEditMode('rule-1');
    store.state.rules.splice(0, 1); // 外部から削除されたシナリオ
    store.state.form.urlPattern = '*://foo.com/new/*';
    const result = store.submitForm();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-found');
  });
});

describe('ルール項目のDOM構造（クリック伝播の回帰防止）', () => {
  const popupJsSource = readFileSync(resolve(import.meta.dirname, '..', 'popup.js'), 'utf-8');

  // 過去のバグ: チェックボックスと URL パターンを <label> で包んでいたため、
  // label の click stopPropagation が URL パターンのクリックも止めてしまい、
  // 「更新後に別ルールをクリックしても編集モードに入らない」問題が発生していた。
  it('renderAutoRules は rule-item 内でチェックボックスを <label> でラップしない', () => {
    // renderAutoRules の本体を抽出
    const renderStart = popupJsSource.indexOf('function renderAutoRules');
    const renderEnd = popupJsSource.indexOf('\n}', renderStart);
    const renderBody = popupJsSource.slice(renderStart, renderEnd);
    // rule-toggle クラスは不要（label を使わない新構造）
    expect(renderBody).not.toMatch(/createElement\(['"]label['"]\)/);
    expect(renderBody).not.toMatch(/\.rule-toggle['"]/);
  });

  it('チェックボックスの click が stopPropagation されている（change 経由で親の click が発火するのを防ぐ）', () => {
    expect(popupJsSource).toMatch(/cb\.addEventListener\(['"]click['"],\s*\(e\)\s*=>\s*e\.stopPropagation\(\)\)/);
  });

  it('削除ボタンの click が stopPropagation されている', () => {
    const delHandlerMatch = popupJsSource.match(/querySelectorAll\(['"]\.rule-del['"]\)[\s\S]{0,400}?stopPropagation/);
    expect(delHandlerMatch).not.toBeNull();
  });
});

describe('ルール更新時の再適用（reapplyAutoRule メッセージ）', () => {
  const popupJsSource = readFileSync(resolve(import.meta.dirname, '..', 'popup.js'), 'utf-8');
  const coreJsSource = readFileSync(resolve(import.meta.dirname, '..', 'content-core.js'), 'utf-8');
  const barJsSource = readFileSync(resolve(import.meta.dirname, '..', 'content-bar.js'), 'utf-8');

  it('popup は更新時に reapplyAutoRule メッセージを送信する', () => {
    expect(popupJsSource).toMatch(/action:\s*['"]reapplyAutoRule['"]/);
  });

  it('content-core は reapplyAutoRule メッセージを受信する', () => {
    expect(coreJsSource).toMatch(/msg\.action === ['"]reapplyAutoRule['"]/);
  });

  it('content-core は reapplyAutoRule 受信時に stopAutoRuleObserver と checkAutoRules を呼ぶ', () => {
    // reapplyAutoRule ハンドラ本体に両方の呼び出しが含まれる
    const handlerMatch = coreJsSource.match(
      /msg\.action === ['"]reapplyAutoRule['"][\s\S]{0,400}?sendResponse/
    );
    expect(handlerMatch).not.toBeNull();
    expect(handlerMatch[0]).toMatch(/stopAutoRuleObserver/);
    expect(handlerMatch[0]).toMatch(/checkAutoRules/);
  });

  it('content-bar の checkAutoRules は公開エクスポートに含まれている', () => {
    // content-core が DVT_BAR.checkAutoRules() を呼べるよう公開されている必要がある
    expect(barJsSource).toMatch(/return\s*\{[^}]*checkAutoRules[^}]*\}/);
  });
});

describe('ルール一覧のアクセシビリティと i18n 表示の回帰防止', () => {
  const popupJsSource = readFileSync(resolve(import.meta.dirname, '..', 'popup.js'), 'utf-8');

  it('rule-item に role="button" / tabindex / aria-pressed が付与されている', () => {
    expect(popupJsSource).toMatch(/setAttribute\(['"]role['"],\s*['"]button['"]\)/);
    expect(popupJsSource).toMatch(/\.tabIndex\s*=\s*0/);
    expect(popupJsSource).toMatch(/setAttribute\(['"]aria-pressed['"],/);
  });

  it('rule-item に keydown ハンドラが登録されて Enter / Space を拾う', () => {
    expect(popupJsSource).toMatch(/addEventListener\(['"]keydown['"][\s\S]{0,200}?Enter/);
    expect(popupJsSource).toMatch(/addEventListener\(['"]keydown['"][\s\S]{0,200}?['"] ['"]/);
  });

  it('subText では textContent 用に escHtml を使わない（二重エスケープ防止）', () => {
    // 旧バグ: escHtml(rule.selector) してから textContent に代入して &gt; が表示されていた
    expect(popupJsSource).not.toMatch(/escHtml\(rule\.selector\)/);
    // 未使用になった escHtml 関数自体も削除済み
    expect(popupJsSource).not.toMatch(/function escHtml\(/);
  });

  it('編集モード遷移時に btnAddRule の data-i18n キーも autoRuleUpdate に切り替わる', () => {
    // textContent だけ差し替えると applyToDOM() でラベルが戻るため dataset.i18n も変更する
    // setAddButtonLabelKey('autoRuleUpdate') / ('autoRuleAdd') 両方の呼び出しが必要
    expect(popupJsSource).toMatch(/setAddButtonLabelKey\(['"]autoRuleUpdate['"]\)/);
    expect(popupJsSource).toMatch(/setAddButtonLabelKey\(['"]autoRuleAdd['"]\)/);
    // 実装側で dataset.i18n を更新していることも確認（textContent だけでは不十分）
    expect(popupJsSource).toMatch(/btn\.dataset\.i18n\s*=/);
  });

  it('要素ピッカー結果復元時は tabBtnRules（ルールタブ）に切り替える', () => {
    // 旧バグ: tabBtnSettings を click しており、ルールフォームが見えなかった
    expect(popupJsSource).toMatch(/getElementById\(['"]tabBtnRules['"]\)\.click\(\)/);
    expect(popupJsSource).not.toMatch(/pendingRuleSelector[\s\S]{0,500}tabBtnSettings/);
  });

  it('findIndex で見つからない場合は exitEditMode せず通知する', () => {
    // 旧実装は idx === -1 時に exitEditMode() に落ち込んで編集内容が失われていた
    expect(popupJsSource).toMatch(/idx === -1[\s\S]{0,300}?autoRuleNotFound/);
  });
});
