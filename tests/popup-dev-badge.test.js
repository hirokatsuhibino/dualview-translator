// Copyright (c) Orangesoft Inc
// popup の dev バッジ表示（Issue #216）のテスト
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const popupHtml = readFileSync(resolve(__dirname, '..', 'popup.html'), 'utf-8');
const popupJs = readFileSync(resolve(__dirname, '..', 'popup.js'), 'utf-8');

describe('dev バッジ表示 (#216)', () => {
  describe('popup.html の静的検証', () => {
    it('brand-name 内に id="devBadge" のバッジ要素がある', () => {
      expect(popupHtml).toMatch(/<span class="dev-badge" id="devBadge">dev<\/span>/);
    });

    it('.dev-badge は既定で display: none', () => {
      // 厳密なパース不要。.dev-badge { ... display: none ... } の塊が存在することを確認
      expect(popupHtml).toMatch(/\.dev-badge\s*\{[^}]*display:\s*none/);
    });

    it('.dev-badge.is-dev で display: inline-block になる', () => {
      expect(popupHtml).toMatch(/\.dev-badge\.is-dev\s*\{[^}]*display:\s*inline-block/);
    });

    it('バッジは赤系の警告色（誤認防止）', () => {
      // 具体色（#e53935 系の赤）でストア版との視覚差を付ける
      expect(popupHtml).toMatch(/\.dev-badge\s*\{[\s\S]*?background:\s*#e5\d{4}/);
    });
  });

  describe('popup.js の静的検証', () => {
    it('chrome.management.getSelf を呼び出している', () => {
      expect(popupJs).toMatch(/chrome\.management\.getSelf/);
    });

    it("installType === 'development' を判定している", () => {
      expect(popupJs).toMatch(/installType\s*===\s*['"]development['"]/);
    });

    it("development の場合に devBadge に is-dev クラスを付与する", () => {
      // classList.add('is-dev') を呼ぶ箇所がある
      expect(popupJs).toMatch(/devBadge[\s\S]{0,200}classList\.add\(\s*['"]is-dev['"]/);
    });
  });

  describe('挙動シミュレーション（dev バッジロジック抽出）', () => {
    // popup.js は top-level 副作用が多くそのまま load できないため、
    // dev バッジに関わる挙動のみを抽出して模擬する。
    function applyDevBadge(chromeMock, doc) {
      // popup.js と同一ロジックを抜粋
      if (chromeMock.management && typeof chromeMock.management.getSelf === 'function') {
        chromeMock.management.getSelf((info) => {
          if (info && info.installType === 'development') {
            doc.getElementById('devBadge').classList.add('is-dev');
          }
        });
      }
    }

    let doc;
    beforeEach(() => {
      document.body.innerHTML = '<span class="dev-badge" id="devBadge">dev</span>';
      doc = document;
    });

    it("installType=development で is-dev クラスが付く", () => {
      const chromeMock = {
        management: {
          getSelf: (cb) => cb({ installType: 'development' }),
        },
      };
      applyDevBadge(chromeMock, doc);
      expect(doc.getElementById('devBadge').classList.contains('is-dev')).toBe(true);
    });

    it("installType=normal では is-dev クラスは付かない", () => {
      const chromeMock = {
        management: {
          getSelf: (cb) => cb({ installType: 'normal' }),
        },
      };
      applyDevBadge(chromeMock, doc);
      expect(doc.getElementById('devBadge').classList.contains('is-dev')).toBe(false);
    });

    it("chrome.management 自体が無くてもエラーにならない（古いブラウザ想定）", () => {
      const chromeMock = {};
      expect(() => applyDevBadge(chromeMock, doc)).not.toThrow();
      expect(doc.getElementById('devBadge').classList.contains('is-dev')).toBe(false);
    });
  });
});
