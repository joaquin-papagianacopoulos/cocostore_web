# -*- coding: utf-8 -*-
"""Reel vertical 9:16 (1080x1920, 30 fps) de perfumes para CocoStore, con voz y música.

Pasos (Python 3.11 con numpy y scipy):
  py -3.11 marketing/reel-perfumes/tts.py      # voz en off → build/vo_*.wav + build/vo.json
  py -3.11 marketing/reel-perfumes/audio.py    # música + efectos + voz → build/mix.wav
  py -3.11 marketing/reel-perfumes/render.py   # video final → reel-perfumes.mp4

La duración de cada escena sale de la voz (timeline.py), y el texto aparece
sincronizado con cada palabra. Fotos de producto en fotos/ y uploads/.
"""
import math
import os
import random
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

import timeline

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
W, H, FPS = 1080, 1920, timeline.FPS
SCENES, TOTAL = timeline.load()
SC = {s["id"]: s for s in SCENES}
EV = timeline.events(SCENES)
N = int(round(TOTAL * FPS))
OUT = os.path.join(HERE, "reel-perfumes.mp4")
MIX = os.path.join(timeline.BUILD, "mix.wav")

FONTS = "C:/Windows/Fonts/"
SERIF_B = FONTS + "georgiab.ttf"
SERIF_I = FONTS + "georgiaz.ttf"
SANS_B = FONTS + "segoeuib.ttf"

GOLD_STOPS = [(0.0, (252, 236, 178)), (0.42, (220, 174, 82)), (0.68, (172, 124, 42)), (1.0, (248, 218, 146))]
GOLD = (232, 190, 105)
CREAM = (246, 238, 222)


def wt(sid, i):
    return SC[sid]["words"][i]["t"]


# ---------- curvas ----------

def clamp01(x):
    return max(0.0, min(1.0, x))


def prog(t, t0, dur):
    return clamp01((t - t0) / dur)


def ease_out(t):
    t = clamp01(t)
    return 1 - (1 - t) ** 3


def ease_in(t):
    t = clamp01(t)
    return t ** 3


def ease_in_out(t):
    t = clamp01(t)
    return 3 * t * t - 2 * t * t * t


def back_out(t, s=1.7):
    t = clamp01(t) - 1
    return t * t * ((s + 1) * t + s) + 1


def elastic_out(t):
    t = clamp01(t)
    if t in (0.0, 1.0):
        return t
    return 2 ** (-10 * t) * math.sin((t * 10 - 0.75) * (2 * math.pi) / 3) + 1


def lerp(a, b, t):
    return a + (b - a) * t


# ---------- imagen ----------

def comp(canvas, im, x, y):
    """alpha_composite que tolera posiciones fuera del lienzo."""
    if im is None:
        return
    x, y = int(round(x)), int(round(y))
    if x >= canvas.width or y >= canvas.height or x + im.width <= 0 or y + im.height <= 0:
        return
    cx0, cy0 = max(0, -x), max(0, -y)
    cx1, cy1 = min(im.width, canvas.width - x), min(im.height, canvas.height - y)
    if (cx0, cy0, cx1, cy1) != (0, 0, im.width, im.height):
        im = im.crop((cx0, cy0, cx1, cy1))
    canvas.alpha_composite(im, (max(0, x), max(0, y)))


def center(canvas, im, cx, cy):
    if im is not None:
        comp(canvas, im, cx - im.width / 2, cy - im.height / 2)


def fade(im, k):
    if im is None or k <= 0.003:
        return None
    if k >= 0.997:
        return im
    a = np.array(im)
    a[..., 3] = (a[..., 3] * k).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def scaled(im, s):
    if im is None:
        return None
    if abs(s - 1) < 0.003:
        return im
    w, h = max(1, int(im.width * s)), max(1, int(im.height * s))
    return im.convert("RGBa").resize((w, h), Image.Resampling.BICUBIC).convert("RGBA")


def rotated(im, deg):
    if abs(deg) < 0.05:
        return im
    return im.convert("RGBa").rotate(deg, Image.Resampling.BICUBIC, expand=True).convert("RGBA")


def gradient_v(w, h, stops):
    ys = np.linspace(0, 1, h)
    cols = np.stack([np.interp(ys, [s[0] for s in stops], [s[1][c] for s in stops]) for c in range(3)], -1)
    return Image.fromarray(np.repeat(cols[:, None, :], w, 1).astype(np.uint8), "RGB")


def radial_sprite(size, color, power=2.0, alpha=255, aspect=1.0):
    h = max(1, int(size * aspect))
    y, x = np.mgrid[0:h, 0:size]
    d = np.hypot((x - (size - 1) / 2) / (size / 2), (y - (h - 1) / 2) / (h / 2))
    arr = np.zeros((h, size, 4), np.uint8)
    arr[..., :3] = color
    arr[..., 3] = (np.clip(1 - d, 0, 1) ** power * alpha).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def tint(sprite, color):
    a = np.array(sprite)
    a[..., :3] = color
    return Image.fromarray(a, "RGBA")


_grid = {}


def shine(im, k, width=70, strength=150, slope=0.45):
    """Barre una franja de luz diagonal sobre la imagen (k: 0→1)."""
    if im is None or not (0 < k < 1):
        return im
    w, h = im.size
    if (w, h) not in _grid:
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        _grid[(w, h)] = x + slope * y
    u = _grid[(w, h)]
    c = lerp(-width * 2, w + slope * h + width * 2, k)
    band = np.exp(-((u - c) / width) ** 2) * strength
    a = np.array(im).astype(np.float32)
    a[..., :3] = np.minimum(255, a[..., :3] + band[..., None] * (a[..., 3:4] / 255))
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def wipe(im, p, soft=60):
    """Revela la imagen de izquierda a derecha con borde suave."""
    if im is None or p <= 0:
        return None
    if p >= 1:
        return im
    w = im.width
    edge = p * (w + soft)
    m = np.clip((edge - np.arange(w)) / soft, 0, 1).astype(np.float32)
    a = np.array(im)
    a[..., 3] = (a[..., 3] * m[None, :]).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def find_coeffs(out_pts, in_pts):
    A, B = [], []
    for (x, y), (X, Y) in zip(out_pts, in_pts):
        A.append([x, y, 1, 0, 0, 0, -X * x, -X * y])
        A.append([0, 0, 0, x, y, 1, -Y * x, -Y * y])
        B += [X, Y]
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()


def rot_y(im, deg, dist=2200):
    """Giro en perspectiva sobre el eje vertical (como un frasco sobre un pedestal)."""
    if im is None or abs(deg) < 0.3:
        return im
    w, h = im.size
    th = math.radians(deg)
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    pts = []
    for x, y in src:
        xc, yc = x - w / 2, y - h / 2
        s = dist / (dist + xc * math.sin(th))
        pts.append((xc * math.cos(th) * s, yc * s))
    mx, my = min(p[0] for p in pts), min(p[1] for p in pts)
    ow = int(math.ceil(max(p[0] for p in pts) - mx))
    oh = int(math.ceil(max(p[1] for p in pts) - my))
    pts = [(p[0] - mx, p[1] - my) for p in pts]
    out = im.convert("RGBa").transform((ow, oh), Image.Transform.PERSPECTIVE, find_coeffs(pts, src), Image.Resampling.BICUBIC)
    return out.convert("RGBA")


def reflection(im, frac=0.26, alpha=0.32):
    r = ImageOps.flip(im).crop((0, 0, im.width, int(im.height * frac)))
    a = np.array(r)
    g = np.linspace(alpha, 0, r.height, dtype=np.float32) ** 1.4
    a[..., 3] = (a[..., 3] * g[:, None]).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


# ---------- texto ----------

_txt = {}


def line_width(font, text, track):
    if not track:
        return font.getlength(text)
    return sum(font.getlength(c) for c in text) + track * (len(text) - 1)


def make_text(lines, font_path, size, fill="gold", track=0, max_w=980, shadow=True, lh=1.06):
    if isinstance(lines, str):
        lines = [lines]
    key = (tuple(lines), font_path, size, fill, track, max_w, shadow, lh)
    if key in _txt:
        return _txt[key]
    while True:
        font = ImageFont.truetype(font_path, size)
        widths = [line_width(font, l, track) for l in lines]
        if max(widths) <= max_w or size <= 24:
            break
        size -= 2
    asc, desc = font.getmetrics()
    lpx = int(size * lh)
    pad = 34
    bw = int(max(widths)) + pad * 2
    bh = lpx * (len(lines) - 1) + asc + desc + pad * 2
    mask = Image.new("L", (bw, bh), 0)
    d = ImageDraw.Draw(mask)
    for i, l in enumerate(lines):
        x, y = (bw - widths[i]) / 2, pad + i * lpx
        if track:
            for ch in l:
                d.text((x, y), ch, font=font, fill=255)
                x += font.getlength(ch) + track
        else:
            d.text((x, y), l, font=font, fill=255)
    if fill == "gold":
        body = gradient_v(bw, bh, GOLD_STOPS)
    else:
        body = Image.new("RGB", (bw, bh), fill)
    body = body.convert("RGBA")
    body.putalpha(mask)
    out = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    if shadow:
        sh = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        sh.putalpha(mask.filter(ImageFilter.GaussianBlur(9)).point(lambda v: min(255, int(v * 2.0))))
        out.alpha_composite(sh, (0, 7))
    out.alpha_composite(body)
    _txt[key] = out
    return out


def pop(im, t, t0, dur=0.28, start=1.6):
    """Entrada con rebote: escala de `start` a 1 y aparece."""
    p = prog(t, t0, dur)
    if p <= 0:
        return None
    return fade(scaled(im, lerp(start, 1.0, back_out(p))), clamp01(p * 2.5))


def chip(text):
    font = ImageFont.truetype(SANS_B, 34)
    tw = line_width(font, text.upper(), 4)
    pw, ph = int(tw + 64), 70
    im = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((1, 1, pw - 2, ph - 2), radius=ph / 2, fill=(20, 16, 12, 170), outline=GOLD + (255,), width=3)
    x = 32
    for ch in text.upper():
        d.text((x, 14), ch, font=font, fill=CREAM)
        x += font.getlength(ch) + 4
    return im


def gold_pill(text, size=54, padx=70, pady=30):
    font = ImageFont.truetype(SANS_B, size)
    tw = line_width(font, text, 3)
    asc, desc = font.getmetrics()
    pw, ph = int(tw + padx * 2), int(asc + desc + pady * 2)
    m = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, pw - 1, ph - 1), radius=ph / 2, fill=255)
    im = gradient_v(pw, ph, GOLD_STOPS).convert("RGBA")
    im.putalpha(m)
    d = ImageDraw.Draw(im)
    x = padx
    for ch in text:
        d.text((x, pady), ch, font=font, fill=(26, 18, 8))
        x += font.getlength(ch) + 3
    return im


# ---------- recursos ----------

def build_background():
    BW, BH = 1400, 2480
    rnd = np.random.default_rng(4)
    small = Image.fromarray((rnd.random((BH // 16, BW // 16)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))
    clouds = np.array(small.resize((BW, BH), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(30)), np.float32)
    clouds = (clouds - clouds.min()) / (np.ptp(clouds) + 1e-6) * 40
    base = np.stack([10 + clouds, 9 + clouds * 0.9, 8 + clouds * 0.78], -1)
    bg = Image.fromarray(base.astype(np.uint8), "RGB").convert("RGBA")

    veins = Image.new("RGBA", (BW, BH), (0, 0, 0, 0))
    d = ImageDraw.Draw(veins)
    r = random.Random(11)
    for i in range(18):
        x, y = r.uniform(-200, BW), r.uniform(-200, BH * 0.75)
        ang = r.uniform(0.3, 1.2)
        col = (215, 170, 85, 130) if i % 4 == 0 else (150, 145, 140, 60)
        pts = []
        for _ in range(60):
            ang += r.uniform(-0.25, 0.25)
            x += math.cos(ang) * 28
            y += math.sin(ang) * 28
            pts.append((x, y))
        d.line(pts, fill=col, width=r.choice([1, 2, 2, 3]))
    bg.alpha_composite(veins.filter(ImageFilter.GaussianBlur(1.6)))

    # terciopelo bordó abajo
    vh = int(BH * 0.34)
    xs = np.arange(BW)
    f = 0.55 + 0.25 * np.sin(xs / 70.0) + 0.15 * np.sin(xs / 23.0 + 1.3) + 0.05 * np.sin(xs / 9.0)
    shade = np.interp(np.linspace(0, 1, vh), [0, 0.15, 1], [0.2, 1.0, 0.45])
    vel = np.zeros((vh, BW, 4), np.float32)
    vel[..., 0] = 78 * f[None, :] * shade[:, None]
    vel[..., 1] = 14 * f[None, :] * shade[:, None]
    vel[..., 2] = 24 * f[None, :] * shade[:, None]
    vel[..., 3] = np.interp(np.linspace(0, 1, vh), [0, 0.14, 1], [0, 255, 255])[:, None]
    bg.alpha_composite(Image.fromarray(vel.astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(5)), (0, BH - vh))
    return bg.convert("RGB")


def camera(bg, cx, cy, zoom):
    cw, ch = W / zoom, H / zoom
    x0 = (bg.width - cw) * clamp01(cx)
    y0 = (bg.height - ch) * clamp01(cy)
    return bg.resize((W, H), Image.Resampling.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch))


def product_card(path, width=700):
    img = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", img.size, (255, 255, 255, 255))
    flat.alpha_composite(img)
    img = flat.convert("RGB").resize((width, int(img.height * width / img.width)), Image.Resampling.LANCZOS)
    pad = 12
    cw, ch = img.width + pad * 2, img.height + pad * 2
    m = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, cw - 1, ch - 1), radius=36, fill=255)
    card = gradient_v(cw, ch, GOLD_STOPS).convert("RGBA")
    card.putalpha(m)
    m2 = Image.new("L", img.size, 0)
    ImageDraw.Draw(m2).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=26, fill=255)
    inner = img.convert("RGBA")
    inner.putalpha(m2)
    card.alpha_composite(inner, (pad, pad))
    return card


def find_photo(stem):
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = os.path.join(HERE, "fotos", stem + ext)
        if os.path.exists(p):
            return p
    raise SystemExit("Falta la foto fotos/%s.(png|jpg)" % stem)


def light_logo(width):
    a = np.array(Image.open(os.path.join(ROOT, "public", "img", "logo-t.png")).convert("RGBA"))
    dark = (a[..., 3] > 0) & (a[..., 0] < 120)
    a[dark, :3] = 255  # trazos negros → blanco; el rojo de las zapatillas queda
    im = Image.fromarray(a, "RGBA")
    im = im.crop(im.getbbox())
    return im.resize((width, int(im.height * width / im.width)), Image.Resampling.LANCZOS)


def star(size=120):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size / 2
    d.polygon([(c, 0), (c + 4, c - 4), (size, c), (c + 4, c + 4), (c, size), (c - 4, c + 4), (0, c), (c - 4, c - 4)], fill=(255, 242, 205, 255))
    im = im.filter(ImageFilter.GaussianBlur(1.0))
    im.alpha_composite(radial_sprite(size, (255, 220, 150), power=2.5, alpha=190))
    return im


class Dust:
    """Partículas doradas flotando (fondo) y bokeh desenfocado (frente)."""

    def __init__(self):
        r = random.Random(3)
        self.back = [(r.uniform(0, W), r.uniform(0, H), r.choice([0, 0, 1, 1, 2]), r.uniform(25, 80), r.uniform(0, 6.28), r.uniform(-14, 14)) for _ in range(80)]
        self.front = [(r.uniform(0, W), r.uniform(0, H), r.uniform(140, 260), r.uniform(15, 40), r.uniform(0, 6.28)) for _ in range(9)]
        self.spr = [[fade(radial_sprite(s, (255, 214, 130), power=2.2), a / 4) for a in range(1, 5)] for s in (24, 44, 78)]
        self.bokeh = {}

    def _bokeh(self, s):
        s = int(s) // 20 * 20
        if s not in self.bokeh:
            self.bokeh[s] = radial_sprite(s, (255, 205, 130), power=0.6, alpha=34)
        return self.bokeh[s]

    def draw_back(self, canvas, t, k=1.0):
        for x, y, si, sp, ph, dx in self.back:
            yy = (y - sp * t) % (H + 100) - 50
            xx = (x + dx * t + 18 * math.sin(t * 0.8 + ph)) % W
            a = min(3, int((0.5 + 0.5 * math.sin(t * 3.0 + ph)) * 4 * k))
            if a > 0:
                center(canvas, self.spr[si][a - 1], xx, yy)

    def draw_front(self, canvas, t):
        for x, y, s, sp, ph in self.front:
            yy = (y - sp * t) % (H + 300) - 150
            xx = (x + 30 * math.sin(t * 0.5 + ph)) % W
            center(canvas, self._bokeh(s), xx, yy)


def burst(canvas, t, t0, cx, cy, spark, n=36, seed=1, speed=900, life=0.9):
    """Chispas doradas que salen disparadas desde un punto."""
    dt = t - t0
    if not (0 <= dt < life):
        return
    r = random.Random(seed)
    for _ in range(n):
        a = r.uniform(0, 2 * math.pi)
        v = r.uniform(0.35, 1.0) * speed
        x = cx + math.cos(a) * v * dt * (1 - 0.4 * dt)
        y = cy + math.sin(a) * v * dt * (1 - 0.4 * dt) + 380 * dt * dt
        k = (1 - dt / life) ** 1.5
        center(canvas, fade(scaled(spark, r.uniform(0.18, 0.4)), k), x, y)


# ---------- escenas ----------

class Assets:
    pass


A = Assets()


def draw_product(fg, card, cx, cy, s=1.0, deg=0.0, gloss=0.0, alpha=1.0):
    im = scaled(card, s)
    im = shine(im, gloss, width=90, strength=120)
    im = rot_y(im, deg)
    im = fade(im, alpha)
    if im is None:
        return
    # brillo dorado detrás y luz rasante en el piso
    center(fg, fade(scaled(A.halo, s), 0.85 * alpha), cx, cy)
    center(fg, fade(A.floor, alpha), cx, cy + im.height / 2 + 8)
    comp(fg, reflection(im), cx - im.width / 2, cy + im.height / 2 + 4)
    center(fg, im, cx, cy)


def twinkles(fg, t, spots, speed=5.0):
    for sx, sy, ph in spots:
        a = math.sin(t * speed + ph)
        if a > 0.05:
            center(fg, fade(scaled(A.star, 0.45 + 0.6 * a), a), sx, sy)


def scene_hook(fg, t, sc):
    # tres frascos que caen con golpe sobre la mesa
    slots = [(A.hook_cards[0], 250, 1230, EV["impacts"][0][0]),
             (A.hook_cards[1], 830, 1230, EV["impacts"][1][0]),
             (A.hook_cards[2], 540, 1170, EV["impacts"][2][0])]
    dim = prog(t, wt("hook", 7) - 0.08, 0.15)
    for i, (im, x, y, t0) in enumerate(slots):
        p = prog(t, t0, 0.22)
        if p <= 0:
            continue
        s = lerp(1.9, 1.0, back_out(p, 1.2)) * lerp(1.0, 0.9, dim)
        yy = y + 18 * math.sin(t * 2 + i) * (p >= 1) - 40 * dim
        center(fg, fade(scaled(A.halo, 0.6), 0.7), x, yy)
        im2 = fade(scaled(im, s), clamp01(p * 3))
        center(fg, im2, x, yy)
        burst(fg, t, t0 + 0.05, x, yy + 140, A.star, n=22, seed=i + 1, speed=700, life=0.7)

    # "3 PERFUMES" + "que hacen que te pregunten…"
    up = 1 - dim
    if up > 0:
        center(fg, fade(pop(A.t_3, t, wt("hook", 0)), up), W / 2, 290 - 60 * dim)
        center(fg, fade(pop(A.t_perf, t, wt("hook", 1), start=1.3), up), W / 2, 530 - 60 * dim)
        center(fg, fade(wipe(A.t_preg, prog(t, wt("hook", 2), wt("hook", 6) + 0.4 - wt("hook", 2))), up), W / 2, 690 - 60 * dim)

    # "¿QUÉ TENÉS PUESTO?" gigante
    if dim > 0:
        fg.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, int(150 * dim))))
        gap = 40
        w1, w2 = A.t_que.width - 68, A.t_tenes.width - 68  # ancho visible, sin el margen del texto
        left = W / 2 - (w1 + gap + w2) / 2
        center(fg, pop(A.t_que, t, wt("hook", 7), start=2.0), left + w1 / 2, 860)
        center(fg, pop(A.t_tenes, t, wt("hook", 8), start=2.0), left + w1 + gap + w2 / 2, 860)
        center(fg, shine(pop(A.t_puesto, t, wt("hook", 9), start=2.2), prog(t, wt("hook", 9) + 0.25, 0.5)), W / 2, 1060)
        burst(fg, t, wt("hook", 9), W / 2, 1000, A.star, n=40, seed=9, speed=1100)


def product_scene(fg, t, sc, card, name, brand, chips, chip_t0, deg_from, deg_to):
    t0 = sc["start"]
    p = prog(t, t0, 0.45)
    s = lerp(0.82, 1.0, ease_out(p)) * (1 + 0.04 * prog(t, t0, sc["end"] - t0))
    deg = lerp(deg_from, deg_to, ease_out(prog(t, t0, 1.4))) + 2.5 * math.sin((t - t0) * 2.2)
    gloss = prog(t, sc["words"][0]["t"] + 0.15, 0.75)
    draw_product(fg, card, W / 2, 740 + 40 * (1 - ease_out(p)), s, deg, gloss, clamp01(p * 2))
    twinkles(fg, t, [(200, 420, 0.0), (880, 560, 1.6), (170, 980, 2.9), (900, 1080, 4.1)])
    words = sc["words"]
    # nombre: se escribe al ritmo de la voz
    name_end = [w for w in words if w["w"].lower() != "de"][-2]["e"] if len(words) > 3 else words[-1]["e"]
    center(fg, wipe(name, prog(t, words[0]["t"], name_end - words[0]["t"] + 0.1)), W / 2, 1255)
    # marca: entra con las letras separándose
    bt = [w for w in words if w["w"].lower() not in ("de",)][-1]["t"]
    pb = prog(t, bt, 0.4)
    if pb > 0:
        center(fg, fade(make_text(brand, SANS_B, 44, CREAM, track=int(lerp(40, 16, ease_out(pb)))), pb), W / 2, 1360)
    # notas del perfume
    xs = [W / 2 - 290, W / 2, W / 2 + 290]
    for i, c in enumerate(chips):
        center(fg, pop(c, t, chip_t0 + 0.15 * i, 0.25, 1.5), xs[i], 1470)


def scene_hg(fg, t, sc):
    product_scene(fg, t, sc, A.card_hg, A.t_hg, "LATTAFA", A.chips_hg, EV["ticks"][0], 26, -6)


def scene_cdn(fg, t, sc):
    # vapor ahumado detrás del frasco
    for j in range(9):
        mx = (j * 137 + 80) % W + 50 * math.sin(t * 0.9 + j)
        my = 1300 - ((t - sc["start"]) * 220 + j * 120) % 1000
        center(fg, A.vapor[j % 3], mx, my)
    product_scene(fg, t, sc, A.card_cdn, A.t_cdn, "ARMAF", A.chips_cdn, EV["ticks"][3], -26, 6)


def scene_dura(fg, t, sc):
    t0 = sc["start"]
    # anillo dorado que se completa como un reloj
    p = ease_in_out(prog(t, t0 + 0.05, 1.5))
    ring_s = lerp(0.75, 1.0, ease_out(prog(t, t0, 0.4)))
    S2 = 1400
    ring = Image.new("RGBA", (S2, S2), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    d.ellipse((60, 60, S2 - 60, S2 - 60), outline=(255, 255, 255, 40), width=10)
    for i in range(12):
        a = math.radians(i * 30 - 90)
        r1, r2 = S2 / 2 - 110, S2 / 2 - 80
        d.line([(S2 / 2 + math.cos(a) * r1, S2 / 2 + math.sin(a) * r1), (S2 / 2 + math.cos(a) * r2, S2 / 2 + math.sin(a) * r2)], fill=GOLD + (200,), width=8)
    if p > 0:
        d.arc((60, 60, S2 - 60, S2 - 60), -90, -90 + 360 * p, fill=GOLD + (255,), width=26)
        a = math.radians(-90 + 360 * p)
        hx, hy = S2 / 2 + math.cos(a) * (S2 / 2 - 73), S2 / 2 + math.sin(a) * (S2 / 2 - 73)
        d.ellipse((hx - 26, hy - 26, hx + 26, hy + 26), fill=(255, 240, 200, 255))
    ring = ring.resize((int(820 * ring_s), int(820 * ring_s)), Image.Resampling.LANCZOS)
    glow = ring.filter(ImageFilter.GaussianBlur(14))
    center(fg, fade(A.halo, 0.6), W / 2, 820)
    center(fg, glow, W / 2, 820)
    center(fg, fade(ring, clamp01(prog(t, t0, 0.3) * 1.5)), W / 2, 820)

    center(fg, pop(A.t_duran, t, wt("dura", 0)), W / 2, 770)
    center(fg, pop(A.t_horas, t, wt("dura", 1)), W / 2, 885)

    # bruma del atomizador y "Y se nota"
    ts = wt("dura", 2) - 0.25
    k = (t - ts) / 1.2
    if k > 0:
        nozzle = (-40, 1320)
        for j, (delay, ang, reach, drift) in enumerate(A.spray):
            life = (k - delay) / 0.75
            if not (0 < life < 1):
                continue
            dist = ease_out(life) * reach
            x = nozzle[0] + math.cos(ang) * dist
            y = nozzle[1] + math.sin(ang) * dist - drift * life
            center(fg, A.mist[min(9, int(life * 10))], x, y)
    center(fg, shine(wipe(A.t_senota, prog(t, wt("dura", 2), 0.5)), prog(t, wt("dura", 4), 0.6)), W / 2, 1290)


def scene_arm(fg, t, sc):
    t0 = sc["start"]
    ta = wt("arm", 3)  # "Armani"
    center(fg, pop(A.tag_dis, t, wt("arm", 2), 0.3, 1.5), W / 2, 250)
    p = prog(t, t0, 0.6)
    punch = 0.06 * math.exp(-(t - ta) * 7) * (t >= ta)
    s = lerp(0.8, 1.0, ease_out(p)) + punch
    deg = lerp(22, 0, ease_out(prog(t, t0, 1.0))) + 3.0 * math.sin((t - t0) * 1.8)
    draw_product(fg, A.card_arm, W / 2, 700 + 260 * (1 - ease_out(p)), s, deg, prog(t, ta, 0.8), clamp01(p * 2))
    burst(fg, t, ta, W / 2, 700, A.star, n=30, seed=21, speed=950)
    twinkles(fg, t, [(170, 420, 0.4), (910, 520, 2.0), (150, 1000, 3.1), (930, 1050, 4.4)])

    pb = prog(t, ta, 0.4)
    if pb > 0:
        center(fg, fade(make_text("EMPORIO ARMANI", SANS_B, 40, CREAM, track=int(lerp(36, 12, ease_out(pb)))), pb), W / 2, 1140)
    center(fg, wipe(A.t_arm, prog(t, wt("arm", 4), wt("arm", 7) + 0.45 - wt("arm", 4))), W / 2, 1230)

    center(fg, pop(A.t_solo, t, wt("arm", 9), 0.25, 1.4), W / 2, 1345)
    pf, pl = EV["price"]
    if t >= pf:
        v = int(round(200000 * ease_out(prog(t, pf, pl - pf)) / 1000)) * 1000
        txt = make_text("$" + "{:,}".format(v).replace(",", "."), SANS_B, 150, "gold")
        land = math.exp(-(t - pl) * 8) * (t >= pl)
        center(fg, fade(A.halo, 0.9 * land), W / 2, 1460)
        center(fg, shine(scaled(txt, 1 + 0.25 * land), prog(t, pl + 0.15, 0.6)), W / 2, 1460)
        burst(fg, t, pl, W / 2, 1460, A.star, n=44, seed=33, speed=1200)


def scene_cta(fg, t, sc):
    t0 = sc["start"]
    for i, (im, x) in enumerate(zip(A.cta_cards, (215, 540, 865))):
        p = prog(t, t0 + 0.08 * i, 0.45)
        if p > 0:
            y = 760 + 420 * (1 - ease_out(p)) + 10 * math.sin(t * 2.2 + i)
            im2 = fade(im, clamp01(p * 2))
            center(fg, fade(scaled(A.halo, 0.45), 0.6 * p), x, y)
            comp(fg, fade(reflection(im), p), x - im.width / 2, y + im.height / 2 + 4)
            center(fg, im2, x, y)
    center(fg, pop(A.t_escrib, t, wt("cta", 0), 0.3, 1.8), W / 2, 300)
    center(fg, wipe(A.t_pedi, prog(t, wt("cta", 1), 0.5)), W / 2, 440)

    # botón con pulso y toque
    tb, tt = EV["button"], EV["tap"]
    pb = prog(t, tb, 0.35)
    if pb > 0:
        squish = 1 - 0.08 * math.exp(-(t - tt) * 10) * (t >= tt)
        bx, by = W / 2, 1090
        for k in range(2):
            ph = ((t - tb) * 1.4 + k * 0.5) % 1.0
            ring = scaled(A.btn_ring, 1 + 0.35 * ph)
            center(fg, fade(ring, (1 - ph) * 0.6 * pb), bx, by)
        center(fg, fade(scaled(A.btn, back_out(pb) * squish), clamp01(pb * 2)), bx, by)
        # dedo que toca el botón
        pf = prog(t, tt - 0.35, 0.35)
        if pf > 0:
            fx, fy = lerp(900, bx + 150, ease_out(pf)), lerp(1380, by + 30, ease_out(pf))
            fs = 1 - 0.2 * math.exp(-(t - tt) * 10) * (t >= tt)
            center(fg, fade(scaled(A.finger, fs), clamp01(pf * 2.5)), fx, fy)
            if t >= tt:
                q = prog(t, tt, 0.5)
                center(fg, fade(scaled(A.ripple, 0.3 + 0.7 * ease_out(q)), 1 - q), fx, fy)

    # logo
    pl = prog(t, EV["logo"], 0.8)
    if pl > 0:
        wig = 6 * math.sin((t - EV["logo"]) * 14) * math.exp(-(t - EV["logo"]) * 4)
        center(fg, fade(rotated(scaled(A.logo, elastic_out(pl)), wig), clamp01(pl * 4)), W / 2, 1420)


RENDER = {"hook": scene_hook, "hg": scene_hg, "cdn": scene_cdn, "dura": scene_dura, "arm": scene_arm, "cta": scene_cta}
TRANS = ["whip", "whip", "zoom", "zoom", "whip"]
HW = 0.17  # media duración de cada transición


def hblur(im, amount):
    if amount < 0.05:
        return im
    f = 1 + 14 * amount
    return im.resize((max(1, int(W / f)), H), Image.Resampling.BILINEAR).resize((W, H), Image.Resampling.BILINEAR)


def apply_transition(fg, t):
    """Barrido con desenfoque o zoom entre escenas. Devuelve (fg, destello, corrimiento de cámara)."""
    for i, s in enumerate(SCENES[:-1]):
        b = s["end"]
        kind = TRANS[i]
        if b - HW <= t < b:
            p = (t - (b - HW)) / HW
            if kind == "whip":
                out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                comp(out, hblur(fg, p), -ease_in(p) * W * 0.6, 0)
                return out, p * 0.5, -ease_in(p) * 0.12
            out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            center(out, fade(scaled(fg, 1 + 0.5 * ease_in(p)), 1 - p * 0.8), W / 2, H / 2)
            return out, p * 0.7, 0
        if b <= t < b + HW:
            p = (t - b) / HW
            if kind == "whip":
                out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                comp(out, hblur(fg, 1 - p), (1 - ease_out(p)) * W * 0.6, 0)
                return out, (1 - p) * 0.5, (1 - ease_out(p)) * 0.12
            out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            center(out, fade(scaled(fg, lerp(0.75, 1.0, ease_out(p))), clamp01(p * 1.5)), W / 2, H / 2)
            return out, (1 - p) * 0.7, 0
    return fg, 0.0, 0.0


def shake(t):
    dx = dy = 0.0
    for i, (ti, _, amp) in enumerate(EV["impacts"]):
        dt = t - ti
        if 0 <= dt < 0.5:
            e = amp * math.exp(-dt * 9)
            dx += e * math.sin(dt * 75 + i)
            dy += e * math.cos(dt * 61 + 2 * i)
    return dx, dy


def main():
    if not os.path.exists(MIX):
        raise SystemExit("Falta build/mix.wav: corré antes tts.py y audio.py")
    print("Preparando recursos...")
    bg = build_background()
    dust = Dust()
    A.halo = radial_sprite(1100, (255, 190, 95), power=1.8, alpha=140)
    A.floor = radial_sprite(820, (255, 200, 120), power=1.5, alpha=120, aspect=0.12)
    A.star = star(130)
    A.vapor = [fade(radial_sprite(s, (235, 228, 220), power=1.6, alpha=110), 0.5) for s in (380, 460, 540)]
    A.mist = [fade(radial_sprite(int(60 + 140 * k / 9), (255, 240, 215), power=1.8, alpha=150), (1 - k / 10) * 0.9) for k in range(10)]
    r = random.Random(17)
    A.spray = [(r.uniform(0, 0.45), r.gauss(-0.15, 0.22), r.uniform(450, 1100), r.uniform(20, 200)) for _ in range(120)]
    A.leak = radial_sprite(1600, (255, 170, 80), power=1.4, alpha=110)

    A.card_hg = product_card(find_photo("honor-glory"))
    A.card_cdn = product_card(find_photo("club-de-nuit"))
    A.card_arm = product_card(os.path.join(ROOT, "uploads", "27d70eaa-ec09-49e9-a6c7-35d58dad832b.jpg"))
    cards = [A.card_hg, A.card_cdn, A.card_arm]
    A.hook_cards = [rotated(scaled(cards[0], 0.5), 9), rotated(scaled(cards[1], 0.5), -9), scaled(cards[2], 0.58)]
    A.cta_cards = [scaled(c, 0.4) for c in cards]
    A.logo = light_logo(470)

    A.t_3 = make_text("3", SERIF_B, 230, "gold")
    A.t_perf = make_text("PERFUMES", SERIF_B, 130, "gold", track=6)
    A.t_preg = make_text("que hacen que te pregunten...", SERIF_I, 66, CREAM)
    A.t_que = make_text("¿QUÉ", SERIF_B, 132, "gold")
    A.t_tenes = make_text("TENÉS", SERIF_B, 132, "gold")
    A.t_puesto = make_text("PUESTO?", SERIF_B, 170, "gold")
    A.t_hg = make_text("Honor & Glory", SERIF_B, 112, "gold")
    A.t_cdn = make_text("Club de Nuit Intense", SERIF_B, 100, "gold")
    A.chips_hg = [chip(c) for c in ("Dulce", "Vainilla", "Adictivo")]
    A.chips_cdn = [chip(c) for c in ("Fresco", "Ahumado", "Potente")]
    A.t_duran = make_text("DURAN", SERIF_B, 118, "gold", track=6)
    A.t_horas = make_text("HORAS", SERIF_B, 118, "gold", track=6)
    A.t_senota = make_text("y se nota.", SERIF_I, 120, CREAM)
    A.tag_dis = chip("De diseñador")
    A.t_arm = make_text("Stronger With You Intensely", SERIF_B, 80, "gold")
    A.t_solo = make_text("SOLO", SANS_B, 52, CREAM, track=14)
    A.t_escrib = make_text("ESCRIBINOS", SERIF_B, 130, "gold", track=4)
    A.t_pedi = make_text("y pedí el tuyo", SERIF_I, 84, CREAM)
    A.btn = gold_pill("DM  ·  WHATSAPP")
    rm = Image.new("RGBA", (A.btn.width + 40, A.btn.height + 40), (0, 0, 0, 0))
    ImageDraw.Draw(rm).rounded_rectangle((4, 4, rm.width - 5, rm.height - 5), radius=(rm.height - 8) / 2, outline=GOLD + (255,), width=5)
    A.btn_ring = rm
    A.finger = radial_sprite(110, (255, 255, 255), power=0.35, alpha=210)
    rp = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    ImageDraw.Draw(rp).ellipse((6, 6, 294, 294), outline=(255, 255, 255, 220), width=8)
    A.ripple = rp

    rng = np.random.default_rng(1)
    grain = [rng.integers(-9, 10, (H, W, 1), dtype=np.int16) for _ in range(6)]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    vign = (1 - 0.55 * np.clip(np.hypot((xx - W / 2) / (W * 0.75), (yy - H / 2) / (H * 0.62)) - 0.45, 0, 1) ** 1.3)[..., None].astype(np.float32)

    ff = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H), "-r", str(FPS), "-i", "-",
        "-i", MIX,
        "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT,
    ], stdin=subprocess.PIPE)

    for f in range(N):
        t = f / FPS
        sc = next((s for s in SCENES if s["start"] <= t < s["end"]), SCENES[-1])
        fg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        RENDER[sc["id"]](fg, t, sc)
        fg, flash, pan = apply_transition(fg, t)
        dx, dy = shake(t)

        # fondo: cámara que flota y empuja en cada escena
        k = prog(t, sc["start"], sc["end"] - sc["start"])
        cx = 0.5 + 0.22 * math.sin(t * 0.33) + pan
        cy = 0.38 + 0.07 * math.sin(t * 0.21)
        frame = camera(bg, cx, cy, 1.1 + 0.07 * k + 0.03 * math.sin(t * 0.6)).convert("RGBA")
        center(frame, fade(A.leak, 0.55 + 0.25 * math.sin(t * 0.7)), W * (0.5 + 0.35 * math.sin(t * 0.25)), H * 0.3)
        dust.draw_back(frame, t)
        comp(frame, fg, dx, dy)
        dust.draw_front(frame, t)
        if flash > 0:
            frame.alpha_composite(Image.new("RGBA", (W, H), (255, 214, 160, int(170 * flash))))

        a = np.asarray(frame.convert("RGB"), dtype=np.float32) * vign
        a = np.clip(a + grain[f % 6], 0, 255).astype(np.uint8)
        if f < 3:
            a = (a * (f / 3)).astype(np.uint8)
        ff.stdin.write(a.tobytes())
        if f % 30 == 0:
            print("  frame %d/%d" % (f, N))
            sys.stdout.flush()

    ff.stdin.close()
    ff.wait()
    print("Listo:", OUT)


if __name__ == "__main__":
    main()
