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

// iOS Safari等 chrome.commands 非対応環境ではショートカット表示を隠す
(function() {
  var hasCommands = typeof chrome !== 'undefined' && typeof chrome.commands !== 'undefined';
  if (!hasCommands) {
    document.documentElement.classList.add('dvt-no-shortcuts');
  }
})();

// ピン留め誘導バナー: ツールバーに未ピン留めのときだけ表示する。
// chrome.action.getUserSettings は Chrome 91+ のみ。Firefox等の非対応環境や
// 一度閉じられた場合（pinBannerDismissed）は表示しない。
(function() {
  var action = (typeof chrome !== 'undefined' && chrome.action) ? chrome.action : null;
  if (!action || typeof action.getUserSettings !== 'function') return;

  var banner = document.getElementById('pinBanner');
  var closeBtn = document.getElementById('pinBannerClose');
  if (!banner) return;

  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      banner.classList.remove('show');
      chrome.storage.local.set({ pinBannerDismissed: true });
    });
  }

  chrome.storage.local.get('pinBannerDismissed', function(data) {
    if (data && data.pinBannerDismissed) return;
    var result;
    try {
      result = action.getUserSettings();
    } catch (e) {
      return;
    }
    Promise.resolve(result).then(function(settings) {
      if (settings && settings.isOnToolbar === false) {
        banner.classList.add('show');
      }
    }).catch(function() {});
  });
})();
