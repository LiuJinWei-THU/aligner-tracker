# -*- coding: utf-8 -*-
"""生成 PWA 图标：圆角渐变底 + 白色牙齿图形（4x 超采样抗锯齿）"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(OUT, exist_ok=True)


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make_icon(size):
    ss = 4  # 超采样倍数
    S = size * ss
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 背景：圆角矩形，从上到下 teal 渐变
    grad = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    top = (13, 148, 136)      # #0d9488
    bottom = (5, 122, 98)     # 深 teal
    for y in range(S):
        t = y / S
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        gd.line([(0, y), (S, y)], fill=c)

    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    corner = int(S * 0.22)
    md.rounded_rectangle([0, 0, S - 1, S - 1], radius=corner, fill=255)
    img.paste(grad, (0, 0), mask)

    # 牙齿（白色）：牙冠（圆润梯形近似）+ 两个牙根
    white = (255, 255, 255, 255)
    cx = S / 2

    # 牙冠：上宽下略窄的圆角矩形，顶部更圆
    crown_w = S * 0.46
    crown_h = S * 0.30
    crown_top = S * 0.22
    crown_box = [cx - crown_w / 2, crown_top, cx + crown_w / 2, crown_top + crown_h]
    rounded_rect(d, crown_box, radius=int(crown_w * 0.34), fill=white)

    # 牙根：左右两个下坠的椭圆，顶部与牙冠重叠
    root_w = S * 0.19
    root_top = crown_top + crown_h - S * 0.03
    root_h = S * 0.26
    gap = S * 0.045
    left_cx = cx - root_w / 2 - gap / 2
    right_cx = cx + root_w / 2 + gap / 2
    d.ellipse([left_cx - root_w / 2, root_top, left_cx + root_w / 2, root_top + root_h], fill=white)
    d.ellipse([right_cx - root_w / 2, root_top, right_cx + root_w / 2, root_top + root_h], fill=white)

    # 中间缺口（两牙根之间的分界），用背景色画一个小三角圆弧
    notch = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    nd = ImageDraw.Draw(notch)
    notch_top = crown_top + crown_h * 0.45
    nd.polygon([
        (cx - S * 0.035, notch_top),
        (cx + S * 0.035, notch_top),
        (cx, notch_top + S * 0.16),
    ], fill=(0, 0, 0, 255))
    # 用渐变背景色填充缺口：把 notch 当 alpha 蒙版贴渐变
    img.paste(grad, (0, 0), notch)

    return img.resize((size, size), Image.LANCZOS)


for s in (192, 512):
    icon = make_icon(s)
    icon.save(os.path.join(OUT, 'icon-%d.png' % s))
    print('saved icon-%d.png' % s)
