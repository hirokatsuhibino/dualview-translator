#!/usr/bin/env python3
# Copyright (c) Orangesoft Inc.
"""DualView Translator アプリアイコン生成スクリプト

1024x1024 のマスターを Pillow で描画し、用途別に各サイズへ書き出す。

- iOS App Store 用: 角丸なしフラット
  -> safari/.../AppIcon.appiconset/universal-icon-1024@1x.png
- macOS 用: squircle（角丸）マスクあり
  -> safari/.../AppIcon.appiconset/mac-icon-{16,32,128,256,512}@{1x,2x}.png
- 拡張本体（ブラウザ）: 角丸ありの 16/32/48/128
  -> icons/icon{16,32,48,128}.png

実行方法:
    python3 assets/generate-icons.py
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw

# ===== デザインパラメータ（1024px ベース） =====
SIZE = 1024
BG_COLOR = (245, 166, 35, 255)  # オレンジ #F5A623
INK_COLOR = (12, 12, 24)        # ダークネイビー #0C0C18
LINE_ALPHA = 235                # 横線・矢印先（不透明寄り）
SHAFT_ALPHA = 110               # 矢印軸（半透明）

# 横線（左右ペア×3行）の中心 y / 左右の長さ / 太さ
LINE_THICKNESS = 64        # 9px @128 -> 72; 視認性重視で 64
LINE_RADIUS = LINE_THICKNESS // 2  # 角丸線
LINE_GAP_X = 96            # 左右列の中央ギャップ（矢印通路）
LINE_ROWS = [
    # (中心y, 左の幅, 右の幅)
    (220, 280, 256),
    (380, 224, 272),
    (540, 168, 208),
]

# 矢印（中央、下向き）
ARROW_SHAFT_TOP = 540          # 3行目の中心から下へ
ARROW_SHAFT_BOTTOM = 760       # 矢印先の付け根
ARROW_SHAFT_WIDTH = 64
ARROW_HEAD_TOP = 760
ARROW_HEAD_BOTTOM = 880
ARROW_HEAD_HALF_WIDTH = 96     # 三角形の半幅

# squircle 風の角丸半径比（macOS Big Sur 以降の squircle に近い 22.4%）
MAC_CORNER_RATIO = 0.224

CENTER_X = SIZE // 2


def draw_master() -> Image.Image:
    """1024x1024 のマスター画像（角丸なし、フラット背景）を描画。"""
    img = Image.new("RGBA", (SIZE, SIZE), BG_COLOR)
    draw = ImageDraw.Draw(img, "RGBA")

    # 横線（rounded rectangle で描画）
    line_color = INK_COLOR + (LINE_ALPHA,)
    for cy, left_w, right_w in LINE_ROWS:
        y0 = cy - LINE_THICKNESS // 2
        y1 = cy + LINE_THICKNESS // 2
        # 左
        lx1 = CENTER_X - LINE_GAP_X
        lx0 = lx1 - left_w
        draw.rounded_rectangle([lx0, y0, lx1, y1], radius=LINE_RADIUS, fill=line_color)
        # 右
        rx0 = CENTER_X + LINE_GAP_X
        rx1 = rx0 + right_w
        draw.rounded_rectangle([rx0, y0, rx1, y1], radius=LINE_RADIUS, fill=line_color)

    # 矢印軸（半透明の縦線）
    shaft_color = INK_COLOR + (SHAFT_ALPHA,)
    sx0 = CENTER_X - ARROW_SHAFT_WIDTH // 2
    sx1 = CENTER_X + ARROW_SHAFT_WIDTH // 2
    draw.rounded_rectangle(
        [sx0, ARROW_SHAFT_TOP, sx1, ARROW_SHAFT_BOTTOM],
        radius=ARROW_SHAFT_WIDTH // 2,
        fill=shaft_color,
    )

    # 矢印先（下向き三角形）
    head_color = INK_COLOR + (LINE_ALPHA,)
    draw.polygon(
        [
            (CENTER_X - ARROW_HEAD_HALF_WIDTH, ARROW_HEAD_TOP),
            (CENTER_X + ARROW_HEAD_HALF_WIDTH, ARROW_HEAD_TOP),
            (CENTER_X, ARROW_HEAD_BOTTOM),
        ],
        fill=head_color,
    )

    return img


def apply_squircle_mask(img: Image.Image, corner_ratio: float = MAC_CORNER_RATIO) -> Image.Image:
    """画像に角丸（squircle 近似）マスクを適用。透明背景のRGBA画像を返す。"""
    w, h = img.size
    radius = int(min(w, h) * corner_ratio)
    # 高解像度マスクを作って縮小することでアンチエイリアスを得る
    scale = 4
    mask_hi = Image.new("L", (w * scale, h * scale), 0)
    md = ImageDraw.Draw(mask_hi)
    md.rounded_rectangle([0, 0, w * scale - 1, h * scale - 1], radius=radius * scale, fill=255)
    mask = mask_hi.resize((w, h), Image.LANCZOS)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def downscale(img: Image.Image, target: int) -> Image.Image:
    """LANCZOS で縮小。1024px を経由するので品質高い。"""
    return img.resize((target, target), Image.LANCZOS)


def render_mac_icon(master: Image.Image, size: int) -> Image.Image:
    """マスターを target サイズへ先に縮小してから squircle マスクを適用。

    透明境界を含む 1024px をいきなり縮小すると、縁の RGB(0,0,0) が
    背景オレンジと混ざりダークなフリンジが出る（特に 16/32px で顕著）。
    縮小→マスク順に変えることで境界フリンジを軽減する。
    """
    if size == master.size[0]:
        return apply_squircle_mask(master)
    return apply_squircle_mask(downscale(master, size))


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    assets_dir = repo_root / "assets"
    icons_dir = repo_root / "icons"
    appicon_dir = (
        repo_root / "safari" / "DualView Translator" / "Shared (App)" / "Assets.xcassets" / "AppIcon.appiconset"
    )

    # 出力先が存在しなければ作成（初回実行時の FileNotFoundError を防ぐ）
    for d in (assets_dir, icons_dir, appicon_dir):
        d.mkdir(parents=True, exist_ok=True)

    master = draw_master()
    # アーカイブ用：マスターと2系統の1024px
    master.save(assets_dir / "app-icon-master-1024.png", "PNG", optimize=True)
    # iOS App Store のラージアイコンは透過 / アルファチャネル禁止のため RGB で書き出す
    ios_1024 = master.convert("RGB")
    mac_1024 = apply_squircle_mask(master)
    ios_1024.save(assets_dir / "app-icon-ios-1024.png", "PNG", optimize=True)
    mac_1024.save(assets_dir / "app-icon-mac-1024.png", "PNG", optimize=True)

    # iOS App Store 用（角丸なし・アルファなし、ピンクパディング無し）
    (appicon_dir / "universal-icon-1024@1x.png").write_bytes(
        (assets_dir / "app-icon-ios-1024.png").read_bytes()
    )

    # macOS 用（squircle 角丸あり、各サイズ）
    # 先に縮小してからマスク適用することで、透明境界由来のフリンジを軽減する
    mac_sizes = {
        "mac-icon-16@1x.png": 16,
        "mac-icon-16@2x.png": 32,
        "mac-icon-32@1x.png": 32,
        "mac-icon-32@2x.png": 64,
        "mac-icon-128@1x.png": 128,
        "mac-icon-128@2x.png": 256,
        "mac-icon-256@1x.png": 256,
        "mac-icon-256@2x.png": 512,
        "mac-icon-512@1x.png": 512,
        "mac-icon-512@2x.png": 1024,
    }
    for fname, size in mac_sizes.items():
        render_mac_icon(master, size).save(appicon_dir / fname, "PNG", optimize=True)

    # 拡張本体アイコン（ブラウザ用、角丸あり）— 同様に縮小→マスク順
    for size in (16, 32, 48, 128):
        render_mac_icon(master, size).save(icons_dir / f"icon{size}.png", "PNG", optimize=True)

    print("[ok] generated icons")
    print(f"  master: {assets_dir/'app-icon-master-1024.png'}")
    print(f"  ios   : {assets_dir/'app-icon-ios-1024.png'}")
    print(f"  mac   : {assets_dir/'app-icon-mac-1024.png'}")
    print(f"  appicon set: {appicon_dir}")
    print(f"  extension icons: {icons_dir}")


if __name__ == "__main__":
    main()
