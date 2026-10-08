// Render config for the seven machine films. One palette for every film: saturated colours that hold up on white,
// no greys. Elements keep the same colour everywhere; orange is reserved for what we apply (light, force, voltage, torque).
window.STAGE_PALETTE = {
  navy:'#18206F', cobalt:'#2F5BFF', sky:'#1FB6FF', teal:'#00A889', saffron:'#FFB300',
  orange:'#FF6B1A', red:'#EE2B47', magenta:'#E3127F', violet:'#7B3FF2',
};
(function(){
  const P = window.STAGE_PALETTE;
  P.input = P.orange;
  const EL = { C:P.navy, H:P.sky, N:P.cobalt, O:P.red, S:P.saffron, P:P.violet, Cl:P.teal, Br:P.magenta, Li:P.magenta, Cr:P.violet, Ni:P.cobalt, Ti:P.saffron };
  const el = e => EL[e] || P.navy;
  const ballstick = (i, c, e) => ({ sphere:{ scale:e === 'H' ? .2 : .3, color:c }, stick:{ radius:.13, color:c } });
  const arrow = (x1, y1, x2, y2, col, w = 5) => {
    const a = Math.atan2(y2 - y1, x2 - x1), h = 16;
    return `<line x1="${x1}" y1="${y1}" x2="${x2 - Math.cos(a) * h * .8}" y2="${y2 - Math.sin(a) * h * .8}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>` +
      `<path d="M${x2},${y2} L${x2 - h * Math.cos(a - .45)},${y2 - h * Math.sin(a - .45)} L${x2 - h * Math.cos(a + .45)},${y2 - h * Math.sin(a + .45)} Z" fill="${col}"/>`;
  };
  const unit = (x, y) => { const L = Math.hypot(x, y) || 1; return [x / L, y / L]; };

  window.STAGE = {
    rotor: {
      style:'ballstick', atomStyle:ballstick, view:{ rx:-20, ry:30 }, drift:14,
      // elements as everywhere, except the rotor half's carbons in magenta so the turning part reads
      color(i, t, S){ const e = S.atoms.elements[i]; return e === 'C' && S.atoms.parts[i] === 1 ? P.magenta : el(e); },
      // light: rings spreading from the central C=C bond
      glyph(inp, pos, t, S, g){
        const d = S.meta.dihedral_atoms, [x, y] = g.screenOf(g.cen(pos, [d[1], d[2]]));
        const age = (t - inp.t0) / (inp.t1 - inp.t0 + .25);
        return [0, .33, .66].map(o => { const k = (age + o) % 1; return `<circle cx="${x}" cy="${y}" r="${30 + 160 * k}" fill="none" stroke="${P.input}" stroke-width="${5 * (1 - k)}" opacity="${1 - k}"/>`; }).join('');
      },
      prep(S){ S.meta.inputs[0].t1 = S.meta.inputs[0].t0 + .25; },
    },
    polymer: {
      style:'ballstick', view:{ rx:0, ry:0 }, drift:10,
      // chain by element; the mechanophore is teal while closed and turns magenta once the C-O bond opens (the colour change is the sensor)
      color(i, t, S){ const e = S.atoms.elements[i]; if (!S.atoms.parts[i] || e === 'H') return el(e);
        return S.lerp(S.meta.co_distance, t) > 2.2 ? P.magenta : P.teal; },
      atomStyle:ballstick,
      glyph(inp, pos, t, S, g){
        const [a, b] = S.meta.ends, A = g.screenOf(g.cen(pos, [a])), B = g.screenOf(g.cen(pos, [b]));
        const [ux, uy] = unit(B[0] - A[0], B[1] - A[1]), L = 90, o = 18;
        return arrow(A[0] - ux * o, A[1] - uy * o, A[0] - ux * (o + L), A[1] - uy * (o + L), P.input) + arrow(B[0] + ux * o, B[1] + uy * o, B[0] + ux * (o + L), B[1] + uy * (o + L), P.input);
      },
    },
    niti: {
      src:'../films/data/niti/', style:'spheres', color:(i, t, S) => el(S.atoms.elements[i]), smooth:12, ortho:true, view:{ rx:-90, ry:0 }, drift:0,
      partsFrom:a => a.elements.map(e => e === 'Ni' ? 1 : 0),
      atomStyle:(i, c) => ({ sphere:{ scale:.36, color:c } }),
      parts:[{ name:'Hot · square lattice' }, { name:'Cooled · lattice shears into a new shape' }, { name:'Heated · snaps back to square' }],
      clock:(t, S) => { const k = (S.meta.temps || []).find(r => t >= r.t0 - 1e-9 && t <= r.t1 + 1e-9); return 't = ' + t.toFixed(1) + ' ps' + (k ? ` · ${k.K} K` : ''); },
    },
    electrolyte: {
      style:'electrolyte', view:{ rx:-12, ry:14 }, drift:10, color:(i, t, S) => el(S.atoms.elements[i]),
      atomStyle:(i, c, e, p) => p === 0 ? (e === 'S' ? { sphere:{ scale:.24, color:c } } : {}) : { sphere:{ scale:p === 2 ? .27 : .34, color:c } },
      extra(viewer, pos, t, S){ tetra(viewer, S, pos); },
      prep(S){
        const els = S.atoms.elements, n = S.nA, F = S.nF, L = S.meta.cell[0];
        S.li = els.map((e, i) => e === 'Li' ? i : -1).filter(i => i >= 0);
        // trails for the six Li that travel furthest (before wrapping)
        const dist = i => Math.abs(S.P[((F - 1) * n + i) * 3] - S.P[i * 3]);
        S.movers = [...S.li].sort((a, b) => dist(b) - dist(a)).slice(0, 6);
        // the crystal is periodic: Li that drift out one face come back in the other
        for (let f = 0; f < F; f++) for (const i of S.li) for (let k = 0; k < 3; k++){ const q = (f * n + i) * 3 + k; S.P[q] -= Math.floor(S.P[q] / L) * L; }
        S.nb = {}; for (const [a, b] of S.atoms.bonds){ const [p, q] = els[a] === 'P' ? [a, b] : [b, a]; (S.nb[p] = S.nb[p] || []).push(q); }
      },
      trails(t, S, g){
        if (t < 6) return '';
        let out = '';
        for (const i of S.movers){
          let seg = [], prev = null;
          const flush = () => { if (seg.length > 1) out += `<polyline points="${seg.map(p => p.join(',')).join(' ')}" fill="none" stroke="${P.magenta}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity=".7"/>`; seg = []; };
          for (let k = 0; k <= 30; k++){ const tt = Math.max(0, t - 5 + 5 * k / 30), p = g.positionsAt(tt), q = g.screenOf([p[3*i], p[3*i+1], p[3*i+2]]);
            if (prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 120) flush();
            seg.push(q); prev = q; }
          flush();
        }
        return out;
      },
      glyph(inp, pos, t, S, g){
        if (inp.kind !== 'field') return '';
        const o = g.screenOf([0, 0, 0]), x = g.screenOf([10, 0, 0]), [ux, uy] = unit(x[0] - o[0], x[1] - o[1]);
        const cx = innerWidth / 2, cy = innerHeight - 150, L = 220;
        return arrow(cx - ux * L / 2, cy - uy * L / 2, cx + ux * L / 2, cy + uy * L / 2, P.input, 6) +
          `<text x="${cx + ux * L / 2 + 16}" y="${cy + uy * L / 2 + 8}" font-family="JetBrains Mono" font-size="22" fill="${P.input}">voltage</text>`;
      },
      clock:(t, S) => 't = ' + t.toFixed(1) + ' ps' + (t < 6 ? ' · 300 K' : t < 26 ? ' · 650 K' : ''),
    },
    mof: {
      style:'mof', color(i, t, S){ const p = S.atoms.parts[i]; return p === 3 ? P.magenta : p === 4 ? P.teal : el(S.atoms.elements[i]); }, view:{ rx:-24, ry:0 }, drift:8,
      atomStyle:(i, c, e, p) => p === 3 ? { sphere:{ scale:.42, color:c }, stick:{ radius:.24, color:c } } : p === 4 ? { sphere:{ scale:e === 'X' ? 0 : .34, color:c }, stick:{ radius:.2, color:c } } :
        { sphere:{ scale:e === 'Cr' ? .26 : e === 'H' ? .08 : .1, color:c }, stick:{ radius:.08, color:c } },
      clock:(t, S) => { const k = S.frameAt(t)[0]; return `CO₂ inside ${S.meta.co2_inside[k]} · N₂ inside ${S.meta.n2_inside[k]}`; },
      // gas crosses the periodic boundary in z (the gas layers above and below are one layer): wrap each molecule by its centre
      prep(S){
        const Lz = S.meta.box[2], n = S.nA, nfw = S.atoms.parts.findIndex(p => p >= 3);
        for (let f = 0; f < S.nF; f++){ const o = f * n * 3;
          for (let i = nfw; i < n; i += 3){ const zc = S.P[o + 3*(i+2) + 2], sh = Math.floor(zc / Lz) * Lz; if (sh) for (let k = 0; k < 3; k++) S.P[o + 3*(i+k) + 2] -= sh; } }
        // tile 2 x 2 periodic images in x, y so the crystal reads as a block, then centre on the origin
        const [Lx, Ly] = S.meta.box, img = [[0, 0], [1, 0], [0, 1], [1, 1]], m = n * img.length, Q = new Float32Array(S.nF * m * 3);
        const c = [Lx, Ly, Lz];
        for (let f = 0; f < S.nF; f++) img.forEach(([a, b], k) => { for (let i = 0; i < n; i++){ const s = (f * n + i) * 3, d = (f * m + k * n + i) * 3;
          // channel axis z goes to screen-horizontal x
          Q[d] = S.P[s+2] - c[2] / 2; Q[d+1] = S.P[s+1] + b * Ly - c[1]; Q[d+2] = -(S.P[s] + a * Lx - c[0]); } });
        const A = S.atoms, rep = arr => img.flatMap(() => arr);
        const atoms = { ...A, elements:rep(A.elements), parts:rep(A.parts), n_atoms:m,
          bonds:img.flatMap((_, k) => A.bonds.map(([a, b, o]) => [a + k * n, b + k * n, o])) };
        return { P:Q, nA:m, atoms };
      },
    },
    dna: {
      style:'dna', color:(i, t, S) => [P.navy, P.teal, P.magenta][S.atoms.parts[i]], view:{ rx:-10, ry:0 }, drift:12,
      atomStyle:(i, c, e) => e === 'P' ? { sphere:{ radius:2.6, color:c }, stick:{ radius:1.1, color:c } } : { sphere:{ radius:2.0, color:c }, stick:{ radius:1.1, color:c } },
      clock:t => 't = ' + (t * 1000 >= 1000 ? (t).toFixed(2) + ' µs' : (t * 1000).toFixed(0) + ' ns'),
    },
    atp: {
      style:'ca', radius:3.1, view:{ rx:-18, ry:0 }, drift:10,
      // c-ring subunits alternate dark and light blue so the turning reads
      prep(S){ const ring = 'IJLMNOPQRS'; S.chain = S.atoms.template.split('\n').map(l => l[21]); S.stripe = S.chain.map(c => ring.indexOf(c) % 2 === 1); },
      color(i, t, S){ const p = S.atoms.parts[i]; return p === 3 ? (S.stripe[i] ? P.sky : P.cobalt) : [P.navy, P.teal, P.violet][p]; },
      clock:(t, S) => 'rotor ' + Math.round(Math.abs(S.lerp(S.meta.rotor_deg, t))) + '°',
      // proton flow: curved arrow around the c-ring, in the turning direction
      glyph(inp, pos, t, S, g){
        const R = 62, pts = [];
        for (let k = 0; k <= 40; k++){ const a = -.6 + k / 40 * 4.6; pts.push(g.screenOf([R * Math.cos(a), -2, R * Math.sin(a)])); }
        const [a2, b2] = [pts[pts.length - 2], pts[pts.length - 1]];
        return `<polyline points="${pts.slice(0, -1).map(p => p.join(',')).join(' ')}" fill="none" stroke="${P.input}" stroke-width="6" stroke-linecap="round"/>` + arrow(a2[0], a2[1], b2[0] + (b2[0] - a2[0]) * 2, b2[1] + (b2[1] - a2[1]) * 2, P.input, 6);
      },
    },
  };

  // PS4 tetrahedra as flat solids, drawn from the current positions
  function tetra(viewer, S, F){
    const V = [], N = [], Fc = [], at = i => [F[3*i], F[3*i+1], F[3*i+2]];
    for (const [p, s] of Object.entries(S.nb)){
      if (s.length !== 4) continue;
      const c = at(+p);
      for (const [a, b, e] of [[0,1,2],[0,1,3],[0,2,3],[1,2,3]]){
        const A = at(s[a]), B = at(s[b]), C = at(s[e]);
        let n = [(B[1]-A[1])*(C[2]-A[2]) - (B[2]-A[2])*(C[1]-A[1]), (B[2]-A[2])*(C[0]-A[0]) - (B[0]-A[0])*(C[2]-A[2]), (B[0]-A[0])*(C[1]-A[1]) - (B[1]-A[1])*(C[0]-A[0])];
        const mid = [(A[0]+B[0]+C[0])/3 - c[0], (A[1]+B[1]+C[1])/3 - c[1], (A[2]+B[2]+C[2])/3 - c[2]];
        if (n[0]*mid[0] + n[1]*mid[1] + n[2]*mid[2] < 0) n = n.map(x => -x);
        const L = Math.hypot(...n); n = n.map(x => x / L);
        const k = V.length; for (const X of [A, B, C]){ V.push({ x:X[0], y:X[1], z:X[2] }); N.push({ x:n[0], y:n[1], z:n[2] }); }
        Fc.push(k, k + 1, k + 2);
      }
    }
    viewer.addCustom({ vertexArr:V, normalArr:N, faceArr:Fc, color:P.violet, opacity:1 });
  }
})();
