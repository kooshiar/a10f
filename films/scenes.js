// Render config, kept apart from the simulation data: change any of this and re-render, no recompute.
// nums(S) returns the live readings for one frame: [label, value, unit]. prep(S) runs once after load.
const dist = (p, i, j) => Math.hypot(p[3*i] - p[3*j], p[3*i+1] - p[3*j+1], p[3*i+2] - p[3*j+2]);

window.SCENES = {
  sn2: {
    size:'5 Å', style:'ballstick', hw:'CPU', stepLabel:'DFT force calls',
    colors:{ C:'#c9ccd1', H:'#6a6e76', Cl:'#1baf7a', Br:'#e87ba4' },
    view:{ rx:-12, ry:18, drift:10 }, labels:[{ atoms:[5], text:'Cl' }, { atoms:[1], text:'Br' }],
    // NVE run: potential energy change = minus kinetic energy change, from finite-difference velocities
    prep(S){
      const M = { C:12.011, H:1.008, Cl:35.45, Br:79.904 }, m = S.els.map(e => M[e]), ke = new Float64Array(S.nF);
      for (let f = 0; f < S.nF; f++){
        const a = Math.max(0, f - 1), b = Math.min(S.nF - 1, f + 1), dt = (S.T[b] - S.T[a]) * 1000;
        for (let i = 0; i < S.nA; i++) for (let d = 0; d < 3; d++){ const v = (S.P[(b*S.nA+i)*3+d] - S.P[(a*S.nA+i)*3+d]) / dt; ke[f] += .5 * m[i] * v * v; }
      }
      S.pe = Array.from(ke, k => (ke[0] - k) * 103.6427 * 23.0605);
    },
    nums(S){ const e = S.lerp(S.pe);
      return [['C–Cl distance', dist(S.pos, 0, 5).toFixed(2), 'Å'], ['C–Br distance', dist(S.pos, 0, 1).toFixed(2), 'Å'],
              ['Energy vs start', (e >= 0 ? '+' : '−') + Math.abs(e).toFixed(1), 'kcal/mol']]; }
  },
  salt: {
    size:'10 Å', style:'salt', hw:'GPU',
    colors:{ Na:'#2a78d6', Cl:'#1baf7a', O:'#eb6834', H:'#6a6e76' },
    view:{ rx:-15, ry:25, drift:14, frameElems:['Na','Cl'] },
    prep(S){ S.ions = S.els.map((e, i) => e === 'Na' || e === 'Cl' ? i : -1).filter(i => i >= 0); S.p0 = S.positionsAt(0); },
    nums(S){
      const p = S.pos, ion = S.meta.free_ion, opp = S.els[ion] === 'Cl' ? 'Na' : 'Cl';
      let near = 1e9; for (const j of S.ions) if (S.els[j] === opp) near = Math.min(near, dist(p, ion, j));
      const moved = Math.hypot(p[3*ion] - S.p0[3*ion], p[3*ion+1] - S.p0[3*ion+1], p[3*ion+2] - S.p0[3*ion+2]);
      return [['Cl⁻ to nearest Na⁺', near.toFixed(1), 'Å'], ['Cl⁻ travel', moved.toFixed(1), 'Å']];
    }
  },
  niti: {
    size:'20 Å', style:'spheres', hw:'GPU',
    colors:{ Ni:'#2a78d6', Ti:'#eb6834' },
    view:{ rx:-90, ry:0, drift:0, ortho:true }, smooth:12, sphere:.36,
    // temperature from finite-difference velocities; lattice angle from an affine fit of the averaged lattice to frame 0
    prep(S){
      const m = S.els.map(e => e === 'Ni' ? 58.69 : 47.87), M = m.reduce((a, b) => a + b), T = new Float64Array(S.nF);
      for (let f = 0; f < S.nF; f++){
        const a = Math.max(0, f - 1), b = Math.min(S.nF - 1, f + 1), dt = (S.T[b] - S.T[a]) * 1000, v = new Float64Array(S.nA * 3), c = [0, 0, 0];
        for (let i = 0; i < S.nA; i++) for (let d = 0; d < 3; d++){ v[3*i+d] = (S.P[(b*S.nA+i)*3+d] - S.P[(a*S.nA+i)*3+d]) / dt; c[d] += m[i] * v[3*i+d] / M; }
        let ke = 0; for (let i = 0; i < S.nA; i++) for (let d = 0; d < 3; d++) ke += .5 * m[i] * (v[3*i+d] - c[d]) ** 2;
        T[f] = 2 * ke * 103.6427 / (3 * S.nA * 8.617e-5);
      }
      S.temp = Array.from(T, (_, f) => { let s = 0, n = 0; for (let k = Math.max(0, f - 15); k <= Math.min(S.nF - 1, f + 15); k++){ s += T[k]; n++; } return s / n; });
      S.X0 = S.center(S.positionsAt(0));
    },
    nums(S){
      const X = S.center(S.pos), X0 = S.X0, G = [[0,0,0],[0,0,0],[0,0,0]], B = [[0,0,0],[0,0,0],[0,0,0]];
      for (let i = 0; i < S.nA; i++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++){ G[r][c] += X0[3*i+r] * X0[3*i+c]; B[r][c] += X0[3*i+r] * X[3*i+c]; }
      const A = S.solve3(G, B), u = A[0], w = A[2];
      const ang = Math.acos((u[0]*w[0] + u[1]*w[1] + u[2]*w[2]) / Math.hypot(...u) / Math.hypot(...w)) * 180 / Math.PI;
      return [['Temperature', Math.round(S.lerp(S.temp) / 5) * 5, 'K'], ['Lattice angle', ang.toFixed(1), '°']];
    }
  },
  crack: {
    size:'40 Å', style:'tagged', hw:'CPU',
    tagColors:[ [11, '#5f636b'], [9, '#eda100'], [0, '#eb6834'] ],
    parts:[ { t1:4.0 }, { t0:4.0, t1:8.0 }, { t0:8.0 } ],
    view:{ rx:0, ry:0, drift:4 },
    // crack growth: bonds across the notch plane, ahead of the notch, that have stretched past 3.2 Å
    prep(S){
      let y0 = 1e9, y1 = -1e9, x0 = 1e9;
      for (let i = 0; i < S.nA; i++){ x0 = Math.min(x0, S.P[3*i]); y0 = Math.min(y0, S.P[3*i+1]); y1 = Math.max(y1, S.P[3*i+1]); }
      S.top = [], S.bot = []; for (let i = 0; i < S.nA; i++){ const y = S.P[3*i+1]; if (y > y1 - 4) S.top.push(i); if (y < y0 + 4) S.bot.push(i); }
      S.span = p => { let a = 0, b = 0; for (const i of S.top) a += p[3*i+1]; for (const i of S.bot) b += p[3*i+1]; return a / S.top.length - b / S.bot.length; };
      S.h0 = S.span(S.P);
      const ym = (y0 + y1) / 2, face = []; for (let i = 0; i < S.nA; i++) if (S.tags[i] < 12 && Math.abs(S.P[3*i+1] - ym) < 6 && S.P[3*i] > x0 + 3) face.push(S.P[3*i+1]);
      const plane = face.reduce((a, b) => a + b, 0) / face.length, up = [], dn = [];
      for (let i = 0; i < S.nA; i++){ const d = S.P[3*i+1] - plane; if (d > 0 && d < 3) up.push(i); if (d < 0 && d > -3) dn.push(i); }
      S.pairs = []; for (const i of up) for (const j of dn) if (dist(S.P, i, j) < 3.0) S.pairs.push([i, j, (S.P[3*i] + S.P[3*j]) / 2]);
      S.notch = Math.min(...S.pairs.map(q => q[2]));
    },
    nums(S){
      const p = S.pos, o = S.fi * S.nA; let lost = 0, tip = S.notch;
      for (let i = 0; i < S.nA; i++){ const l = S.tags[i] - S.tags[o + i]; if (l > 0) lost += l; }
      for (const [i, j, x] of S.pairs) if (x > tip && dist(p, i, j) > 3.2) tip = x;
      return [['Strain', ((S.span(p) / S.h0 - 1) * 100).toFixed(1), '%'], ['Bonds broken', Math.round(lost / 2).toLocaleString(), ''], ['Crack growth', (tip - S.notch).toFixed(0), 'Å']];
    }
  },
  bind: {
    size:'80 Å', style:'cartoon', hw:'GPU',
    chainColors:{ A:'#2a78d6', D:'#eb6834' },
    view:{ rx:-10, ry:0, drift:18 },
    extraTools:[{ id:'guide', label:'Contact springs', sub:'guided approach' }], extraAt:3, extraFire:[{ tool:'guide', t0:0, t1:150 }, { tool:'boltz', t0:0, t1:40 }],
    prep(S){ const ca = S.tmpl.map((l, i) => l.slice(12, 16).trim() === 'CA' ? i : -1).filter(i => i >= 0);
      S.A = ca.filter(i => S.tmpl[i][21] === 'A'); S.D = ca.filter(i => S.tmpl[i][21] === 'D'); },
    nums(S){
      const p = S.pos, c = idx => { const r = [0, 0, 0]; for (const i of idx) for (let d = 0; d < 3; d++) r[d] += p[3*i+d] / idx.length; return r; };
      const a = c(S.A), b = c(S.D); let gap = 1e9, n = 0;
      for (const i of S.A) for (const j of S.D){ const d = dist(p, i, j); if (d < gap) gap = d; if (d < 8) n++; }
      return [['Centre to centre', Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]).toFixed(1), 'Å'], ['Closest residues', gap.toFixed(1), 'Å'], ['Residue contacts', n, '']];
    }
  }
};
