"""Compose a Blender-rendered film: molecule frames + text layer (overlay.html) -> MP4.

    .venv/bin/python web/site/compose.py atp            # -> videos/site/atp_dark.mp4
    .venv/bin/python web/site/compose.py atp 0,300,560  # stills only
Needs the local server on :8791 and data/render/<id>/frames from server/render/blender_<id>.py.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "videos" / "site"
W, H, FPS = 1600, 1100, 30


def main():
    mid = sys.argv[1]
    clean = len(sys.argv) > 2 and sys.argv[2] == "clean"
    sel = [int(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 and not clean else None
    q = ""
    if clean:                                  # centre the molecule: union of its footprint over the film
        from PIL import Image
        fr = sorted((ROOT / "data" / "render" / mid / "frames").glob("*.png"))[::25]; x0, x1 = 1e9, 0
        for f in fr:
            b = Image.open(f).getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
            if b: x0, x1 = min(x0, b[0]), max(x1, b[2])
        q = f"&min=1&dx={W / 2 - (x0 + x1) / 2:.0f}"
    n = len(list((ROOT / "data" / "render" / mid / "frames").glob("*.png")))
    tmp = Path(tempfile.mkdtemp(prefix=f"compose_{mid}_"))
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={"width": W, "height": H})
        page.goto(f"http://localhost:8791/site/overlay.html?id={mid}{q}"); page.wait_for_function("window.READY === true")
        page.evaluate("document.fonts.ready")
        for f in (sel or range(n)):
            page.evaluate(f"show({f})")
            page.screenshot(path=str((OUT / "stills" if sel else tmp) / f"{mid}_dark_{f:04d}.png" if sel else tmp / f"{f:04d}.png"))
        b.close()
    if not sel:
        out = OUT / f"{mid}_{'clean' if clean else 'dark'}.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(tmp / "%04d.png"), "-c:v", "libx264",
                        "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", str(out)], check=True)
        print(out, f"{out.stat().st_size / 1e6:.1f} MB")
    shutil.rmtree(tmp)


if __name__ == "__main__":
    main()
