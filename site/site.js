// Live cards: mount a spinning machine while the card is on screen, free the GPU context when it leaves.
function liveCards(sel, pal, opt = {}){
  const io = new IntersectionObserver(es => es.forEach(e => {
    const el = e.target, id = el.dataset.id;
    if (e.isIntersecting && !el._h){ el._h = Machines.create(el, { spin:opt.spin ?? .3, zoom:opt.zoom || .95 }); el._h.show(id, pal(id)); }
    if (!e.isIntersecting && el._h){ el._h.destroy(); el._h = null; }
  }), { rootMargin:'120px' });
  document.querySelectorAll(sel).forEach(el => io.observe(el));
  addEventListener('resize', () => document.querySelectorAll(sel).forEach(el => el._h && el._h.resize()));
}
const pad2 = i => String(i + 1).padStart(2, '0');
