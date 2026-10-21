// Sign in with Google (Supabase auth, same project as the other sites). A small icon sits next to Contact.
// The worker checks the signed-in account (/api/session); the owner gets a Decks tab and the deck cookie.
// supabase-js loads only when someone signs in or already has a session, so plain visits stay light.
const SB = { url: 'https://mrmazotdgcmnrigzxkok.supabase.co', key: 'sb_publishable_yI8wFFTRjprK5MddelYlkQ_unHoGuEX' };
const STORE = 'sb-mrmazotdgcmnrigzxkok-auth-token', FLAG = 'k14_decks';
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.5c1.2-3.4 4-5 7.2-5s6 1.6 7.2 5"/></svg>';
const nav = document.querySelector('.bar nav'), cta = nav && nav.querySelector('[data-cta]');
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
             set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} } };

if (cta) {
  const who = document.createElement('button');
  who.type = 'button'; who.className = 'who'; who.setAttribute('aria-label', 'Sign in'); who.innerHTML = ICON;
  const menu = document.createElement('div');
  menu.className = 'whomenu'; menu.hidden = true;
  cta.after(who); who.after(menu);

  let sb = null;
  const client = async () => sb || (sb = (await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')).createClient(SB.url, SB.key));
  const decksTab = on => {
    let a = nav.querySelector('.tabs a[data-decks]');
    if (on && !a) {
      a = document.createElement('a'); a.href = '/decks/'; a.dataset.decks = ''; a.textContent = 'Decks';
      if (location.pathname.startsWith('/decks')) a.className = 'on';
      nav.querySelector('.tabs').append(a);
    }
    if (!on && a) a.remove();
  };
  const face = user => {
    const pic = user && user.user_metadata && user.user_metadata.avatar_url;
    who.innerHTML = pic ? `<img src="${pic}" alt="" referrerpolicy="no-referrer">` : ICON;
    who.classList.toggle('in', !!user);
    who.setAttribute('aria-label', user ? 'Account' : 'Sign in');
  };
  if (ls.get(FLAG)) decksTab(true);

  async function check() {
    const c = await client();
    const { data: { session } } = await c.auth.getSession();
    face(session && session.user);
    if (!session) { decksTab(false); ls.set(FLAG, null); return; }
    const r = await fetch('/api/session', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(x => x.json()).catch(() => ({}));
    decksTab(!!r.decks); ls.set(FLAG, r.decks ? '1' : null);
    if (r.decks && document.querySelector('[data-gate]')) location.reload();   // the deck password page: now open
  }
  if (ls.get(STORE) || /access_token=|[?&]code=/.test(location.href)) check();

  who.addEventListener('click', async () => {
    const c = await client();
    const { data: { session } } = await c.auth.getSession();
    if (!session) {
      await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
      return;
    }
    menu.innerHTML = `<span></span><button type="button">Sign out</button>`;
    menu.firstChild.textContent = session.user.email || '';
    menu.hidden = !menu.hidden;
    menu.lastChild.onclick = async () => {
      await c.auth.signOut();
      await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
      ls.set(FLAG, null); decksTab(false); face(null); menu.hidden = true;
      if (location.pathname.startsWith('/decks')) location.href = '/';
    };
  });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !who.contains(e.target)) menu.hidden = true; });
}
