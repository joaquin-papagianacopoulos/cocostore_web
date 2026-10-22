# -*- coding: utf-8 -*-
"""Genera la voz en off (es-AR-TomasNeural) línea por línea con tiempos por palabra.

Uso:  py -3.11 marketing/reel-comparalo/tts.py
Salida: build/vo_<id>.wav + build/vo.json (duración y palabras de cada línea)
"""
import asyncio
import json
import os
import subprocess

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
VOICE = "es-AR-TomasNeural"
RATE = "+20%"

# id de escena → texto de la voz en off
LINES = [
    ("hook", "¿Uno de sesenta y tres mil, que lo comparan con uno de casi doscientos?"),
    ("jas", "Jasoor, de Lattafa. Manzana y cardamomo: fresco, para todos los días."),
    ("nb", "Noble Blush, también de Lattafa. Almendra y vainilla: dulce, para salir."),
    ("arm", "¿Y el de diseñador? También lo tenemos: Stronger With You Intensely, para la noche."),
    ("env", "Lo armamos y te lo llevamos."),
    ("cta", "Escribinos por WhatsApp y pedí el tuyo. Envíos a todo el país."),
]


async def synth(key, text):
    comm = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
    mp3 = os.path.join(BUILD, "vo_%s.mp3" % key)
    words = []
    with open(mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7})
    # recorta el silencio de los bordes y deja los tiempos relativos al recorte
    t0 = max(0.0, words[0]["t"] - 0.04)
    t1 = words[-1]["t"] + words[-1]["d"] + 0.15
    for w in words:
        w["t"] -= t0
    wav = os.path.join(BUILD, "vo_%s.wav" % key)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ss", "%.3f" % t0, "-to", "%.3f" % t1, "-ar", "44100", "-ac", "1", wav], check=True)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).decode().strip())
    return {"id": key, "text": text, "dur": dur, "words": words}


async def main():
    os.makedirs(BUILD, exist_ok=True)
    out = [await synth(k, t) for k, t in LINES]
    with open(os.path.join(BUILD, "vo.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    for l in out:
        print("%-5s %.2fs  %s" % (l["id"], l["dur"], " ".join(w["w"] for w in l["words"])))
    print("total %.2fs" % sum(l["dur"] for l in out))


asyncio.run(main())
