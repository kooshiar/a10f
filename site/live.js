// Live 3D stage for the machine films: plays the saved trajectory, rotates with the mouse, labels follow the parts.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { COLORS } from './films.js';

const DUR = 20;
const mat = (hex) => new THREE.MeshPhysicalMaterial({ color:hex, roughness:.4, metalness:0, clearcoat:.3, clearcoatRoughness:.3,
  sheen:.12, sheenColor:new THREE.Color('#FFD9EA'), sheenRoughness:.7 });
const glow = (hex) => new THREE.MeshBasicMaterial({ color:hex, toneMapped:false });

export class Stage {
  constructor(host, overlay, opts = {}){
    this.host = host; this.ov = overlay; this.opts = opts;
    const R = this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:!!opts.capture });
    R.setPixelRatio(Math.min(devicePixelRatio, 2)); R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = .95;
    R.outputColorSpace = THREE.SRGBColorSpace; R.setClearColor(0x000000, 0);
    host.appendChild(R.domElement);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(R); this.scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; this.scene.environmentIntensity = .18;
    this.camera = new THREE.PerspectiveCamera(20, 1, .01, 5000); this.scene.add(this.camera);
    // lights ride with the camera so every angle gets the same look as the films
    const L = (c, i, p) => { const l = new THREE.DirectionalLight(c, i); l.position.set(...p); this.camera.add(l); l.target.position.set(0, 0, -1); this.camera.add(l.target); };
    L('#FFF1E6', 2.4, [-1.2, 1.0, .6]); L('#6F95FF', 2.6, [1.2, .5, -1.4]); L('#FFC9E2', .55, [1.0, -.5, .5]);
    this.scene.add(new THREE.HemisphereLight('#2E3A5C', '#0B0E16', .7));
    this.controls = new OrbitControls(this.camera, R.domElement);
    Object.assign(this.controls, { enableDamping:true, dampingFactor:.08, enableZoom:false, enablePan:false, rotateSpeed:.7 });
    this.controls.addEventListener('start', () => { this.touched = performance.now(); });
    this.composer = new EffectComposer(R);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (!opts.noAO){ this.ao = new GTAOPass(this.scene, this.camera, 10, 10); this.ao.updateGtaoMaterial({ radius:.25, distanceExponent:1, thickness:1, scale:1.2 }); this.composer.addPass(this.ao); }
    this.composer.addPass(new OutputPass());
    this.t0 = performance.now(); this.root = null;
    new ResizeObserver(() => this.resize()).observe(host); this.resize();
    const tick = () => { this.frame(); requestAnimationFrame(tick); }; if (!opts.capture) requestAnimationFrame(tick);
  }
  resize(){
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h); this.camera.aspect = w / h;
    if (this.ready && this.hull) this.frameCamera(false);
    this.camera.updateProjectionMatrix();
  }

  async load(film){
    this.ready = false; this.film = film; this.A = this.B = null; this.tetMesh = this.trails = this.boxLine = this.arrow = this.rotor = this.flow = null; this.sticks = []; this.balls = [];
    const base = `live/${film.id}/`, sc = this.sc = await fetch(base + 'scene.json').then(r => r.json());
    if (this.root){ this.scene.remove(this.root); this.root.traverse(o => { o.geometry?.dispose(); }); }
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.up = sc.up;
    if (film.style === 'surface') await this.buildSurface(base); else await this.buildBalls(base);
    this.frameCamera(true);
    this.t0 = performance.now(); this.ready = true; this.frame(true);
  }
  // data coords -> three (y up)
  v(x, y, z, out){ return this.up === 'z' ? out.set(x, z, -y) : out.set(x, y, z); }

  async buildBalls(base){
    const sc = this.sc, f = this.film, n = sc.n;
    const dyn = new Int16Array(await fetch(base + 'dyn.bin').then(r => r.arrayBuffer()));
    const sta = sc.static.length ? new Float32Array(await fetch(base + 'static.bin').then(r => r.arrayBuffer())) : null;
    this.dyn = dyn; this.nd = sc.dyn.length;
    this.P = new Float32Array(n * 3);                       // current positions, three coords
    if (sta) sc.static.forEach((a, k) => { const v = this.v(sta[3*k], sta[3*k+1], sta[3*k+2], new THREE.Vector3()); this.P.set([v.x, v.y, v.z], 3 * a); });
    this.gid = new Int32Array(n).fill(-1); const names = Object.keys(f.groups);
    names.forEach((g, k) => sc.groups[g].forEach(a => this.gid[a] = k));
    const sph = new THREE.SphereGeometry(1, 28, 20), cyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    this.balls = names.map((g, k) => { const idx = sc.groups[g]; const m = new THREE.InstancedMesh(sph, mat(COLORS[f.groups[g]]), idx.length);
      m.userData.idx = idx; this.root.add(m); return m; });
    // half bonds per group
    const halves = names.map(() => []);
    for (const [a, b] of sc.bonds){ if (this.gid[a] >= 0) halves[this.gid[a]].push([a, b]); if (this.gid[b] >= 0) halves[this.gid[b]].push([b, a]); }
    this.sticks = f.stick ? names.map((g, k) => { const m = new THREE.InstancedMesh(cyl, mat(COLORS[f.groups[g]]), Math.max(1, halves[k].length));
      m.userData.h = halves[k]; m.count = halves[k].length; this.root.add(m); return m; }) : [];
    if (f.tets){
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sc.tets.length * 12 * 3), 3));
      this.tetMesh = new THREE.Mesh(g, mat(COLORS.pearl)); this.root.add(this.tetMesh);
    }
    if (f.trails){
      this.trailMat = new LineMaterial({ color:COLORS.blue, linewidth:2.5, transparent:true, opacity:.75, worldUnits:false });
      this.trails = new LineSegments2(new LineSegmentsGeometry(), this.trailMat); this.root.add(this.trails);
    }
    if (f.box){
      this.boxLine = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)),
        new THREE.LineBasicMaterial({ color:'#E6E8EF', transparent:true, opacity:.55 }));
      this.root.add(this.boxLine);
    }
    if (f.arrow){
      const a = new THREE.Group(), m = glow(COLORS.orange);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 14, 16), m); shaft.rotation.z = -Math.PI / 2; a.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(1, 2.6, 20), m); head.rotation.z = -Math.PI / 2; head.position.x = 8; a.add(head);
      this.arrow = a; this.root.add(a);
    }
    // MOF: pick one CO2 that ends inside the crystal and one N2 that ends outside, for the callouts
    if (this.film.id === 'mof'){
      const last = this.posAt(sc.frames - 1, new Float32Array(n * 3)), xs = sc.groups.frame.map(a => last[3*a]);
      const lo = Math.min(...xs), hi = Math.max(...xs), cx = a => last[3*a];
      const co2 = sc.groups.co2.filter((a, i) => i % 3 === 2).find(a => cx(a) > lo + 4 && cx(a) < hi - 4 && last[3*a+1] > 0);
      const n2 = sc.groups.n2.filter((a, i) => i % 2 === 0).find(a => (cx(a) > hi + 8 || cx(a) < lo - 8) && Math.abs(last[3*a+1]) < 12);
      sc.anchors.co2 = [co2]; sc.anchors.n2 = [n2];
      this.film = { ...this.film, labels:[...this.film.labels, { at:'co2', text:['CO₂', 'trapped in a pore'] }, { at:'n2', text:['N₂', 'stays in the gas'] }] };
    }
    this.hull = this.ballHull();
  }
  posAt(k, out){                                            // frame k into out (three coords), static atoms too
    const sc = this.sc, o = k * this.nd * 3, t = new THREE.Vector3();
    if (out !== this.P) out.set(this.P);
    sc.dyn.forEach((a, j) => { this.v(this.dyn[o + 3*j] / 100, this.dyn[o + 3*j+1] / 100, this.dyn[o + 3*j+2] / 100, t); out[3*a] = t.x; out[3*a+1] = t.y; out[3*a+2] = t.z; });
    return out;
  }
  ballHull(){
    const b = new THREE.Box3(), p = new Float32Array(this.sc.n * 3), v = new THREE.Vector3();
    for (let k = 0; k < this.sc.frames; k += 15){ this.posAt(k, p); for (let i = 0; i < this.sc.n; i++) b.expandByPoint(v.set(p[3*i], p[3*i+1], p[3*i+2])); }
    return b.expandByScalar(Math.max(...this.sc.radius));
  }

  async buildSurface(base){
    const gltf = await new GLTFLoader().loadAsync(base + 'atp.glb'), sc = this.sc;
    const col = { stalk:'blue', ring_a:'blue', ring_b:'sky', alpha:'pearl', beta:'pink', stator:'lilac' };
    this.rotor = new THREE.Group(); this.rotor.matrixAutoUpdate = false; this.root.add(this.rotor);
    gltf.scene.traverse(o => { if (!o.isMesh) return; const name = o.name.replace(/\.\d+$/, '');
      const m = new THREE.Mesh(o.geometry, mat(COLORS[col[name] || 'pearl'])); (['stalk', 'ring_a', 'ring_b'].includes(name) ? this.rotor : this.root).add(m); });
    // proton flow: orange arc around the c-ring
    const R = sc.ring_radius, c = sc.ring_center, g = glow(COLORS.orange);
    this.flow = new THREE.Group(); this.flow.position.set(c[0], c[1], c[2]);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R, .075, 12, 140, 4.9), g); arc.rotation.x = Math.PI / 2; this.flow.add(arc);
    const head = new THREE.Mesh(new THREE.ConeGeometry(.28, .6, 20), g); const a = 4.9;
    head.position.set(R * Math.cos(a), 0, R * Math.sin(a));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))); this.flow.add(head);
    this.root.add(this.flow);
    this.hull = new THREE.Box3().setFromObject(this.root);
  }

  frameCamera(reset){
    const f = this.film.view, c = this.hull.getCenter(new THREE.Vector3()), s = this.hull.getSize(new THREE.Vector3());
    const ext = Math.max(s.x, s.y, s.z), vfov = THREE.MathUtils.degToRad(this.camera.fov), asp = this.camera.aspect;
    const d = Math.max(ext / f.fill / 2 / Math.tan(vfov / 2), ext / f.fill / 2 / Math.tan(vfov / 2) / Math.min(1, asp));
    this.controls.target.copy(c);
    if (reset){ const yw = THREE.MathUtils.degToRad(f.yaw), el = THREE.MathUtils.degToRad(f.elev);
      this.camera.position.copy(c).add(new THREE.Vector3(Math.cos(el) * Math.sin(yw), Math.sin(el), Math.cos(el) * Math.cos(yw)).multiplyScalar(d)); }
    else { const dir = this.camera.position.clone().sub(c).normalize(); this.camera.position.copy(c).addScaledVector(dir, d); }
    this.camera.near = d / 50; this.camera.far = d * 10; this.camera.updateProjectionMatrix(); this.controls.update();
  }

  time(){ return ((performance.now() - this.t0) / 1000) % DUR; }
  frame(force){
    if (!this.ready) return;
    const v = this.opts.capture ? this.vCapture : this.time(), sc = this.sc, F = sc.frames, x = v / DUR * (F - 1), k0 = Math.floor(x), k1 = Math.min(F - 1, k0 + 1), w = x - k0;
    this.k = Math.round(x);
    if (this.film.style === 'balls') this.updateBalls(k0, k1, w); else this.updateSurface(k0, k1, w);
    this.controls.update();
    this.composer.render();
    this.drawOverlay(v);
    if (this.onFrame) this.onFrame(v, this.k);
  }
  updateBalls(k0, k1, w){
    const n = this.sc.n, A = this.A || (this.A = new Float32Array(n * 3)), B = this.B || (this.B = new Float32Array(n * 3));
    this.posAt(k0, A); this.posAt(k1, B); const P = this.P;
    for (let i = 0; i < n; i++){                          // blend, but never across a periodic wrap
      const jump = Math.abs(B[3*i] - A[3*i]) + Math.abs(B[3*i+1] - A[3*i+1]) + Math.abs(B[3*i+2] - A[3*i+2]) > 6;
      for (let k = 0; k < 3; k++) P[3*i+k] = jump ? (w < .5 ? A[3*i+k] : B[3*i+k]) : A[3*i+k] + (B[3*i+k] - A[3*i+k]) * w; }
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    const rad = this.sc.radius;
    for (const m of this.balls){ m.userData.idx.forEach((a, j) => { const r = rad[a]; m.setMatrixAt(j, M.compose(p.set(P[3*a], P[3*a+1], P[3*a+2]), q.identity(), s.set(r, r, r))); }); m.instanceMatrix.needsUpdate = true; }
    const sr = this.film.stick;
    for (const m of this.sticks){ m.userData.h.forEach(([a, b], j) => {
      const ax = P[3*a], ay = P[3*a+1], az = P[3*a+2], mx = (ax + P[3*b]) / 2, my = (ay + P[3*b+1]) / 2, mz = (az + P[3*b+2]) / 2;
      d.set(mx - ax, my - ay, mz - az); const L = d.length(); q.setFromUnitVectors(up, d.normalize());
      m.setMatrixAt(j, M.compose(p.set((ax + mx) / 2, (ay + my) / 2, (az + mz) / 2), q, s.set(sr, L, sr))); }); m.instanceMatrix.needsUpdate = true; }
    if (this.tetMesh){
      const arr = this.tetMesh.geometry.attributes.position.array; let o = 0;
      for (const t of this.sc.tets) for (const [a, b, c] of [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]) for (const i of [t[a], t[b], t[c]]){ arr[o++] = P[3*i]; arr[o++] = P[3*i+1]; arr[o++] = P[3*i+2]; }
      // wind every face outward from its tetrahedron centre
      for (let f = 0; f < arr.length; f += 9){ const ti = Math.floor(f / 36), t = this.sc.tets[ti];
        const cx = (P[3*t[0]] + P[3*t[1]] + P[3*t[2]] + P[3*t[3]]) / 4, cy = (P[3*t[0]+1] + P[3*t[1]+1] + P[3*t[2]+1] + P[3*t[3]+1]) / 4, cz = (P[3*t[0]+2] + P[3*t[1]+2] + P[3*t[2]+2] + P[3*t[3]+2]) / 4;
        const e1 = [arr[f+3] - arr[f], arr[f+4] - arr[f+1], arr[f+5] - arr[f+2]], e2 = [arr[f+6] - arr[f], arr[f+7] - arr[f+1], arr[f+8] - arr[f+2]];
        const nx = e1[1]*e2[2] - e1[2]*e2[1], ny = e1[2]*e2[0] - e1[0]*e2[2], nz = e1[0]*e2[1] - e1[1]*e2[0];
        if (nx * (arr[f] - cx) + ny * (arr[f+1] - cy) + nz * (arr[f+2] - cz) < 0) for (let k = 0; k < 3; k++){ const t1 = arr[f+3+k]; arr[f+3+k] = arr[f+6+k]; arr[f+6+k] = t1; } }
      this.tetMesh.geometry.attributes.position.needsUpdate = true; this.tetMesh.geometry.computeVertexNormals();
    }
    if (this.trails){
      const seg = [], hist = 36, tmp = new Float32Array(this.sc.n * 3), L2 = 100;
      for (const a of this.sc.movers){ let prev = null;
        for (let k = Math.max(0, this.k - hist); k <= this.k; k++){ this.posAt(k, tmp); const cur = [tmp[3*a], tmp[3*a+1], tmp[3*a+2]];
          if (prev && (cur[0]-prev[0])**2 + (cur[1]-prev[1])**2 + (cur[2]-prev[2])**2 < L2) seg.push(...prev, ...cur); prev = cur; } }
      if (seg.length){ this.trails.geometry.dispose(); this.trails.geometry = new LineSegmentsGeometry().setPositions(seg); this.trails.visible = this.sc.story.t_ps[this.k] > 6; }
      this.trailMat.resolution.set(this.host.clientWidth, this.host.clientHeight);
    }
    if (this.film.switch){ const sw = this.film.switch, k = this.sc.story[sw.key][this.k], g = Object.keys(this.film.groups).indexOf(sw.group);
      const c = new THREE.Color(COLORS[sw.a]).lerp(new THREE.Color(COLORS[sw.b]), k); this.balls[g].material.color.copy(c); if (this.sticks[g]) this.sticks[g].material.color.copy(c); }
    if (this.boxLine){ const c = this.sc.story.box[this.k], arr = this.boxLine.geometry.attributes.position.array, t = new THREE.Vector3();
      c.forEach((p, i) => { this.v(p[0], p[1], p[2], t); arr[3*i] = t.x; arr[3*i+1] = t.y; arr[3*i+2] = t.z; }); this.boxLine.geometry.attributes.position.needsUpdate = true; }
    if (this.arrow){ const on = this.sc.story[this.film.arrow.on][this.k]; this.arrow.visible = on;
      const h = this.hull, c = h.getCenter(new THREE.Vector3()); this.arrow.position.set(c.x, h.min.y - 3.5, h.max.z + 2); }
  }
  updateSurface(k0, k1, w){
    const M = this.sc.rotor_matrix, a = new THREE.Matrix4().fromArray(M[k0]), b = new THREE.Matrix4().fromArray(M[k1]);
    const pa = new THREE.Vector3(), qa = new THREE.Quaternion(), sa = new THREE.Vector3(), pb = new THREE.Vector3(), qb = new THREE.Quaternion();
    a.decompose(pa, qa, sa); b.decompose(pb, qb, sa); qa.slerp(qb, w); pa.lerp(pb, w);
    this.rotor.matrix.compose(pa, qa, new THREE.Vector3(1, 1, 1)); this.rotor.matrixWorldNeedsUpdate = true;
    const s = this.sc.story; this.flow.visible = s.torque_on[this.k]; this.flow.rotation.y = -THREE.MathUtils.degToRad(s.rotor_deg[this.k]);
  }

  anchor(name){                                             // screen position of a labelled part
    const v = new THREE.Vector3();
    if (this.film.style === 'surface'){ const p = this.sc.anchor_pos[name][this.k]; v.set(p[0], p[1], p[2]); }
    else { const idx = this.sc.anchors[name]; if (!idx || idx[0] == null) return null; 
      let x = 0, y = 0, z = 0; for (const a of idx){ x += this.P[3*a]; y += this.P[3*a+1]; z += this.P[3*a+2]; } v.set(x / idx.length, y / idx.length, z / idx.length); }
    v.project(this.camera); return [(v.x + 1) / 2 * this.host.clientWidth, (1 - v.y) / 2 * this.host.clientHeight];
  }
  drawOverlay(v){
    if (!this.ov) return;
    const f = this.film, s = this.sc.story, k = this.k, W = this.host.clientWidth, X = W - (this.opts.labelInset || 230);
    let svg = '';
    const rows = (W < 640 ? [] : f.labels).map(L => ({ L, a:this.anchor(L.at) })).filter(r => r.a).map(r => ({ ...r, y:r.a[1] })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < rows.length; i++) rows[i].y = Math.max(rows[i].y, rows[i - 1].y + 62);
    for (const { L, a, y } of rows){
      svg += `<circle cx="${a[0]}" cy="${a[1]}" r="3" fill="#E6E8EF"/><polyline points="${a[0]},${a[1]} ${X - 22},${y} ${X - 6},${y}" fill="none" stroke="rgba(230,232,239,.55)" stroke-width="1"/>` +
        `<text class="lab" x="${X}" y="${y - 3}">${L.text[0]}</text><text class="lab sub" x="${X}" y="${y + 14}">${L.text[1]}</text>`;
    }
    if (f.burst && s[f.burst.on][k]){ const a = this.anchor(f.burst.at), age = Math.max(0, s[f.burst.age][k]);
      for (const o of [0, .33, .66]){ const q = (age * 1.6 + o) % 1; svg += `<circle cx="${a[0]}" cy="${a[1]}" r="${30 + 170 * q}" fill="none" stroke="#FF6B1A" stroke-width="${3.5 * (1 - q) + .5}" opacity="${(1 - q) * .9}"/>`; }
      svg += `<text class="lab" x="${a[0] + 110}" y="${a[1] - 150}" style="fill:#FF6B1A">${f.burst.label}</text>`; }
    if (f.pull && s.pulling[k]){ const A = this.anchor('end_a'), B = this.anchor('end_b'), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L;
      const ar = (x, y, dx, dy) => { const x2 = x + dx * 70, y2 = y + dy * 70, a = Math.atan2(dy, dx), h = 12;
        return `<line x1="${x + dx * 14}" y1="${y + dy * 14}" x2="${x2 - dx * 8}" y2="${y2 - dy * 8}" stroke="#FF6B1A" stroke-width="3.5" stroke-linecap="round"/><path d="M${x2},${y2} L${x2 - h * Math.cos(a - .45)},${y2 - h * Math.sin(a - .45)} L${x2 - h * Math.cos(a + .45)},${y2 - h * Math.sin(a + .45)} Z" fill="#FF6B1A"/>`; };
      svg += ar(A[0], A[1], -ux, -uy) + ar(B[0], B[1], ux, uy); }
    if (f.arrow && this.arrow?.visible){ const p = this.arrow.position.clone().add(new THREE.Vector3(9, 0, 0)).project(this.camera);
      svg += `<text class="lab" x="${(p.x + 1) / 2 * W + 14}" y="${(1 - p.y) / 2 * this.host.clientHeight + 5}" style="fill:#FF6B1A">${f.arrow.label}</text>`; }
    if (f.style === 'surface' && this.flow.visible){ const a = this.anchor('ring'); svg += `<text class="lab" x="${a[0] - 230}" y="${a[1] + 110}" style="fill:#FF6B1A">Proton flow</text>`; }
    this.ov.svg.innerHTML = svg;
    this.ov.steps.forEach((el, i) => el.classList.toggle('on', i === s.part[k]));
    this.ov.read.innerHTML = f.readout(s, k).join('<br>');
  }
}
