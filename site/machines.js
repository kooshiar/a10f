// Shared renderer for the seven machines. Each design page passes its own colours.
//   Machines.mount(el, 'atp', { base:'#111', accent:'#ff3b1f', second:'#2440ff', light:'#c9ccd3' }, { spin:.4 })
(function(){
  const LIST = [                    // ordered by size; size = largest extent of the built structure
    { id:'rotor',       size:10,  name:'Light-driven rotor',  kind:'Small molecule',   industry:'Smart materials',    input:'Light → rotor turns' },
    { id:'niti',        size:17,  name:'Shape-memory alloy',  kind:'Alloy',            industry:'Medical devices',    input:'Heat → lattice shears' },
    { id:'electrolyte', size:19,  name:'Solid electrolyte',   kind:'Crystal',          industry:'Batteries',          input:'Voltage → Li⁺ hops' },
    { id:'mof',         size:32,  name:'Breathing MOF',       kind:'Porous framework', industry:'Carbon capture',     input:'CO₂ in → pores swell' },
    { id:'lce',         size:56,  name:'Artificial muscle',   kind:'Polymer',          industry:'Soft robotics',      input:'Heat → chains contract' },
    { id:'dna',         size:110, name:'DNA tweezers',        kind:'DNA',              industry:'Diagnostics',        input:'Fuel strand → arms close' },
    { id:'atp',         size:220, name:'ATP synthase',        kind:'Protein',          industry:'Drugs, cell energy', input:'Proton flow → shaft turns' },
  ];
  // part index -> colour role, per machine (order matches part_names in the data)
  const ROLES = {
    rotor:['base','accent'], electrolyte:['base','light','accent'], niti:['base','accent'],
    mof:['base','second','light','accent'], lce:['base','accent','light'], dna:['accent','base','second'],
    atp:['base','second','light','accent'],
  };
  const VIEW = {                     // initial orientation, degrees
    rotor:{ x:-20, y:30 }, electrolyte:{ x:-12, y:14 }, niti:{ x:-90, y:0 }, mof:{ x:-8, y:12 },
    lce:{ x:-14, y:-22 }, dna:{ x:-12, y:0 }, atp:{ x:0, y:20 },
  };
  const cache = {};
  const load = id => cache[id] || (cache[id] = fetch(`data/${id}.json`).then(r => r.json()));

  function build(viewer, d, pal, frame){
    viewer.removeAllModels();
    const role = ROLES[d.id], col = i => pal[role[d.parts[i]]] || pal.base;
    if (d.template && d.id === 'atp'){
      const m = viewer.addModel(d.template, 'pdb');
      m.setStyle({}, {});
      const by = {}; m.selectedAtoms({ atom:'CA' }).forEach(a => { const c = col(a.serial - 1); (by[c] = by[c] || []).push(a.serial); });
      for (const [c, idx] of Object.entries(by)) m.setStyle({ serial:idx }, { sphere:{ radius:3.1, color:c } });
      return m;
    }
    if (d.template){
      const m = viewer.addModel(d.template, 'pdb');
      m.setStyle({}, { cartoon:{ colorfunc:a => col(a.serial - 1), thickness:d.id === 'dna' ? .6 : .5, arrows:false, opacity:1 } });
      if (d.id === 'dna') m.setStyle({}, { cartoon:{ colorfunc:a => col(a.serial - 1), ribbon:false, thickness:.8 } });
      return m;
    }
    const F = d.frames[frame || 0], n = d.n, atoms = [];
    const bl = d.bonds ? Array.from({ length:n }, () => [[], []]) : null;
    if (bl) for (const [a, b, o] of d.bonds){ bl[a][0].push(b); bl[a][1].push(o); bl[b][0].push(a); bl[b][1].push(o); }
    for (let i = 0; i < n; i++) atoms.push({ elem:d.elements[i], x:F[3*i], y:F[3*i+1], z:F[3*i+2], serial:i, bonds:bl ? bl[i][0] : [], bondOrder:bl ? bl[i][1] : [] });
    const m = viewer.addModel(); m.addAtoms(atoms);
    const S = {
      rotor:      i => ({ sphere:{ scale:d.elements[i] === 'H' ? .2 : .3, color:d.elements[i] === 'H' ? pal.light : col(i) }, stick:{ radius:.13, color:d.elements[i] === 'H' ? pal.light : col(i) } }),
      electrolyte:i => d.parts[i] === 0 ? (d.elements[i] === 'S' ? { sphere:{ scale:.22, color:col(i) } } : {}) : { sphere:{ scale:d.parts[i] === 2 ? .3 : .4, color:col(i) } },
      niti:       i => ({ sphere:{ scale:.38, color:col(i) } }),
      mof:        i => ({ sphere:{ scale:d.parts[i] === 3 ? .5 : d.elements[i] === 'Cr' ? .38 : .18, color:col(i) }, stick:{ radius:d.parts[i] === 3 ? .3 : .14, color:col(i) } }),
      lce:        i => ({ stick:{ radius:d.parts[i] === 1 ? .26 : .16, color:col(i) } }),
    }[d.id];
    // group atoms by identical style to keep setStyle calls few
    const groups = new Map();
    for (let i = 0; i < n; i++){ const s = S(i), k = JSON.stringify(s); if (!groups.has(k)) groups.set(k, [s, []]); groups.get(k)[1].push(i); }
    for (const [, [s, idx]] of groups) m.setStyle({ serial:idx }, s);
    if (d.id === 'electrolyte') tetrahedra(viewer, d, F, pal.base);
    return m;
  }

  // PS4 tetrahedra as flat-shaded solids: four faces per P from its four S neighbours
  function tetrahedra(viewer, d, F, color){
    const nb = {}; for (const [a, b] of d.bonds){ const [p, q] = d.elements[a] === 'P' ? [a, b] : [b, a]; (nb[p] = nb[p] || []).push(q); }
    const V = [], N = [], Fc = [], P = i => [F[3*i], F[3*i+1], F[3*i+2]];
    for (const [p, s] of Object.entries(nb)){
      if (s.length !== 4) continue;
      const c = P(+p);
      for (const [a, b, e] of [[0,1,2],[0,1,3],[0,2,3],[1,2,3]]){
        const A = P(s[a]), B = P(s[b]), C = P(s[e]);
        let n = [(B[1]-A[1])*(C[2]-A[2]) - (B[2]-A[2])*(C[1]-A[1]), (B[2]-A[2])*(C[0]-A[0]) - (B[0]-A[0])*(C[2]-A[2]), (B[0]-A[0])*(C[1]-A[1]) - (B[1]-A[1])*(C[0]-A[0])];
        const mid = [(A[0]+B[0]+C[0])/3 - c[0], (A[1]+B[1]+C[1])/3 - c[1], (A[2]+B[2]+C[2])/3 - c[2]];
        if (n[0]*mid[0] + n[1]*mid[1] + n[2]*mid[2] < 0) n = n.map(x => -x);
        const L = Math.hypot(...n); n = n.map(x => x / L);
        const k = V.length; for (const X of [A, B, C]){ V.push({ x:X[0], y:X[1], z:X[2] }); N.push({ x:n[0], y:n[1], z:n[2] }); }
        Fc.push(k, k + 1, k + 2);
      }
    }
    viewer.addCustom({ vertexArr:V, normalArr:N, faceArr:Fc, color, opacity:1 });
  }

  // one viewer that can show any machine; show() swaps the model, the loop spins and plays frames
  function create(el, opt = {}){
    const viewer = $3Dmol.createViewer(el, { backgroundColor:opt.bg || 'white', antialias:true, disableFog:true });
    viewer.setBackgroundColor(opt.bg || 'white', opt.bgAlpha ?? 0);
    if (opt.outline !== false) viewer.setViewStyle({ style:'outline', color:opt.outlineColor || '#000000', width:opt.outlineWidth || .02 });
    let cur = null, run = true, f = 0, last = 0;
    const h = {
      viewer,
      async show(id, pal){
        const d = await load(id), v = VIEW[id];
        viewer.clear(); cur = { d, pal }; f = 0;
        build(viewer, d, pal, 0);
        viewer.zoomTo(); viewer.rotate(v.x, 'x'); viewer.rotate(v.y, 'y');
        viewer.zoom(opt.zoom || .95); viewer.render();
        return d;
      },
      resize(){ viewer.resize(); viewer.render(); },
      destroy(){ run = false; const c = el.querySelector('canvas'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl')); gl && gl.getExtension('WEBGL_lose_context')?.loseContext(); el.innerHTML = ''; },
    };
    const tick = t => {
      if (!run) return;
      if (cur){
        const { d, pal } = cur;
        if (d.frames.length > 1 && t - last > 70){ last = t; f = (f + 1) % (2 * d.frames.length - 2); const k = f < d.frames.length ? f : 2 * d.frames.length - 2 - f;
          const view = viewer.getView(); build(viewer, d, pal, k); viewer.setView(view); }
        if (opt.spin !== 0) viewer.rotate(opt.spin ?? .25, 'y');
        viewer.render();
      }
      requestAnimationFrame(tick);
    };
    if (!opt.still) requestAnimationFrame(tick);
    return h;
  }
  async function mount(el, id, pal, opt = {}){ const h = create(el, opt); await h.show(id, pal); return h; }

  window.Machines = { LIST, ROLES, create, mount, load };
})();
