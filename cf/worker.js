// 97a.io on Cloudflare: static files from ./dist, "/" -> the homepage, POST /api/contact -> saved in D1, then emailed.
// The destination address lives only in the CONTACT_TO secret (wrangler secret put CONTACT_TO), never in the page or repo.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.97a.io') return Response.redirect(`https://97a.io${url.pathname}${url.search}`, 301);
    if (url.pathname === '/api/contact') return contact(request, env);
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
