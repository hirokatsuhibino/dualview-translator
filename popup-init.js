// Copyright (c) Orangesoft Inc
// DualView Translator — ポップアップ初期化（テーマ適用・ショートカット表示）

// テーマ適用: content scriptがWebページコンテキストで検出した値をstorageから読む
// （Firefox拡張ポップアップではprefers-color-schemeがOS設定を反映しないため）
(function() {
  function apply(light) {
    document.documentElement.classList.toggle('dvt-light', light);
  }
  chrome.storage.local.get('dvtTheme', function(data) {
    if (data.dvtTheme) {
      apply(data.dvtTheme === 'light');
    }
  });
  chrome.storage.onChanged.addListener(function(changes) {
    if (changes.dvtTheme) apply(changes.dvtTheme.newValue === 'light');
  });
})();

// Macの場合はショートカット表示を Cmd に切り替え
(function() {
  if (navigator.platform.indexOf('Mac') !== -1 || navigator.userAgent.indexOf('Mac') !== -1) {
    document.querySelectorAll('.btn-shortcut').forEach(function(el) {
      el.textContent = el.textContent.replace('Ctrl', '⌘');
    });
  }
})();
