// Rally: the stages, the road, the car's handling and the pacenotes. No drawing here, so it can be tested with node.
// The ground is flat: x across, z along. Heading h points the car along (sin h, cos h);
// steering right makes h go down. Distances are in metres, speeds in metres per second.
const Rally = (() => {
  const WIDTH = 10;            // road width
  const HALF = WIDTH / 2;
  const SHOULDER = 2.5;        // rough edge before the soft sand
  const STEP = 1;              // one road sample per metre
  const START_S = 18;          // where the car waits
  const LINE_S = 26;           // start line
  const END_PAD = 70;          // road left after the finish line

  // Each stage is drawn like a turtle: straights ['S', metres] and corners ['L' or 'R', degrees, radius].
  const STAGES = [
    {
      id: 1, name: 'Desert', pic: '🏜️', seed: 11,
      grip: 1, sky: 0xf6d7b8, ground: 0xd79a7f, road: 0xedcba6, edge: 0xc98468,
      props: ['rock', 'cactus', 'cactus', 'bush'], far: 'dune',
      path: [['S', 70], ['R', 45, 60], ['S', 70], ['L', 90, 35], ['S', 60], ['R', 60, 50], ['S', 40], ['L', 30, 80],
        ['S', 90], ['R', 180, 14], ['S', 70], ['L', 70, 28], ['S', 50], ['R', 40, 60], ['S', 70], ['L', 90, 45],
        ['S', 60], ['R', 30, 90], ['S', 50 + END_PAD]],
    },
    {
      id: 2, name: 'Canyon', pic: '🏞️', seed: 23,
      grip: 0.95, sky: 0xf4c9a4, ground: 0xc8714e, road: 0xe3b48d, edge: 0xa85a3c,
      props: ['rock', 'rock', 'bush', 'cactus'], far: 'mesa',
      path: [['S', 60], ['L', 60, 30], ['S', 30], ['R', 90, 22], ['S', 50], ['L', 120, 18], ['S', 40], ['R', 40, 40],
        ['L', 40, 40], ['S', 60], ['R', 180, 13], ['S', 50], ['L', 180, 13], ['S', 60], ['R', 90, 25], ['S', 40],
        ['L', 50, 35], ['S', 70], ['R', 70, 28], ['S', 60], ['L', 30, 60], ['S', 40 + END_PAD]],
    },
    {
      id: 3, name: 'Snow', pic: '🏔️', seed: 37,
      grip: 0.72, sky: 0xd6e2ee, ground: 0xeef3f8, road: 0x9fadbd, edge: 0xc4d0dc,
      props: ['pine', 'pine', 'pine', 'rock'], far: 'hill',
      path: [['S', 70], ['R', 70, 45], ['S', 50], ['L', 100, 30], ['S', 40], ['R', 30, 70], ['S', 60], ['L', 160, 16],
        ['S', 50], ['R', 90, 35], ['S', 40], ['L', 45, 55], ['R', 45, 55], ['S', 70], ['R', 120, 22], ['S', 60],
        ['L', 60, 40], ['S', 50 + END_PAD]],
    },
  ];

  // Small seeded random numbers, so a stage always looks the same.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // How sharp a corner is, rally style: 1 is a hairpin, 6 is barely a bend.
  function severity(radius, degrees) {
    if (radius < 15 || (radius < 19 && degrees >= 150)) return 1;
    if (radius < 23) return 2;
    if (radius < 33) return 3;
    if (radius < 46) return 4;
    if (radius < 66) return 5;
    return 6;
  }

  // Lay the road out as samples one metre apart, plus the pacenotes for each corner.
  function build(stage) {
    const pts = [];   // {x, z, h, k} where k is the bend (1/radius, + for left)
    const notes = [];
    let x = 0, z = 0, h = 0, s = 0;
    pts.push({ x, z, h, k: 0 });
    for (const seg of stage.path) {
      const [type, a, r] = seg;
      if (type !== 'S') {
        notes.push({ s, dir: type === 'R' ? 'right' : 'left', sev: severity(r, a), deg: a, len: Math.round(a * Math.PI / 180 * r) });
      }
      const len = type === 'S' ? a : a * Math.PI / 180 * r;
      const n = Math.max(1, Math.round(len / STEP));
      const k = type === 'S' ? 0 : (type === 'L' ? 1 : -1) / r;
      const dh = type === 'S' ? 0 : (type === 'L' ? 1 : -1) * a * Math.PI / 180 / n;
      const ds = len / n;
      for (let i = 0; i < n; i++) {
        // move half a turn, step, then the other half, so arcs stay round
        h += dh / 2;
        x += Math.sin(h) * ds;
        z += Math.cos(h) * ds;
        h += dh / 2;
        s += ds;
        pts.push({ x, z, h, k });
      }
    }
    // spread the samples out evenly by distance (they nearly are already)
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const length = cum[cum.length - 1];
    const finish = length - END_PAD;
    const t = { stage, pts, cum, length, finish, notes, grid: null };
    t.grid = gridOf(pts, 25);
    // join up corners that come straight after one another: "Left three into right four"
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i], next = notes[i + 1];
      const endS = n.s + n.len;
      n.into = !!next && next.s - endS < 30;
    }
    return t;
  }

  function gridOf(items, cell) {
    const g = new Map();
    items.forEach((p, i) => {
      const key = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell);
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(i);
    });
    return { cell, g };
  }
  function near(grid, x, z, reach = 1) {
    const out = [];
    const cx = Math.floor(x / grid.cell), cz = Math.floor(z / grid.cell);
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const a = grid.g.get((cx + i) + ',' + (cz + j));
      if (a) for (const k of a) out.push(k);
    }
    return out;
  }

  // Where a point is along the road: nearest sample i, distance along s, and how far off
  // the middle d (+ is to the right of the road).
  function locate(t, x, z, hint = -1) {
    let best = -1, bd = Infinity;
    const look = (i) => {
      const p = t.pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    };
    if (hint >= 0) for (let i = Math.max(0, hint - 30); i < Math.min(t.pts.length, hint + 60); i++) look(i);
    if (best < 0 || bd > 30 * 30) {
      const cand = near(t.grid, x, z, 1);
      if (cand.length) { bd = Infinity; for (const i of cand) look(i); }
      else for (let i = 0; i < t.pts.length; i++) look(i);
    }
    const p = t.pts[best];
    // right of the heading is (cos h, -sin h)
    const d = (x - p.x) * Math.cos(p.h) - (z - p.z) * Math.sin(p.h);
    return { i: best, s: t.cum[best], d, off: Math.sqrt(bd) };
  }

  // A point on the road at distance s, d metres right of the middle.
  function at(t, s, d = 0) {
    const i = Math.max(0, Math.min(t.pts.length - 1, Math.round(s / STEP)));
    const p = t.pts[i];
    return { x: p.x + Math.cos(p.h) * d, z: p.z - Math.sin(p.h) * d, h: p.h };
  }

  // Roadside things: solid ones (rocks, cacti, trees) the car bumps into, and far-off scenery.
  function scenery(t) {
    const r = rng(t.stage.seed);
    const props = [], far = [];
    const clear = (x, z, gap) => {
      for (const i of near(t.grid, x, z, 2)) {
        const p = t.pts[i];
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < gap * gap) return false;
      }
      return true;
    };
    for (let s = 10; s < t.length; s += 5) {
      for (const side of [-1, 1]) {
        if (r() > 0.55) continue;
        const d = side * (HALF + SHOULDER + 4 + r() ** 2 * 45);
        const p = at(t, s + r() * 4, d);
        const kind = t.stage.props[Math.floor(r() * t.stage.props.length)];
        const size = 0.7 + r() * 0.8;
        if (!clear(p.x, p.z, HALF + SHOULDER + 3 + size)) continue;
        if (props.some(q => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 16)) continue;
        props.push({ kind, x: p.x, z: p.z, size, rot: r() * Math.PI * 2, rad: kind === 'bush' ? 0 : (kind === 'rock' ? 1.3 : 0.7) * size });
      }
    }
    // big scenery well away from the road
    for (let s = 0; s < t.length; s += 30) {
      for (const side of [-1, 1]) {
        if (r() > 0.7) continue;
        const d = side * (60 + r() * 90);
        const p = at(t, s, d);
        const size = 1 + r() * 2;
        if (!clear(p.x, p.z, 45 + size * 6)) continue;
        far.push({ kind: t.stage.far, x: p.x, z: p.z, size, rot: r() * Math.PI * 2 });
      }
    }
    const solid = props.filter(p => p.rad > 0);
    return { props, far, solid, grid: gridOf(solid, 20) };
  }

  // ---------- the car
  const CAR = {
    top: 28,          // top speed on the road (about 100 km/h)
    accel: 9,
    brake: 15,
    wheelbase: 2.6,
    lat: 11,          // how hard it can corner before it slides
    radius: 1.3,
  };

  function newCar(t) {
    const p = at(t, START_S, 0);
    return { x: p.x, z: p.z, h: p.h, vx: 0, vz: 0, yaw: 0, steer: 0, speed: 0, slide: 0, drift: false, surface: 'road', hint: START_S, bump: 0 };
  }

  // Move the car on by dt seconds. input = {steer: -1..1 (+ is right), brake: bool, go: bool}
  function step(t, sc, car, input, dt) {
    const grip = t.stage.grip;
    car.steer += (input.steer - car.steer) * Math.min(1, dt * 7);
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    const rx = Math.cos(car.h), rz = -Math.sin(car.h);
    let vf = car.vx * fx + car.vz * fz;
    let vl = car.vx * rx + car.vz * rz;

    const where = locate(t, car.x, car.z, car.hint);
    car.hint = where.i;
    const ad = Math.abs(where.d);
    car.surface = ad <= HALF ? 'road' : ad <= HALF + SHOULDER ? 'edge' : 'sand';
    const top = CAR.top * (car.surface === 'road' ? 1 : car.surface === 'edge' ? 0.75 : 0.45);

    car.drift = input.brake && Math.abs(car.steer) > 0.3 && vf > 9;
    if (!input.go) vf = Math.max(0, vf - CAR.brake * dt);
    else if (input.brake) vf = Math.max(0, vf - (car.drift ? 6 : CAR.brake) * dt);
    else if (vf < top) vf += CAR.accel * (1 - vf / top) * dt * (vf < 3 ? 1.6 : 1);
    else vf = Math.max(top, vf - 7 * dt);
    // turning hard scrubs a little speed off
    vf -= Math.abs(car.steer) * 0.25 * vf * dt;

    // steering: tighter at low speed, limited by grip at high speed
    const ang = 0.55 / (1 + vf / 14);
    let want = -car.steer * vf * Math.tan(ang) / CAR.wheelbase;
    const lim = CAR.lat * grip * (car.drift ? 1.9 : 1) / Math.max(vf, 2);
    want = Math.max(-lim, Math.min(lim, want));
    car.yaw += (want - car.yaw) * Math.min(1, dt * 9);
    car.h += car.yaw * dt;

    // sideways sliding dies away quickly with grip, slowly in a handbrake drift or on snow
    const hold = (car.drift ? 2.2 : 9) * grip * (car.surface === 'sand' ? 0.8 : 1);
    // the car keeps moving the way it was going, now partly sideways to its new heading...
    const nfx = Math.sin(car.h), nfz = Math.cos(car.h), nrx = Math.cos(car.h), nrz = -Math.sin(car.h);
    const mx = fx * vf + rx * vl, mz = fz * vf + rz * vl;
    vf = mx * nfx + mz * nfz;
    vl = mx * nrx + mz * nrz;
    // ...then the tyres turn most of that slide back into going forwards
    const keep = Math.exp(-hold * dt);
    const lost = vl * vl * (1 - keep * keep);
    vl *= keep;
    if (vf > 0) vf = Math.sqrt(vf * vf + lost * 0.85);
    car.vx = nfx * vf + nrx * vl;
    car.vz = nfz * vf + nrz * vl;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.speed = Math.max(0, vf);
    car.slide = vl;

    // bump into rocks and trees
    car.bump = 0;
    for (const i of near(sc.grid, car.x, car.z, 1)) {
      const o = sc.solid[i];
      const dx = car.x - o.x, dz = car.z - o.z;
      const min = o.rad + CAR.radius;
      const dd = dx * dx + dz * dz;
      if (dd < min * min && dd > 1e-6) {
        const d = Math.sqrt(dd), nx = dx / d, nz = dz / d;
        car.x = o.x + nx * min;
        car.z = o.z + nz * min;
        const into = car.vx * nx + car.vz * nz;
        if (into < 0) {
          car.vx -= 1.4 * into * nx;
          car.vz -= 1.4 * into * nz;
          car.vx *= 0.55; car.vz *= 0.55;
          car.bump = Math.max(car.bump, -into);
        }
      }
    }
    return where;
  }

  // Ideal-ish driver, used to check the stages can be driven and to set the medal times.
  function autopilot(t, car) {
    const here = locate(t, car.x, car.z, car.hint);
    const ahead = at(t, here.s + Math.max(7, car.speed * 0.55));
    let err = Math.atan2(ahead.x - car.x, ahead.z - car.z) - car.h;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    const steer = Math.max(-1, Math.min(1, -err * 3));
    // slow down for the bends coming up
    let brake = false;
    const lat = CAR.lat * t.stage.grip * 0.95;
    for (let i = here.i; i < Math.min(t.pts.length, here.i + 90); i++) {
      const k = Math.abs(t.pts[i].k);
      if (!k) continue;
      const vmax = Math.sqrt(lat / k);
      const dist = t.cum[i] - here.s;
      if (car.speed * car.speed > vmax * vmax + 2 * CAR.brake * 0.8 * dist) { brake = true; break; }
    }
    return { steer, brake, go: true };
  }

  // How long the autopilot takes; medals are a bit slower than that.
  const medalCache = {};
  function medals(t) {
    const id = t.stage.id;
    if (medalCache[id]) return medalCache[id];
    const sc = scenery(t);
    const car = newCar(t);
    const dt = 1 / 60;
    let time = 0;
    for (let n = 0; n < 60 * 400; n++) {
      const w = step(t, sc, car, autopilot(t, car), dt);
      time += dt;
      if (w.s >= t.finish) break;
    }
    const round = v => Math.ceil(v);
    return (medalCache[id] = { ai: time, gold: round(time * 1.12), silver: round(time * 1.35), bronze: round(time * 1.7) });
  }

  // What the co-driver says for a corner.
  const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
  function call(n) {
    const side = n.dir === 'left' ? 'Left' : 'Right';
    const base = n.sev === 1 ? `Hairpin ${n.dir}` : `${side} ${WORDS[n.sev]}`;
    return (n.deg >= 100 && n.sev > 1 ? 'Long ' + base.toLowerCase() : base);
  }

  return { WIDTH, HALF, SHOULDER, START_S, LINE_S, STAGES, CAR, rng, build, locate, at, scenery, newCar, step, autopilot, medals, call, severity };
})();

if (typeof module !== 'undefined') module.exports = Rally;
