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
