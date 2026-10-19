#!/bin/sh
# Copy the public site into cf/dist for Cloudflare (homepage, /apps, /contact). Big media and old experiments stay out.
cd "$(dirname "$0")/.." && rm -rf cf/dist && mkdir -p cf/dist
rsync -a --exclude 'videos/' --exclude 'render' --exclude 'machines' --exclude '*.py' --exclude '__pycache__' --exclude '*.mp4' site cf/dist/
rsync -a --exclude '*.py' apps contact technology ss decks poster join lab cf/dist/
du -sh cf/dist; find cf/dist -type f | wc -l
