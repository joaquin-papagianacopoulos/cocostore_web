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

LEAD = {"hook": 0.2, "jas": 0.12, "nb": 0.12, "arm": 0.12, "env": 0.12, "cta": 0.12}
HOLD = {"env": 0.4}  # tiempo extra en pantalla después de la voz
TAIL = 0.9  # lo que queda en pantalla después de la última palabra (logo)


def load():
    with open(os.path.join(BUILD, "vo.json"), encoding="utf-8") as f:
        lines = json.load(f)
    scenes = []
    cursor = 0.0
    for l in lines:
        start = cursor
        vo = start + LEAD[l["id"]]
        end = vo + l["dur"] + 0.05 + HOLD.get(l["id"], 0)
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

    price_from = w("hook", 12)  # "casi"
    price_land = w("hook", 13) + 0.35  # termina "doscientos"
    logo = w("cta", 6)  # "tuyo"
    ev = {
        # (tiempo, intensidad de sonido 0-1, sacudón en px)
        "impacts": [(w("hook", 0), 0.6, 12), (w("hook", 5), 0.6, 12), (w("hook", 10), 0.6, 12),
                    (price_land, 1.0, 26), (w("arm", 3), 0.6, 10), (w("arm", 10) + 0.3, 0.8, 16),
                    (w("env", 1), 0.6, 12)],
        "whooshes": [s["end"] - 0.12 for s in scenes[:-1]],
        "riser": (w("hook", 8), price_land),
        "shimmers": [w("jas", 0) + 0.2, w("nb", 0) + 0.2, w("arm", 3), logo],
        "ticks": [w("jas", 3) - 0.35 + 0.15 * i for i in range(3)] + [w("nb", 5) - 0.35 + 0.15 * i for i in range(3)]
                 + [w("arm", 11) - 0.35 + 0.15 * i for i in range(3)],
        "price": (price_from, price_land),
        "button": w("cta", 2),
        "logo": logo,
        "tap": logo + 0.3,
    }
    return ev


if __name__ == "__main__":
    sc, tot = load()
    for s in sc:
        print("%-5s %5.2f - %5.2f   voz %5.2f" % (s["id"], s["start"], s["end"], s["vo"]))
    print("total %.2f s" % tot)
