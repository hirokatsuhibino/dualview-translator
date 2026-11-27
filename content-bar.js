// Copyright (c) Orangesoft Inc
// DualView Translator — ページ読み込み時の翻訳バー + 言語検出

// eslint-disable-next-line no-var
var DVT_BAR = (function () {
  'use strict';

  // ─── 定数 ─────────────────────────────────────────────────────────────────
  const WAIT_FOR_ELEMENT_TIMEOUT = 10000;  // 要素出現待機タイムアウト(ms)
  const RETRANSLATE_DEBOUNCE_MS = 500;     // コンテンツ変更後の再翻訳デバウンス(ms)
  const SPA_RECHECK_DELAY_MS = 300;        // SPA遷移後のルール再チェック遅延(ms)

  // ─── 調査用デバッグログ（Issue #271） ────────────────────────────────
  // DVT.debugLog は storage の debugLog が true のときだけ出力する
  function dlog(...args) {
    if (typeof DVT !== 'undefined' && DVT.debugLog) DVT.debugLog('[autoRule]', ...args);
  }
  function desc(el) {
    return (typeof DVT !== 'undefined' && DVT.describeEl) ? DVT.describeEl(el) : '';
  }

  // ─── ページ言語検出 ────────────────────────────────────────────────
  async function detectPageLanguage() {
    // <html lang> がゴミ値（"null" / "und" / "unknown" 等）の場合は「無い」扱いにして
    // API 検出にフォールバックする（issue #195）。
    // 前後空白付きや空白のみのケース（issue #197）にも対応するため、生値ではなく
    // trim 正規化した値を valid 判定・langMatches・表示で一貫して使う。
    const rawHtmlLang = document.documentElement.lang;
    const htmlLang = rawHtmlLang ? String(rawHtmlLang).trim() : '';
    const htmlLangValid = DVT.isValidLangCode(htmlLang);
    if (htmlLangValid && !DVT.langMatches(htmlLang, DVT.state.targetLang)) {
      showTranslateBar(htmlLang);
      return;
    }
    if (htmlLangValid && DVT.langMatches(htmlLang, DVT.state.targetLang)) return;

    // <html lang> に何か値が書かれていたが不正だった場合は「言語不明」バーを出す候補。
    // 値が完全に空 or 空白のみのサイトは作者が意図的に書いていない or 単なる属性ミスの
    // ケースもあり、勝手にバーを出すと過剰干渉になりかねないので、bogus 扱いから外す。
    const hadBogusHtmlLang = !!htmlLang && !htmlLangValid;

    // lang属性がない or 不正値ならAPIで検出
    const bodyText = document.body?.innerText?.trim();
    if (!bodyText || bodyText.length < 20) {
      // body が短すぎて API 検出も使えない。<html lang> が不正値だった場合だけ「言語不明」バーを出す。
      if (hadBogusHtmlLang) showTranslateBar(null);
      return;
    }
    const sample = bodyText.slice(0, 200);

    try {
      const rawResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'detectLang', text: sample }, (res) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(res?.ok ? res.detectedLang : null);
        });
      });
      // API 検出結果も前後空白の混入を考慮して trim 正規化する
      const result = rawResult ? String(rawResult).trim() : null;
      const resultValid = DVT.isValidLangCode(result);
      if (resultValid && !DVT.langMatches(result, DVT.state.targetLang)) {
        showTranslateBar(result);
      } else if (!resultValid && hadBogusHtmlLang) {
        // API 検出も失敗 / 無効値で、元々の <html lang> も不正だった
        // → 言語不明バーを出して翻訳判断はユーザーに委ねる
        showTranslateBar(null);
      }
    } catch (e) {
      // API 例外も hadBogusHtmlLang のときは言語不明バーで救済
      if (hadBogusHtmlLang) showTranslateBar(null);
    }
  }

  // ─── 翻訳バー表示 ──────────────────────────────────────────────────
  // detectedLang が null / 不正値の場合は「言語不明」用メッセージを使う（issue #195）。
  function showTranslateBar(detectedLang) {
    if (DVT.state.translateBar) return;
    const isUnknown = !DVT.isValidLangCode(detectedLang);
    const message = isUnknown
      ? t('translateBarMsgUnknown')
      : t('translateBarMsg', { lang: DVT.getLangDisplayName(detectedLang) });

    const bar = document.createElement('div');
    bar.className = 'dvt-translate-bar';
    bar.setAttribute('data-dvt', 'true');
    const barText = document.createElement('span');
    barText.className = 'dvt-translate-bar-text';
    // <strong>タグを含むメッセージをDOM要素に変換
    const msgParts = message.split(/(<strong>.*?<\/strong>)/);
    msgParts.forEach(part => {
      const m = part.match(/^<strong>(.*)<\/strong>$/);
      if (m) {
        const strong = document.createElement('strong');
        strong.textContent = m[1];
        barText.appendChild(strong);
      } else if (part) {
        barText.appendChild(document.createTextNode(part));
      }
    });
    bar.appendChild(barText);
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'dvt-translate-bar-btn dvt-translate-bar-accept';
    acceptBtn.textContent = t('translateBarAccept');
    bar.appendChild(acceptBtn);
    const summarizeBtn = document.createElement('button');
    summarizeBtn.className = 'dvt-translate-bar-btn dvt-translate-bar-summarize';
    summarizeBtn.textContent = t('translateBarSummarize');
    bar.appendChild(summarizeBtn);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dvt-translate-bar-btn dvt-translate-bar-close';
    closeBtn.title = t('close');
    closeBtn.textContent = '✕';
    bar.appendChild(closeBtn);
    document.body.appendChild(bar);
    DVT.state.translateBar = bar;

    // APIキー未設定時はボタンを無効化・非表示
    chrome.storage.local.get(['claudeApiKey', 'geminiApiKey', 'translateEngine', 'deeplApiKey'], (data) => {
      // DeepL選択時にAPIキー未設定なら翻訳ボタンも非表示
      if (data.translateEngine === 'deepl' && !data.deeplApiKey) {
        const acceptBtn = bar.querySelector('.dvt-translate-bar-accept');
        if (acceptBtn) acceptBtn.style.display = 'none';
        const sumBtn = bar.querySelector('.dvt-translate-bar-summarize');
        if (sumBtn) sumBtn.style.display = 'none';
        return;
      }
      // LLM APIキー未設定時は要約ボタンを非表示
      if (!data.claudeApiKey && !data.geminiApiKey) {
        const sumBtn = bar.querySelector('.dvt-translate-bar-summarize');
        if (sumBtn) sumBtn.style.display = 'none';
      }
    });

    bar.querySelector('.dvt-translate-bar-accept').addEventListener('click', () => {
      removeTranslateBar();
      DVT_PAGE.translatePage(DVT.state.targetLang);
    });

    bar.querySelector('.dvt-translate-bar-summarize').addEventListener('click', () => {
      removeTranslateBar();
      DVT_PAGE.translatePageAndSummarize(DVT.state.targetLang);
    });

    bar.querySelector('.dvt-translate-bar-close').addEventListener('click', () => {
      removeTranslateBar();
      chrome.storage.local.get('dismissedDomains', (data) => {
        const list = data.dismissedDomains || [];
        if (!list.includes(location.hostname)) {
          list.push(location.hostname);
          chrome.storage.local.set({ dismissedDomains: list });
        }
      });
    });
  }

  function removeTranslateBar() {
    if (DVT.state.translateBar) {
      DVT.state.translateBar.remove();
      DVT.state.translateBar = null;
    }
  }

  // ─── URLパターンマッチング（ワイルドカード対応） ─────────────────────
  function matchesUrlPattern(url, pattern) {
    // ワイルドカード(*)を正規表現に変換してURLと照合
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try {
      return new RegExp('^' + escaped + '$').test(url);
    } catch (e) {
      return false;
    }
  }

  // ─── 要素が出現するまでMutationObserverで待機 ────────────────────────
  // 動的に追加されるDOM要素（AJAX・遅延ロード等）に対応するため
  function waitForElement(selector, timeout = WAIT_FOR_ELEMENT_TIMEOUT) {
    return new Promise(resolve => {
      // 既に存在する場合はすぐに返す
      const existing = document.querySelector(selector);
      if (existing) { resolve(existing); return; }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });

      // タイムアウト（デフォルト10秒）後にnullで解決
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // ─── アクティブなルールObserverの管理 ──────────────────────────────
  // ruleId → { observer, watcher, cleanup } のマップ。削除・無効化時に切断するために保持する。
  const activeRuleObservers = new Map();

  // ─── 要素の再翻訳監視 ────────────────────────────────────────────────
  // 翻訳済み要素のコンテンツが外部から書き換えられたとき（webメール等）に再翻訳する。
  // 翻訳中はObserverを一時切断して自分の変更を無視し、完了後に再接続する。
  //
  // あわせて、対象要素そのものがページ側で作り直された場合（スリープ復帰後の再描画など）にも
  // 追従する（issue #260）。古い要素が DOM から外れたら rule.selector で要素を探し直し、
  // 見つかった新しい要素に翻訳と監視を張り直す。
  //
  // options.translateNow: true のとき、監視開始と同時に el を翻訳する（要素差し替え時に使用）
  function startAutoRuleObserver(el, rule, options = {}) {
    // 同じルールの既存Observerがあれば先に停止（重複防止）
    stopAutoRuleObserver(rule.id);

    let retranslateTimer = null;
    let recheckTimer = null;
    const entry = { observer: null, watcher: null, cleanup: null, el, rule, translating: false };
    dlog(`監視開始 rule=${rule.id} selector=${rule.selector} mode=${rule.mode} translateNow=${!!options.translateNow} el=${desc(el)}`);

    // このエントリがまだ有効か（ルール削除・無効化・要素差し替えで無効になる）
    function isActive() {
      return activeRuleObservers.get(rule.id) === entry;
    }

    async function retranslate() {
      // 翻訳中はObserverを停止して自分の変更を無視
      observer.disconnect();
      entry.translating = true;
      const t0 = Date.now();
      dlog(`再翻訳 開始 rule=${rule.id} el=${desc(el)}（子ノード監視を一時停止）`);
      try {
        if (rule.mode === 'summarize') {
          await DVT_PAGE.translateAndSummarizeClickedElement(el);
        } else {
          await DVT_PAGE.translateClickedElement(el);
        }
      } catch (e) {
        // 再翻訳失敗は無視
        dlog(`再翻訳 例外 rule=${rule.id}: ${e && e.message}`);
      } finally {
        entry.translating = false;
        // ルールが削除・無効化されていなければ監視を再開
        const reobserve = isActive() && el.isConnected;
        if (reobserve) {
          observer.observe(el, { childList: true });
        }
        dlog(`再翻訳 終了 rule=${rule.id} ${Date.now() - t0}ms active=${isActive()} el=${desc(el)} 子ノード監視再開=${reobserve}`);
      }
    }

    // 直接の子ノード変更を監視（subtree不要: 中身全体の入れ替えを検出すれば十分）
    const observer = new MutationObserver((records) => {
      dlog(`子ノード変更を検知 rule=${rule.id} records=${records.length} → ${RETRANSLATE_DEBOUNCE_MS}ms 後に再翻訳`);
      clearTimeout(retranslateTimer);
      retranslateTimer = setTimeout(retranslate, RETRANSLATE_DEBOUNCE_MS);
    });

    // ── 対象要素の差し替え検知 ──
    // 古い要素が DOM から外れていて、セレクタで別の要素が見つかれば張り直す。
    // まだ見つからない（再描画の途中）ならそのまま監視を続ける。
    async function recheckTarget(reason) {
      if (!isActive() || el.isConnected || !rule.selector) return;
      dlog(`差し替え再探索 rule=${rule.id} reason=${reason || 'mutation'} 旧el=${desc(el)}`);
      // 現在の URL でこのルールがまだ採用されるかを、保存済みルールから再評価する。
      // SPA 遷移で URL 条件から外れた／より優先度の高いルールに切り替わった／
      // ルールが削除・無効化された場合は、別ページや別モードで翻訳しないよう監視ごと停止する
      const latest = await findStillAdoptedRule(rule.id);
      // 待機中に別の再探索が張り直した・停止した場合はここで終了（二重翻訳防止）
      if (!isActive() || el.isConnected) return;
      if (!latest) {
        dlog(`差し替え再探索: ルールが採用されなくなったため監視停止 rule=${rule.id} url=${location.href}`);
        stopAutoRuleObserver(rule.id);
        return;
      }
      // セレクタを変更しても別タブには再適用メッセージが届かないため、探索も最新ルールのセレクタで行う
      if (!latest.selector) {
        // ページ全体翻訳のルールに変わった場合は、この要素監視は不要
        stopAutoRuleObserver(rule.id);
        return;
      }
      let next = null;
      try {
        next = document.querySelector(latest.selector);
      } catch (e) {
        return; // 不正なセレクタ
      }
      if (!next || next === el) {
        dlog(`差し替え再探索: 新しい要素なし rule=${rule.id} found=${!!next}（監視継続）`);
        return;
      }
      // 本文がまだ空なら翻訳はせず監視だけ張る（中身が入った時点で子ノード監視が再翻訳する）
      const hasText = (next.textContent || '').trim().length > 0;
      // モード変更などに追従するため、保存済みの最新ルールで張り直す
      startAutoRuleObserver(next, latest, { translateNow: hasText });
    }

    // document 配下の変更を監視（body 自体の差し替えも拾えるよう document を対象にする）。
    // コールバックは el が接続中なら即 return するので軽量。
    // デバウンスにすると無関係な DOM 更新が続くページで再探索が延期され続けるため、
    // 予約済みのタイマーは維持するスロットルにする（最初の変更から一定時間後に必ず再探索）
    const watcher = new MutationObserver(() => {
      if (el.isConnected || recheckTimer) return;
      recheckTimer = setTimeout(() => {
        recheckTimer = null;
        recheckTarget('mutation');
      }, RETRANSLATE_DEBOUNCE_MS);
    });

    // タブが再表示されたときにも差し替えをチェック（スリープ復帰直後など）
    function onVisibilityChange() {
      if (!document.hidden) recheckTarget('visibilitychange');
    }

    // 調査用: 対象要素の深い階層の変更も数える（デバッグ時のみ）。
    // メールを開いても「子ノード変更を検知」が出ないとき、変更が直下でなく深い階層で起きているかを判別する
    let deepObserver = null;
    let deepCount = 0;
    let deepTimer = null;
    if (typeof DVT !== 'undefined' && DVT.isDebugEnabled && DVT.isDebugEnabled() && el.isConnected) {
      deepObserver = new MutationObserver((records) => {
        deepCount += records.length;
        if (deepTimer) return;
        deepTimer = setTimeout(() => {
          dlog(`(参考) 対象要素内の変更 rule=${rule.id} records=${deepCount} translating=${entry.translating}`);
          deepCount = 0;
          deepTimer = null;
        }, 1000);
      });
      deepObserver.observe(el, { childList: true, subtree: true, characterData: true });
    }

    entry.observer = observer;
    entry.watcher = watcher;
    entry.cleanup = () => {
      clearTimeout(retranslateTimer);
      clearTimeout(recheckTimer);
      clearTimeout(deepTimer);
      if (deepObserver) deepObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    activeRuleObservers.set(rule.id, entry);

    if (rule.selector) {
      watcher.observe(document, { childList: true, subtree: true });
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    if (options.translateNow) {
      // retranslate が翻訳中の自己変更を無視し、完了後に子ノード監視を開始する
      retranslate();
    } else if (el.isConnected) {
      observer.observe(el, { childList: true });
    }

    // 翻訳処理中に対象要素が作り直されていた場合、以後 DOM 更新がないと検知できないため
    // 監視開始の時点で一度だけ差し替えを確認する
    if (rule.selector && !el.isConnected) recheckTarget('start');
  }

  // ─── 採用ルールの再評価 ──────────────────────────────────────────────
  // checkAutoRules と同じ優先順（先頭から、URL が一致し、セレクタ要素が存在する最初のルール）で
  // 現在の URL に採用されるルールを求め、それが ruleId のルールなら最新のルールを返す。
  // より優先度の高いルールが採用される・URL が一致しない・削除/無効化済みの場合は null。
  async function findStillAdoptedRule(ruleId) {
    const data = await new Promise(resolve =>
      chrome.storage.local.get('autoRules', resolve)
    );
    const rules = ((data && data.autoRules) || []).filter(r => r.enabled);
    const url = location.href;
    for (const r of rules) {
      if (!matchesUrlPattern(url, r.urlPattern)) continue;
      if (r.id === ruleId) return r;
      // 優先度の高いルールが今のページに適用できるなら、そちらが採用される
      if (!r.selector) return null;
      try {
        if (document.querySelector(r.selector)) return null;
      } catch (e) {
        // 不正なセレクタのルールは適用できないので次へ
      }
    }
    return null;
  }

  // 自動ルールの監視をすべて停止する
  function stopAllAutoRuleObservers() {
    for (const id of [...activeRuleObservers.keys()]) stopAutoRuleObserver(id);
  }

  // ─── 自動ルールObserverの停止 ────────────────────────────────────────
  // ルール削除・無効化時にpopup.jsから呼び出される
  function stopAutoRuleObserver(ruleId) {
    const entry = activeRuleObservers.get(ruleId);
    if (entry) {
      dlog(`監視停止 rule=${ruleId}`);
      entry.observer.disconnect();
      entry.watcher.disconnect();
      entry.cleanup();
      activeRuleObservers.delete(ruleId);
    }
  }

  // ─── 対象要素の出現待ち（Issue #271） ────────────────────────────
  // URL はルールに一致するのに、セレクタの要素が waitForElement のタイムアウト内に
  // 見つからなかった場合に使う軽量な待機監視。
  // 例: 拡張の更新・再読み込みで content script が入れ直された時点で、Web メールが
  // ログイン画面だった場合。ログイン後に本文要素が現れても URL は変わらないため、
  // これがないと checkAutoRules が二度と実行されず、リロードするまで翻訳されない。
  // 要素が現れた時点で checkAutoRules をやり直す（採用ルールの判定は checkAutoRules に任せる）。
  let pendingWatch = null;

  function stopPendingWatch() {
    if (!pendingWatch) return;
    pendingWatch.observer.disconnect();
    clearTimeout(pendingWatch.timer);
    document.removeEventListener('visibilitychange', pendingWatch.onVisibilityChange);
    pendingWatch = null;
  }

  function startPendingWatch(selectors) {
    stopPendingWatch();
    dlog(`要素の出現待ちを開始 selectors=${selectors.join(' , ')}`);
    const watch = { observer: null, timer: null, onVisibilityChange: null };

    function anyFound() {
      return selectors.some(sel => {
        try {
          return !!document.querySelector(sel);
        } catch (e) {
          return false; // 不正なセレクタ
        }
      });
    }

    function check(reason) {
      if (pendingWatch !== watch) return;
      if (!anyFound()) return;
      dlog(`要素の出現を検知（${reason}）→ checkAutoRules をやり直す`);
      stopPendingWatch();
      checkAutoRules();
    }

    // 対象要素の差し替え検知と同じく、デバウンスではなくスロットルにする
    // （無関係な DOM 更新が続くページでも、最初の変更から一定時間後に必ず確認する）
    watch.observer = new MutationObserver(() => {
      if (watch.timer) return;
      watch.timer = setTimeout(() => {
        watch.timer = null;
        check('mutation');
      }, RETRANSLATE_DEBOUNCE_MS);
    });
    watch.onVisibilityChange = () => {
      if (!document.hidden) check('visibilitychange');
    };
    pendingWatch = watch;
    // body ごと差し替えられても拾えるよう document を監視する
    watch.observer.observe(document, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', watch.onVisibilityChange);
    // 複数ルールがあると、先のルールのタイムアウト後に後続ルールを待っている間に
    // 先のルールの要素が現れていることがある。監視の登録前に現れた要素は通知されないため、
    // 登録直後にも一度確認する
    check('start');
  }

  // ─── 自動翻訳ルールのチェックと実行 ────────────────────────────────
  // checkAutoRules の世代番号。要素待ちの間に新しい checkAutoRules が始まった場合、
  // 古い方は出現待ちを張らない（新しい方の結果を上書きしないため）
  let checkGeneration = 0;

  async function checkAutoRules() {
    const generation = ++checkGeneration;
    // 前回の出現待ちは、このチェックの結果で必要なら張り直す
    stopPendingWatch();
    const startUrl = location.href;
    // await の間に新しいチェック（SPA 遷移・ルール更新・出現待ち）が始まった、または URL が
    // 変わった場合、このチェックは古い。旧ルールでの翻訳や、最新の監視の停止・張り直しをしない
    const isStale = () => generation !== checkGeneration || location.href !== startUrl;
    const data = await new Promise(resolve =>
      chrome.storage.local.get('autoRules', resolve)
    );
    // 古いチェックは新しいチェックに処理を任せる。true を返すのは、初期化時の呼び出し元が
    // 「ルールなし」と判断して翻訳バーを出さないようにするため
    if (isStale()) {
      dlog('checkAutoRules: 新しいチェックが始まったため中止（ルール取得後）');
      return true;
    }
    const rules = (data.autoRules || []).filter(r => r.enabled);
    const url = location.href;
    dlog(`checkAutoRules 開始 有効ルール=${rules.length} url=${url}`);
    // URL は一致したが要素が見つからなかったルールのセレクタ
    const missingSelectors = [];

    for (const rule of rules) {
      if (!matchesUrlPattern(url, rule.urlPattern)) continue;

      if (rule.selector) {
        // 要素セレクタ指定: 即座に存在しない場合はDOMに追加されるまで待機
        const el = await waitForElement(rule.selector);
        if (isStale()) {
          dlog(`checkAutoRules: 新しいチェックが始まったため中止（要素待ち後） rule=${rule.id}`);
          return true;
        }
        if (!el) {
          dlog(`checkAutoRules: 要素待ちタイムアウト rule=${rule.id} selector=${rule.selector}`);
          missingSelectors.push(rule.selector);
          continue; // タイムアウト後も見つからなければスキップ
        }
        dlog(`checkAutoRules: ルール採用 rule=${rule.id} el=${desc(el)}`);

        // これから翻訳する前に既存の監視をすべて停止する。
        // 別ルールの監視が残ると競合し、同じルールの監視が残ると差し替え検知が同じ要素を
        // 重複して翻訳するため（新しい監視は翻訳完了後に張り直す）
        stopAllAutoRuleObservers();

        // 翻訳完了後にコンテンツ変更監視を開始（webメール等の書き換えに対応）
        // Promise.resolve()で同期・非同期どちらの戻り値にも対応
        const fn = rule.mode === 'summarize'
          ? DVT_PAGE.translateAndSummarizeClickedElement
          : DVT_PAGE.translateClickedElement;
        const t0 = Date.now();
        Promise.resolve(fn(el))
          .then(() => {
            dlog(`checkAutoRules: 初回翻訳 終了 rule=${rule.id} ${Date.now() - t0}ms el=${desc(el)}`);
            // 翻訳中に新しいチェックが始まっていれば、旧ルールの監視は張らない（新しいチェックが張る）
            if (isStale()) {
              dlog(`checkAutoRules: 新しいチェックが始まったため監視を張らない rule=${rule.id}`);
              return;
            }
            startAutoRuleObserver(el, rule);
          })
          .catch((e) => { dlog(`checkAutoRules: 初回翻訳 例外 rule=${rule.id}: ${e && e.message}`); });
      } else {
        dlog(`checkAutoRules: ページ全体翻訳ルール採用 rule=${rule.id} mode=${rule.mode} pageTranslateActive=${!!DVT.state.pageTranslateActive}`);
        stopAllAutoRuleObservers();
        // セレクタなしはページ全体翻訳。
        // translatePage はトグル（翻訳中なら解除）なので、SPA の URL 変更で再評価されるたびに
        // 翻訳が解除されないよう、状態をそろえるだけの ensurePageTranslate を使う（Issue #271）
        DVT_PAGE.ensurePageTranslate(DVT.state.targetLang, rule.mode);
      }
      return true; // マッチしたルールで処理済み
    }
    // どのルールも採用されない（SPA 遷移で URL が外れた等）なら旧ルールの監視をすべて停止する
    dlog('checkAutoRules: 採用ルールなし');
    stopAllAutoRuleObservers();
    // URL は一致するのに要素がまだ無いルールがあれば、要素が現れるまで待機監視を残す。
    // 待機中に別の checkAutoRules（SPA 遷移・ルール更新）が始まっていれば、そちらに任せる
    if (missingSelectors.length > 0 && generation === checkGeneration && url === location.href) {
      startPendingWatch(missingSelectors);
    }
    return false; // マッチするルールなし
  }

  // ─── SPA対応: URL変更を検知して自動翻訳ルールを再チェック ───────────
  // history.pushState / replaceState と popstate イベントを監視
  (function watchSpaNavigation() {
    let lastUrl = location.href;

    function onUrlChange() {
      const newUrl = location.href;
      if (newUrl === lastUrl) return;
      dlog(`SPA URL 変更 ${lastUrl} → ${newUrl}`);
      lastUrl = newUrl;
      // URL変更後に少し待ってからルールをチェック（DOMの更新を待つ）
      setTimeout(() => checkAutoRules(), SPA_RECHECK_DELAY_MS);
    }

    // history API のラップ
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = function (...args) {
      origPush(...args);
      onUrlChange();
    };
    history.replaceState = function (...args) {
      origReplace(...args);
      onUrlChange();
    };

    // ブラウザの戻る/進む
    window.addEventListener('popstate', onUrlChange);
  })();

  // ─── 監視状態のスナップショット（Issue #271 調査用） ─────────────────
  // スリープ復帰（タブ再表示・オンライン復帰・フォーカス）のたびに、各ルールの監視が
  // どの要素に張られているか・翻訳中のまま止まっていないか・セレクタが今どの要素を指すかを出す
  function logAutoRuleSnapshot(trigger) {
    if (typeof DVT === 'undefined' || !DVT.isDebugEnabled || !DVT.isDebugEnabled()) return;
    // ページ全体翻訳（セレクタなしのルール・翻訳バー・手動）の状態
    if (typeof DVT_PAGE !== 'undefined' && DVT_PAGE.getDebugState) {
      DVT.debugLog('[page]', `snapshot(${trigger}): ${DVT_PAGE.getDebugState()}`);
    }
    if (activeRuleObservers.size === 0) {
      dlog(`snapshot(${trigger}): 有効な監視なし 要素の出現待ち=${!!pendingWatch}`);
      return;
    }
    for (const [id, entry] of activeRuleObservers) {
      let current = null;
      try {
        current = entry.rule.selector ? document.querySelector(entry.rule.selector) : null;
      } catch (e) {
        // 不正なセレクタは null 扱い
      }
      dlog(`snapshot(${trigger}): rule=${id} translating=${entry.translating}`
        + ` 監視中el=${desc(entry.el)} セレクタの現在の要素=${desc(current)} 同一=${current === entry.el}`);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) logAutoRuleSnapshot('visibilitychange');
  });
  window.addEventListener('online', () => logAutoRuleSnapshot('online'));
  window.addEventListener('focus', () => logAutoRuleSnapshot('focus'));

  return { detectPageLanguage, checkAutoRules, logAutoRuleSnapshot, matchesUrlPattern, waitForElement, startAutoRuleObserver, stopAutoRuleObserver };
})();
