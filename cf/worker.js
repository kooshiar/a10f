// 97a.io on Cloudflare: static files from ./dist, "/" -> the homepage, POST /api/contact -> saved in D1, then emailed.
// The destination address lives only in the CONTACT_TO secret (wrangler secret put CONTACT_TO), never in the page or repo.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.97a.io') return Response.redirect(`https://97a.io${url.pathname}${url.search}`, 301);
    if (url.pathname === '/api/contact') return contact(request, env);
    if (url.pathname === '/api/join') return join(request, env);
    if (url.pathname === '/api/lab') return lab(request, env);
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
    body: JSON.stringify({ name, linkedin: linkedin || '-', message, _subject: `97A contact: ${name}`, _template: 'table', _captcha: 'false' }),
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
    await env.DB.prepare('INSERT INTO founders (name, email, linkedin, roles, problems, built, hours, city, nda, country, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(name, email, str(b.linkedin, 300) || null, list(b.roles, 12), list(b.problems, 20), list(b.built, 3), str(b.hours, 40) || null, str(b.city, 200) || null,
            b.nda ? 1 : 0, request.cf?.country || null, (request.headers.get('user-agent') || '').slice(0, 200)).run();
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
<title>Scientist answers · 97A</title><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
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
<td>${esc(arr(r.roles).join(', '))}</td><td>${esc(arr(r.problems).join(', '))}</td><td>${arr(r.built).map(esc).join('<br>')}</td><td>${esc(r.hours || '')}</td><td>${r.nda ? '✓' : ''}</td><td>${esc((r.created || '').slice(0, 10))}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Founder answers · 97A</title><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>body{margin:0;background:#F4F5F7;font-family:"Space Grotesk",system-ui,sans-serif;color:#0E0F12}.w{max-width:1200px;margin:0 auto;padding:40px 16px}
h1{font-weight:600;font-size:30px;letter-spacing:-.03em;margin:0 0 28px}.c{background:#fff;border:1px solid #D5DAE2;border-radius:10px;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid #E4E6EB}
th{font:500 11px/1 "JetBrains Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:#7A808C}td span{display:block;color:#7A808C;font-size:12px;margin-top:3px}
a{color:#0057FF;text-decoration:none}a:hover{text-decoration:underline}.bk{font:500 13px "JetBrains Mono",monospace;color:#454A55}</style></head>
<body><div class="w"><a class="bk" href="/decks">← All decks</a><h1 style="margin-top:20px">Founder answers · ${results.length}</h1><div class="c"><table><tr><th>Name</th><th>Roles</th><th>Problems</th><th>Built</th><th>Hours/wk</th><th>NDA</th><th>Date</th></tr>${rows}</table></div></div></body></html>`;
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
  const d = DECKS[name];
  if (!d) return privateDecks(request, env, url, name);
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
<meta name="robots" content="noindex"><title>${esc(d.title)} · 97A</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site/frame.css">
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
<header class="site"><div class="bar"><nav class="wrap"><a class="logo" href="/">97A</a><div class="tabs"><a href="/apps/">Applications</a><a href="/technology/">Technology</a></div><a data-cta href="/contact/">Contact</a></nav></div></header>
<main><div class="g"><h1>${esc(d.title)}</h1><p>Enter your work email to open this deck.</p>
<form method="post" action="${esc(url.pathname)}"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required autofocus>
${err ? `<span class="err" role="alert">${esc(err)}</span>` : ''}<button type="submit">Open deck</button></form></div></main>
<footer class="site"><div class="wrap"><span>97A</span><span>© 2026</span></div></footer></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

// ---- /decks (the list) and the private decks below it: one password (ADMIN_PASS secret). No secret set = 404,
// so a deploy can never expose them. The files sit in ./dist/decks but every /decks path runs through the worker first.
const PRIVATE = ['opportunities', 'sales', 'tech', 'customers', 'investors', 'amd', 'progress', 'founders', 'answers', 'scientists'];
const same = (a, b) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
async function privateDecks(request, env, url, name) {
  if ((name && !PRIVATE.includes(name)) || !env.ADMIN_PASS || !env.DECK_SECRET) return new Response('Not found', { status: 404 });
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const pass = String(form?.get('password') || '');
    const ok = same(await sign(env, `pw|${pass}`), await sign(env, `pw|${env.ADMIN_PASS}`));
    try {
      await env.DB.prepare('INSERT INTO deck_access (deck, email, granted, country, ua) VALUES (?, ?, ?, ?, ?)')
        .bind(name || 'list', null, ok ? 1 : 0, request.cf?.country || null, (request.headers.get('user-agent') || '').slice(0, 200)).run();
    } catch (e) { console.log('admin store failed', String(e).slice(0, 200)); }
    if (!ok) { await new Promise((r) => setTimeout(r, 800)); return adminGate(url, 'Wrong password.', 403); }
    const exp = Date.now() + 30 * 864e5;
    const token = `${exp}.${await sign(env, `admin|${exp}|${env.ADMIN_PASS}`)}`;
    return new Response(null, { status: 303, headers: { location: url.pathname,
      'set-cookie': `decks=${token}; Path=/decks; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` } });
  }
  const tok = cookieOf(request, 'decks');
  if (tok) {
    const [exp, sig] = tok.split('.');
    if (Number(exp) > Date.now() && sig && same(sig, await sign(env, `admin|${exp}|${env.ADMIN_PASS}`))) {
      if (name === 'answers') return answersPage(env);
      if (name === 'scientists') return scientistsPage(env);
      const r = await env.ASSETS.fetch(request);
      const h = new Headers(r.headers); h.set('cache-control', 'private, no-store'); h.set('x-robots-tag', 'noindex');
      return new Response(r.body, { status: r.status, headers: h });
    }
  }
  return adminGate(url, '', 200);
}

function adminGate(url, err, status) {
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Decks · 97A</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site/frame.css">
<style>main{min-height:calc(100vh - 121px);display:flex;align-items:center}
.g{max-width:420px;margin:0 auto;padding:48px 16px;display:flex;flex-direction:column;gap:22px}
h1{margin:0;font-weight:600;font-size:34px;letter-spacing:-.03em;line-height:1.05}
form{display:flex;flex-direction:column;gap:12px}
label{font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
input{font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--sep);border-radius:8px;color:var(--ink)}
input:focus-visible,button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
button{font:inherit;font-weight:500;font-size:16px;padding:12px 14px;border:0;border-radius:8px;background:var(--bg);color:var(--txt);cursor:pointer}
.err{color:#C4271B;font-size:14px}</style></head><body>
<header class="site"><div class="bar"><nav class="wrap"><a class="logo" href="/">97A</a><div class="tabs"><a href="/apps/">Applications</a><a href="/technology/">Technology</a></div><a data-cta href="/contact/">Contact</a></nav></div></header>
<main><div class="g"><h1>Decks</h1>
<form method="post" action="${esc(url.pathname)}"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
${err ? `<span class="err" role="alert">${esc(err)}</span>` : ''}<button type="submit">Open</button></form></div></main>
<footer class="site"><div class="wrap"><span>97A</span><span>© 2026</span></div></footer></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
