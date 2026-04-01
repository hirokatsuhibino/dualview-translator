// テスト用ヘルパー: スクリプトファイルをグローバルスコープで実行
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 指定されたJSファイルをグローバルスコープで実行し、var宣言をglobalThisに登録する
 * IIFE内のvar宣言（例: var DVT_I18N = ...）がglobalThis.DVT_I18N に公開される
 */
export function loadScript(...filenames) {
  for (const filename of filenames) {
    const filepath = resolve(import.meta.dirname, '..', filename);
    const code = readFileSync(filepath, 'utf-8');
    // var宣言をglobalThisに登録するため、直接代入に変換してからFunction内で実行
    // eslint-disable-next-line no-eval
    const wrappedCode = code.replace(
      /^var\s+(\w+)\s*=/gm,
      (_match, name) => `globalThis.${name} =`
    );
    const fn = new Function(wrappedCode);
    fn();
  }
}
