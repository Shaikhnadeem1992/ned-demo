// Renderer: Three.js energy core. Knows nothing about app logic; receives interpolated params each frame.
import * as THREE from '../vendor/three.module.js';
const C = { primary: 0xFFB547, core: 0xFFE7B0, trail: 0xEF862A, red: 0xFF5A4E };

function glowTexture(inner = 'rgba(255,231,176,1)', mid = 'rgba(255,181,71,0.35)') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const RINGS = [ // radius, tilt (x,y,z), relative speed, arc segments [start,end] in turns, opacity
  { r: 1.25, tilt: [1.0, 0.15, 0.0],  sp: 1.00, arcs: [[0, .42], [.5, .93]], op: 1 },
  { r: 1.70, tilt: [0.7, -0.5, 0.3], sp: -0.62, arcs: [[0, .30], [.38, .70], [.78, .95]], op: .8 },
  { r: 2.15, tilt: [1.2, 0.4, -0.2], sp: 0.41, arcs: [[0, .62], [.7, .9]], op: .6, ticks: true },
  { r: 2.65, tilt: [0.55, 0.7, 0.5],   sp: -0.25, arcs: [[.05, .55]], op: .45 },
];

export class CoreRenderer {
  constructor(canvas, quality) {
    this.canvas = canvas; this.q = quality;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100); this.cam.position.set(0, 0, 8.2);
    this.root = new THREE.Group(); this.root.rotation.x = 0.28; this.scene.add(this.root);
    this.ringAngles = RINGS.map((_, i) => i * 0.7); // accumulated, never reset
    this.time = 0; this.pointer = { x: 0, y: 0 };
    this.add = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };
    this.buildCore(); this.buildRings(); this.buildParticles(); this.buildTrails(); this.buildRipples();
    addEventListener('pointermove', e => { this.pointer.x = e.clientX / innerWidth - .5; this.pointer.y = e.clientY / innerHeight - .5; });
    quality.onChange(() => this.applyQuality()); this.applyQuality();
  }
  buildCore() {
    this.coreSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: C.core, ...this.add }));
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,181,71,.55)', 'rgba(239,134,42,.12)'), color: C.primary, ...this.add, opacity: .5 }));
    this.coreSprite.scale.setScalar(1.1); this.halo.scale.setScalar(3.2);
    this.scene.add(this.halo, this.coreSprite); // in scene (camera-facing) for a soft, clear centre
  }
  buildRings() {
    this.rings = RINGS.map(def => {
      const tiltG = new THREE.Group(); tiltG.rotation.set(...def.tilt);
      const spin = new THREE.Group(); tiltG.add(spin);
      for (const [a, b] of def.arcs) {
        const n = 96, pos = [], col = [];
        for (let i = 0; i <= n; i++) {
          const t = (a + (b - a) * i / n) * Math.PI * 2; pos.push(Math.cos(t) * def.r, Math.sin(t) * def.r, 0);
          const f = Math.sin(Math.PI * i / n) ** 0.6; col.push(f, f * .71, f * .28); // taper at arc ends
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        spin.add(new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, ...this.add, opacity: def.op })));
      }
      if (def.ticks) { // subtle holographic tick markings
        const pos = []; for (let i = 0; i < 72; i++) { const t = i / 72 * Math.PI * 2, l = i % 6 ? .05 : .12;
          pos.push(Math.cos(t) * (def.r + .08), Math.sin(t) * (def.r + .08), 0, Math.cos(t) * (def.r + .08 + l), Math.sin(t) * (def.r + .08 + l), 0); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        this.ticks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: C.primary, ...this.add, opacity: .22 })); spin.add(this.ticks);
      }
      this.root.add(tiltG); return { tiltG, spin, def };
    });
  }
  buildParticles() {
    const N = 1400; this.pN = N;
    this.pData = Array.from({ length: N }, (_, i) => {
      const ring = RINGS[i % RINGS.length];
      return { ring: i % RINGS.length, r: ring.r * (0.75 + Math.random() * 0.55), ph: Math.random() * 6.283, sp: (0.25 + Math.random() * .6) * Math.sign(ring.sp),
        wob: (Math.random() - .5) * .5, z: (Math.random() - .5) * .35, m: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ring.tilt[0] + (Math.random() - .5) * .3, ring.tilt[1] + (Math.random() - .5) * .3, ring.tilt[2])) };
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: C.primary, size: 0.075, sizeAttenuation: true, map: glowTexture(), ...this.add, opacity: .9 }));
    this.root.add(this.points); this.v = new THREE.Vector3();
  }
  buildTrails() {
    this.trails = []; const L = 48;
    for (let i = 0; i < 10; i++) {
      const ring = RINGS[i % RINGS.length];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L * 3), 3));
      const col = new Float32Array(L * 3); for (let k = 0; k < L; k++) { const f = (1 - k / L) ** 2; col.set([f, f * .53, f * .16], k * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, ...this.add, opacity: .9 }));
      this.root.add(line);
      this.trails.push({ line, L, r: ring.r * (0.9 + Math.random() * .25), ph: Math.random() * 6.283, sp: (0.6 + Math.random() * .5) * Math.sign(ring.sp),
        m: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ring.tilt[0] + (Math.random() - .5) * .4, ring.tilt[1] + (Math.random() - .5) * .4, ring.tilt[2])) });
    }
  }
  buildRipples() {
    this.ripples = Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96), new THREE.MeshBasicMaterial({ color: C.primary, ...this.add, opacity: 0, side: THREE.DoubleSide }));
      m.visible = false; this.scene.add(m); return { m, life: 0, dir: 1 };
    });
    this.rippleClock = 0;
  }
  spawnRipple(dir, strength = 1) {
    const rp = this.ripples.find(r => r.life <= 0); if (!rp) return;
    rp.life = 1; rp.dir = dir; rp.str = strength; rp.m.visible = true;
  }
  applyQuality() {
    const s = this.q.settings; this.r.setPixelRatio(Math.min(devicePixelRatio, s.pixelRatio));
    this.trails.forEach((t, i) => t.line.visible = i < s.trails); if (this.ticks) this.ticks.visible = s.ticks; this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.r.setSize(w, h, false); this.cam.aspect = w / h;
    this.cam.position.z = w / h < 1 ? 7.8 / Math.max(.7, w / h) : 8.2; this.cam.updateProjectionMatrix();
  }
  // p: interpolated params {speed,tight,bright,density,ripple,stream,breathe,chaos}, level: audio 0..1, dt seconds
  frame(p, level, dt, opts) {
    const rm = this.q.reduceMotion, mot = rm ? 0.15 : 1; this.time += dt;
    const t = this.time, err = opts.error;
    // rings: accumulate angles (continuity) — speed only scales the increment
    this.rings.forEach((R, i) => {
      this.ringAngles[i] += dt * p.speed * mot * R.def.sp * (1 + p.chaos * 0.6 * Math.sin(t * 0.7 + i));
      R.spin.rotation.z = this.ringAngles[i];
      R.tiltG.scale.setScalar(p.tight + (i * 0.04) * (1 - p.tight));
      R.tiltG.rotation.y = R.def.tilt[1] + p.chaos * 0.25 * Math.sin(t * .4 + i * 1.7) * mot;
      R.spin.children.forEach(c => c.material.opacity = R.def.op * (0.45 + 0.55 * p.bright));
    });
    // camera parallax / slow sway for depth
    const px = rm ? 0 : this.pointer.x * .5 + Math.sin(t * .13) * .25, py = rm ? 0 : -this.pointer.y * .35 + Math.cos(t * .11) * .15;
    this.cam.position.x += (px - this.cam.position.x) * .05; this.cam.position.y += (py - this.cam.position.y) * .05; this.cam.lookAt(0, 0, 0);
    // core: breathing + audio-driven brightening; centre stays small and soft (not a solid ball)
    const breathe = 1 + p.breathe * 0.06 * Math.sin(t * 1.6) * (rm ? .3 : 1);
    const b = p.bright + level * 0.6;
    this.coreSprite.scale.setScalar(0.95 * breathe * (1 + level * .35)); this.coreSprite.material.opacity = Math.min(1, b);
    this.halo.scale.setScalar(2.6 * breathe * (0.8 + .4 * p.bright + level * .5)); this.halo.material.opacity = 0.35 * b;
    this.coreSprite.material.color.setHex(err ? 0xFFC9B0 : C.core); this.halo.material.color.setHex(err ? C.red : C.primary);
    // particles on coherent orbital paths
    const n = Math.floor(this.q.settings.particles * p.density * (rm ? .6 : 1)); const arr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const d = this.pData[i]; d.ph += dt * d.sp * p.speed * mot * (1 + p.chaos * .8);
      let r = d.r * p.tight;
      if (p.stream > 0.01) r += p.stream * (((t * .35 * mot + d.ph * .159) % 1) * 1.4 - .3) * (i % 3 === 0 ? 1 : 0); // directional outward streams
      r += p.chaos * .12 * Math.sin(d.ph * 3 + i);
      this.v.set(Math.cos(d.ph) * r, Math.sin(d.ph) * r, d.z + d.wob * Math.sin(d.ph * 2)).applyMatrix4(d.m);
      arr[i * 3] = this.v.x; arr[i * 3 + 1] = this.v.y; arr[i * 3 + 2] = this.v.z;
    }
    this.points.geometry.setDrawRange(0, n); this.points.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = .35 + .55 * p.bright; this.points.material.color.setHex(err ? 0xC98A6A : C.primary);
    // tapered trails following the same orbital paths
    this.trails.forEach((tr, ti) => {
      if (!tr.line.visible) return; tr.ph += dt * tr.sp * p.speed * mot * (1 + p.stream * .8);
      const a = tr.line.geometry.attributes.position.array, rr = tr.r * p.tight;
      for (let k = 0; k < tr.L; k++) { const ph = tr.ph - Math.sign(tr.sp) * k * 0.025 * (0.6 + p.speed);
        this.v.set(Math.cos(ph) * rr, Math.sin(ph) * rr, 0).applyMatrix4(tr.m); a[k * 3] = this.v.x; a[k * 3 + 1] = this.v.y; a[k * 3 + 2] = this.v.z; }
      tr.line.geometry.attributes.position.needsUpdate = true; tr.line.material.opacity = (0.25 + 0.7 * p.bright) * (ti < 4 || p.stream > .3 ? 1 : .5);
    });
    // ripples: audio-driven inward (listening) / outward (speaking), rare ambient ones otherwise
    this.rippleClock -= dt;
    if (this.rippleClock <= 0) {
      if (Math.abs(p.ripple) > .5 && level > 0.06) { this.spawnRipple(Math.sign(p.ripple), Math.min(1, level * 2)); this.rippleClock = rm ? 0.9 : 0.28; }
      else if (!rm && !err && p.speed > .2 && Math.random() < 0.004) { this.spawnRipple(1, .35); this.rippleClock = 3; }
    }
    this.ripples.forEach(rp => {
      if (rp.life <= 0) return; rp.life -= dt / (rm ? 2.2 : 1.4);
      const k = 1 - Math.max(0, rp.life); const s = rp.dir > 0 ? 0.5 + k * 2.6 : 3.0 - k * 2.4;
      rp.m.scale.setScalar(s); rp.m.material.opacity = Math.sin(Math.PI * k) * 0.45 * rp.str; rp.m.lookAt(this.cam.position);
      if (rp.life <= 0) rp.m.visible = false;
    });
    this.r.render(this.scene, this.cam);
  }
}
