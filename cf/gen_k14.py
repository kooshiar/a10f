"""Build /k14: the site rebranded as K14 (investor-deck palette, Geist, 5-in-9 mark).

Reads the generated 97A pages (homepage, apps, technology, contact) and writes k14/... copies with the new frame,
logo, links and colours. Run after gen_apps.py:  python3 web/cf/gen_k14.py
"""
import pathlib, re

WEB = pathlib.Path(__file__).resolve().parents[1]
OUT = WEB / 'k14'

FONT_OLD = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'
FONT_NEW = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap'
MARK = '<img src="/k14/mark.svg" alt="">'
# molecule tiles: host elements by count -> green, cream, light green, grey, pale green; trapped molecule cream (as in the hero)
HEAD = ('<link rel="icon" href="/k14/favicon.svg"><meta name="robots" content="noindex">\n'
        "<script>globalThis.MOLPAL=['#6FAF52','#ECE8DD','#A9D38F','#C9CED8','#DCE8D2'];globalThis.MOLGUEST='#F4F1E8'</script>")


def brand(s):
    s = s.replace(FONT_OLD, FONT_NEW)
    s = s.replace('href="/site/frame.css">', 'href="/k14/frame.css">\n' + HEAD)
    s = s.replace('href="frame.css">', 'href="/k14/frame.css">\n' + HEAD)
    s = s.replace('<a class="logo" href="/">97A</a>', f'<a class="logo" href="/k14/">{MARK}K14</a>')
    s = s.replace('<span>97A</span><span>© 2026</span>', f'<span class="logo">{MARK}K14</span><span>© 2026</span>')
    for p in ('apps', 'technology', 'contact'):
        s = s.replace(f'"/{p}/', f'"/k14/{p}/')
    s = s.replace("'/site/appmols.js?v=3'", "'/site/appmols.js?v=4'").replace("'/site/appmols.js'", "'/site/appmols.js?v=4'")
    s = s.replace("'./appmols.js'", "'./appmols.js?v=4'")
    # molecule tiles in the brand palette (cream and greens) instead of element colours; ?bg=light keeps the deck look
    s = s.replace("=== 'light' ? 'light' : 'dark';", "=== 'light' ? 'light' : null;")
    s = s.replace('#12151D', '#181818').replace('#F3F4F6', '#F1EFE8')
    return s.replace('97A', 'K14')


def home(s):
    s = brand(s)
    # hero machine in the deck green, the caught ball cream
    s = s.replace("import { FILMS } from './films.js';",
                  "import { FILMS, COLORS } from './films.js';\nObject.assign(COLORS, { blue:'#6FAF52', orange:'#EDE7D9' });")
    s = s.replace('</style>', '  .more{box-shadow:0 0 0 1.5px var(--page)}\n'
                  '  .techbg.white .designer{border-color:var(--blue)}\n</style>', 1)
    return s


def app_css(s):
    for a, b in (('#00A651', '#3F7F2C'), ('#1A1A1A', '#181818'), ('#F0F1F4', '#EFEDE6'), ('#F6F7F9', '#F3F1EA')):
        s = s.replace(a, b)
    return s


def write(rel, text):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


write('index.html', home((WEB / 'site/index.html').read_text()))
write('apps/app.css', app_css((WEB / 'apps/app.css').read_text()))
n = 1
for d in ('apps', 'technology', 'contact'):
    for f in sorted((WEB / d).rglob('index.html')):
        write(f.relative_to(WEB), brand(f.read_text()))
        n += 1
print(f'k14: {n} pages')
