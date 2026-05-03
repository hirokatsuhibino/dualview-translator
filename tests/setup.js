// Chrome拡張APIのモック
// テスト環境でchrome.*が未定義のため、最低限のモックを提供

// jsdomに存在しないAPIのモック
globalThis.window.matchMedia = vi.fn((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

// jsdom は Range.getBoundingClientRect() / getClientRects() を実装していない
// content-selection.js のミニアイコン位置決めなどで参照されるためダミーを返す
if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = function () {
    return { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  };
}
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function () {
    return [];
  };
}

// jsdom は Element.scrollIntoView() を実装していない
// content-page.js の runSummarize 等で要約ブロック挿入後に呼ばれるためダミーを置く
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// content-selection.js は selectionchange リスナーをタッチデバイスのみで登録するため、
// jsdom 環境を「タッチデバイス」と判定させて selectionchange 経路もテストできるようにする。
// (`'ontouchstart' in document.documentElement` の判定で true を返させる)
if (typeof document !== 'undefined' && !('ontouchstart' in document.documentElement)) {
  Object.defineProperty(document.documentElement, 'ontouchstart', {
    value: null,
    configurable: true,
    writable: true,
  });
}

// Web Speech API のモック（読み上げ機能のテスト用）
// jsdom には未実装なので最低限の挙動を提供する。
// テスト側からは globalThis.__speakLog で呼び出し履歴を検査できる。
globalThis.__speakLog = {
  spoken: [],   // speak() に渡された SpeechSynthesisUtterance の配列
  cancels: 0,   // cancel() の呼び出し回数
  reset() { this.spoken = []; this.cancels = 0; },
};
class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.onend = null;
    this.onerror = null;
  }
}
// getVoices() の戻り値はテストごとに上書きできるよう変数で保持
globalThis.__mockVoices = [
  { lang: 'ja-JP', name: 'Kyoko' },
  { lang: 'en-US', name: 'Samantha' },
  { lang: 'fr-FR', name: 'Thomas' },
  { lang: 'de-DE', name: 'Anna' },
];
globalThis.window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
globalThis.window.speechSynthesis = {
  speak: vi.fn((utterance) => {
    globalThis.__speakLog.spoken.push(utterance);
  }),
  cancel: vi.fn(() => { globalThis.__speakLog.cancels++; }),
  getVoices: vi.fn(() => globalThis.__mockVoices),
};

const storageData = {};

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn((keys, cb) => {
        if (typeof keys === 'string') keys = [keys];
        const result = {};
        keys.forEach(k => { if (storageData[k] !== undefined) result[k] = storageData[k]; });
        if (cb) cb(result);
        return Promise.resolve(result);
      }),
      set: vi.fn((data, cb) => {
        Object.assign(storageData, data);
        if (cb) cb();
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn((msg, cb) => {
      if (cb) cb({ ok: true });
      return Promise.resolve({ ok: true });
    }),
    onMessage: {
      addListener: vi.fn(),
    },
    lastError: null,
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([{ id: 1 }])),
    sendMessage: vi.fn(() => Promise.resolve({ ok: true })),
  },
  commands: {
    onCommand: {
      addListener: vi.fn(),
    },
  },
  contextMenus: {
    create: vi.fn(),
    update: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
};

// テスト間でストレージをリセットするヘルパー
globalThis.__resetMockStorage = () => {
  Object.keys(storageData).forEach(k => delete storageData[k]);
};
