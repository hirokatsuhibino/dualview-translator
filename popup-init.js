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

// ピン留め誘導バナー: ツールバーに未ピン留めのときに表示する。
// chrome.action.getUserSettings は Chrome 91+ のみ。
//  - 検出可能: 未ピン留めなら表示、ピン留め済みなら非表示
//  - 検出不可（古い Firefox / Safari 等）: ピン留め状態が分からないため表示するが、
//    永続的に居座らないようポップアップ表示回数が MAX_BANNER_SHOWS に達したら止める
// ×ボタンでの明示的非表示（pinBannerDismissed）はどの環境でも即・永続で効く。
(function() {
  var MAX_BANNER_SHOWS = 3; // 非対応環境での最大表示回数

  var action = (typeof chrome !== 'undefined' && chrome.action) ? chrome.action : null;
  var banner = document.getElementById('pinBanner');
  var closeBtn = document.getElementById('pinBannerClose');
  if (!banner) return;

  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      banner.classList.remove('show');
      chrome.storage.local.set({ pinBannerDismissed: true });
    });
  }

  chrome.storage.local.get(['pinBannerDismissed', 'pinBannerShownCount'], function(data) {
    if (data && data.pinBannerDismissed) return;

    // 検出可能な環境: ピン留め状態を直接見て判定（回数制限は不要）
    if (action && typeof action.getUserSettings === 'function') {
      var result;
      try {
        result = action.getUserSettings();
      } catch (e) {
        result = null;
      }
      if (result) {
        Promise.resolve(result).then(function(settings) {
          // isOnToolbar === true（ピン留め済み）のときは出さない
          if (settings && settings.isOnToolbar === false) {
            banner.classList.add('show');
          }
        }).catch(function() {});
        return;
      }
      // result が falsy（取得不可）は非対応環境として下のフォールバックへ
    }

    // 非対応環境: 回数上限まで表示し、表示するたびにカウントを進める
    var count = (data && data.pinBannerShownCount) || 0;
    if (count >= MAX_BANNER_SHOWS) return;
    banner.classList.add('show');
    chrome.storage.local.set({ pinBannerShownCount: count + 1 });
  });
})();
