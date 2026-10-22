# -*- coding: utf-8 -*-
"""Línea de tiempo compartida por render.py y audio.py, armada desde build/vo.json."""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
FPS = 30
BPM = 100
BEAT = 60.0 / BPM
GRID = BEAT / 2  # los cortes caen en corcheas para ir al ritmo de la música

LEAD = {"hook": 0.2, "hg": 0.12, "cdn": 0.12, "dura": 0.12, "arm": 0.12, "cta": 0.12}
TAIL = 1.1  # lo que queda en pantalla después de la última palabra (logo)


def load():
    with open(os.path.join(BUILD, "vo.json"), encoding="utf-8") as f:
        lines = json.load(f)
    scenes = []
    cursor = 0.0
    for l in lines:
        start = cursor
        vo = start + LEAD[l["id"]]
        end = vo + l["dur"] + 0.05
        end = math.ceil(end / GRID - 1e-6) * GRID
        words = [{"w": w["w"], "t": vo + w["t"], "e": vo + w["t"] + w["d"]} for w in l["words"]]
        scenes.append({"id": l["id"], "start": start, "end": end, "vo": vo, "vo_dur": l["dur"], "words": words,
                       "wav": os.path.join(BUILD, "vo_%s.wav" % l["id"])})
        cursor = end
    scenes[-1]["end"] += TAIL
    total = scenes[-1]["end"]
    return scenes, total


def events(scenes):
    """Momentos clave que comparten la imagen (sacudones, brillos) y el sonido (golpes, whooshes)."""
    S = {s["id"]: s for s in scenes}

    def w(sid, i):
        return S[sid]["words"][i]["t"]

    price_from = w("arm", 10)  # "doscientos"
    price_land = w("arm", 11) + 0.05  # "mil"
    logo = w("cta", 4)  # "tuyo"
    ev = {
        # (tiempo, intensidad de sonido 0-1, sacudón en px)
        "impacts": [(w("hook", 0), 0.55, 12), (w("hook", 1), 0.6, 12), (w("hook", 1) + 0.36, 0.7, 14),
                    (w("hook", 7), 1.0, 24), (w("arm", 3), 0.6, 10), (price_land, 1.0, 26)],
        "whooshes": [s["end"] - 0.12 for s in scenes[:-1]],
        "riser": (price_from - 0.75, price_land),
        "shimmers": [w("hg", 0) + 0.2, w("cdn", 0) + 0.3, w("arm", 3), logo],
        "ticks": [w("hg", 3) - 0.35 + 0.15 * i for i in range(3)] + [w("cdn", 4) - 0.45 + 0.15 * i for i in range(3)],
        "price": (price_from, price_land),
        "button": w("cta", 0) + 0.35,
        "logo": logo,
        "tap": logo + 0.3,
    }
    return ev


if __name__ == "__main__":
    sc, tot = load()
    for s in sc:
        print("%-5s %5.2f - %5.2f   voz %5.2f" % (s["id"], s["start"], s["end"], s["vo"]))
    print("total %.2f s" % tot)
