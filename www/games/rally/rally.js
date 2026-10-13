// Rally: the 3D world, the driving buttons and the race itself. The rules of the road are in track.js.
import * as THREE from '../../shared/three.module.min.js';

const R = Rally;
const $ = s => document.querySelector(s);
const DT = 1 / 60;
const STAGES = R.STAGES;

// ---------- saved: best time and ghost for each stage, and the options
let save = {};
try { save = JSON.parse(localStorage.getItem('kg-rally')) || {}; } catch (e) {}
save = { best: {}, ghost: true, tilt: false, ...save };
const store = () => { try { localStorage.setItem('kg-rally', JSON.stringify(save)); } catch (e) {} };

// ---------- 3D set-up (or a kind message if this tablet can't do it)
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#view'), antialias: devicePixelRatio < 2, powerPreference: 'high-performance' });
} catch (e) {
  document.querySelectorAll('.hud, .pad').forEach(el => { el.style.display = 'none'; });
  $('#nogl').hidden = false;
  throw e;
}
let quality = 'high';
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 700);
const hemi = new THREE.HemisphereLight(0xffe2c7, 0x8d5c48, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { near: 1, far: 140, left: -38, right: 38, top: 38, bottom: -38 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 58 : 45;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- little helpers for building low-poly things
const mats = new Map();
const lam = (color, extra) => {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return mats.get(key);
};
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const mix = (a, b, f) => new THREE.Color(a).lerp(new THREE.Color(b), f).getHex();

// A lumpy rock: the same corner always moves the same way so the faces stay joined.
function rockGeo(seed) {
  const g = new THREE.DodecahedronGeometry(1, 0);
  const r = R.rng(seed), moved = new Map(), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(3)).join();
    if (!moved.has(key)) moved.set(key, [0.75 + r() * 0.5, 0.75 + r() * 0.5, 0.75 + r() * 0.5]);
    const m = moved.get(key);
    p.setXYZ(i, p.getX(i) * m[0], p.getY(i) * m[1], p.getZ(i) * m[2]);
  }
  g.computeVertexNormals();
  return g;
}

// The parts that make up each kind of roadside thing (each part is drawn once for all of them).
function kinds(st) {
  const rockCol = { 1: 0xb5563c, 2: 0x8f3d2a, 3: 0x8a8f99 }[st.id];
  const geo = {
    rock: [rockGeo(st.seed), rockGeo(st.seed + 1), rockGeo(st.seed + 2)],
    trunk: new THREE.CylinderGeometry(0.35, 0.42, 3.2, 7),
    arm: new THREE.CylinderGeometry(0.24, 0.24, 1, 6),
    bush: new THREE.IcosahedronGeometry(0.9, 0),
    cone: new THREE.ConeGeometry(1, 1, 7),
    stump: new THREE.CylinderGeometry(0.25, 0.32, 1.4, 6),
    blob: new THREE.IcosahedronGeometry(1, 1),
    mesa: new THREE.CylinderGeometry(1, 1.25, 1, 7),
  };
  const cactus = lam(0x3d6045);
  return {
    rock: i => [{ geo: geo.rock[i % 3], mat: lam(rockCol), m: M4(0, 0.45, 0, 0, 0, 0, 1.3, 0.9, 1.2) }],
    cactus: () => [
      { geo: geo.trunk, mat: cactus, m: M4(0, 1.6, 0) },
      { geo: geo.arm, mat: cactus, m: M4(0.6, 1.5, 0, 0, 0, Math.PI / 2, 1, 0.9, 1) },
      { geo: geo.arm, mat: cactus, m: M4(1.05, 2.05, 0, 0, 0, 0, 1, 1.1, 1) },
      { geo: geo.arm, mat: cactus, m: M4(-0.55, 1.05, 0, 0, 0, Math.PI / 2, 1, 0.8, 1) },
      { geo: geo.arm, mat: cactus, m: M4(-0.92, 1.45, 0, 0, 0, 0, 1, 0.9, 1) },
    ],
    bush: () => [{ geo: geo.bush, mat: lam(st.id === 1 ? 0x8a9a5b : 0x76824a), m: M4(0, 0.35, 0, 0, 0, 0, 1.1, 0.6, 1.1), shadow: true }],
    pine: () => [
      { geo: geo.stump, mat: lam(0x6b4a35), m: M4(0, 0.7, 0) },
      { geo: geo.cone, mat: lam(0x2f5d50), m: M4(0, 2.2, 0, 0, 0, 0, 1.9, 2.6, 1.9) },
      { geo: geo.cone, mat: lam(0x356b5b), m: M4(0, 3.5, 0, 0, 0, 0, 1.45, 2.2, 1.45) },
      { geo: geo.cone, mat: lam(0x2f5d50), m: M4(0, 4.7, 0, 0, 0, 0, 0.95, 1.8, 0.95) },
      { geo: geo.cone, mat: lam(0xffffff), m: M4(0, 5.45, 0, 0, 0, 0, 0.45, 0.6, 0.45) },
    ],
    dune: () => [{ geo: geo.blob, mat: lam(mix(st.ground, 0xffffff, 0.12)), m: M4(0, -2, 0, 0, 0, 0, 16, 6, 24), shadow: false }],
    mesa: () => [
      { geo: geo.mesa, mat: lam(0xa9502f), m: M4(0, 11, 0, 0, 0, 0, 12, 22, 12) },
      { geo: geo.mesa, mat: lam(0xd98b5f), m: M4(0, 16, 0, 0, 0, 0, 10.6, 3, 10.6) },
      { geo: geo.mesa, mat: lam(0x8f3d2a), m: M4(0, 22.4, 0, 0, 0, 0, 9.7, 1, 9.7) },
    ],
    hill: () => [
      { geo: geo.blob, mat: lam(0xffffff), m: M4(0, -3, 0, 0, 0, 0, 20, 12, 18), shadow: false },
      { geo: geo.rock[0], mat: lam(0x8a8f99), m: M4(5, 5, 2, 0, 0, 0, 4, 3, 4) },
    ],
  };
}

// Draw a list of things, one instanced mesh per part.
function plant(group, list, partsOf) {
  const byPart = new Map();
  list.forEach((p, n) => {
    partsOf(p, n).forEach((part, k) => {
      const key = k + ':' + part.geo.uuid;
      if (!byPart.has(key)) byPart.set(key, { part, items: [] });
      byPart.get(key).items.push(p);
    });
  });
  const base = new THREE.Matrix4(), m = new THREE.Matrix4();
  for (const { part, items } of byPart.values()) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, items.length);
    items.forEach((p, i) => {
      base.copy(M4(p.x, 0, p.z, 0, p.rot, 0, p.size, p.size, p.size));
      m.multiplyMatrices(base, part.m);
      im.setMatrixAt(i, m);
    });
    im.castShadow = part.shadow !== false;
    im.receiveShadow = true;
    group.add(im);
  }
}

// A flat strip along the road from d0 to d1 metres right of the middle.
function ribbon(t, d0, d1, y, color) {
  const n = t.pts.length;
  const pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), idx = [];
  t.pts.forEach((p, i) => {
    const rx = Math.cos(p.h), rz = -Math.sin(p.h);
    pos.set([p.x + rx * d0, y, p.z + rz * d0, p.x + rx * d1, y, p.z + rz * d1], i * 6);
    nor.set([0, 1, 0, 0, 1, 0], i * 6);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}

function textTexture(text, bg, fg, w = 512, h = 96) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.font = `700 ${h * 0.7}px Fredoka, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 32;
  const x = c.getContext('2d');
  for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#222' : '#fff'; x.fillRect(i * 16, j * 16, 16, 16); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

// Start and finish: chequered line, an arch, tape along the road and a crowd.
function gate(group, t, s, label, crowd) {
  const p = R.at(t, s);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(R.WIDTH, 2), new THREE.MeshLambertMaterial({ map: checkerTexture() }));
  line.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.position.set(p.x, 0.05, p.z);
  holder.rotation.y = p.h;
  line.receiveShadow = true;
  holder.add(line);
  const post = new THREE.BoxGeometry(0.5, 5.2, 0.5), postMat = lam(0x2b2d42);
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(post, postMat);
    m.position.set(side * (R.HALF + 1.2), 2.6, 0);
    m.castShadow = true;
    holder.add(m);
  }
  const tex = textTexture(label, label === 'FINISH' ? '#e63946' : '#2b9348', '#fff');
  const plain = lam(label === 'FINISH' ? 0xe63946 : 0x2b9348);
  const face = new THREE.MeshLambertMaterial({ map: tex });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(R.WIDTH + 3, 1.5, 0.3), [plain, plain, plain, plain, face, face]);
  banner.position.y = 5;
  banner.castShadow = true;
  holder.add(banner);
  group.add(holder);

  // red and white tape on little posts
  const posts = [], tape = [[], []];
  for (let a = s - 30; a < s + 40; a += 5) {
    for (const side of [-1, 1]) {
      const d = side * (R.HALF + R.SHOULDER + 0.6);
      const q = R.at(t, a, d);
      posts.push(q);
      const q2 = R.at(t, a + 5, d);
      tape[Math.round(a / 5) % 2 ? 0 : 1].push({ x: (q.x + q2.x) / 2, z: (q.z + q2.z) / 2, h: Math.atan2(q2.x - q.x, q2.z - q.z), len: Math.hypot(q2.x - q.x, q2.z - q.z) });
    }
  }
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 5), lam(0xffffff), posts.length);
  posts.forEach((q, i) => pm.setMatrixAt(i, M4(q.x, 0.55, q.z)));
  group.add(pm);
  tape.forEach((list, k) => {
    const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.14, 1), lam(k ? 0xffffff : 0xe63946), list.length);
    list.forEach((q, i) => tm.setMatrixAt(i, M4(q.x, 0.95, q.z, 0, q.h, 0, 1, 1, q.len)));
    group.add(tm);
  });

  if (!crowd) return null;
  // a stand on each side, with people who jump about
  const people = [];
  const r = R.rng(Math.round(s));
  for (const side of [-1, 1]) {
    const d = side * (R.HALF + R.SHOULDER + 6.5);
    for (let a = s - 16; a <= s + 10; a += 13) {
      const q = R.at(t, a, d);
      const stand = new THREE.Group();
      stand.position.set(q.x, 0, q.z);
      stand.rotation.y = q.h;
      for (let k = 0; k < 3; k++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6 + k * 0.6, 12), lam(k % 2 ? 0x9aa5b1 : 0xb8c2cc));
        step.position.set(side * k * 2.2, (0.6 + k * 0.6) / 2, 0);
        step.castShadow = true; step.receiveShadow = true;
        stand.add(step);
        for (let n = -5; n <= 5; n += 1.1) {
          if (r() < 0.25) continue;
          const local = new THREE.Vector3(side * k * 2.2 + (r() - 0.5) * 0.6, 0.6 + k * 0.6, n);
          local.applyAxisAngle(new THREE.Vector3(0, 1, 0), q.h);
          people.push({ x: q.x + local.x, y: local.y, z: q.z + local.z, col: [0xe63946, 0xffd60a, 0x3a86ff, 0x8338ec, 0xff8fab, 0x2b9348, 0xffffff][Math.floor(r() * 7)], ph: r() * 6 });
        }
      }
      group.add(stand);
    }
  }
  const bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.8, 0.4), new THREE.MeshLambertMaterial(), people.length);
  const headMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.25, 0), lam(0xf1c27d), people.length);
  people.forEach((q, i) => bodyMesh.setColorAt(i, new THREE.Color(q.col)));
  group.add(bodyMesh, headMesh);
  const crowdState = { people, bodyMesh, headMesh, excite: 0 };
  moveCrowd(crowdState, 0);
  return crowdState;
}
function moveCrowd(c, time) {
  c.people.forEach((q, i) => {
    const jump = Math.max(0, Math.sin(time * (6 + c.excite * 4) + q.ph)) * (0.08 + c.excite * 0.45);
    c.bodyMesh.setMatrixAt(i, M4(q.x, q.y + 0.4 + jump, q.z));
    c.headMesh.setMatrixAt(i, M4(q.x, q.y + 1.05 + jump, q.z));
  });
  c.bodyMesh.instanceMatrix.needsUpdate = true;
  c.headMesh.instanceMatrix.needsUpdate = true;
}

// ---------- the cars
function makeCar(colour, ghost) {
  const car = new THREE.Group(), body = new THREE.Group();
  car.add(body);
  const mat = c => ghost ? new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.38, depthWrite: false }) : lam(c);
  const box = (w, h, l, c, x, y, z, parent = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat(c));
    m.position.set(x, y, z);
    m.castShadow = !ghost;
    parent.add(m);
    return m;
  };
  box(1.9, 0.55, 4.1, colour, 0, 0.68, 0);           // body
  box(1.86, 0.2, 1.3, colour, 0, 1.0, 1.25).rotation.x = 0.12;   // bonnet
  box(1.6, 0.6, 2.0, colour, 0, 1.22, -0.35);        // cabin
  box(1.64, 0.36, 1.5, 0x22303c, 0, 1.25, -0.35);    // side windows
  box(1.5, 0.42, 0.08, 0x22303c, 0, 1.2, 0.68).rotation.x = -0.45;  // windscreen
  box(0.45, 0.04, 2.02, 0xffffff, 0, 1.53, -0.35);   // roof stripe
  box(0.45, 0.04, 4.12, 0xffffff, 0, 0.96, 0);       // bonnet stripe
  box(1.95, 0.08, 0.45, 0x2b2d42, 0, 1.45, -2.0);    // spoiler
  box(0.08, 0.4, 0.2, 0x2b2d42, 0.6, 1.2, -1.95);
  box(0.08, 0.4, 0.2, 0x2b2d42, -0.6, 1.2, -1.95);
  box(0.4, 0.18, 0.06, 0xfff3b0, 0.6, 0.75, 2.06);   // lights
  box(0.4, 0.18, 0.06, 0xfff3b0, -0.6, 0.75, 2.06);
  for (const side of [-1, 1]) {                      // door roundels
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 12), mat(0xffffff));
    r.rotation.z = Math.PI / 2;
    r.position.set(side * 0.96, 0.7, 0.1);
    body.add(r);
  }
  const wheels = [], fronts = [];
  const wheelGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.38, 10);
  for (const z of [1.35, -1.35]) for (const x of [-0.97, 0.97]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.43, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, mat(0x23232b));
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = !ghost;
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.12), mat(0xd9d9d9));
    spin.add(tyre, hub);
    pivot.add(spin);
    car.add(pivot);
    wheels.push(spin);
    if (z > 0) fronts.push(pivot);
  }
  car.userData = { body, wheels, fronts, roll: 0, pitch: 0 };
  return car;
}

// ---------- dust puffs from the back wheels
const DUST = 220;
const dust = { mesh: null, list: [], next: 0 };
function makeDust(group, colour) {
  dust.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.42, 0), lam(0xffffff), DUST);
  dust.mesh.frustumCulled = false;
  dust.list = [];
  const r = R.rng(5);
  for (let i = 0; i < DUST; i++) {
    dust.list.push({ age: 9, life: 0.6, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, spin: 0 });
    dust.mesh.setColorAt(i, new THREE.Color(mix(colour, 0xffffff, r() * 0.45)));
    dust.mesh.setMatrixAt(i, M4(0, -10, 0, 0, 0, 0, 0, 0, 0));
  }
  group.add(dust.mesh);
}
function puff(x, z, vx, vz, big) {
  const d = dust.list[dust.next];
  dust.next = (dust.next + 1) % DUST;
  Object.assign(d, {
    age: 0, life: 0.6, x: x + (Math.random() - 0.5) * 0.6, y: 0.3, z: z + (Math.random() - 0.5) * 0.6,
    vx: vx * 0.25 + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 1.8, vz: vz * 0.25 + (Math.random() - 0.5) * 2,
    s: (big ? 1.3 : 0.8) * (0.7 + Math.random() * 0.6), spin: Math.random() * 6,
  });
}
function moveDust(dt) {
  if (!dust.mesh) return;
  dust.list.forEach((d, i) => {
    if (d.age >= d.life) { if (d.age < 9) { d.age = 9; dust.mesh.setMatrixAt(i, M4(0, -10, 0, 0, 0, 0, 0, 0, 0)); } return; }
    d.age += dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    d.vy -= 1.5 * dt;
    const k = Math.max(0, 1 - d.age / d.life) * d.s;
    dust.mesh.setMatrixAt(i, M4(d.x, d.y, d.z, d.spin * d.age, d.spin, 0, k, k, k));
  });
  dust.mesh.instanceMatrix.needsUpdate = true;
}

// ---------- snow falling on the snow stage
let snow = null;
function makeSnow(group) {
  const n = 500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 80, Math.random() * 30, (Math.random() - 0.5) * 80], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.2 }));
  snow.frustumCulled = false;
  group.add(snow);
}
function moveSnow(dt, cx, cz) {
  if (!snow) return;
  const p = snow.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i) - 3 * dt, z = p.getZ(i);
    if (y < 0) y += 30;
    if (x < cx - 40) x += 80; else if (x > cx + 40) x -= 80;
    if (z < cz - 40) z += 80; else if (z > cz + 40) z -= 80;
    p.setXYZ(i, x + Math.sin(y + i) * 0.01, y, z);
  }
  p.needsUpdate = true;
}

// ---------- building a stage
let world = null, T = null, SC = null, stageIdx = 0, crowds = [];
const carMesh = makeCar(0xe63946, false);
const ghostMesh = makeCar(0x8fd3ff, true);
scene.add(carMesh, ghostMesh);

function disposeWorld() {
  if (!world) return;
  scene.remove(world);
  world.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); if (![...mats.values()].includes(m)) m.dispose(); });
  });
  world = null;
}
function buildWorld(idx) {
  disposeWorld();
  stageIdx = idx;
  const st = STAGES[idx];
  T = R.build(st);
  SC = R.scenery(T);
  world = new THREE.Group();
  scene.background = new THREE.Color(st.sky);
  scene.fog = new THREE.Fog(st.sky, 150, 380);
  // snow is bright enough already
  if (st.id === 3) { hemi.color.set(0xeaf2ff); hemi.groundColor.set(0x7f8fa3); hemi.intensity = 1.1; sun.intensity = 1.6; }
  else { hemi.color.set(0xffe2c7); hemi.groundColor.set(0x8d5c48); hemi.intensity = 1.4; sun.intensity = 2.2; }

  // ground, centred on the stage
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of T.pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: st.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  ground.receiveShadow = true;
  world.add(ground);

  // the road: soft edges, the dirt, and two darker wheel tracks
  world.add(ribbon(T, -R.HALF - R.SHOULDER, -R.HALF + 0.2, 0.02, st.edge));
  world.add(ribbon(T, R.HALF - 0.2, R.HALF + R.SHOULDER, 0.02, st.edge));
  world.add(ribbon(T, -R.HALF, R.HALF, 0.03, st.road));
  const rut = mix(st.road, st.edge, 0.35);
  world.add(ribbon(T, -2.4, -1.5, 0.04, rut));
  world.add(ribbon(T, 1.5, 2.4, 0.04, rut));

  // roadside things and far-off scenery
  const k = kinds(st);
  plant(world, SC.props, (p, n) => k[p.kind](n));
  plant(world, SC.far, (p, n) => k[p.kind](n));

  crowds = [gate(world, T, R.LINE_S, 'START', true), gate(world, T, T.finish, 'FINISH', true)].filter(Boolean);
  makeDust(world, st.id === 3 ? 0xffffff : st.edge);
  snow = null;
  if (st.id === 3) makeSnow(world);
  scene.add(world);
  $('#stage-tag').textContent = 'S' + st.id;
  document.querySelector('meta[name=theme-color]').content = '#' + new THREE.Color(st.sky).getHexString();
}

// ---------- driving buttons, keys and tilt
const keys = { left: false, right: false, brake: false };
function pad(el, name) {
  const held = new Set();
  const set = () => { keys[name] = held.size > 0; el.classList.toggle('down', keys[name]); };
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sound.unlock(); audioStart();
    held.add(e.pointerId);
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    set();
  });
  const up = e => { held.delete(e.pointerId); set(); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
pad($('#left'), 'left');
pad($('#right'), 'right');
pad($('#brake'), 'brake');
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brake', ArrowDown: 'brake', KeyS: 'brake' };
addEventListener('keydown', e => { if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); audioStart(); } });
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });

// Tilt: turn the tablet like a steering wheel. Works out the angle from gravity on the screen.
let tiltAngle = 0, tiltZero = 0, tiltSeen = false;
addEventListener('devicemotion', e => {
  const g = e.accelerationIncludingGravity;
  if (!g || g.x == null || g.y == null) return;
  const a = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI / 180;
  const sx = g.x * Math.cos(a) - g.y * Math.sin(a);
  const sy = g.x * Math.sin(a) + g.y * Math.cos(a);
  const raw = -Math.atan2(sx, Math.max(Math.abs(sy), 3));
  tiltAngle += (raw - tiltAngle) * 0.35;
  if (!tiltSeen) { tiltSeen = true; tiltZero = tiltAngle; showTilt(); }
});
const tiltOn = () => save.tilt && tiltSeen;
function showTilt() { document.body.classList.toggle('tilt', tiltOn()); }
function steerInput() {
  if (tiltOn()) {
    const deg = (tiltAngle - tiltZero) * 180 / Math.PI;
    const dead = 3, full = 24;
    if (Math.abs(deg) < dead) return 0;
    return Math.max(-1, Math.min(1, (deg - Math.sign(deg) * dead) / (full - dead)));
  }
  return (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
}

// ---------- engine and gravel sounds (their own little mixer, so they can run all the time)
let ac = null, eng = null;
function audioStart() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  const out = ac.createGain();
  out.gain.value = 0.9;
  out.connect(ac.destination);
  const osc = ac.createOscillator(), sub = ac.createOscillator();
  osc.type = 'sawtooth'; sub.type = 'square';
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 500;
  const gain = ac.createGain();
  gain.gain.value = 0;
  const subGain = ac.createGain();
  subGain.gain.value = 0.5;
  osc.connect(filter); sub.connect(subGain); subGain.connect(filter);
  filter.connect(gain); gain.connect(out);
  osc.start(); sub.start();
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass'; band.frequency.value = 700; band.Q.value = 0.6;
  const grit = ac.createGain();
  grit.gain.value = 0;
  noise.connect(band); band.connect(grit); grit.connect(out);
  noise.start();
  eng = { osc, sub, filter, gain, grit, band, out };
}
function audioUpdate(rpm, on) {
  if (!eng) return;
  const t = ac.currentTime;
  const live = on && !Sound.isMuted();
  const f = 48 + rpm * 120;
  eng.osc.frequency.setTargetAtTime(f, t, 0.05);
  eng.sub.frequency.setTargetAtTime(f / 2, t, 0.05);
  eng.filter.frequency.setTargetAtTime(350 + rpm * 900, t, 0.05);
  eng.gain.gain.setTargetAtTime(live ? 0.07 + rpm * 0.06 : 0, t, 0.08);
  let grit = 0;
  if (car.surface === 'sand') grit = Math.min(0.22, car.speed * 0.012);
  else if (Math.abs(car.slide) > 1.4) grit = Math.min(0.2, Math.abs(car.slide) * 0.04);
  else grit = car.speed * 0.002;
  if (STAGES[stageIdx].id === 3) eng.band.frequency.setTargetAtTime(1600, t, 0.1);
  else eng.band.frequency.setTargetAtTime(700, t, 0.1);
  eng.grit.gain.setTargetAtTime(live ? grit : 0, t, 0.08);
}
function beep(freq, len) {
  if (!ac || Sound.isMuted()) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.12, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + len);
  o.connect(g); g.connect(eng.out);
  o.start(); o.stop(ac.currentTime + len);
}

// ---------- the race
let car = null, state = 'menu', time = 0, prog = 0, noteIdx = 0, spokenTo = -1;
let count = 0, rec = [], recT = 0, ghost = null, ghostHint = 0, stuck = 0, progMark = 0, finishT = 0;
let camH = 0, camPos = new THREE.Vector3(), orbit = 0, slowFrames = [], wasBump = 0;
const built = {};
const medalsFor = idx => R.medals(built[idx] = built[idx] || R.build(STAGES[idx]));
const medalOf = (idx, t) => {
  const m = medalsFor(idx);
  return t <= m.gold ? 'gold' : t <= m.silver ? 'silver' : t <= m.bronze ? 'bronze' : '';
};
const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' };
const bestOf = idx => save.best[STAGES[idx].id];
const medalWon = idx => { const b = bestOf(idx); return b ? medalOf(idx, b.time) : ''; };
const unlocked = idx => idx === 0 || !!medalWon(idx - 1);
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };

function placeCar() {
  car = R.newCar(T);
  camH = car.h;
  const back = R.at(T, R.START_S - 16);
  camPos.set(back.x, 12, back.z);
}

function startRace(idx) {
  hideSheets();
  if (idx !== stageIdx || !T) buildWorld(idx);
  placeCar();
  state = 'count';
  count = 0; time = 0; prog = R.START_S; noteIdx = 0; spokenTo = -1; rec = []; recT = 0; stuck = 0; progMark = prog; finishT = 0;
  ghostHint = 0;
  const b = bestOf(idx);
  ghost = save.ghost && b && b.ghost ? b.ghost : null;
  ghostMesh.visible = !!ghost;
  $('#pin-ghost').hidden = !ghost;
  $('#rescue').hidden = true;
  crowds.forEach(c => { c.excite = 0; });
  tiltZero = tiltAngle;
  showTilt();
  showTarget();
  Guard.round(`${STAGES[idx].pic} ${STAGES[idx].name}`);
  $('#lights').hidden = false;
  [...$('#lights').children].forEach(l => { l.className = ''; });
  audioStart();
}

function showTarget() {
  const m = medalsFor(stageIdx), have = medalWon(stageIdx), b = bestOf(stageIdx);
  let text = '';
  if (!have) text = `🥉 ${fmt(m.bronze)}`;
  else if (have === 'bronze') text = `🥈 ${fmt(m.silver)}`;
  else if (have === 'silver') text = `🥇 ${fmt(m.gold)}`;
  else if (b) text = `👻 ${fmt(b.time)}`;
  $('#target').innerHTML = text.replace(/^(\S+)/, '<span class="emo">$1</span>');
}

function rescue() {
  const p = R.at(T, Math.max(R.START_S, prog - 4));
  Object.assign(car, { x: p.x, z: p.z, h: p.h, vx: 0, vz: 0, yaw: 0, steer: 0, speed: 0, slide: 0, hint: Math.round(prog) });
  stuck = 0; progMark = prog;
  $('#rescue').hidden = true;
  Sound.whoosh();
  Guard.count('↩️ back on the road');
}
$('#rescue').addEventListener('click', rescue);

function speak(text) { Sound.say(text, { rate: 1.1, pitch: 1.0 }); }

function physics() {
  if (state === 'count') {
    count += DT;
    const lit = count < 0.4 ? 0 : count < 1.2 ? 1 : count < 2.0 ? 2 : count < 2.8 ? 3 : 4;
    const lights = [...$('#lights').children];
    if (lit !== physics.lit) {
      physics.lit = lit;
      if (lit >= 1 && lit <= 3) { lights[lit - 1].className = 'red'; beep(440, 0.25); }
      if (lit === 4) { lights.forEach(l => { l.className = 'green'; }); beep(880, 0.6); state = 'race'; }
    }
  }
  if (state === 'race' || state === 'done') {
    const go = state === 'race';
    const input = go && autoDrive ? R.autopilot(T, car) : { steer: go ? steerInput() : 0, brake: go && keys.brake, go };
    const w = R.step(T, SC, car, input, DT);
    if (car.bump > 3 && wasBump <= 0) { Sound.bonk(); wasBump = 0.4; }
    wasBump -= DT;
    if (go) {
      time += DT;
      if (Math.abs(w.d) < 25 && w.s > prog && w.s - prog < 60) prog = w.s;
      // co-driver: call the next corner in good time (and the one after if they run together)
      const notes = T.notes;
      while (noteIdx < notes.length && prog > notes[noteIdx].s + notes[noteIdx].len * 0.5) noteIdx++;
      const n = notes[noteIdx];
      const lead = Math.max(55, Math.min(95, car.speed * 3.4));
      if (n && spokenTo < noteIdx && n.s - prog < lead) {
        let text = R.call(n);
        spokenTo = noteIdx;
        if (n.into && notes[noteIdx + 1]) { text += ', into ' + R.call(notes[noteIdx + 1]).toLowerCase(); spokenTo = noteIdx + 1; }
        speak(text + '!');
      }
      // record for the ghost
      recT += DT;
      if (recT >= 0.1 - 1e-6) { recT = 0; rec.push(Math.round(car.x * 10) / 10, Math.round(car.z * 10) / 10, Math.round(car.h * 100) / 100); }
      // stuck or lost? offer the way back
      if (prog > progMark + 4) { progMark = prog; stuck = 0; } else stuck += DT;
      if ((stuck > 4 || Math.abs(w.d) > 30) && $('#rescue').hidden) $('#rescue').hidden = false;
      if (!$('#rescue').hidden && stuck < 0.5 && Math.abs(w.d) < 12) $('#rescue').hidden = true;
      if (prog >= T.finish) finish();
    } else {
      finishT += DT;
    }
  }
}

function finish() {
  state = 'done';
  finishT = 0;
  $('#rescue').hidden = true;
  crowds.forEach(c => { c.excite = 1; });
  const id = STAGES[stageIdx].id;
  const old = save.best[id];
  const isBest = !old || time < old.time;
  const hadMedal = medalWon(stageIdx);
  if (isBest) { save.best[id] = { time: Math.round(time * 100) / 100, ghost: rec }; store(); }
  const medal = medalOf(stageIdx, time);
  Sound.cheer();
  if (medal) { Guard.won(); Guard.count(`${MEDAL[medal]} ${STAGES[stageIdx].name}`); } else Guard.failed();
  if (medal) Celebrate.burst();
  speak(medal ? `${medal[0].toUpperCase() + medal.slice(1)} medal!` : 'Finished! Try for bronze!');
  setTimeout(() => showResult(time, medal, isBest && !!old, !hadMedal && medal && stageIdx + 1 < STAGES.length), 1600);
}

function showResult(t, medal, newBest, opened) {
  $('#res-pic').textContent = medal ? MEDAL[medal] : '🏁';
  $('#res-time').textContent = fmt(t);
  $('#res-new').hidden = !newBest;
  const b = bestOf(stageIdx);
  $('#res-best').textContent = b ? `Best ${fmt(b.time)}` : '';
  const m = medalsFor(stageIdx);
  $('#res-medals').innerHTML = ['gold', 'silver', 'bronze'].map(k =>
    `<span class="${t <= m[k] ? 'got' : ''}"><span class="emo">${MEDAL[k]}</span> ${fmt(m[k])}</span>`).join('');
  const next = stageIdx + 1 < STAGES.length && unlocked(stageIdx + 1);
  $('#res-next').hidden = !next;
  $('#result').hidden = false;
  if (opened) setTimeout(() => speak(`${STAGES[stageIdx + 1].name} stage is open!`), 1400);
}

// ---------- sheets
function hideSheets() { ['#menu', '#paused', '#result'].forEach(s => { $(s).hidden = true; }); }
function showMenu() {
  hideSheets();
  state = 'menu';
  $('#lights').hidden = true;
  $('#rescue').hidden = true;
  if (!car) placeCar();
  const box = $('#stages');
  box.innerHTML = '';
  STAGES.forEach((st, i) => {
    const b = document.createElement('button');
    const won = medalWon(i), best = bestOf(i);
    b.className = 'stagebtn' + (unlocked(i) ? '' : ' locked');
    b.style.background = '#' + new THREE.Color(st.sky).getHexString();
    b.innerHTML = `<span class="pic">${st.pic}</span>${st.name}<span class="medal">${won ? MEDAL[won] : ''}</span><span class="best">${best ? fmt(best.time) : ''}</span>`;
    b.setAttribute('aria-label', st.name);
    b.addEventListener('click', () => {
      Sound.unlock(); audioStart();
      if (!unlocked(i)) { Sound.nope(); speak(`Win a bronze medal on ${STAGES[i - 1].name} first!`); return; }
      Sound.pop();
      startRace(i);
    });
    box.appendChild(b);
  });
  $('#opt-ghost').classList.toggle('on', !!save.ghost);
  $('#opt-tilt').classList.toggle('on', !!save.tilt);
  $('#menu').hidden = false;
}
$('#opt-ghost').addEventListener('click', () => { save.ghost = !save.ghost; store(); Sound.pop(); showMenu(); });
$('#opt-tilt').addEventListener('click', () => {
  Gate.ask(async () => {
    save.tilt = !save.tilt;
    // iPhones and iPads have to ask first; Android just sends the tilt
    if (save.tilt && typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      try { await DeviceMotionEvent.requestPermission(); } catch (e) {}
    }
    store(); showTilt(); showMenu();
  });
});

function pause() {
  if (state !== 'race' && state !== 'count') return;
  pause.was = state;
  state = 'paused';
  $('#paused').hidden = false;
  if (window.speechSynthesis) speechSynthesis.cancel();
}
$('#pause').addEventListener('click', () => { Sound.pop(); pause(); });
$('#resume').addEventListener('click', () => { Sound.pop(); $('#paused').hidden = true; state = pause.was; tiltZero = tiltAngle; });
$('#restart').addEventListener('click', () => { Sound.pop(); startRace(stageIdx); });
$('#to-menu').addEventListener('click', () => { Sound.pop(); showMenu(); });
$('#res-again').addEventListener('click', () => { Sound.pop(); startRace(stageIdx); });
$('#res-next').addEventListener('click', () => { Sound.pop(); startRace(stageIdx + 1); });
$('#res-menu').addEventListener('click', () => { Sound.pop(); showMenu(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

const muteBtn = $('#mute');
const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); audioStart(); Sound.pop(); });
showMute();

// ---------- the dashboard and pacenote cards
const rpmBars = [];
for (let i = 0; i < 12; i++) { const b = document.createElement('i'); b.style.height = (10 + i * 1.7) + 'px'; $('#rpm').appendChild(b); rpmBars.push(b); }
const GEARS = [0, 6, 11, 16, 21, 25];
function engine() {
  const v = car ? car.speed : 0;
  let g = 1;
  while (g < GEARS.length && v >= GEARS[g]) g++;
  const lo = GEARS[g - 1], hi = GEARS[g] || 30;
  const rpm = v < 0.5 ? 0.18 : 0.3 + 0.68 * Math.min(1, (v - lo) / (hi - lo));
  return { gear: g, rpm };
}

function drawArrow(cv, n) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  x.clearRect(0, 0, W, H);
  const pts = [[0, 0]];
  let px = 0, py = 0, h = -Math.PI / 2;
  for (let i = 0; i < 8; i++) { px += Math.cos(h) * 2; py += Math.sin(h) * 2; pts.push([px, py]); }
  const turn = Math.min(n.deg, 180) * Math.PI / 180 * (n.dir === 'left' ? -1 : 1);
  const r = [0, 6, 9, 13, 18, 26, 36][n.sev];
  const steps = 24;
  for (let i = 0; i < steps; i++) { h += turn / steps; px += Math.cos(h) * r * Math.abs(turn) / steps; py += Math.sin(h) * r * Math.abs(turn) / steps; pts.push([px, py]); }
  for (let i = 0; i < 3; i++) { px += Math.cos(h) * 2; py += Math.sin(h) * 2; pts.push([px, py]); }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min((W - 26) / Math.max(1, maxX - minX), (H - 22) / Math.max(1, maxY - minY), 2.2);
  const ox = W / 2 - (minX + maxX) / 2 * sc, oy = H / 2 - (minY + maxY) / 2 * sc;
  const P = p => [ox + p[0] * sc, oy + p[1] * sc];
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const [w, c] of [[13, '#2b2d42'], [8, '#2fbf5b']]) {
    x.strokeStyle = c; x.lineWidth = w;
    x.beginPath();
    pts.forEach((p, i) => { const q = P(p); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); });
    x.stroke();
  }
  const [ex, ey] = P(pts[pts.length - 1]);
  x.fillStyle = '#2fbf5b'; x.strokeStyle = '#2b2d42'; x.lineWidth = 3;
  x.beginPath();
  x.moveTo(ex + Math.cos(h) * 11, ey + Math.sin(h) * 11);
  x.lineTo(ex + Math.cos(h + 2.3) * 11, ey + Math.sin(h + 2.3) * 11);
  x.lineTo(ex + Math.cos(h - 2.3) * 11, ey + Math.sin(h - 2.3) * 11);
  x.closePath(); x.fill(); x.stroke();
}
const cards = { n1: null, n2: null };
function hud() {
  if (!car) return;
  const racing = state === 'race' || state === 'done' || state === 'paused' || state === 'count';
  ['#top-c', '#prog', '#dash', '#notes'].forEach(s => { $(s).style.visibility = racing ? '' : 'hidden'; });
  document.querySelectorAll('.pad').forEach(el => { el.style.visibility = racing ? '' : 'hidden'; });
  $('#clock').textContent = fmt(time);
  const { gear, rpm } = engine();
  $('#gear').textContent = car.speed < 0.3 && state !== 'race' ? 'N' : gear;
  $('#speed').textContent = Math.round(car.speed * 3.6);
  const lit = Math.round(rpm * rpmBars.length);
  rpmBars.forEach((b, i) => { b.className = i < lit ? (i >= 10 ? 'on top' : i >= 7 ? 'on hi' : 'on') : ''; });
  // progress pins
  const frac = s => Math.max(0, Math.min(1, (s - R.START_S) / (T.finish - R.START_S)));
  $('#pin-car').style.bottom = (frac(prog) * 100) + '%';
  if (ghost && ghostMesh.visible) {
    const gl = R.locate(T, ghostMesh.position.x, ghostMesh.position.z, ghostHint);
    ghostHint = gl.i;
    $('#pin-ghost').style.bottom = (frac(gl.s) * 100) + '%';
  }
  // pacenotes
  const notes = T.notes, n = state === 'race' ? notes[noteIdx] : null;
  const lead = Math.max(55, Math.min(95, car.speed * 3.4)) + 50;
  const show1 = n && n.s - prog < lead ? n : null;
  const n2 = show1 && notes[noteIdx + 1] && notes[noteIdx + 1].s - prog < lead + 60 ? notes[noteIdx + 1] : null;
  const c1 = $('#note1'), c2 = $('#note2');
  if (show1 !== cards.n1) { cards.n1 = show1; if (show1) { drawArrow(c1.querySelector('canvas'), show1); c1.querySelector('.sev').textContent = show1.sev; } }
  c1.hidden = !show1;
  if (show1) {
    const d = Math.round(show1.s - prog);
    c1.querySelector('.dist').textContent = d > 3 ? `${d} m` : 'now!';
    c1.classList.toggle('now', d <= 25);
  }
  if (n2 !== cards.n2) { cards.n2 = n2; if (n2) { drawArrow(c2.querySelector('canvas'), n2); c2.querySelector('.sev').textContent = n2.sev; } }
  c2.hidden = !n2;
  audioUpdate(rpm, state === 'race' || state === 'done' || state === 'count');
}

// ---------- drawing each frame
const fwd = new THREE.Vector3(), look = new THREE.Vector3();
function placeMeshes(dt) {
  carMesh.position.set(car.x, 0, car.z);
  carMesh.rotation.y = car.h;
  const u = carMesh.userData;
  u.wheels.forEach(w => { w.rotation.x += car.speed * dt / 0.43; });
  u.fronts.forEach(f => { f.rotation.y = -car.steer * 0.45; });
  const roll = Math.max(-0.12, Math.min(0.12, car.yaw * car.speed * 0.006));
  u.roll += (roll - u.roll) * Math.min(1, dt * 6);
  const pitch = state === 'race' && keys.brake ? 0.05 : 0;
  u.pitch += (pitch - u.pitch) * Math.min(1, dt * 8);
  u.body.rotation.set(u.pitch, 0, u.roll);

  // dust from the back wheels
  const fx = Math.sin(car.h), fz = Math.cos(car.h), rx = Math.cos(car.h), rz = -Math.sin(car.h);
  let rate = 0;
  if (car.surface !== 'road' && car.speed > 2) rate = 1 + car.speed / 6;
  if (Math.abs(car.slide) > 1.4) rate += Math.abs(car.slide) * 0.8;
  if (car.speed > 12) rate += 0.35;
  if (car.bump) rate += 6;
  rate *= dt * 30;
  while (rate > 0) {
    if (rate >= 1 || Math.random() < rate) {
      const side = Math.random() < 0.5 ? -1 : 1;
      puff(car.x - fx * 1.5 + rx * side * 0.95, car.z - fz * 1.5 + rz * side * 0.95, -car.vx, -car.vz, car.surface === 'sand' || Math.abs(car.slide) > 3);
    }
    rate -= 1;
  }
  moveDust(dt);

  // ghost
  if (ghost && (state === 'race' || state === 'done' || state === 'paused')) {
    const f = time / 0.1, i = Math.floor(f), k = f - i;
    const a = i * 3, b = Math.min(ghost.length - 3, a + 3);
    if (a < ghost.length - 3) {
      ghostMesh.visible = true;
      let dh = ghost[b + 2] - ghost[a + 2];
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      ghostMesh.position.set(ghost[a] + (ghost[b] - ghost[a]) * k, 0, ghost[a + 1] + (ghost[b + 1] - ghost[a + 1]) * k);
      ghostMesh.rotation.y = ghost[a + 2] + dh * k;
    } else ghostMesh.visible = false;
  } else if (ghost && state === 'count') {
    ghostMesh.visible = true;
    ghostMesh.position.set(ghost[0], 0, ghost[1]);
    ghostMesh.rotation.y = ghost[2];
  }
}

function moveCamera(dt) {
  if (state === 'menu') {
    // swing slowly from side to side behind the waiting car
    orbit += dt * 0.35;
    const a = car.h + Math.PI + Math.sin(orbit) * 0.9;
    const d = innerWidth < innerHeight ? 15 : 10;
    camPos.set(car.x + Math.sin(a) * d, 3.6, car.z + Math.cos(a) * d);
    camera.position.copy(camPos);
    camera.lookAt(car.x + Math.sin(car.h) * 4, 1.6, car.z + Math.cos(car.h) * 4);
    return;
  }
  // follow the way the car is going (not where its nose points in a drift), a little behind
  let want = car.h;
  if (car.speed > 4) {
    let d = car.h - Math.atan2(car.vx, car.vz);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    want = Math.atan2(car.vx, car.vz) + d * 0.4;
  }
  let dh = want - camH;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  camH += dh * Math.min(1, dt * 2.6);
  const portrait = innerWidth < innerHeight;
  const back = portrait ? 19 : 15, up = portrait ? 17 : 12.5, ahead = portrait ? 6 : 9;
  fwd.set(Math.sin(camH), 0, Math.cos(camH));
  const target = new THREE.Vector3(car.x - fwd.x * back, up, car.z - fwd.z * back);
  camPos.lerp(target, Math.min(1, dt * 5));
  camera.position.copy(camPos);
  look.set(car.x + fwd.x * ahead, 0, car.z + fwd.z * ahead);
  camera.lookAt(look);
}

let turbo = 1, autoDrive = false, last = performance.now(), acc = 0, clock = 0, slowCheck = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;
  if (state !== 'paused') {
    acc += dt * turbo;
    while (acc >= DT) { physics(); acc -= DT; }
  }
  const vis = state === 'paused' ? 0 : dt;
  if (car) {
    placeMeshes(vis);
    moveCamera(vis || 0.0001);
    moveSnow(vis, car.x, car.z);
    sun.position.set(car.x + 25, 40, car.z - 15);
    sun.target.position.set(car.x, 0, car.z);
  }
  crowds.forEach(c => { c.excite = Math.max(0, c.excite - vis * 0.15); moveCrowd(c, clock); });
  if (state === 'count' && count > 3.6) $('#lights').hidden = true;
  if (state === 'race' && !$('#lights').hidden && count > 2.8 + 0.9) $('#lights').hidden = true;
  if (state === 'race') count += vis;
  hud();
  renderer.render(scene, camera);
  // a slow tablet gets fewer pixels and no shadows
  if (state === 'race' && quality === 'high') {
    slowCheck += 1;
    if (slowCheck > 30 && slowCheck <= 150) slowFrames.push(dt);
    if (slowCheck === 150) {
      const avg = slowFrames.reduce((a, b) => a + b, 0) / slowFrames.length;
      if (avg > 0.03) {
        quality = 'low';
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = false;
        sun.castShadow = false;
        scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
        resize();
      }
    }
  }
}

buildWorld(0);
placeCar();
showMenu();
requestAnimationFrame(frame);
Sound.intro('Race to the finish! Listen to your co-driver for the corners.');
window.__rally = { get state() { return state; }, get car() { return car; }, get time() { return time; }, get prog() { return prog; }, get T() { return T; }, keys, startRace, rescue, R, save, get quality() { return quality; }, set turbo(v) { turbo = v; }, set auto(v) { autoDrive = v; } };
