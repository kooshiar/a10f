"""Render film MP4s from saved simulation data. No simulation is rerun.

    .venv/bin/python web/films/render.py bind          # one video
    .venv/bin/python web/films/render.py all           # every scene
    .venv/bin/python web/films/render.py all 3,10,17   # stills at those video seconds, no mp4
Needs the local server on :8791 (it serves web/), headless Chromium via Playwright, ffmpeg.
"""
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / "videos"
BASE = "http://localhost:8791/films/player.html"
FPS, DUR, W, H = 30, 20, 1920, 1080
SCENES = ["sn2", "salt", "niti", "crack", "bind"]


def open_scene(page, sid):
    page.goto(f"{BASE}?id={sid}&capture=1")
    page.wait_for_function("window.READY === true", timeout=60000)


def render(page, sid):
    tmp = Path(tempfile.mkdtemp(prefix=f"film_{sid}_"))
    open_scene(page, sid)
    t0 = time.time()
    for i in range(FPS * DUR):
        page.evaluate(f"renderAt({i / FPS:.5f})")
        page.screenshot(path=str(tmp / f"{i:04d}.png"))
    out = OUT / f"{sid}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(tmp / "%04d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", str(out)], check=True)
    shutil.rmtree(tmp)
    print(f"{out.name}: {time.time() - t0:.0f} s, {out.stat().st_size / 1e6:.1f} MB", flush=True)


def stills(page, sid, secs):
    open_scene(page, sid)
    for s in secs:
        page.evaluate(f"renderAt({s})")
        page.screenshot(path=str(OUT / "stills" / f"{sid}_{s:g}.png"))


def main():
    OUT.mkdir(exist_ok=True)
    ids = SCENES if sys.argv[1] == "all" else sys.argv[1].split(",")
    ids = [s for s in ids if (HERE / "data" / s / "meta.json").exists()]
    secs = [float(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 else None
    if secs:
        (OUT / "stills").mkdir(exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist"])
        page = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        for sid in ids:
            stills(page, sid, secs) if secs else render(page, sid)
        b.close()


if __name__ == "__main__":
    main()
