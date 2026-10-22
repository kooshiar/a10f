#!/bin/sh
# Copy the public site into cf/dist for Cloudflare (homepage, /apps, /contact). Big media and old experiments stay out.
cd "$(dirname "$0")/.." && rm -rf cf/dist && mkdir -p cf/dist
python3 cf/gen_apps.py >/dev/null   # app pages carry the latest spinoff scores (decks/progress)
python3 decks/unify_rail.py >/dev/null   # one control rail on every deck (theme, design, links, share, pager)
rsync -a --exclude 'videos/' --exclude 'render' --exclude 'machines' --exclude '*.py' --exclude '__pycache__' --exclude '*.mp4' site cf/dist/
# decks/bioprogress holds only the bio rows the one progress table reads (its own page is a redirect); loops and logs stay out
rsync -a --exclude '*.py' --exclude '*.sh' --exclude '*.log' --exclude '*.out' --exclude 'decks/bioprogress/_shell.html' apps contact tech ss decks poster join lab spinoffs cf/dist/
du -sh cf/dist; find cf/dist -type f | wc -l
