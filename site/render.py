"""Render the machine films (site hero) from saved trajectories. No simulation is rerun.

    .venv/bin/python web/site/render.py atp            # one film -> videos/site/atp.mp4
    .venv/bin/python web/site/render.py all            # all seven
    .venv/bin/python web/site/render.py atp 2,9,16     # stills at those seconds -> videos/site/stills/
    .venv/bin/python web/site/render.py all thumb      # posters only
Needs the local server on :8791 (serves web/), Playwright Chromium, ffmpeg.
"""
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / "videos" / "site"
BASE = "http://localhost:8791/site/stage.html"
FPS, DUR, W, H = 30, 20, 1600, 1100
IDS = ["rotor", "niti", "electrolyte", "polymer", "mof", "dna", "atp"]


def open_scene(page, mid):
    page.goto(f"{BASE}?id={mid}&capture=1")
    page.wait_for_function("window.READY === true", timeout=120000)
    page.evaluate("document.fonts.ready")


def film(page, mid):
    tmp = Path(tempfile.mkdtemp(prefix=f"site_{mid}_"))
    open_scene(page, mid); t0 = time.time()
    for i in range(FPS * DUR):
        page.evaluate(f"renderAt({i / FPS:.5f})")
        page.screenshot(path=str(tmp / f"{i:04d}.png"))
    out = OUT / f"{mid}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(tmp / "%04d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow", "-movflags", "+faststart", str(out)], check=True)
    shutil.rmtree(tmp)
    thumb(page, mid)
    print(f"{out.name}: {time.time() - t0:.0f} s, {out.stat().st_size / 1e6:.1f} MB", flush=True)


def thumb(page, mid, at=14.0):
    """Poster/thumbnail: one clean frame, no caption."""
    page.evaluate("document.body.classList.add('clean')")
    page.evaluate(f"renderAt({at})")
    png = OUT / f"{mid}_thumb.png"
    page.screenshot(path=str(png))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(png), "-vf", "scale=800:-1", "-q:v", "3", str(OUT / f"{mid}.jpg")], check=True)
    png.unlink()
    page.evaluate("document.body.classList.remove('clean')")


def stills(page, mid, secs):
    open_scene(page, mid)
    for s in secs:
        page.evaluate(f"renderAt({s})")
        page.screenshot(path=str(OUT / "stills" / f"{mid}_{s:g}.png"))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ids = IDS if sys.argv[1] == "all" else sys.argv[1].split(",")
    only_thumb = len(sys.argv) > 2 and sys.argv[2] == "thumb"
    secs = [float(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 and not only_thumb else None
    if secs: (OUT / "stills").mkdir(exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist"])
        page = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        page.on("pageerror", lambda e: print("pageerror:", e))
        for mid in ids:
            if only_thumb: open_scene(page, mid); thumb(page, mid)
            elif secs: stills(page, mid, secs)
            else: film(page, mid)
        b.close()


if __name__ == "__main__":
    main()
