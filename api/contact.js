// Contact form -> email. The address lives only in the CONTACT_TO env var on Vercel, never in the page or the repo.
// Delivery goes through FormSubmit's AJAX endpoint; the first message makes FormSubmit send a one-time activation email.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const name = String(b.name || '').trim().slice(0, 200);
  const linkedin = String(b.linkedin || '').trim().slice(0, 300);
  const message = String(b.message || '').trim().slice(0, 5000);
  if (b.website) return res.status(200).json({ ok: true });                       // honeypot: bots fill every field
  if (!name || !message) return res.status(400).json({ ok: false, error: 'missing' });
  if (linkedin && !/^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(linkedin)) return res.status(400).json({ ok: false, error: 'linkedin' });
  const to = process.env.CONTACT_TO;
  if (!to) return res.status(500).json({ ok: false, error: 'not configured' });
  const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://a10f.vercel.app', Referer: 'https://a10f.vercel.app/contact' },
    body: JSON.stringify({ name, linkedin: linkedin || '-', message, _subject: `A10 contact: ${name}`, _template: 'table', _captcha: 'false' }),
  });
  const out = await r.json().catch(() => ({}));
  return res.status(r.ok ? 200 : 502).json({ ok: r.ok && String(out.success) !== 'false' });
}
