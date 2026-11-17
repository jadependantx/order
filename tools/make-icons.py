"""生成 PWA 图标（安卓添加到主屏幕需要 PNG）。
运行：python tools/make-icons.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
S = 2048  # 先放大画，再缩，边缘才干净


def gradient_background(size: int) -> Image.Image:
    top, bottom = (240, 113, 63), (216, 67, 31)
    rows = np.zeros((size, size, 3), dtype=np.uint8)
    for y in range(size):
        t = y / (size - 1)
        rows[y, :] = [round(top[i] * (1 - t) + bottom[i] * t) for i in range(3)]
    img = Image.fromarray(rows, "RGB").convert("RGBA")

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255
    )
    img.putalpha(mask)
    return img


def draw_icon(size: int) -> Image.Image:
    img = gradient_background(S)
    d = ImageDraw.Draw(img)

    # 碗：下半椭圆
    d.pieslice([520, 1040, 1528, 1800], start=0, end=180, fill=(255, 247, 240, 255))
    # 碗沿
    d.rounded_rectangle([472, 1380, 1576, 1490], radius=55, fill=(255, 217, 199, 255))
    # 热气
    for cx in (860, 1024, 1188):
        d.arc([cx - 92, 900, cx + 92, 1180], start=200, end=340, fill=(255, 247, 240, 150), width=52)

    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
draw_icon(512).save(OUT / "icon-512.png")
draw_icon(192).save(OUT / "icon-192.png")
print("已生成：", OUT / "icon-192.png", OUT / "icon-512.png")
