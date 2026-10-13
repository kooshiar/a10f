// 97a.io on Cloudflare: static files from ./dist, "/" -> the homepage, POST /api/contact -> saved in D1, then emailed.
// The destination address lives only in the CONTACT_TO secret (wrangler secret put CONTACT_TO), never in the page or repo.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.97a.io') return Response.redirect(`https://97a.io${url.pathname}${url.search}`, 301);
    if (url.pathname === '/api/contact') return contact(request, env);
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

// ---- gated decks: /decks/<name> asks for an email; only emails matching the deck's rule get in. Every entry is saved in D1.
// The deck file sits in the assets but every /decks/* path runs through here first, so it is never served without the cookie.
const DECKS = { dsc: { file: '/decks/dsc/deck', rule: /jacob/i, title: 'Data Center Construction', hint: 'Use your Jacobs email.' } };
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
  if (!d || !env.DECK_SECRET) return new Response('Not found', { status: 404 });
  const ck = `deck_${name}`;
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const email = String(form?.get('email') || '').trim().toLowerCase().slice(0, 200);
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const ok = valid && d.rule.test(email);
    try {
      await env.DB.prepare('INSERT INTO deck_access (deck, email, granted, country, ua) VALUES (?, ?, ?, ?, ?)')
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
