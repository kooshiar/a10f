// 97a.io on Cloudflare: static files from ./dist, "/" -> the homepage, POST /api/contact -> email.
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
  if (!env.CONTACT_TO) return json({ ok: false, error: 'not configured' }, 500);
  const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(env.CONTACT_TO)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://97a.io', Referer: 'https://97a.io/contact' },
    body: JSON.stringify({ name, linkedin: linkedin || '-', message, _subject: `A10 contact: ${name}`, _template: 'table', _captcha: 'false' }),
  });
  const out = await r.json().catch(() => ({}));
  return json({ ok: r.ok && String(out.success) !== 'false' }, r.ok ? 200 : 502);
}
