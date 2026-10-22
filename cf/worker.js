// k14.ai on Cloudflare (97a.io redirects here): static files from ./dist, "/" -> the homepage, POST /api/contact -> saved in D1, then emailed.
// The destination address lives only in the CONTACT_TO secret (wrangler secret put CONTACT_TO), never in the page or repo.
const HOST = 'k14.ai';
const SWITCHED = true;   // k14.ai has its TLS certificate: 97a.io redirects there (false serves both hosts)
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // one home: k14.ai. 97a.io, www and the old /technology and /k14 paths redirect, path kept
    const path = url.pathname.replace(/^\/technology(?=\/|$)/, '/tech').replace(/^\/k14(?=\/|$)/, '') || '/';
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';   // wrangler dev
    if ((url.hostname !== HOST && !local && (SWITCHED || url.hostname === 'www.' + HOST)) || path !== url.pathname)
      return Response.redirect(`https://${SWITCHED || url.hostname.endsWith(HOST) ? HOST : url.hostname}${path}${url.search}`, ['GET', 'HEAD'].includes(request.method) ? 301 : 308);
    if (url.pathname === '/api/session') return session(request, env);
    if (url.pathname === '/api/contact') return contact(request, env);
    if (url.pathname === '/api/join') return join(request, env);
    if (url.pathname === '/api/lab') return lab(request, env);
    if (url.pathname === '/decks/_share') return shareCreate(request, env, url);
    if (url.pathname.startsWith('/share/')) return shareView(request, env, url);
    if (url.pathname === '/decks' || url.pathname.startsWith('/decks/')) return deck(request, env, url);
    if (url.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/site/', url), request));
    return env.ASSETS.fetch(request);
  },
};

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

async function contact(request, env) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  let b = {};
  try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const name = String(b.name || '').trim().slice(0, 200);
  const linkedin = String(b.linkedin || '').trim().slice(0, 300);
  const message = String(b.message || '').trim().slice(0, 5000);
  if (b.website) return json({ ok: true });                                        // honeypot
  if (!name || !message) return json({ ok: false, error: 'missing' }, 400);
  if (linkedin && !/^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(linkedin)) return json({ ok: false, error: 'linkedin' }, 400);
  // 1) keep it: the message is saved before anything else can fail
  let id = null;
  try {
    const row = await env.DB.prepare('INSERT INTO messages (name, linkedin, message) VALUES (?, ?, ?) RETURNING id').bind(name, linkedin || null, message).first();
    id = row && row.id;
  } catch (e) { console.log('contact store failed', String(e).slice(0, 200)); }
  // 2) email it (best effort); the visitor sees success once it is stored
  const note = async (delivered, text) => { if (id != null) try { await env.DB.prepare('UPDATE messages SET delivered = ?, relay_note = ? WHERE id = ?').bind(delivered, text, id).run(); } catch {} };
  if (b.selftest === 'store-only') { await note(0, 'self-test, not emailed'); return json({ ok: id != null, id }); }
  if (!env.CONTACT_TO) { await note(0, 'no CONTACT_TO'); return json({ ok: id != null }, id != null ? 200 : 500); }
  const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(env.CONTACT_TO)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://97a.io', Referer: 'https://97a.io/contact' },
    body: JSON.stringify({ name, linkedin: linkedin || '-', message, _subject: `K14 contact: ${name}`, _template: 'table', _captcha: 'false' }),
  });
  const text = await r.text(); let out = {};
  try { out = JSON.parse(text); } catch {}
  const ok = r.ok && String(out.success) !== 'false';
  if (!ok) console.log('contact relay failed', r.status, (out.message || text).slice(0, 300));   // relay's reason, no form data
  await note(ok ? 1 : 0, ok ? 'emailed' : (out.message || `relay ${r.status}`).slice(0, 300));
  return json({ ok: ok || id != null });
}

// ---- /join: founder Q&A for spinoffs, one row per submission in the founders table
async function join(request, env) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  let b = {};
  try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const str = (v, n) => String(v || '').trim().slice(0, n);
  const list = (v, n) => JSON.stringify((Array.isArray(v) ? v : []).map((x) => str(x, 200)).filter(Boolean).slice(0, n));
  const name = str(b.name, 200);
  const email = str(b.email, 200).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'missing' }, 400);
  try {
    await env.DB.prepare('INSERT INTO founders (name, email, linkedin, roles, problems, built, hours, city, nda, country, ua, problem_text, make, test, lab_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(name, email, str(b.linkedin, 300) || null, list(b.roles, 12), list(b.problems, 40), list(b.built, 3), str(b.hours, 40) || null, str(b.city, 200) || null,
            b.nda ? 1 : 0, request.cf?.country || null, (request.headers.get('user-agent') || '').slice(0, 200),
            str(b.problem_text, 2000) || null, list(b.make, 20), list(b.test, 20), str(b.lab_text, 1500) || null).run();
  } catch (e) { console.log('join store failed', String(e).slice(0, 200)); return json({ ok: false }, 500); }
  return json({ ok: true });
}

// ---- /lab: scientists say which problems interest them and what their lab can make and test
async function lab(request, env) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  let b = {};
  try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const str = (v, n) => String(v || '').trim().slice(0, n);
  const list = (v, n) => JSON.stringify((Array.isArray(v) ? v : []).map((x) => str(x, 120)).filter(Boolean).slice(0, n));
  const name = str(b.name, 200), email = str(b.email, 200).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'missing' }, 400);
  try {
    await env.DB.prepare('INSERT INTO scientists (name, email, problems, problem_text, make, test, lab_text, country, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(name, email, list(b.problems, 40), str(b.problem_text, 2000) || null, list(b.make, 20), list(b.test, 20), str(b.lab_text, 1500) || null,
            request.cf?.country || null, (request.headers.get('user-agent') || '').slice(0, 200)).run();
  } catch (e) { console.log('lab store failed', String(e).slice(0, 200)); return json({ ok: false }, 500); }
  return json({ ok: true });
}

async function scientistsPage(env) {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const arr = (t) => { try { return JSON.parse(t || '[]'); } catch { return []; } };
  const { results = [] } = await env.DB.prepare('SELECT * FROM scientists ORDER BY id DESC').all();
  const rows = results.map((r) => `<tr><td><b>${esc(r.name)}</b><span>${esc(r.email)}</span></td><td>${esc(arr(r.problems).join(', '))}<span>${esc(r.problem_text || '')}</span></td>
<td>${esc(arr(r.make).join(', '))}</td><td>${esc(arr(r.test).join(', '))}<span>${esc(r.lab_text || '')}</span></td><td>${esc((r.created || '').slice(0, 10))}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Scientist answers · K14</title><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>body{margin:0;background:#F4F5F7;font-family:"Space Grotesk",system-ui,sans-serif;color:#0E0F12}.w{max-width:1200px;margin:0 auto;padding:40px 16px}
h1{font-weight:600;font-size:30px;letter-spacing:-.03em;margin:20px 0 28px}.c{background:#fff;border:1px solid #D5DAE2;border-radius:10px;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid #E4E6EB}
th{font:500 11px/1 "JetBrains Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:#7A808C}td span{display:block;color:#7A808C;font-size:12px;margin-top:4px}
.bk{font:500 13px "JetBrains Mono",monospace;color:#454A55;text-decoration:none}</style></head>
<body><div class="w"><a class="bk" href="/decks">← All decks</a><h1>Scientist answers · ${results.length}</h1><div class="c"><table><tr><th>Name</th><th>Problems</th><th>Make</th><th>Test</th><th>Date</th></tr>${rows}</table></div></div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });
}

async function answersPage(env) {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const arr = (t) => { try { return JSON.parse(t || '[]'); } catch { return []; } };
  const { results = [] } = await env.DB.prepare('SELECT * FROM founders ORDER BY id DESC').all();
  const rows = results.map((r) => `<tr><td><b>${r.linkedin ? `<a href="${esc(r.linkedin)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name)}</b><span>${esc(r.email || '')}</span><span>${esc(r.city || '')}</span></td>
<td>${esc(arr(r.roles).join(', '))}</td><td>${esc(arr(r.problems).join(', '))}<span>${esc(r.problem_text || '')}</span></td><td>${esc(arr(r.make).concat(arr(r.test)).join(', '))}<span>${esc(r.lab_text || '')}</span></td><td>${arr(r.built).map(esc).join('<br>')}</td><td>${esc(r.hours || '')}</td><td>${r.nda ? '✓' : ''}</td><td>${esc((r.created || '').slice(0, 10))}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Founder answers · K14</title><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>body{margin:0;background:#F4F5F7;font-family:"Space Grotesk",system-ui,sans-serif;color:#0E0F12}.w{max-width:1200px;margin:0 auto;padding:40px 16px}
h1{font-weight:600;font-size:30px;letter-spacing:-.03em;margin:0 0 28px}.c{background:#fff;border:1px solid #D5DAE2;border-radius:10px;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid #E4E6EB}
th{font:500 11px/1 "JetBrains Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:#7A808C}td span{display:block;color:#7A808C;font-size:12px;margin-top:3px}
a{color:#0057FF;text-decoration:none}a:hover{text-decoration:underline}.bk{font:500 13px "JetBrains Mono",monospace;color:#454A55}</style></head>
<body><div class="w"><a class="bk" href="/decks">← All decks</a><h1 style="margin-top:20px">Founder answers · ${results.length}</h1><div class="c"><table><tr><th>Name</th><th>Roles</th><th>Problems</th><th>Lab</th><th>Built</th><th>Hours/wk</th><th>NDA</th><th>Date</th></tr>${rows}</table></div></div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });
}

// ---- gated decks: /decks/<name> asks for an email; only emails matching the deck's rule get in. Every entry is saved in D1.
// The deck file sits in the assets but every /decks/* path runs through here first, so it is never served without the cookie.
const DECKS = {
  dsc: { file: '/decks/dsc/deck', rule: /jacob/i, title: 'Data Center Construction', hint: 'Use your Jacobs email.', table: 'deck_access' },
  // spinoff decks: any valid email opens them; entries go to their own table
  crp: { file: '/decks/crp/deck', rule: /./, title: 'CRP Binders', hint: '', table: 'spinoffs' },
  heatcold: { file: '/decks/heatcold/deck', rule: /./, title: 'Heat and Cold Wraps', hint: '', table: 'spinoffs' },
};
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(env, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.DECK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
const cookieOf = (request, name) => (request.headers.get('cookie') || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];

async function deck(request, env, url) {
  const name = url.pathname.split('/')[2] || '';
  return privateDecks(request, env, url, name);
  const d = DECKS[name];   // legacy email gates, unused: every deck now needs the deck password or the owner sign-in link
  if (!env.DECK_SECRET) return new Response('Not found', { status: 404 });
  const ck = `deck_${name}`;
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const email = String(form?.get('email') || '').trim().toLowerCase().slice(0, 200);
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const ok = valid && d.rule.test(email);
    try {
      await env.DB.prepare(`INSERT INTO ${d.table} (deck, email, granted, country, ua) VALUES (?, ?, ?, ?, ?)`)
        .bind(name, email || null, ok ? 1 : 0, request.cf?.country || null, (request.headers.get('user-agent') || '').slice(0, 200)).run();
    } catch (e) { console.log('deck store failed', String(e).slice(0, 200)); }
    if (!ok) return gate(d, url, valid ? d.hint : 'Enter a valid email.', 403);
    const token = `${b64u(enc.encode(email))}.${await sign(env, `${name}|${email}`)}`;
    return new Response(null, { status: 303, headers: { location: `/decks/${name}/`,
      'set-cookie': `${ck}=${token}; Path=/decks/${name}; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` } });
  }
  const tok = cookieOf(request, ck);
  if (tok) {
    const [e64, sig] = tok.split('.');
    let email = '';
    try { email = atob(e64.replace(/-/g, '+').replace(/_/g, '/')); } catch {}
    if (email && sig && d.rule.test(email) && sig === await sign(env, `${name}|${email}`)) {
      const r = await env.ASSETS.fetch(new Request(new URL(d.file, url), request));
      const h = new Headers(r.headers); h.set('cache-control', 'private, no-store'); h.set('x-robots-tag', 'noindex');
      return new Response(r.body, { status: r.status, headers: h });
    }
  }
  return gate(d, url, '', 200);
}

function gate(d, url, err, status) {
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(d.title)} · K14</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site/frame.css"><script type="module" src="/site/auth.js"></script>
<style>main{min-height:calc(100vh - 121px);display:flex;align-items:center}
.g{max-width:420px;margin:0 auto;padding:48px 16px;display:flex;flex-direction:column;gap:22px}
h1{margin:0;font-weight:600;font-size:34px;letter-spacing:-.03em;line-height:1.05}
p{margin:0;color:var(--ink2);font-size:16px;line-height:1.5}
form{display:flex;flex-direction:column;gap:12px}
label{font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
input{font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--sep);border-radius:8px;color:var(--ink)}
input:focus-visible,button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
button{font:inherit;font-weight:500;font-size:16px;padding:12px 14px;border:0;border-radius:8px;background:var(--bg);color:var(--txt);cursor:pointer}
.err{color:#C4271B;font-size:14px}</style></head><body>
<header class="site"><div class="bar"><nav class="wrap"><a class="logo" href="/"><img src="/site/mark.svg" alt="">K14</a><div class="tabs"><a href="/apps/">Apps</a><a href="/tech/">Tech</a></div><a data-cta href="/contact/">Contact</a></nav></div></header>
<main><div class="g"><h1>${esc(d.title)}</h1><p>Enter your work email to open this deck.</p>
<form method="post" action="${esc(url.pathname)}"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required autofocus>
${err ? `<span class="err" role="alert">${esc(err)}</span>` : ''}<button type="submit">Open deck</button></form></div></main>
<footer class="site"><div class="wrap"><span class="logo"><img src="/site/mark.svg" alt="">K14</span><span>© 2026</span></div></footer></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

// ---- /api/session: the site's Google sign-in (Supabase). The page sends its Supabase access token; Supabase says who it
// is; the owner gets the same 30-day deck cookie as the password. Everyone else just stays signed in, no decks.
const SB = { url: 'https://mrmazotdgcmnrigzxkok.supabase.co', key: 'sb_publishable_yI8wFFTRjprK5MddelYlkQ_unHoGuEX' };
async function session(request, env) {
  const out = (body, cookie) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store',
    ...(cookie ? { 'set-cookie': cookie } : {}) } });
  if (request.method === 'DELETE') return out({ ok: true }, 'decks=; Path=/decks; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  if (request.method !== 'POST' || !env.ADMIN_PASS || !env.DECK_SECRET) return out({ decks: false });
  const tok = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok) return out({ decks: false });
  const r = await fetch(`${SB.url}/auth/v1/user`, { headers: { apikey: SB.key, Authorization: `Bearer ${tok}` } }).catch(() => null);
  const u = r && r.ok ? await r.json().catch(() => null) : null;
  if (!u || String(u.email || '').toLowerCase() !== OWNER || !u.email_confirmed_at) return out({ decks: false });
  const exp = Date.now() + 30 * 864e5;
  const token = `${exp}.${await sign(env, `admin|${exp}|${env.ADMIN_PASS}`)}`;
  return out({ decks: true }, `decks=${token}; Path=/decks; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`);
}

// ---- /decks (the list) and the private decks below it: one password (ADMIN_PASS secret). No secret set = 404,
// so a deploy can never expose them. The files sit in ./dist/decks but every /decks path runs through the worker first.
const FILES = { dsc: '/decks/dsc/deck', crp: '/decks/crp/deck', heatcold: '/decks/heatcold/deck' };   // decks served from one file
const OWNER = 'kooshiar@gmail.com';   // the one email that can sign in by link (sent to the CONTACT_TO inbox)
const PRIVATE = ['design', 'dsc', 'crp', 'heatcold', 'opportunities', 'sales', 'tech', 'customers', 'investors', 'amd', 'progress', 'founders', 'answers', 'scientists', 'evonik', 'cemvita',
  'bio', 'bioprogress'];   // bio spinoff decks; bioprogress serves only the bio rows the one progress table reads
const same = (a, b) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
async function privateDecks(request, env, url, name) {
  if ((name && name !== 'login' && !PRIVATE.includes(name)) || !env.ADMIN_PASS || !env.DECK_SECRET) return new Response('Not found', { status: 404 });
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const grant = async (to) => {
    const exp = Date.now() + 30 * 864e5;
    const token = `${exp}.${await sign(env, `admin|${exp}|${env.ADMIN_PASS}`)}`;
    return new Response(null, { status: 303, headers: { location: to,
      'set-cookie': `decks=${token}; Path=/decks; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` } });
  };
  // owner sign-in link: /decks/login?t=<exp>.<sig>&to=/decks/...
  if (name === 'login') {
    const [exp, sig] = String(url.searchParams.get('t') || '').split('.');
    const to = /^\/decks(\/|$)/.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : '/decks/';
    if (Number(exp) > Date.now() && sig && same(sig, await sign(env, `login|${exp}|${OWNER}`))) return grant(to);
    return adminGate(url, 'This sign-in link has expired. Ask for a new one.', 403);
  }
  // 3 wrong passwords from one address = locked for 24 hours
  let lock = null;
  try { lock = await env.DB.prepare('SELECT fails, until FROM deck_lock WHERE ip = ?').bind(ip).first(); } catch (e) {}
  const locked = lock && Number(lock.until) > Date.now();
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const email = String(form?.get('email') || '').trim().toLowerCase();
    if (email) {   // owner sign-in by link; any other email gets the same reply so the owner address is not revealed
      if (email === OWNER && env.CONTACT_TO) {
        const exp = Date.now() + 15 * 6e4;
        const link = `https://k14.ai/decks/login?t=${exp}.${await sign(env, `login|${exp}|${OWNER}`)}&to=${encodeURIComponent(url.pathname)}`;
        try {
          await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(env.CONTACT_TO)}`, { method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://97a.io', Referer: 'https://97a.io/decks' },
            body: JSON.stringify({ name: 'Deck sign-in', message: `Sign-in link (15 min): ${link}`, _subject: 'Deck sign-in link', _template: 'table', _captcha: 'false' }) });
        } catch (e) { console.log('login mail failed', String(e).slice(0, 200)); }
      }
      return adminGate(url, 'If that email can sign in, a link is on its way (valid 15 minutes).', 200);
    }
    if (locked) return adminGate(url, 'Too many wrong passwords. Try again in 24 hours.', 429);
    const pass = String(form?.get('password') || '');
    const ok = same(await sign(env, `pw|${pass}`), await sign(env, `pw|${env.ADMIN_PASS}`));
    try {
      await env.DB.prepare('INSERT INTO deck_access (deck, email, granted, country, ua) VALUES (?, ?, ?, ?, ?)')
        .bind(name || 'list', null, ok ? 1 : 0, request.cf?.country || null, (request.headers.get('user-agent') || '').slice(0, 200)).run();
    } catch (e) { console.log('admin store failed', String(e).slice(0, 200)); }
    if (!ok) {
      const fails = (lock && Number(lock.until) <= Date.now() && Number(lock.fails) >= 3 ? 0 : Number(lock?.fails || 0)) + 1;
      const until = fails >= 3 ? Date.now() + 864e5 : 0;
      try { await env.DB.prepare('INSERT INTO deck_lock (ip, fails, until) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET fails = excluded.fails, until = excluded.until').bind(ip, fails, until).run(); } catch (e) {}
      await new Promise((r) => setTimeout(r, 800));
      return adminGate(url, fails >= 3 ? 'Too many wrong passwords. Try again in 24 hours.' : `Wrong password. ${3 - fails} ${3 - fails === 1 ? 'try' : 'tries'} left.`, 403);
    }
    try { await env.DB.prepare('DELETE FROM deck_lock WHERE ip = ?').bind(ip).run(); } catch (e) {}
    return grant(url.pathname);
  }
  const tok = cookieOf(request, 'decks');
  if (tok) {
    const [exp, sig] = tok.split('.');
    if (Number(exp) > Date.now() && sig && same(sig, await sign(env, `admin|${exp}|${env.ADMIN_PASS}`))) {
      if (name === 'answers') return answersPage(env);
      if (name === 'scientists') return scientistsPage(env);
      const f = FILES[name];
      const r = await env.ASSETS.fetch(f && /^\/decks\/[^/]+\/?$/.test(url.pathname) ? new Request(new URL(f, url), request) : request);
      const h = new Headers(r.headers); h.set('cache-control', 'private, no-store'); h.set('x-robots-tag', 'noindex');
      if (r.ok && (h.get('content-type') || '').includes('text/html')) return withBar(await r.text(), h, url);
      return new Response(r.body, { status: r.status, headers: h });
    }
  }
  return adminGate(url, locked ? 'Too many wrong passwords. Try again in 24 hours.' : '', 200);
}

// ---- every internal /decks page carries the site's top bar (share links never do). A page with its own bar (the decks
// list) gets the current one swapped in; a full-screen deck opens in a frame under the bar, so its layout is untouched.
const BAR = '<header class="site"><div class="bar"><nav class="wrap"><a class="logo" href="/"><img src="/site/mark.svg" alt="">K14</a>'
  + '<div class="tabs"><a href="/apps/">Apps</a><a href="/tech/">Tech</a><a href="/decks/" class="on" data-decks>Decks</a></div>'
  + '<a data-cta href="/contact/">Contact</a></nav></div></header>';
const GEIST = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap';
function withBar(html, h, url) {
  h.delete('content-length'); h.delete('etag');
  html = html.replace(/(<title>[^<]*?)97A/i, '$1K14');
  if (/^\/decks\/(bio)?progress(\/|$)/.test(url.pathname))   // progress pages stay light even when the OS is in dark mode
    html = html.replace(/<html([^>]*)>/i, (m, a) => /data-theme/.test(a) ? m.replace(/data-theme="[^"]*"/, 'data-theme="light"') : `<html${a} data-theme="light">`);
  if (url.searchParams.has('k14frame'))   // inside the frame: links to other pages open in the top window; slide hash shows in its URL
    return new Response(html.replace(/<\/body>/i, `<script>document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');`
      + `if(!a||a.target)return;const u=new URL(a.href,location.href);if(u.origin===location.origin&&u.pathname!==location.pathname){e.preventDefault();`
      + `top.location.href=u.pathname+u.search+u.hash}},true);let h0=location.hash;setInterval(()=>{if(location.hash!==h0){h0=location.hash;try{top.history.replaceState(null,'',h0||' ')}catch(e){}}},300)</script></body>`),
      { status: 200, headers: h });
  if (/<header class="site">/.test(html))
    return new Response(html.replace(/<header class="site">[\s\S]*?<\/header>/, BAR)
      .replace(/https:\/\/fonts\.googleapis\.com\/css2\?family=Space\+Grotesk[^"]*/g, GEIST)
      .replace(/<\/head>/i, '<link rel="icon" href="/site/favicon.svg"><script type="module" src="/site/auth.js"></script></head>'), { status: 200, headers: h });
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [0, 'Decks'])[1];
  const src = url.pathname + (url.search ? url.search + '&' : '?') + 'k14frame=1';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title><link rel="icon" href="/site/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${GEIST}" rel="stylesheet">
<link rel="stylesheet" href="/site/frame.css"><script type="module" src="/site/auth.js"></script>
<style>html,body{height:100%;overflow:hidden}#f{position:fixed;left:0;top:57px;width:100%;height:calc(100% - 57px);border:0;display:block;background:#fff}</style></head>
<body>${BAR}<iframe id="f" title="${title.replace(/"/g, '&quot;')}" allow="fullscreen; clipboard-write"></iframe>
<script>const f=document.getElementById('f');f.src=${JSON.stringify(src)}+location.hash;f.addEventListener('load',()=>{f.focus();try{document.title=f.contentDocument.title}catch(e){}});</script>
</body></html>`, { status: 200, headers: h });
}

function adminGate(url, err, status) {
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Decks · K14</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site/frame.css"><script type="module" src="/site/auth.js"></script>
<style>main{min-height:calc(100vh - 121px);display:flex;align-items:center}
.g{max-width:420px;margin:0 auto;padding:48px 16px;display:flex;flex-direction:column;gap:22px}
h1{margin:0;font-weight:600;font-size:34px;letter-spacing:-.03em;line-height:1.05}
form{display:flex;flex-direction:column;gap:12px}
label{font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
input{font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--sep);border-radius:8px;color:var(--ink)}
input:focus-visible,button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
button{font:inherit;font-weight:500;font-size:16px;padding:12px 14px;border:0;border-radius:8px;background:var(--bg);color:var(--txt);cursor:pointer}
.err{color:#C4271B;font-size:14px}</style></head><body>
<header class="site"><div class="bar"><nav class="wrap"><a class="logo" href="/"><img src="/site/mark.svg" alt="">K14</a><div class="tabs"><a href="/apps/">Apps</a><a href="/tech/">Tech</a></div><a data-cta href="/contact/">Contact</a></nav></div></header>
<main data-gate><div class="g"><h1>Decks</h1>
<form method="post" action="${esc(url.pathname)}"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
${err ? `<span class="err" role="alert">${esc(err)}</span>` : ''}<button type="submit">Open</button></form>
<form method="post" action="${esc(url.pathname)}"><label for="em">Or sign in by email</label><input id="em" name="email" type="email" autocomplete="email" required><button type="submit">Send sign-in link</button></form></div></main>
<footer class="site"><div class="wrap"><span class="logo"><img src="/site/mark.svg" alt="">K14</span><span>© 2026</span></div></footer></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}


// ---- share links: the owner (deck cookie) asks for /api/share {deck}; anyone with the /share/<name>-<5 chars> link
// sees that one deck after giving an email. Emails go to D1 (share_views) and Supabase public.events (insert-only key).
async function ownerOK(request, env) {
  const tok = cookieOf(request, 'decks'); if (!tok || !env.ADMIN_PASS || !env.DECK_SECRET) return false;
  const [exp, sig] = tok.split('.');
  return Number(exp) > Date.now() && !!sig && same(sig, await sign(env, `admin|${exp}|${env.ADMIN_PASS}`));
}
async function shareCreate(request, env, url) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  if (!(await ownerOK(request, env))) return json({ ok: false }, 403);
  let b = {}; try { b = await request.json(); } catch {}
  const deckPath = String(b.deck || '').replace(/^\/+|\/+$/g, '');
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(deckPath) || !PRIVATE.includes(deckPath.split('/')[0])) return json({ ok: false, error: 'deck' }, 400);
  const short = deckPath.split('/').pop().slice(0, 16);
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789'; const rnd = crypto.getRandomValues(new Uint8Array(5));
  const id = `${short}-${[...rnd].map((x) => abc[x % abc.length]).join('')}`;
  await env.DB.prepare('INSERT INTO share_links (id, deck, created) VALUES (?, ?, ?)').bind(id, deckPath, Date.now()).run();
  return json({ ok: true, url: `${url.origin}/share/${id}` });
}
async function shareView(request, env, url) {
  const parts = url.pathname.split('/'); const id = parts[2] || ''; const rest = parts.slice(3).join('/');
  if (!/^[a-z0-9-]{3,30}$/.test(id) || !env.DECK_SECRET) return new Response('Not found', { status: 404 });
  const row = await env.DB.prepare('SELECT deck FROM share_links WHERE id = ?').bind(id).first().catch(() => null);
  if (!row) return new Response('Not found', { status: 404 });
  const ck = `sh_${id.replace(/-/g, '_')}`;
  if (request.method === 'POST' && rest !== '_t') {
    const form = await request.formData().catch(() => null);
    const email = String(form?.get('email') || '').trim().toLowerCase().slice(0, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return shareGate(url, id, 'Enter a valid email.', 400);
    const country = request.cf?.country || null, ua = (request.headers.get('user-agent') || '').slice(0, 200);
    try { await env.DB.prepare('INSERT INTO share_views (share, deck, email, country, ua, ts) VALUES (?, ?, ?, ?, ?, ?)').bind(id, row.deck, email, country, ua, Date.now()).run(); } catch (e) { console.log('share store failed', String(e).slice(0, 200)); }
    try {
      await fetch(`${SB.url}/rest/v1/events`, { method: 'POST', headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify([{ ts: new Date().toISOString(), session: `share-${id}`, event: 'share_open', path: `/share/${id}`, view: 'share', referer: url.href,
          props: { share: id, deck: row.deck, email, country } }]) });
    } catch (e) { console.log('supabase share log failed', String(e).slice(0, 200)); }
    const token = `${b64u(enc.encode(email))}.${await sign(env, `share|${id}|${email}`)}`;
    return new Response(null, { status: 303, headers: { location: `/share/${id}/`, 'set-cookie': `${ck}=${token}; Path=/share/${id}; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` } });
  }
  const tok = cookieOf(request, ck); let ok = false;
  if (tok) { const [e64, sig] = tok.split('.'); let email = ''; try { email = atob(e64.replace(/-/g, '+').replace(/_/g, '/')); } catch {}
    ok = !!email && !!sig && same(sig, await sign(env, `share|${id}|${email}`)); }
  if (!ok) return shareGate(url, id, '', 200);
  if (rest === '_t' && request.method === 'POST') {   // time on each page, sent by the shared deck
    let b = {}; try { b = await request.json(); } catch {}
    const email = atob(tok.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'));
    const page = Math.max(0, Math.min(99, Number(b.page) || 0)), sec = Math.max(0, Math.min(7200, Math.round(Number(b.sec) || 0)));
    if (sec >= 1) {
      try { await env.DB.prepare('INSERT INTO share_time (share, deck, email, page, title, sec, ts) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, row.deck, email, page, String(b.title || '').slice(0, 120), sec, Date.now()).run(); } catch (e) {}
      try { await fetch(`${SB.url}/rest/v1/events`, { method: 'POST', headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify([{ ts: new Date().toISOString(), session: `share-${id}`, event: 'share_page_time', path: `/share/${id}`, view: 'share', referer: url.href, props: { share: id, deck: row.deck, email, page, title: String(b.title || '').slice(0, 120), seconds: sec } }]) }); } catch (e) {}
    }
    return new Response(null, { status: 204 });
  }
  const base = `/decks/${row.deck}/`;
  const file = rest ? base + rest : (FILES[row.deck] || base);
  const r = await env.ASSETS.fetch(new Request(new URL(file, url), request));
  const h = new Headers(r.headers); h.set('cache-control', 'private, no-store'); h.set('x-robots-tag', 'noindex');
  if (rest || !(h.get('content-type') || '').includes('text/html')) return new Response(r.body, { status: r.status, headers: h });
  let html = await r.text();
  html = html.replace(/<head>/i, `<head><base href="/share/${id}/">`)
    .replace(/<\/body>/i, `<style>.alldecks,#fsb,#fbx,.u-links a,.u-sh{display:none!important}</style><script>document.querySelectorAll('a[href]').forEach(a=>{const s=document.createElement('span');s.innerHTML=a.innerHTML;s.className=a.className;a.replaceWith(s)});document.querySelectorAll('.alldecks').forEach(n=>n.remove());</script><script>(()=>{const S=[...document.querySelectorAll('.slide')];let cur=-1,t0=Date.now();const send=()=>{if(cur<0)return;const sec=(Date.now()-t0)/1000;const s=S[cur];const ti=(s.querySelector('h2')||{}).textContent||'';navigator.sendBeacon(location.pathname.replace(/\\/?$/,'/')+'_t',new Blob([JSON.stringify({page:cur+1,sec,title:ti})],{type:'application/json'}));};const tick=()=>{const i=S.findIndex(s=>s.classList.contains('on'));if(i!==cur){send();cur=i;t0=Date.now();}};new MutationObserver(tick).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});tick();addEventListener('visibilitychange',()=>{if(document.hidden){send();t0=Date.now();}else t0=Date.now();});addEventListener('pagehide',send);})();</script></body>`);
  h.delete('content-length');
  return new Response(html, { status: r.status, headers: h });
}
function shareGate(url, id, err, status) {
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Shared deck</title>
<style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F4F3EF;color:#181818;display:flex;min-height:100vh;align-items:center;justify-content:center}
.g{max-width:380px;width:100%;padding:24px;display:flex;flex-direction:column;gap:16px}h1{margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em}p{margin:0;color:#5B6170}
form{display:flex;flex-direction:column;gap:10px}input{font:inherit;font-size:16px;padding:12px 14px;border:1px solid #D5DAE2;border-radius:8px}
button{font:inherit;font-size:16px;padding:12px;border:0;border-radius:8px;background:#181818;color:#fff;cursor:pointer}.err{color:#C4271B;font-size:14px}</style></head>
<body><div class="g"><h1>Shared deck</h1><p>Enter your email to open it.</p><form method="post" action="/share/${esc(id)}/"><input name="email" type="email" autocomplete="email" placeholder="you@company.com" required autofocus>
${err ? `<span class="err" role="alert">${esc(err)}</span>` : ''}<button type="submit">Open deck</button></form></div></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
