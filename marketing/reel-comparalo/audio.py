# -*- coding: utf-8 -*-
"""Música (beat con aire árabe, escala hijaz en Re), efectos y voz en off → build/mix.wav.

Uso:  py -3.11 marketing/reel-comparalo/audio.py   (después de tts.py)
Todo se sintetiza acá: no usa samples ni música con derechos.
"""
import math
import os
import subprocess

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

import timeline

SR = 44100
SCENES, TOTAL = timeline.load()
EV = timeline.events(SCENES)
BEAT = timeline.BEAT
N = int(TOTAL * SR) + SR // 2
rng = np.random.default_rng(7)

D4 = 293.66
HIJAZ = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16]  # Re, Mib, Fa#, Sol, La, Sib, Do, Re…


def hz(semi, base=D4):
    return base * 2 ** (semi / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def filt(x, kind, f):
    return sosfilt(butter(2, f, kind, fs=SR, output="sos"), x)


def put(buf, x, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(buf) or i + len(x) <= 0:
        return
    if i < 0:
        x, i = x[-i:], 0
    x = x[: len(buf) - i]
    l, r = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
    buf[i:i + len(x), 0] += x * gain * l * 1.414
    buf[i:i + len(x), 1] += x * gain * r * 1.414


# ---------- instrumentos ----------

def kick():
    t = tt(0.45)
    f = 45 + 85 * np.exp(-t * 28)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    x[:300] += rng.uniform(-0.4, 0.4, 300) * np.linspace(1, 0, 300)
    return np.tanh(x * 1.6)


def clap():
    t = tt(0.25)
    n = filt(rng.uniform(-1, 1, len(t)), "bandpass", [900, 5000])
    env = np.exp(-t * 18)
    for d in (0.008, 0.018):
        env += 0.6 * np.exp(-np.clip(t - d, 0, None) * 120) * (t >= d)
    return n * env * 0.8


def hat(open_=False):
    t = tt(0.25 if open_ else 0.05)
    return filt(rng.uniform(-1, 1, len(t)), "highpass", 7500) * np.exp(-t * (14 if open_ else 90)) * 0.5


def doum():
    t = tt(0.4)
    f = 85 + 40 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.9


def tek():
    t = tt(0.09)
    n = filt(rng.uniform(-1, 1, len(t)), "bandpass", [2000, 7000]) * np.exp(-t * 60)
    return n * 0.7 + np.sin(2 * np.pi * 640 * t) * np.exp(-t * 70) * 0.35


def sub(freq, dur):
    t = tt(dur)
    f = freq * (1 + 0.6 * np.exp(-t * 40))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t * 200) * np.exp(-t * 2.2)
    return np.tanh(x * 2.0) * 0.8


def pluck(freq, dur=0.6):
    """Cuerda punteada tipo oud: armónicos que se apagan rápido."""
    t = tt(dur)
    x = np.zeros_like(t)
    for k in range(1, 10):
        x += (1 / k) * np.sin(2 * np.pi * freq * k * t * (1 + 0.0015 * k)) * np.exp(-t * (4 + 2.2 * k))
    return x * np.minimum(1, t * 900) * 0.5


def pad(freq, dur):
    t = tt(dur)
    x = np.zeros_like(t)
    for k in range(1, 7):
        x += (1 / k) * (np.sin(2 * np.pi * freq * k * t) + np.sin(2 * np.pi * freq * k * 1.004 * t))
    x = filt(x, "lowpass", 900)
    env = np.minimum(1, t / 1.5) * np.minimum(1, (dur - t) / 0.8)
    return x * env * 0.12


# ---------- efectos ----------

def whoosh(dur=0.42):
    t = tt(dur)
    n = rng.uniform(-1, 1, len(t))
    out = np.zeros_like(n)
    # filtro pasabajos que se abre y se cierra (barrido)
    cut = 300 + 5000 * np.sin(np.pi * t / dur) ** 2
    a = 1 - np.exp(-2 * np.pi * cut / SR)
    y = 0.0
    for i in range(len(n)):
        y += a[i] * (n[i] - y)
        out[i] = y
    return out * np.sin(np.pi * t / dur) ** 1.5 * 1.4


def impact(strength=1.0):
    t = tt(1.4)
    f = 32 + 70 * np.exp(-t * 14)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    crash = filt(rng.uniform(-1, 1, len(t)), "lowpass", 3500) * np.exp(-t * 6) * 0.5
    return np.tanh((boom + crash) * 1.5) * strength


def riser(dur):
    t = tt(dur)
    k = t / dur
    n = rng.uniform(-1, 1, len(t))
    lo = filt(n, "highpass", 1500) * k ** 2 * 0.5
    tone = np.sin(2 * np.pi * np.cumsum(220 + 900 * k ** 2) / SR) * k ** 2 * 0.25
    return lo + tone


def shimmer():
    t = tt(1.6)
    x = np.zeros_like(t)
    for i, s in enumerate([24, 28, 31, 36]):  # Re, Fa#, La, Re agudos
        d = i * 0.05
        tt_ = np.clip(t - d, 0, None)
        x += np.sin(2 * np.pi * hz(s) * tt_) * np.exp(-tt_ * 3.0) * (t >= d)
        x += 0.3 * np.sin(2 * np.pi * hz(s) * 2.76 * tt_) * np.exp(-tt_ * 6.0) * (t >= d)
    return x * 0.18


def tick():
    t = tt(0.04)
    return np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 120) * 0.35


def reverb(x, secs=1.6, wet=0.25):
    t = tt(secs)
    ir = rng.uniform(-1, 1, len(t)) * np.exp(-t * 4.5)
    ir = filt(ir, "lowpass", 5000)
    y = np.stack([fftconvolve(x[:, c], ir)[: len(x)] for c in range(2)], 1)
    y /= np.abs(y).max() + 1e-9
    return x + y * wet * np.abs(x).max()


# ---------- arreglo ----------

def main():
    music = np.zeros((N, 2))
    lead = np.zeros((N, 2))
    sfx = np.zeros((N, 2))
    vo = np.zeros((N, 2))

    rf, rl = EV["riser"]
    s16 = BEAT / 4
    steps = int(TOTAL / s16) + 1
    K, C, Hh, Dm, Tk = kick(), clap(), hat(), doum(), tek()
    maqsum = {0: "D", 2: "T", 6: "T", 8: "D", 12: "T"}  # en semicorcheas, por compás
    for i in range(steps):
        t = i * s16
        pos = i % 16
        bar = i // 16
        if rf <= t < rl:  # silencio antes del precio: solo queda el riser
            continue
        intro = t < EV["impacts"][0][0]
        if not intro:
            if pos in (0, 7, 10):
                put(music, K, t, 0.95)
            if pos in (4, 12):
                put(music, C, t, 0.55, 0.1)
            if pos % 2 == 0 or (bar % 2 == 1 and pos >= 13):
                put(music, Hh, t, 0.32 if pos % 4 else 0.22, 0.35)
            if pos in maqsum:
                put(music, Dm if maqsum[pos] == "D" else Tk, t, 0.5, -0.3)
            if pos in (0, 10):
                note = [0, 0, -2, 1][bar % 4]  # Re, Re, Do, Mib
                put(music, sub(hz(note - 24), 0.55 if pos == 0 else 0.4), t, 0.75)

    # melodía en hijaz (semicorcheas con silencios), entra después del hook
    motif = [(0, 0), (1, 1), (2, 2), (3, 3), (4, 4), (6, 3), (7, 2), (10, 1),
             (16, 4), (17, 5), (18, 4), (19, 3), (20, 2), (22, 1), (23, 2), (26, 0)]
    start = SCENES[1]["start"]
    bars = int((TOTAL - start) / (BEAT * 4)) + 1
    for b in range(bars):
        for step, deg in motif:
            t = start + (b * 32 + step) * (BEAT / 4)
            if t >= TOTAL - 0.3 or rf <= t < rl:
                continue
            octave = 12 if b % 2 else 0
            put(lead, pluck(hz(HIJAZ[deg] + octave)), t, 0.32, 0.25 if step % 2 else -0.25)
    put(music, pad(hz(-24), TOTAL), 0, 0.9, -0.2)
    put(music, pad(hz(-17), TOTAL), 0, 0.6, 0.2)
    music += reverb(lead, 1.4, 0.35)

    # efectos
    for t, s, _ in EV["impacts"]:
        put(sfx, impact(s), t, 0.9)
    for t in EV["whooshes"]:
        put(sfx, whoosh(), t - 0.12, 0.5, -0.6)
        put(sfx, whoosh(), t - 0.08, 0.35, 0.6)
    put(sfx, riser(rl - rf), rf, 0.6)
    for t in EV["shimmers"]:
        put(sfx, shimmer(), t, 1.0, 0.2)
    for t in EV["ticks"]:
        put(sfx, tick(), t, 1.0)
    put(sfx, tick(), EV["tap"], 1.6)
    sfx = reverb(sfx, 1.2, 0.18)

    # voz en off (con un poco de brillo y compresión suave)
    for s in SCENES:
        sr, x = wavfile.read(s["wav"])
        x = x.astype(np.float64) / 32768
        x = x + 0.35 * filt(x, "highpass", 3000)
        x = np.tanh(x * 1.8) / np.tanh(1.8)
        put(vo, x, s["vo"], 1.0)

    # la música baja cuando habla la voz
    env = np.abs(vo[:, 0])
    win = int(0.12 * SR)
    env = np.convolve(env, np.ones(win) / win, mode="same")
    env = np.clip(env / (env.max() + 1e-9) * 4, 0, 1)
    duck = 1 - 0.6 * env
    music *= duck[:, None]

    talk = env > 0.5
    rms = lambda a: 20 * np.log10(np.sqrt((a[talk] ** 2).mean()) + 1e-9)
    print("mientras habla: voz %.1f dB / música %.1f dB / efectos %.1f dB" % (rms(vo), rms(music * 0.4), rms(sfx * 0.5)))
    mix = music * 0.4 + sfx * 0.5 + vo * 1.0
    fade_out = np.ones(N)
    n_end = int(TOTAL * SR)
    fade_out[n_end - int(0.4 * SR):n_end] = np.linspace(1, 0, int(0.4 * SR))
    fade_out[n_end:] = 0
    mix *= fade_out[:, None]
    mix = np.tanh(mix / (np.abs(mix).max() + 1e-9) * 1.4)
    mix = mix[:n_end] / np.abs(mix).max() * 0.9

    raw = os.path.join(timeline.BUILD, "mix_raw.wav")
    wavfile.write(raw, SR, (mix * 32767).astype(np.int16))
    out = os.path.join(timeline.BUILD, "mix.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), out], check=True)
    print("Listo:", out, "(%.2f s)" % TOTAL)


if __name__ == "__main__":
    main()
