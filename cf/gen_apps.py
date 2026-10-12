"""Build the applications part of 97a.io from the problem-card deck (demo_cards/problem-cards.html).

    python3 web/cf/gen_apps.py

Writes
  web/site/appsdata.js        APPS (slug, title, short title, category), CATS, HOME (homepage row), DATA (molecules)
  web/apps/index.html         every application, one row per category
  web/apps/<slug>/index.html  one page per application; the "How" rows become a contact link
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
DECK = ROOT / "demo_cards" / "problem-cards.html"

SHORT = {
    "Decaf sponge that pulls caffeine and keeps flavor": "Decaf that keeps flavor",
    "Cork-taint remover for wine": "Cork-taint remover",
    "Off-flavor trap for plant-based milk and meat": "Off-flavor trap",
    "Stable natural blue food color": "Natural blue color",
    "Fat-bloom blocker for chocolate": "Chocolate bloom",
    "Sugar-like sweetener with no calories": "Zero-calorie sweetener",
    "Ethylene trap that keeps fruit fresh longer": "Ethylene trap for fruit",
    "Pheromone dispenser that confuses crop pests": "Pest pheromone",
    "Mycotoxin binder for animal feed": "Mycotoxin binder",
    "Phosphorus catcher for farm runoff": "Phosphorus catcher",
    "Fertilizer stabilizer that stops nitrogen loss": "Fertilizer stabilizer",
    "Herbicide that kills resistant weeds": "Resistant-weed killer",
    "Catalyst that makes ammonia at low heat": "Low-heat ammonia",
    "Feed additive that cuts cow methane": "Cow methane cutter",
    "Perfume capsule that releases scent slowly": "Slow-release perfume",
    "Vitamin C serum that doesn’t turn brown": "Stable vitamin C",
    "Odor trap for deodorants": "Deodorant odor trap",
    "Reef-safe sunscreen UV filter": "Reef-safe UV filter",
    "PFAS-free water-repellent coating for fabric": "PFAS-free rain coating",
    "Plant-based replacement for silicone in cosmetics": "Plant-based silicone",
    "Taste masker for bitter children’s medicine": "Bitter taste masker",
    "Drug crystal form check before scale-up": "Drug crystal check",
    "Potassium binder for kidney patients": "Potassium binder",
    "Sensor surface that tracks inflammation at home": "Inflammation sensor",
    "Slow-release joint injection for arthritis": "Slow-release joint shot",
    "Crystal blocker for gout": "Gout crystal blocker",
    "Antibiotic-free coating that stops catheter infections": "Infection-free catheter",
    "MRI contrast agent without gadolinium": "Gadolinium-free MRI",
    "Stabilizer that keeps vaccines safe without a freezer": "Freezer-free vaccines",
    "Cell-freezing solution without DMSO": "DMSO-free cell freezing",
    "Cheap ligand that pulls antibodies out of cell broth": "Antibody capture",
    "PFAS trap for drinking water": "PFAS trap for water",
    "CO₂ trap that works in humid air": "CO₂ trap for humid air",
    "Catalyst that turns mixed plastic back into fuel": "Plastic to fuel",
    "Heat battery that cuts data center cooling peaks": "Data-center heat battery",
    "Coolant for data centers after 3M leaves PFAS": "PFAS-free coolant",
    "Heat paste that pulls heat out of AI chips": "Heat paste for AI chips",
    "Sorbent that cools data centers with waste heat": "Waste-heat cooling",
    "Chip-making precursor that deposits cleaner films": "Cleaner chip precursor",
    "Long-life blue emitter for OLED screens": "Long-life blue OLED",
    "Iodine trap for nuclear fuel recycling": "Nuclear iodine trap",
    "Hydrogen storage material for trucks": "Hydrogen storage",
    "Solid electrolyte for solid-state batteries": "Solid-state batteries",
    "Iridium-free catalyst for green hydrogen": "Iridium-free hydrogen",
    "Rare-earth-free permanent magnet": "Rare-earth-free magnet",
    "Lithium picker for brine": "Lithium from brine",
    "Cyanide-free gold extraction": "Cyanide-free gold",
    "Rare-earth separator for magnet supply chains": "Rare-earth separator",
    "Corrosion inhibitor for steel pipes": "Pipe corrosion",
    "Copper-free antifouling paint for ships": "Copper-free ship paint",
    "Heat shield coating for jet engine blades": "Jet blade heat shield",
}
CAT_SHORT = {"Food & drink": "Food", "Agriculture": "Farming", "Cosmetics & home": "Home", "Data centers & chips": "Chips"}
HOME = ["PFAS trap for drinking water", "Solid electrolyte for solid-state batteries", "Heat paste that pulls heat out of AI chips",
        "Potassium binder for kidney patients", "Stabilizer that keeps vaccines safe without a freezer", "Lithium picker for brine",
        "Catalyst that makes ammonia at low heat", "Decaf sponge that pulls caffeine and keeps flavor", "Long-life blue emitter for OLED screens",
        "Cyanide-free gold extraction", "CO₂ trap that works in humid air", "Rare-earth-free permanent magnet"]
CONTACT_ROW = ('<tr class="g0"><th scope="row" class="grp" colspan="2">How</th>'
               '<td><a class="ask" href="/contact/">Contact us for the design specs and build plan &rarr;</a></td></tr>')

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n'
         '<link rel="stylesheet" href="/site/frame.css">')


def bar(active):
    t = lambda k, h, x="": f'<a {x}href="{h}"' + (' class="on"' if k == active else '') + f'>{k}</a>'
    return (f'<header class="site"><div class="bar"><nav class="wrap"><a class="logo" href="/">97A</a><div class="tabs">{t("Applications", "/apps/")}'
            f'{t("Technology", "/technology/")}</div>{t("Contact", "/contact/", "data-cta ")}</nav></div></header>')


FOOT = '<footer class="site"><div class="wrap"><span>97A</span><span>© 2026</span></div></footer>'


def slug(t):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower().replace("₂", "2"))).strip("-")


def main():
    s = DECK.read_text()
    js = s[s.index("<script"):]
    a = js.index("const DATA="); b = js.index("\nconst COL")
    data = json.loads(js[a + len("const DATA="):b].rstrip().rstrip(";"))
    apps, cat = [], None
    for cls, lab, body in re.findall(r'<section class="(pg[^"]*)" aria-label="([^"]*)">(.*?)</section>', s, re.S):
        if "div" in cls:
            cat = html.unescape(lab); continue
        title = html.unescape(lab)
        table = re.search(r"<table>.*?</table>", body, re.S).group(0)
        # drop the How group (5 rows) and put the contact link in its place
        rows = re.findall(r"<tr.*?</tr>", table, re.S)
        i = next(k for k, r in enumerate(rows) if ">How</th>" in r)
        rows = rows[:i] + [CONTACT_ROW] + rows[i + 5:]
        fig = re.search(r'data-k="([^"]+)"[^>]*title="([^"]*)"', body)
        use = re.sub(r"<[^>]+>", "", re.search(r'<th scope="row">Use</th><td>(.*?)</td>', body, re.S).group(1)).strip()
        apps.append(dict(slug=slug(title), title=title, short=SHORT.get(title, title), cat=cat, cs=CAT_SHORT.get(cat, cat), use=html.unescape(use),
                         k=fig.group(1) if fig else None, cap=html.unescape(fig.group(2)) if fig else "", focus='cyclodextrin' in (fig.group(2) if fig else ''), table="<table>" + "".join(rows) + "</table>"))
    assert len(apps) == 51 and len({a["slug"] for a in apps}) == 51
    cats = list(dict.fromkeys(a["cat"] for a in apps))

    used = {a["k"] for a in apps if a["k"]}
    out = ("// Generated by web/cf/gen_apps.py from the problem-card deck. Do not edit by hand.\n"
           f"export const APPS = {json.dumps([{k: a[k] for k in ('slug', 'title', 'short', 'cat', 'cs', 'k', 'focus')} for a in apps], ensure_ascii=False)};\n"
           f"export const CATS = {json.dumps(cats, ensure_ascii=False)};\n"
           f"export const HOME = {json.dumps([slug(t) for t in HOME])};\n"
           f"export const DATA = {json.dumps({k: data[k] for k in sorted(used)}, separators=(',', ':'))};\n")
    (WEB / "site" / "appsdata.js").write_text(out)

    # ---- index: a treemap of categories that fits one screen. Each cell shows one row of tiles (as many as its width
    #      holds); the title and count link to the category page with the full list.
    # 8 tile slots per row; a category's cell is as wide as the tiles it shows; the title opens the full list
    # Rows of cells; every row holds 9 tiles and runs exactly from the nav's left edge to its right edge.
    # Tile size t per row: 100% = 9t + gaps between tiles + inner paddings (outer cells have no outside padding).
    ROWS = [[("Agriculture", 5), ("Medicine", 4)], [("Food & drink", 5), ("Cosmetics & home", 4)],
            [("Data centers & chips", 3), ("Environment", 3), ("Biotech", 3)], [("Energy", 3), ("Mining", 3), ("Industry", 3)]]
    assert sorted(c for r in ROWS for c, _ in r) == sorted(cats)
    G, PAD = 24, 22                                     # px between tiles; px between a tile and an inner line
    cslug = {c: slug(c) for c in cats}
    assert not set(cslug.values()) & {a["slug"] for a in apps}
    tile = lambda a: f'<a class="tile" href="/apps/{a["slug"]}/" data-k="{a["k"]}"{" data-focus" if a["focus"] else ""}><canvas></canvas><b>{html.escape(a["short"])}</b></a>'
    def head(c, tag="h2"):
        n = sum(a["cat"] == c for a in apps)
        return f'<{tag}><a href="/apps/{cslug[c]}/">{html.escape(c)}<span class="n">{n}</span></a></{tag}>'
    def row(r):
        T = sum(k for _, k in r); fixed = (T - len(r)) * G + 2 * PAD * (len(r) - 1)
        out = []
        for i, (c, k) in enumerate(r):
            pl = 0 if i == 0 else PAD; pr = 0 if i == len(r) - 1 else PAD
            w = f"calc((100% - {fixed}px) * {k} / {T} + {(k - 1) * G + pl + pr}px)"
            shown = [a for a in apps if a["cat"] == c][:k]
            out.append(f'<section class="cell" style="width:{w}; padding-left:{pl}px; padding-right:{pr}px; --k:{k}">{head(c)}'
                       f'<div class="tiles">' + "".join(tile(a) for a in shown) + "</div></section>")
        return '  <div class="row">' + "".join(out) + "</div>"
    cells = "\n".join(row(r) for r in ROWS)
    TILE_JS = """<script type="module">
import { setup } from '/site/appmols.js';
const tiles = [...document.querySelectorAll('.tile')];
const look = new URLSearchParams(location.search).get('bg') === 'light' ? 'light' : 'dark';
document.body.classList.toggle('light', look === 'light');
const views = tiles.map(el => setup({ dataset:{ k:el.dataset.k }, look, focus:'focus' in el.dataset, querySelector:() => el.querySelector('canvas') }));
let hot = -1, last = performance.now();
(function loop(t){ if (hot >= 0) views[hot].tick(t - last); last = t; requestAnimationFrame(loop); })(last);
requestAnimationFrame(() => views.forEach(v => v.draw()));
tiles.forEach((el, i) => { el.onmouseenter = () => { hot = i; views[i].active(true); }; el.onmouseleave = () => { if (hot === i) hot = -1; views[i].active(false); }; });
</script>"""
    HEAD_CSS = """  h1, .cell h2{margin:0; font-weight:500; letter-spacing:-.02em; color:var(--ink)}
  h1 a, h2 a{color:inherit; text-decoration:none} h1 a:hover, h2 a:hover{color:var(--blue)}
  .n{margin-left:9px; font-family:var(--mono); font-size:15px; font-weight:500; letter-spacing:0; color:var(--ink2); vertical-align:1px}
  .tile{flex:none; color:var(--ink); text-decoration:none}
  .tile canvas{display:block; border-radius:19px; background:var(--bg); transition:transform .2s}
  body.light .tile canvas{background:#F3F4F6}
  .tile:hover canvas{transform:translateY(-2px)}
  .tile b{display:block; padding:6px 1px 0; font-weight:500; line-height:1.25; letter-spacing:-.005em}"""
    page = lambda title, body, css: f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>97A · {html.escape(title)}</title>
{FONTS}
<style>
{HEAD_CSS}
{css}
</style>
</head>
<body>
{bar("Applications")}
{body}
{FOOT}
{TILE_JS}
</body>
</html>
"""
    (WEB / "apps" / "index.html").write_text(page("Applications", f'<main class="wrap">\n{cells}\n</main>', """  main.wrap{padding-block:8px 24px}
  .row{display:flex}
  .row + .row{border-top:1px solid var(--sep)}
  .cell{flex:none; padding-top:14px; padding-bottom:12px; min-width:0}
  .cell + .cell{border-left:1px solid var(--sep)}
  .cell h2{margin:0 0 10px; font-size:20px; font-weight:600; letter-spacing:-.025em; white-space:nowrap}
  .tiles{display:grid; grid-template-columns:repeat(var(--k), minmax(0, 1fr)); gap:24px}
  .tile{min-width:0} .tile canvas{width:100%; height:auto; aspect-ratio:1} .tile b{font-size:13px}
  @media (max-width:900px){ .row{flex-direction:column} .cell{width:auto !important; padding-inline:0 !important; padding-block:18px 20px} .cell + .cell{border-left:0; border-top:1px solid var(--sep)}
    .cell h2{font-size:22px; margin-bottom:14px} .tiles{grid-template-columns:repeat(3, minmax(0, 1fr)); gap:18px 16px} .tile b{font-size:15px; padding-top:8px} }"""))

    # ---- hidden /ss: one square card per category to screenshot for social posts (not linked from the site)
    COLS = {8: 4, 6: 3, 5: 3, 3: 3}
    cards = "\n".join(
        f'  <section class="sq" id="{cslug[c]}" style="--cols:{COLS[sum(a["cat"] == c for a in apps)]}"><h1>{html.escape(c)}</h1><div class="g">' +
        "".join(f'<div class="t" data-k="{a["k"]}"{" data-focus" if a["focus"] else ""}><canvas></canvas><b>{html.escape(a["short"])}</b></div>' for a in apps if a["cat"] == c) +
        "</div></section>" for c in cats)
    (WEB / "ss").mkdir(exist_ok=True)
    (WEB / "ss" / "index.html").write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>97A · Cards</title>
{FONTS}
<style>
  body{{background:#fff; padding:40px 0 80px}}
  .sq{{width:720px; height:720px; margin:0 auto 48px; background:#E8EDF4; padding:64px 60px; display:flex; flex-direction:column}}
  .sq h1{{margin:0; font-weight:600; font-size:44px; letter-spacing:-.03em; color:var(--ink)}}
  .g{{flex:1; display:grid; grid-template-columns:repeat(var(--cols), 1fr); align-content:center; gap:30px 26px}}
  .t canvas{{display:block; width:100%; aspect-ratio:1; border-radius:28px; background:var(--bg)}}
  .t b{{display:block; margin-top:10px; font-weight:500; font-size:16px; line-height:1.25; letter-spacing:-.01em; color:var(--ink)}}
</style>
</head>
<body>
{cards}
<script type="module">
import {{ setup }} from '/site/appmols.js';
document.querySelectorAll('.t').forEach(el => setup({{ dataset:{{ k:el.dataset.k }}, look:'dark', scale:.9, focus:'focus' in el.dataset, querySelector:() => el.querySelector('canvas') }}).draw());
</script>
</body>
</html>
""")

    # ---- one page per category: every application in it, with its one-line use
    for c in cats:
        items = "".join(f'<li>{tile(a)}<div><a class="t" href="/apps/{a["slug"]}/">{html.escape(a["title"])}</a><p>{html.escape(a["use"])}</p></div></li>'
                        for a in apps if a["cat"] == c)
        d = WEB / "apps" / cslug[c]; d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(page(c, f"""<main class="wrap">
  <a class="crumb" href="/apps/">Applications</a>
  {head(c, "h1")}
  <ul class="list">{items}</ul>
</main>""", """  main.wrap{padding-block:26px 56px}
  .crumb{font-family:var(--mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--mute); text-decoration:none} .crumb:hover{color:var(--ink)}
  h1{margin-top:10px; font-size:30px; font-weight:600; letter-spacing:-.03em} h1 .n{font-size:17px}
  .list{list-style:none; margin:26px 0 0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:22px 40px}
  .list li{display:flex; gap:18px; align-items:center; padding-bottom:22px; border-bottom:1px solid var(--sep)}
  .tile{width:96px} .tile canvas{width:96px; height:96px} .tile b{display:none}
  .t{font-weight:500; font-size:17px; letter-spacing:-.01em; color:var(--ink); text-decoration:none} .t:hover{color:var(--blue)}
  .list p{margin:6px 0 0; font-size:14px; line-height:1.45; color:var(--ink2)}
  @media (max-width:900px){ .list{grid-template-columns:1fr} }"""))

    # ---- one page per application
    for n, a in enumerate(apps):
        prev, nxt = apps[n - 1], apps[(n + 1) % len(apps)]
        d = WEB / "apps" / a["slug"]; d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>97A · {html.escape(a["title"])}</title>
{FONTS}
<link rel="stylesheet" href="/apps/app.css">
</head>
<body>
{bar("Applications")}
<main class="wrap app">
  <a class="crumb" href="/apps/">Applications</a><span class="crumb">/</span><a class="crumb" href="/apps/{slug(a["cat"])}/">{html.escape(a["cat"])}</a>
  <div class="grid">
    <div class="card"><h1>{html.escape(a["title"])}</h1>{a["table"]}</div>
    <figure class="mol" data-k="{a["k"]}"><canvas aria-label="{html.escape(a["cap"])}"></canvas><figcaption>{html.escape(a["cap"])}</figcaption></figure>
  </div>
  <nav class="pn"><a href="/apps/{prev["slug"]}/">&larr; {html.escape(prev["short"])}</a><a href="/apps/{nxt["slug"]}/">{html.escape(nxt["short"])} &rarr;</a></nav>
</main>
{FOOT}
<script type="module">
import {{ setup }} from '/site/appmols.js';
const look = new URLSearchParams(location.search).get('bg') === 'light' ? 'light' : 'dark';
document.body.classList.toggle('light', look === 'light');
const f = document.querySelector('.mol'), v = setup({{ dataset:{{ k:f.dataset.k }}, scale:.95, look, querySelector:() => f.querySelector('canvas') }});
v.active(true); let last = performance.now();
(function loop(t){{ v.tick(t - last); last = t; requestAnimationFrame(loop); }})(last);
addEventListener('resize', () => v.draw());
// left / right arrow keys step through the applications
const pn = document.querySelectorAll('.pn a');
addEventListener('keydown', e => {{ if (e.altKey || e.metaKey || e.ctrlKey || /input|textarea/i.test(e.target.tagName)) return;
  if (e.key === 'ArrowLeft') location.href = pn[0].href; if (e.key === 'ArrowRight') location.href = pn[1].href; }});
</script>
</body>
</html>
""")
    print(len(apps), "apps,", len(cats), "categories,", len(used), "molecules")


if __name__ == "__main__":
    main()
