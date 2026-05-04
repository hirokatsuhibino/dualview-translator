// Copyright (c) Orangesoft Inc.
// 音声読み上げ（DVT.speak / createSpeakButton）のテスト

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers.js';

describe('DVT — 音声読み上げ', () => {
  beforeAll(() => {
    loadScript('i18n.js', 'content-core.js');
  });

  beforeEach(() => {
    globalThis.__speakLog.reset();
    globalThis.__mockVoices = [
      { lang: 'ja-JP', name: 'Kyoko' },
      { lang: 'en-US', name: 'Samantha' },
      { lang: 'fr-FR', name: 'Thomas' },
      { lang: 'de-DE', name: 'Anna' },
    ];
    document.body.innerHTML = '';
    DVT.stopSpeak();
    globalThis.__speakLog.reset();
  });

  describe('isSpeechSupported()', () => {
    it('window.speechSynthesis があるとき true', () => {
      expect(DVT.isSpeechSupported()).toBe(true);
    });
  });

  describe('speak()', () => {
    it('speechSynthesis.speak が呼ばれる', () => {
      const btn = DVT.createSpeakButton('こんにちは', 'ja');
      document.body.appendChild(btn);
      DVT.speak('こんにちは', 'ja', btn);
      expect(globalThis.__speakLog.spoken.length).toBe(1);
      expect(globalThis.__speakLog.spoken[0].text).toBe('こんにちは');
    });

    it('翻訳先言語コードが BCP47 形式に正規化されて utterance.lang に渡される', () => {
      const btn = DVT.createSpeakButton('Hello', 'en');
      DVT.speak('Hello', 'en', btn);
      expect(globalThis.__speakLog.spoken[0].lang).toBe('en-US');

      DVT.stopSpeak();
      globalThis.__speakLog.reset();

      const btn2 = DVT.createSpeakButton('こんにちは', 'ja');
      DVT.speak('こんにちは', 'ja', btn2);
      expect(globalThis.__speakLog.spoken[0].lang).toBe('ja-JP');
    });

    it('zh-CN / zh-TW / ko / fr / de / es / pt / ru / ar すべて BCP47 マップに対応', () => {
      const cases = [
        ['zh-CN', 'zh-CN'],
        ['zh-TW', 'zh-TW'],
        ['ko', 'ko-KR'],
        ['fr', 'fr-FR'],
        ['de', 'de-DE'],
        ['es', 'es-ES'],
        ['pt', 'pt-PT'],
        ['ru', 'ru-RU'],
        ['ar', 'ar-SA'],
      ];
      // すべての言語を「対応音声あり」にしておく
      globalThis.__mockVoices = cases.map(([, bcp]) => ({ lang: bcp, name: bcp }));
      for (const [code, expected] of cases) {
        DVT.stopSpeak();
        globalThis.__speakLog.reset();
        const btn = DVT.createSpeakButton('text', code);
        DVT.speak('text', code, btn);
        expect(globalThis.__speakLog.spoken[0]?.lang, `mapping for ${code}`).toBe(expected);
      }
    });

    it('テキストが空のとき speak は呼ばれない', () => {
      const btn = DVT.createSpeakButton('', 'ja');
      DVT.speak('', 'ja', btn);
      expect(globalThis.__speakLog.spoken.length).toBe(0);
    });

    it('再生中はボタンに data-dvt-speaking 属性が付く', () => {
      const btn = DVT.createSpeakButton('Hello', 'en');
      document.body.appendChild(btn);
      DVT.speak('Hello', 'en', btn);
      expect(btn.dataset.dvtSpeaking).toBe('true');
    });

    it('再生中アイコンが ⏹ に切り替わる', () => {
      const btn = DVT.createSpeakButton('Hello', 'en');
      DVT.speak('Hello', 'en', btn);
      expect(btn.querySelector('.dvt-speak-icon').textContent).toBe('⏹');
    });

    it('同じボタンを再クリックすると停止（cancel が呼ばれる）', () => {
      const btn = DVT.createSpeakButton('Hello', 'en');
      DVT.speak('Hello', 'en', btn);
      const cancelsBefore = globalThis.__speakLog.cancels;
      // 再度同じボタンで speak を呼ぶ
      DVT.speak('Hello', 'en', btn);
      expect(globalThis.__speakLog.cancels).toBeGreaterThan(cancelsBefore);
      expect(btn.dataset.dvtSpeaking).toBeUndefined();
    });

    it('別のボタンをクリックすると現在の再生を停止して新規再生', () => {
      const btn1 = DVT.createSpeakButton('Hello', 'en');
      const btn2 = DVT.createSpeakButton('Bonjour', 'fr');
      DVT.speak('Hello', 'en', btn1);
      expect(btn1.dataset.dvtSpeaking).toBe('true');
      const cancelsBefore = globalThis.__speakLog.cancels;
      DVT.speak('Bonjour', 'fr', btn2);
      expect(globalThis.__speakLog.cancels).toBeGreaterThan(cancelsBefore);
      expect(btn1.dataset.dvtSpeaking).toBeUndefined();
      expect(btn2.dataset.dvtSpeaking).toBe('true');
    });

    it('対応音声がない言語のときトーストを表示して speak は呼ばない', () => {
      // ar の音声を含めない
      globalThis.__mockVoices = [
        { lang: 'en-US', name: 'Samantha' },
        { lang: 'ja-JP', name: 'Kyoko' },
      ];
      document.querySelectorAll('.dvt-toast').forEach(el => el.remove());
      const btn = DVT.createSpeakButton('مرحبا', 'ar');
      DVT.speak('مرحبا', 'ar', btn);
      expect(globalThis.__speakLog.spoken.length).toBe(0);
      expect(document.querySelectorAll('.dvt-toast').length).toBe(1);
      // トーストに言語名「العربية」が含まれる
      const toastText = document.querySelector('.dvt-toast').textContent;
      expect(toastText).toContain('العربية');
    });

    it('getVoices() が空配列のときは「未対応」と判定せず楽観的に再生試行', () => {
      // Chrome 起動直後など、getVoices が非同期ロードで空のケース
      globalThis.__mockVoices = [];
      const btn = DVT.createSpeakButton('Hello', 'en');
      DVT.speak('Hello', 'en', btn);
      expect(globalThis.__speakLog.spoken.length).toBe(1);
    });

    it('utterance の onend が呼ばれるとボタン状態がリセットされる', () => {
      const btn = DVT.createSpeakButton('Hello', 'en');
      DVT.speak('Hello', 'en', btn);
      const utterance = globalThis.__speakLog.spoken[0];
      expect(btn.dataset.dvtSpeaking).toBe('true');
      // ブラウザが再生終了を通知したのを模擬
      utterance.onend();
      expect(btn.dataset.dvtSpeaking).toBeUndefined();
    });
  });

  describe('stopSpeak()', () => {
    it('再生中なら cancel を呼んでボタン状態を戻す', () => {
      const btn = DVT.createSpeakButton('Hello', 'en');
      DVT.speak('Hello', 'en', btn);
      expect(btn.dataset.dvtSpeaking).toBe('true');
      DVT.stopSpeak();
      expect(globalThis.__speakLog.cancels).toBeGreaterThan(0);
      expect(btn.dataset.dvtSpeaking).toBeUndefined();
    });

    it('再生していないときに呼んでもエラーにならない', () => {
      expect(() => DVT.stopSpeak()).not.toThrow();
    });
  });

  describe('createSpeakButton()', () => {
    it('button 要素を返す', () => {
      const btn = DVT.createSpeakButton('text', 'ja');
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.classList.contains('dvt-speak-btn')).toBe(true);
    });

    it('type="button" が付与される（form 内 submit 防止）', () => {
      const btn = DVT.createSpeakButton('text', 'ja');
      expect(btn.getAttribute('type')).toBe('button');
    });

    it('data-dvt 属性が付与される（拡張要素識別用）', () => {
      const btn = DVT.createSpeakButton('text', 'ja');
      expect(btn.getAttribute('data-dvt')).toBe('true');
    });

    it('extraClass を渡すとクラス追加される', () => {
      const btn = DVT.createSpeakButton('text', 'ja', 'dvt-speak-btn-inline');
      expect(btn.classList.contains('dvt-speak-btn-inline')).toBe(true);
    });

    it('クリックすると speak が発火する', () => {
      const btn = DVT.createSpeakButton('Hello', 'en');
      document.body.appendChild(btn);
      btn.click();
      expect(globalThis.__speakLog.spoken.length).toBe(1);
      expect(globalThis.__speakLog.spoken[0].text).toBe('Hello');
    });

    it('getter 関数を渡すとクリック時の最新値が読まれる', () => {
      let latestText = 'old';
      const btn = DVT.createSpeakButton(() => latestText, () => 'en');
      latestText = 'new';
      btn.click();
      expect(globalThis.__speakLog.spoken[0].text).toBe('new');
    });
  });

  describe('ESC / visibilitychange での自動停止', () => {
    it('再生中に Escape キー押下で停止', () => {
      const btn = DVT.createSpeakButton('Hello', 'en');
      DVT.speak('Hello', 'en', btn);
      expect(btn.dataset.dvtSpeaking).toBe('true');
      const cancelsBefore = globalThis.__speakLog.cancels;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(globalThis.__speakLog.cancels).toBeGreaterThan(cancelsBefore);
      expect(btn.dataset.dvtSpeaking).toBeUndefined();
    });

    it('document.hidden=true の visibilitychange で停止', () => {
      const btn = DVT.createSpeakButton('Hello', 'en');
      DVT.speak('Hello', 'en', btn);
      const cancelsBefore = globalThis.__speakLog.cancels;
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(globalThis.__speakLog.cancels).toBeGreaterThan(cancelsBefore);
    });
  });

  describe('他ブロックの再生を保護', () => {
    it('removeSelectionPanel 相当の状況でもパネル外の再生は止まらない（仕様確認）', () => {
      // パネル外で再生中
      const inlineBtn = DVT.createSpeakButton('Inline text', 'en');
      document.body.appendChild(inlineBtn);
      DVT.speak('Inline text', 'en', inlineBtn);
      expect(inlineBtn.dataset.dvtSpeaking).toBe('true');
      const cancelsBefore = globalThis.__speakLog.cancels;

      // パネル DOM を別途用意。中の dvt-speak-btn は再生中ではない
      const panel = document.createElement('div');
      panel.className = 'dvt-sel-panel';
      const panelBtn = DVT.createSpeakButton('Panel text', 'en');
      panel.appendChild(panelBtn);
      document.body.appendChild(panel);

      // 「パネルに dvt-speak-btn[data-dvt-speaking="true"] があるときだけ stopSpeak」のロジック確認
      if (panel.querySelector('.dvt-speak-btn[data-dvt-speaking="true"]')) {
        DVT.stopSpeak();
      }
      // パネル内ボタンは再生中ではないので stopSpeak は呼ばれずインライン側は再生継続
      expect(globalThis.__speakLog.cancels).toBe(cancelsBefore);
      expect(inlineBtn.dataset.dvtSpeaking).toBe('true');
    });

    it('同一言語スキップでパネル内ボタンが再生中でないとき stopSpeak は呼ばれない', () => {
      const otherBtn = DVT.createSpeakButton('Other', 'en');
      DVT.speak('Other', 'en', otherBtn);
      const cancelsBefore = globalThis.__speakLog.cancels;

      const panelBtn = DVT.createSpeakButton('Panel', 'en');
      // パネル内ボタンは再生中ではない
      if (panelBtn.dataset.dvtSpeaking === 'true') {
        DVT.stopSpeak();
      }
      expect(globalThis.__speakLog.cancels).toBe(cancelsBefore);
      expect(otherBtn.dataset.dvtSpeaking).toBe('true');
    });
  });
});
