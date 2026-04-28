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
