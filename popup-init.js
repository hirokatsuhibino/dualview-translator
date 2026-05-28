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
// 判定可否は chrome.action.getUserSettings の有無で決まる（Chrome 91+ / Firefox 116+ 等で対応）。
//  - 対応ブラウザ: 未ピン留めなら表示、ピン留め済みなら非表示
//  - 非対応ブラウザ: ピン留め状態が分からないため表示するが、永続的に居座らないよう
//    ポップアップ表示回数が MAX_BANNER_SHOWS に達したら止める
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

    // 判定不可（非対応・取得失敗・reject 等）のフォールバック:
    // 回数上限まで表示し、表示するたびにカウントを進める
    function showWithCap() {
      var count = (data && data.pinBannerShownCount) || 0;
      if (count >= MAX_BANNER_SHOWS) return;
      banner.classList.add('show');
      chrome.storage.local.set({ pinBannerShownCount: count + 1 });
    }

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
          if (settings && settings.isOnToolbar === true) {
            // ピン留め済み → 出さない
            return;
          }
          if (settings && settings.isOnToolbar === false) {
            // 未ピン留め → 表示（判定できているので回数制限は不要）
            banner.classList.add('show');
            return;
          }
          // 期待した形が返らない → 判定不可としてフォールバック
          showWithCap();
        }).catch(function() {
          // reject（部分対応・不安定実装）→ 判定不可としてフォールバック
          showWithCap();
        });
        return;
      }
      // result が falsy（取得不可）は非対応環境として下のフォールバックへ
    }

    // 非対応環境
    showWithCap();
  });
})();
