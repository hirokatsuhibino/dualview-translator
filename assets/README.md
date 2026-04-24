<!--
Copyright (c) Orangesoft Inc.
-->
# assets/

DualView Translator のアプリアイコン元データと再生成スクリプト。

## ファイル

| ファイル | 用途 |
|---|---|
| `app-icon.svg` | マスター SVG（編集の起点。ベクター元データ） |
| `generate-icons.py` | 全サイズ PNG を Pillow で再生成するスクリプト |
| `app-icon-master-1024.png` | フラット背景（角丸なし）1024×1024 |
| `app-icon-ios-1024.png` | iOS App Store 用（角丸なし）1024×1024 |
| `app-icon-mac-1024.png` | macOS 用（squircle 風角丸あり）1024×1024 |

`app-icon-*-1024.png` はスクリプトの実行成果物だが、レビュー時に差分が見えるようコミットに含める運用。

## 再生成手順

デザイン（色・寸法・矢印）を変えたいとき:

1. `app-icon.svg` を編集（必要なら `generate-icons.py` の定数も合わせて更新）
2. 再生成:

   ```bash
   python3 -m pip install --user pillow  # 初回のみ
   python3 assets/generate-icons.py
   ```

3. 以下が一括で更新される:
   - `safari/DualView Translator/Shared (App)/Assets.xcassets/AppIcon.appiconset/` の全11ファイル
   - `icons/icon{16,32,48,128}.png`（拡張本体）
   - `assets/app-icon-{master,ios,mac}-1024.png`

## デザイン仕様

- 背景色: `#F5A623`（オレンジ）
- 線・矢印色: `#0C0C18`（ダークネイビー、不透明度 92%）
- 矢印軸: 同色 不透明度 43%
- 構成: 左右2列の横線×3行（原文/翻訳の対比）＋ 中央下向き矢印（変換）
- macOS: squircle 風角丸（半径比 22.4%）
- iOS: 角丸なし（システム側マスクが角丸を付ける）
