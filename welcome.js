// Copyright (c) Orangesoft Inc
// DualView Translator — ウェルカムページ（初回インストール時の案内）

(function () {
  // テーマ適用: content scriptが検出した値をstorageから読む（popup-init.jsと同じ方式）
  function applyTheme(light) {
    document.documentElement.classList.toggle('dvt-light', light);
  }

  // 表示言語を適用し、RTL言語（アラビア語）では dir を切り替える
  function applyLang(lang) {
    if (lang && DVT_I18N.supportedLangs().indexOf(lang) !== -1) {
      DVT_I18N.setLang(lang);
    }
    const current = DVT_I18N.getLang();
    document.documentElement.setAttribute('lang', current);
    document.documentElement.setAttribute('dir', current === 'ar' ? 'rtl' : 'ltr');
    DVT_I18N.applyToDOM(document);
  }

  // ピン留め済みかを判定して表示を切り替える。
  // chrome.action.getUserSettings は Chrome 91+ のみ。Firefox等の非対応環境では
  // 手順をそのまま表示する（ピン留め状態が不明なため誘導を出し続けるのが安全側）。
  function reflectPinState() {
    const action = (typeof chrome !== 'undefined' && chrome.action) ? chrome.action : null;
    if (!action || typeof action.getUserSettings !== 'function') return;
    let result;
    try {
      result = action.getUserSettings();
    } catch (e) {
      return;
    }
    Promise.resolve(result).then((settings) => {
      if (settings && settings.isOnToolbar === true) {
        const done = document.getElementById('pinnedDone');
        const steps = document.getElementById('pinSteps');
        if (done) done.classList.add('show');
        if (steps) steps.style.display = 'none';
      }
    }).catch(() => {});
  }

  function init() {
    chrome.storage.local.get(['dvtTheme', 'uiLang'], (data) => {
      if (data.dvtTheme) applyTheme(data.dvtTheme === 'light');
      applyLang(data.uiLang);
    });
    reflectPinState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
