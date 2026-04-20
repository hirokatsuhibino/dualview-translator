// Copyright (c) Orangesoft Inc
// 自動翻訳ルールの編集フロー（select-to-edit）のテスト
// popup.js のロジックに相当する状態遷移を再現して検証する
import { describe, it, expect, beforeEach } from 'vitest';

// popup.js と同じデータ形状（id/urlPattern/selector/mode/enabled）
function makeRule(overrides = {}) {
  return {
    id: 'r' + Math.random().toString(36).slice(2),
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
      state.rules[idx] = {
        ...prev,
        urlPattern,
        selector: state.form.selector.trim(),
        mode: state.form.mode,
      };
      const observerRestart = prev.selector !== state.form.selector.trim() || prev.mode !== state.form.mode;
      exitEditMode();
      return { ok: true, action: 'update', observerRestart };
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
    expect(result).toEqual({ ok: true, action: 'update', observerRestart: true });
    expect(store.state.rules).toHaveLength(1);
    expect(store.state.rules[0].urlPattern).toBe('*://foo.com/page/*');
    expect(store.state.rules[0].selector).toBe('article');
    expect(store.state.rules[0].mode).toBe('translate');
    expect(store.state.rules[0].id).toBe('rule-1'); // IDは維持
  });

  it('selector/mode に変更がない更新では observerRestart が false', () => {
    store.enterEditMode('rule-1');
    // URLパターンだけ変える
    store.state.form.urlPattern = '*://foo.com/different/*';
    const result = store.submitForm();
    expect(result.observerRestart).toBe(false);
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
