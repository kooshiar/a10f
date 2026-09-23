// Coordinate generators for the four boxes on deck page 1. Pure math, no 3Dmol, testable in node.
(function (root) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => mul(a, 1 / (len(a) || 1));
  const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const c01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  const rng = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
  const centroid = ps => { const c = [0, 0, 0]; ps.forEach(p => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); return mul(c, 1 / ps.length); };
  const randUnit = r => { let v; do { v = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]; } while (len(v) > 1 || len(v) < .1); return unit(v); };
  function rotate(p, c, axis, ang){                     // Rodrigues, about an axis through c
    const k = unit(axis), v = sub(p, c), co = Math.cos(ang), s = Math.sin(ang), kv = cross(k, v), kd = dot(k, v) * (1 - co);
    return [c[0] + v[0] * co + kv[0] * s + k[0] * kd, c[1] + v[1] * co + kv[1] * s + k[1] * kd, c[2] + v[2] * co + kv[2] * s + k[2] * kd];
  }
  function angle(a, b, c){ return Math.acos(Math.max(-1, Math.min(1, dot(unit(sub(a, b)), unit(sub(c, b)))))); }
  function dihedral(p0, p1, p2, p3){
    const b0 = sub(p0, p1), b1 = unit(sub(p2, p1)), b2 = sub(p3, p2);
    const v = sub(b0, mul(b1, dot(b0, b1))), w = sub(b2, mul(b1, dot(b2, b1)));
    return Math.atan2(dot(cross(b1, v), w), dot(v, w));
  }
  function place(A, B, C, bond, theta, tau){            // NeRF: next point from three previous, bond, angle at C, dihedral A-B-C-D
    const bc = unit(sub(C, B)), n = unit(cross(sub(B, A), bc)), m = cross(n, bc);
    const d = [-bond * Math.cos(theta), bond * Math.sin(theta) * Math.cos(tau), bond * Math.sin(theta) * Math.sin(tau)];
    return add(C, add(add(mul(bc, d[0]), mul(m, d[1])), mul(n, d[2])));
  }
  function fitter(ref, mob){                            // optimal superposition of mob onto ref (Horn quaternion)
    const cR = centroid(ref), cM = centroid(mob), S = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < ref.length; i++){ const a = sub(mob[i], cM), b = sub(ref[i], cR); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += a[r] * b[c]; }
    const K = [
      [S[0][0]+S[1][1]+S[2][2], S[1][2]-S[2][1], S[2][0]-S[0][2], S[0][1]-S[1][0]],
      [S[1][2]-S[2][1], S[0][0]-S[1][1]-S[2][2], S[0][1]+S[1][0], S[2][0]+S[0][2]],
      [S[2][0]-S[0][2], S[0][1]+S[1][0], -S[0][0]+S[1][1]-S[2][2], S[1][2]+S[2][1]],
      [S[0][1]-S[1][0], S[2][0]+S[0][2], S[1][2]+S[2][1], -S[0][0]-S[1][1]+S[2][2]]];
    let s = 0; K.forEach(r => r.forEach(x => s = Math.max(s, Math.abs(x))));
    let q = [1, 0, 0, 0];
    for (let it = 0; it < 200; it++){
      const w = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) w[i] += (K[i][j] + (i === j ? 4 * s : 0)) * q[j];
      const n = Math.hypot(...w); if (!n) break; q = w.map(x => x / n);
    }
    const [a, b, c, d] = q;
    const M = [[1-2*(c*c+d*d), 2*(b*c-a*d), 2*(b*d+a*c)], [2*(b*c+a*d), 1-2*(b*b+d*d), 2*(c*d-a*b)], [2*(b*d-a*c), 2*(c*d+a*b), 1-2*(b*b+c*c)]];
    return p => { const v = sub(p, cM); return [M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2]+cR[0], M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2]+cR[1], M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]+cR[2]]; };
  }
  const xyz = (p, i) => p.map(x => x.toFixed(3).padStart(8)).join('');
  const pdbLines = (tmpl, pos) => tmpl.map((l, i) => l.slice(0, 30) + xyz(pos[i]) + l.slice(54)).join('\n');

  /* ---------------- 1: B2 NiAl, ~100 atoms, gas → crystal (grows from the centre) → gas ---------------- */
  function alloy(){
    const a = 2.887, sites = [], els = [];
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) for (let k = 0; k <= 3; k++){ sites.push([i * a, j * a, k * a]); els.push('Ni'); }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++){ sites.push([(i + .5) * a, (j + .5) * a, (k + .5) * a]); els.push('Al'); }
    const L = 12, c = 1.5 * a, o = [c - L / 2, c - L / 2, c - L / 2], r = rng(29);
    const gas = sites.map(() => [0, 1, 2].map(k => o[k] + 1 + r() * (L - 2)));
    const ph = sites.map(() => [r() * 6.3, r() * 6.3, r() * 6.3, r() * 6.3]);
    const order = sites.map((p, i) => [len(sub(p, [c, c, c])) + r() * .6, i]).sort((x, y) => x[0] - y[0]);
    const rank = []; order.forEach(([, i], n) => rank[i] = n / (sites.length - 1));
    const drift = (i, t) => [0, 1, 2].map(k => Math.sin(t * .9 + ph[i][k]) * 1.1 + Math.sin(t * 2.3 + ph[i][3] + k) * .35);
    function frame(T, t){
      return sites.map((s, i) => {
        const g = add(gas[i], drift(i, t)), vib = [0, 1, 2].map(k => Math.sin(t * 9 + ph[i][k] * 3) * .05);
        const cap = 2.5 + 6 * rank[i], rel = 14.5 + 4 * (1 - rank[i]);
        const f = T < cap ? 0 : T < rel ? ease((T - cap) / .7) : 1 - ease((T - rel) / .9);
        return [els[i], ...add(mix(g, s, f), mul(vib, f))];
      });
    }
    return { L, origin:o, frame };
  }

  /* ---------------- 2: MOF-5 cage, ~1k atoms, CO2 diffusing in, binding at the zinc clusters, leaving ---------------- */
  function mof(){
    const a2 = 12.92, fw = [], nodes = [];
    const T4 = [[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]].map(v => mul(v, 1.12));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++){
      const n = [i * a2, j * a2, k * a2]; nodes.push(n);
      fw.push(['O', ...n]); T4.forEach(v => fw.push(['Zn', ...add(n, v)]));
    }
    const axes = [[1,0,0],[0,1,0],[0,0,1]], perps = [[0,1,0],[0,0,1],[1,0,0]];
    for (let ax = 0; ax < 3; ax++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++){
      const idx = [i, j, k]; if (idx[ax] === 2) continue;
      const A = [i * a2, j * a2, k * a2], e = axes[ax], p = perps[ax], at = s => add(A, mul(e, s));
      const put = (el, s, off) => fw.push([el, ...add(at(s), mul(p, off))]);
      const mid = a2 / 2;
      [[3.58, 2.95], [a2 - 3.58, a2 - 2.95]].forEach(([cC, cO]) => { put('C', cC, 0); put('O', cO, 1.10); put('O', cO, -1.10); });
      put('C', mid - 1.39, 0); put('C', mid + 1.39, 0);
      [-1, 1].forEach(sx => [-1, 1].forEach(sy => { put('C', mid + sx * .695, sy * 1.204); put('H', mid + sx * 1.24, sy * 2.15); }));
    }
    const L = 32, c = a2, o = [c - L / 2, c - L / 2, c - L / 2], r = rng(71);
    const pores = []; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) pores.push([(i + .5) * a2, (j + .5) * a2, (k + .5) * a2]);
    const N = 14, mols = [];
    for (let m = 0; m < N; m++){
      const P = pores[m % 8], corners = nodes.filter(n => Math.abs(n[0] - P[0]) < 7 && Math.abs(n[1] - P[1]) < 7 && Math.abs(n[2] - P[2]) < 7);
      const node = corners[Math.floor(m / 8 * 4 + r() * 4) % corners.length], site = mix(node, P, .36);
      const face = Math.floor(r() * 3), out = [0, 1, 2].map(k => o[k] + 3 + r() * (L - 6)); out[face] = r() < .5 ? o[face] - 7 : o[face] + L + 7;
      mols.push({ P, site, out, d:randUnit(r), ax:randUnit(r), ph:r() * 6.3, te:.3 + 6 * m / N, tl:12.3 + 4 * m / N });
    }
    function frame(T, t){
      const atoms = [];
      for (const m of mols){
        let pos, free;
        if (T < m.te){ pos = m.out; free = 1; }
        else if (T < m.te + 2.6){ pos = mix(m.out, m.P, ease((T - m.te) / 2.6)); free = 1; }
        else if (T < m.te + 3.4){ const f = ease((T - m.te - 2.6) / .8); pos = mix(m.P, m.site, f); free = 1 - f; }
        else if (T < m.tl){ pos = m.site; free = 0; }
        else if (T < m.tl + .8){ const f = ease((T - m.tl) / .8); pos = mix(m.site, m.P, f); free = f; }
        else if (T < m.tl + 3.4){ pos = mix(m.P, m.out, ease((T - m.tl - .8) / 2.6)); free = 1; }
        else { pos = m.out; free = 1; }
        const jig = [0, 1, 2].map(k => Math.sin(t * 1.7 + m.ph + k * 2) * .9 * free + Math.sin(t * 11 + m.ph * 3 + k) * .05);
        const p = add(pos, jig), d = mul(rotate(m.d, [0, 0, 0], m.ax, t * 2.2 * free + m.ph), 1.16);
        atoms.push(['O', ...sub(p, d)], ['C', ...p], ['O', ...add(p, d)]);
      }
      return atoms;
    }
    return { L, origin:o, framework:fw, frame };
  }

  /* ---------------- 3: ubiquitin, a floppy chain folding into its structure (torsion-space path), breathing, unfolding ---------------- */
  function fold(pdb, SEED = 2, THU = 105, PTURN = .2){
    const models = []; let cur = null; const ss = [];
    for (const l of pdb.split('\n')){
      if (l.startsWith('MODEL')) cur = [];
      else if (l.startsWith('ENDMDL')){ if (cur) models.push(cur); cur = null; }
      else if (l.startsWith('ATOM') && cur && ['N', 'CA', 'C', 'O'].includes(l.slice(12, 16).trim())) cur.push(l);
      else if (l.startsWith('HELIX')) ss.push([+l.slice(21, 25), +l.slice(33, 37)]);
      else if (l.startsWith('SHEET')) ss.push([+l.slice(22, 26), +l.slice(33, 37)]);
    }
    const tmpl = models[0], P = l => [+l.slice(30, 38), +l.slice(38, 46), +l.slice(46, 54)];
    const coords = models.map(m => m.map(P));
    const resSeq = tmpl.map(l => +l.slice(22, 26)), seqs = [...new Set(resSeq)], n = seqs.length;
    const ri = resSeq.map(s => seqs.indexOf(s)), ca0 = [];
    tmpl.forEach((l, i) => { if (l.slice(12, 16).trim() === 'CA') ca0[ri[i]] = coords[0][i]; });
    const b = [], thN = [], tuN = [];
    for (let r = 1; r < n; r++) b[r] = len(sub(ca0[r], ca0[r - 1]));
    for (let r = 2; r < n; r++) thN[r] = angle(ca0[r - 2], ca0[r - 1], ca0[r]);
    for (let r = 3; r < n; r++) tuN[r] = dihedral(ca0[r - 3], ca0[r - 2], ca0[r - 1], ca0[r]);
    const rr = rng(SEED), thU = [], tuU = [], dl = [], ph = [];
    const inSS = s => (ss.length ? ss : [[1,7],[10,17],[23,34],[40,45],[48,49],[56,59],[66,72]]).some(([x, y]) => s >= x && s <= y);
    for (let r = 0; r < n; r++){
      thU[r] = (THU + 16 * (rr() - .5)) * Math.PI / 180;
      tuU[r] = rr() < PTURN ? (50 + 50 * (rr() * 2 - 1)) * Math.PI / 180 : (rr() * 2 - 1) * Math.PI;
      dl[r] = inSS(seqs[r]) ? .02 + .12 * rr() : .22 + .16 * rr();
      ph[r] = [rr() * 6.3, rr() * 6.3, rr() * 6.3];
    }
    // backbone atoms ride on a frame made of three consecutive CA
    const frameAt = (ca, r) => { const q = Math.min(Math.max(r, 1), n - 2), o = ca[q], u = unit(sub(ca[q + 1], o)), v = unit(sub(ca[q - 1], o));
      const x = unit(add(u, v)), z = unit(cross(u, v)), y = cross(z, x); return [o, x, y, z]; };
    const local = tmpl.map((l, i) => { const [o, x, y, z] = frameAt(ca0, ri[i]), d = sub(coords[0][i], o); return [dot(d, x), dot(d, y), dot(d, z)]; });
    function chain(f, t){
      const ca = [ca0[0], ca0[1], ca0[2]];
      for (let r = 3; r < n; r++){
        const fr = ease(c01((f - dl[r]) / .62)), loose = 1 - fr;
        const th = thU[r] + (thN[r] - thU[r]) * fr + .07 * loose * Math.sin(t * 1.3 + ph[r][2]);
        const tu = tuU[r] + wrap(tuN[r] - tuU[r]) * fr + .22 * loose * (Math.sin(t * 1.1 + ph[r][0]) * .65 + Math.sin(t * .6 + ph[r][1]) * .35);
        ca.push(place(ca[r - 3], ca[r - 2], ca[r - 1], b[r], th, tu));
      }
      // keep the chain centred on the native centroid; no rotation fit, so the view never flips
      const shift = sub(centroid(ca0), centroid(ca)), F = [];
      const pos = tmpl.map((l, i) => { const r = ri[i]; if (!F[r]) F[r] = frameAt(ca, r); const [o, x, y, z] = F[r], p = local[i];
        return add(add(o, add(add(mul(x, p[0]), mul(y, p[1])), mul(z, p[2]))), shift); });
      return pos;
    }
    const seq = [0, 3, 6, 9, 0];
    function frame(T, t){
      let pos;
      if (T < 1.5) pos = chain(0, t);
      else if (T < 10) pos = chain((T - 1.5) / 8.5, t);
      else if (T < 14.4){ const u = (T - 10) / 1.1, k = Math.min(Math.floor(u), seq.length - 2), f = ease(u - k);
        pos = coords[seq[k]].map((p, i) => mix(p, coords[seq[k + 1]][i], f)); }
      else if (T < 19.6) pos = chain(1 - (T - 14.4) / 5.2, t);
      else pos = chain(0, t);
      return pdbLines(tmpl, pos);
    }
    const c = centroid(ca0), L = 64;
    return { L, origin:sub(c, [L / 2, L / 2, L / 2]), frame, _test:{ chain, ca0, n } };
  }

  /* ---------------- 4: antibody Fab and PD-1: search, dock, clamp, turn as one, release ---------------- */
  function bind(pdb){
    const lines = pdb.split('\n').filter(l => l.startsWith('ATOM') && ['N', 'CA', 'C', 'O'].includes(l.slice(12, 16).trim()));
    const P = l => [+l.slice(30, 38), +l.slice(38, 46), +l.slice(46, 54)];
    const byChain = {}; lines.forEach(l => (byChain[l[21]] = byChain[l[21]] || []).push(l));
    const pd1 = byChain['A'], pdP = pd1.map(P), cA = centroid(pdP);
    const fabIds = Object.keys(byChain).filter(c => c !== 'A' && c !== 'B')
      .map(c => [c, len(sub(centroid(byChain[c].map(P)), cA))]).sort((x, y) => x[1] - y[1]).slice(0, 2).map(x => x[0]);
    const fab = fabIds.flatMap(c => byChain[c]), fabP = fab.map(P), cF = centroid(fabP);
    const resIdx = ls => { const out = [], seen = {}; let chain = '', k = -1, last = '';
      ls.forEach(l => { const ch = l[21], rs = l.slice(22, 27); if (ch !== chain){ chain = ch; k = -1; last = ''; } if (rs !== last){ k++; last = rs; } out.push(k); }); return out; };
    const fRes = resIdx(fab), pRes = resIdx(pd1);
    const isV = fRes.map(k => k < 108), vP = fabP.filter((p, i) => isV[i]), cP = fabP.filter((p, i) => !isV[i]);
    const pivot = centroid(fabP.filter((p, i) => fRes[i] >= 103 && fRes[i] <= 114));
    const dir = unit(sub(cA, cF)), longAx = unit(sub(centroid(vP), centroid(cP)));
    let elbow = cross(longAx, dir); if (len(elbow) < .2) elbow = cross(longAx, [0, 0, 1]); elbow = unit(elbow);
    const r = rng(53), tumble = randUnit(r), side = unit(cross(dir, tumble));
    const wF = fabP.map(p => { const d = len(sub(p, cA)); return Math.exp(-(d * d) / (2 * 12 * 12)); });
    const wP = pdP.map(p => Math.pow(c01(len(sub(p, cA)) / 16), 1.5));
    const ruF = {}, ruP = {}, key = (ls, i) => ls[i].slice(21, 27);
    fab.forEach((l, i) => { const k = key(fab, i); if (!ruF[k]) ruF[k] = [randUnit(r), r() * 6.3]; });
    pd1.forEach((l, i) => { const k = key(pd1, i); if (!ruP[k]) ruP[k] = [randUnit(r), r() * 6.3]; });
    const cc = centroid([...fabP, ...pdP]), far = 24, up = [0, 1, 0];
    function frame(T, t){
      const dock = T < 5 ? ease(T / 5) : T < 14 ? 1 : T < 17 ? 1 - ease((T - 14) / 3) : 0;
      const lock = T < 4 ? 0 : T < 5.4 ? ease((T - 4) / 1.4) : T < 14 ? 1 : T < 15 ? 1 - ease(T - 14) : 0;
      const spin = T >= 6 && T < 14 ? 2 * Math.PI * ease((T - 6) / 8) : 0;
      const elbowAng = .24 * Math.sin(t * .8) * (1 - lock);
      const fabOut = fabP.map((p, i) => {
        let q = isV[i] ? rotate(p, pivot, elbow, elbowAng) : p;
        const [u, ph] = ruF[key(fab, i)], amp = wF[i] * (1.8 * (1 - lock) + .25) * (Math.sin(t * 1.4 + ph) * .7 + Math.sin(t * .6 + ph * 2) * .3);
        q = add(q, mul(u, amp));
        return spin ? rotate(q, cc, up, spin) : q;
      });
      const tumbleAng = (1 - dock) * 2.6 + .15 * Math.sin(t * .7) * (1 - dock);
      const shift = add(mul(dir, far * (1 - dock)), mul(side, 9 * Math.sin(Math.PI * dock) * (1 - dock * .3)));
      const pdOut = pdP.map((p, i) => {
        const [u, ph] = ruP[key(pd1, i)], amp = wP[i] * (1.4 * (1 - lock) + .2) * Math.sin(t * 1.2 + ph);
        let q = add(rotate(add(p, mul(u, amp)), cA, tumble, tumbleAng), shift);
        return spin ? rotate(q, cc, up, spin) : q;
      });
      return { fab:pdbLines(fab, fabOut), pd1:pdbLines(pd1, pdOut), _fab:fabOut, _pd:pdOut };
    }
    const L = 130;
    return { L, origin:sub(cc, [L / 2, L / 2, L / 2]), frame };
  }

  const Scenes = { alloy, mof, fold, bind, CYCLE:20 };
  if (typeof module !== 'undefined') module.exports = Scenes; else root.Scenes = Scenes;
})(typeof window !== 'undefined' ? window : globalThis);
