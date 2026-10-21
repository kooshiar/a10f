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
    "Corrosion inhibitor for liquid-cooling loops": "Cooling-loop corrosion",
    "Longer-life transformer oil": "Long-life transformer oil",
    "Concrete additive for heavier data center floors": "Stronger data-center floors",
}
CAT_SHORT = {"Food & drink": "Food", "Agriculture": "Farming", "Cosmetics & home": "Home", "Data centers & chips": "Chips"}
HOME = ["PFAS trap for drinking water", "Solid electrolyte for solid-state batteries", "Heat paste that pulls heat out of AI chips",
        "Potassium binder for kidney patients", "Stabilizer that keeps vaccines safe without a freezer", "TMAH recovery for chip fabs",
        "Catalyst that makes ammonia at low heat", "Decaf sponge that pulls caffeine and keeps flavor", "Long-life blue emitter for OLED screens",
        "Boron catcher for desalination", "Early-strength booster for low-carbon cement", "Rare-earth-free permanent magnet"]
# apps dropped from the site (weak in the spinoff runs)
REMOVE = {"Lithium picker for brine", "Catalyst that turns mixed plastic back into fuel"}
# private apps: only the problem is published. Their solution rows and host molecules are never written to any public
# file (not the page, not appsdata.js); the tile shows the target molecule alone.
HIDE = {"Cork-taint remover for wine": ("cork_p", "TCA, the musty molecule in corked wine (green = chlorine)"),
        "CO₂ trap that works in humid air": ("co2_p", "CO₂ next to a water molecule, which competes for the same sites"),
        "Cyanide-free gold extraction": ("gold_p", "Gold cyanide, how most gold is leached today (orange = Au)"),
        "Ethylene trap that keeps fruit fresh longer": ("ethylene_p", "Ethylene, the gas that ripens fruit"),
        "Phosphorus catcher for farm runoff": ("phosphate_p", "Phosphate (orange = P)"),
        "Rare-earth separator for magnet supply chains": ("rareearth_p", "Neodymium and praseodymium ions, nearly the same size and charge")}
# apps from the spinoff runs that are not in the card deck. Facts from the spinoff decks; molecules from apps_extra.py
# (the target or today's product, never our design)
EXTRA = [
    dict(title="Boron catcher for desalination", short="Boron catcher", cat="Environment", k="boric", cap="Boric acid (orange = boron)",
         use="Pull boric acid out of desalinated seawater without a second reverse-osmosis pass",
         test="Boron removal from real reverse-osmosis water", time="~1–2 months",
         comp="Second reverse-osmosis pass at high pH; boron-selective resins", buyers="Desalination plants, membrane makers",
         market="$16B desalination market (2023), $37B by 2032"),
    dict(title="Trap for 1,4-dioxane in groundwater", short="Dioxane trap", cat="Environment", k="dioxane", cap="1,4-dioxane, a solvent in groundwater",
         use="Catch 1,4-dioxane, a likely carcinogen that carbon filters barely hold", test="Batch uptake at 1–10 ppb", time="~1–2 months",
         comp="UV plus hydrogen peroxide, ~$2–2.5M per system", buyers="Water utilities, remediation firms",
         market="Suffolk County, NY alone: $177M over 5 years"),
    dict(title="Binder for a reagent-free phosphate probe", short="Phosphate probe", cat="Environment", k="tren",
         cap="Tren tris(phenylurea), a phosphate binder from the literature",
         use="Track phosphate in sewage plants with a simple probe instead of a $29k analyzer",
         comp="Wet-chemistry analyzers (~$29k); no phosphate probe is sold", buyers="Sewage plants (1,279 large US plants have P limits), probe makers",
         market="$0.6B phosphate analyzers (2025)"),
    dict(title="Ammonium probe binder that ignores potassium", short="Ammonium probe", cat="Environment", k="crown_nh4",
         cap="Ammonium in 18-crown-6, a classic binder",
         use="Steadier ammonium probes for sewage aeration, which uses 25–60% of plant power",
         comp="Nonactin probes, only 10–20× ammonium over potassium", buyers="Sewage plants, probe makers",
         market="$290M ammonium sensors (2025)"),
    dict(title="Early-strength booster for low-carbon cement", short="Low-carbon cement booster", cat="Industry", k="tea",
         cap="Triethanolamine, today’s booster", use="Speed day-1 strength in low-clinker cements, keeping set time and 28-day strength",
         test="Mortar cubes: 1-, 3- and 28-day strength", time="~2–3 months", comp="Amine additives (TEA, TIPA), sulfate tuning",
         buyers="Cement makers, admixture makers", market="$3.9–6.6B cement additives"),
    dict(title="TMAH recovery for chip fabs", short="TMAH recovery", cat="Data centers & chips", k="tmah",
         cap="Tetramethylammonium, the chip developer", use="Pull the toxic TMAH developer out of fab rinse water and reuse it",
         comp="Destroyed in fab wastewater plants", buyers="Chip fabs (TSMC aims to reuse 24,000 t a year)",
         market="$1.3B electronic-grade TMAH (2025)"),
    dict(title="Wraps that hold one temperature", short="Steady heat wraps", cat="Cosmetics & home", k="paraffin",
         cap="Paraffin, today’s heat-storing fill", use="Hot and cold wraps that hold 42 °C or 15 °C instead of drifting",
         comp="Gel and chemical packs that drift off temperature", buyers="Consumer health brands", market="$1.8B hot and cold packs"),
]


CONTACT_ROW = ('<tr class="g0"><th scope="row" class="grp" colspan="2">How</th>'
               '<td><a class="ask" href="/contact/">Contact us for the design specs and build plan &rarr;</a></td></tr>')

FONTS = ('<script async src="/site/analytics.js?v=1"></script>\n'
         '<script type="module" src="/site/auth.js"></script>\n'
         '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">\n'
         '<link rel="stylesheet" href="/site/frame.css">\n'
         '<link rel="icon" href="/site/favicon.svg">')


def bar(active):
    t = lambda k, h, x="": f'<a {x}href="{h}"' + (' class="on"' if k == active else '') + f'>{k}</a>'
    return (f'<header class="site"><div class="bar"><nav class="wrap"><a class="logo" href="/"><img src="/site/mark.svg" alt="">K14</a><div class="tabs">{t("Apps", "/apps/")}'
            f'{t("Tech", "/tech/")}</div>{t("Contact", "/contact/", "data-cta ")}</nav></div></header>')


FOOT = '<footer class="site"><div class="wrap"><span class="logo"><img src="/site/mark.svg" alt="">K14</span><span>© 2026</span></div></footer>'


def slug(t):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower().replace("₂", "2"))).strip("-")


def chip_cat(cat):
    return f'<span class="chip tag">{html.escape(cat)}</span>'


def problem_only(a):
    """Private app: category, the problem it answers, today's competition and the contact link. Nothing else."""
    comp = re.search(r'>Competition</th>(<td>.*?</td>)', a["table"], re.S)
    return ('<table><tr class="g0"><th scope="rowgroup" class="grp" rowspan="2">Problem</th><th scope="row">Category</th>'
            f'<td>{chip_cat(a["cat"])}</td></tr><tr><th scope="row">Use</th><td>{html.escape(a["use"])}</td></tr>{CONTACT_ROW}'
            + (f'<tr class="g0"><th scope="row" class="grp" colspan="2">Competition</th>{comp.group(1)}</tr>' if comp else '') + '</table>')


def extra_table(e):
    r = lambda k, v: f'<th scope="row">{k}</th><td>{html.escape(v)}</td>'
    build = [("Testing", e["test"])] if e.get("test") else []
    build += [("Time", e["time"])] if e.get("time") else []
    t = (f'<table><tr class="g0"><th scope="rowgroup" class="grp" rowspan="2">Why</th><th scope="row">Category</th><td>{chip_cat(e["cat"])}</td></tr>'
         f'<tr>{r("Use", e["use"])}</tr>')
    for i, (k, v) in enumerate(build):
        t += (f'<tr class="g0"><th scope="rowgroup" class="grp" rowspan="{len(build)}">Build</th>{r(k, v)}</tr>' if i == 0 else f'<tr>{r(k, v)}</tr>')
    return (t + CONTACT_ROW + f'<tr class="g0"><th scope="row" class="grp" colspan="2">Competition</th><td>{html.escape(e["comp"])}</td></tr>'
            f'<tr class="g0"><th scope="rowgroup" class="grp" rowspan="2">Business</th>{r("Buyers", e["buyers"])}</tr><tr>{r("Market", e["market"])}</tr></table>')


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
        # drop the How group (6 rows) and put the contact link in its place
        rows = re.findall(r"<tr.*?</tr>", table, re.S)
        i = next(k for k, r in enumerate(rows) if ">How</th>" in r)
        # keep testing and funding from the How group, under their own heading, then the contact link
        cell = lambda lab: re.search(rf'<th scope="row">{lab}</th>(<td>.*?</td>)', "".join(rows[i:i + 6]), re.S).group(1)
        need = (f'<tr class="g0"><th scope="rowgroup" class="grp" rowspan="3">Build</th><th scope="row">Testing</th>{cell("Lab test")}</tr>'
                f'<tr><th scope="row">Funding</th>{cell("Costs")}</tr><tr><th scope="row">Time</th>{cell("Time")}</tr>')
        rows = rows[:i] + [need, CONTACT_ROW] + rows[i + 6:]
        fig = re.search(r'data-k="([^"]+)"[^>]*title="([^"]*)"', body)
        use = re.sub(r"<[^>]+>", "", re.search(r'<th scope="row">Use</th><td>(.*?)</td>', body, re.S).group(1)).strip()
        apps.append(dict(slug=slug(title), title=title, short=SHORT.get(title, title), cat=cat, cs=CAT_SHORT.get(cat, cat), use=html.unescape(use),
                         k=fig.group(1) if fig else None, cap=html.unescape(fig.group(2)) if fig else "", focus='cyclodextrin' in (fig.group(2) if fig else ''), table="<table>" + "".join(rows) + "</table>"))
    assert len(apps) == 54
    apps = [a for a in apps if a["title"] not in REMOVE]
    for a in apps:
        if a["title"] in HIDE:
            a["k"], a["cap"] = HIDE[a["title"]]; a["focus"] = False; a["table"] = problem_only(a)
    extra = json.loads((WEB / "cf" / "apps_extra.json").read_text())
    data.update(extra)
    for e in EXTRA:
        at = max(i for i, a in enumerate(apps) if a["cat"] == e["cat"]) + 1
        apps.insert(at, dict(slug=slug(e["title"]), title=e["title"], short=e["short"], cat=e["cat"], cs=CAT_SHORT.get(e["cat"], e["cat"]),
                             use=e["use"], k=e["k"], cap=e["cap"], focus=False, table=extra_table(e)))
    n = 54 - len(REMOVE) + len(EXTRA)
    assert len(apps) == n and len({a["slug"] for a in apps}) == n
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
            [("Data centers & chips", 3), ("Environment", 3), ("Biotech", 3)], [("Energy", 4), ("Mining", 2), ("Industry", 3)]]
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
<title>K14 · {html.escape(title)}</title>
{FONTS}
<style>
{HEAD_CSS}
{css}
</style>
</head>
<body>
{bar("Apps")}
{body}
{FOOT}
{TILE_JS}
</body>
</html>
"""
    (WEB / "apps" / "index.html").write_text(page("Apps", f'<main class="wrap">\n{cells}\n</main>', """  main.wrap{padding-block:8px 24px}
  .row{display:flex}
  .row + .row{border-top:1px solid var(--sep)}
  .cell{flex:none; padding-top:14px; padding-bottom:12px; min-width:0}
  .cell + .cell{border-left:1px solid var(--sep)}
  .cell h2{margin:0 0 10px; font-size:20px; font-weight:600; letter-spacing:-.025em; white-space:nowrap}
  .tiles{display:grid; grid-template-columns:repeat(var(--k), minmax(0, 1fr)); gap:24px}
  .tile{min-width:0} .tile canvas{width:100%; height:auto; aspect-ratio:1} .tile b{font-size:13px}
  @media (max-width:900px){ .row{flex-direction:column} .cell{width:auto !important; padding-inline:0 !important; padding-block:18px 20px} .cell + .cell{border-left:0; border-top:1px solid var(--sep)}
    .cell h2{font-size:22px; margin-bottom:14px} .tiles{grid-template-columns:repeat(auto-fill, minmax(88px, 1fr)); grid-template-rows:auto; grid-auto-rows:0; row-gap:0; column-gap:14px; overflow:hidden}
      .tile b{font-size:13.5px; padding-top:7px} }"""))

    # ---- hidden /ss: four square images to screenshot for social posts (not linked). Similar categories share an image;
    #      each category is one row of up to 4 tiles, like the phone layout.
    GROUPS = [["Medicine", "Biotech", "Cosmetics & home"], ["Food & drink", "Agriculture"],
              ["Energy", "Data centers & chips"], ["Environment", "Mining", "Industry"]]
    assert sorted(c for g in GROUPS for c in g) == sorted(cats)
    def block(c):
        mine = [a for a in apps if a["cat"] == c]
        return (f'<div class="blk"><h2>{html.escape(c)}<span>{len(mine)}</span></h2><div class="g">' +
                "".join(f'<div class="t" data-k="{a["k"]}"{" data-focus" if a["focus"] else ""}><canvas></canvas><b>{html.escape(a["short"])}</b></div>' for a in mine[:4]) +
                "</div></div>")
    cards = "\n".join(f'  <section class="sq" id="ss{i + 1}">' + "".join(block(c) for c in g) + "</section>" for i, g in enumerate(GROUPS))
    (WEB / "ss").mkdir(exist_ok=True)
    (WEB / "ss" / "index.html").write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>K14 · Cards</title>
{FONTS}
<style>
  body{{background:#fff; padding:40px 0 80px}}
  .sq{{width:720px; height:720px; margin:0 auto 48px; background:#E8EDF4; padding:44px 60px; display:flex; flex-direction:column; justify-content:center; gap:20px}}
  .blk h2{{margin:0 0 12px; font-weight:600; font-size:28px; letter-spacing:-.025em; color:var(--ink); white-space:nowrap}}
  .blk h2 span{{margin-left:10px; font-family:var(--mono); font-size:17px; font-weight:500; color:var(--ink2); vertical-align:3px}}
  .g{{display:grid; grid-template-columns:repeat(4, 134px); gap:14px}}
  .t canvas{{display:block; width:104px; height:104px; border-radius:24px; background:var(--bg)}}
  .t b{{display:block; margin-top:8px; font-weight:500; font-size:16.5px; line-height:1.2; letter-spacing:-.015em; color:var(--ink)}}
</style>
</head>
<body>
{cards}
<script type="module">
import {{ setup }} from '/site/appmols.js?v=3';
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
  <a class="crumb" href="/apps/">Apps</a>
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
<title>K14 · {html.escape(a["title"])}</title>
{FONTS}
<link rel="stylesheet" href="/apps/app.css">
</head>
<body>
{bar("Apps")}
<main class="wrap app">
  <a class="crumb" href="/apps/">Apps</a><span class="crumb">/</span><a class="crumb" href="/apps/{slug(a["cat"])}/">{html.escape(a["cat"])}</a>
  <div class="grid">
    <div class="card"><h1>{html.escape(a["title"])}</h1>{a["table"]}</div>
    <figure class="mol" data-k="{a["k"]}"><canvas aria-label="{html.escape(a["cap"])}"></canvas><figcaption>{html.escape(a["cap"])}</figcaption></figure>
  </div>
  <nav class="pn"><a href="/apps/{prev["slug"]}/">&larr; {html.escape(prev["short"])}</a><a href="/apps/{nxt["slug"]}/">{html.escape(nxt["short"])} &rarr;</a></nav>
</main>
{FOOT}
<script type="module">
import {{ setup }} from '/site/appmols.js?v=3';
const look = new URLSearchParams(location.search).get('bg') === 'light' ? 'light' : 'dark';
document.body.classList.toggle('light', look === 'light');
const f = document.querySelector('.mol'), v = setup({{ dataset:{{ k:f.dataset.k }}, scale:.95, look, drag:true, querySelector:() => f.querySelector('canvas') }});
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
    keep = {a["slug"] for a in apps} | set(cslug.values())
    for d in (WEB / "apps").iterdir():
        if d.is_dir() and d.name not in keep:
            for f in d.iterdir(): f.unlink()
            d.rmdir()
    print(len(apps), "apps,", len(cats), "categories,", len(used), "molecules")


if __name__ == "__main__":
    main()
