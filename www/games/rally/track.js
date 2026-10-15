// Rally: the stages, the road, the car's handling and the pacenotes. No drawing here, so it can be tested with node.
// The ground is flat: x across, z along. Heading h points the car along (sin h, cos h);
// steering right makes h go down. Distances are in metres, speeds in metres per second.
const Rally = (() => {
  const WIDTH = 10;            // road width
  const HALF = WIDTH / 2;
  const SHOULDER = 2.5;        // rough edge before the soft sand
  const STEP = 1;              // one road sample per metre
  const START_S = 18;          // where the car waits
  const LINE_S = 26;           // start and finish line (every stage is a loop)
  const STANDS = [-16, -3, 10];  // grandstands either side of the line, this far from it

  // Each stage is drawn like a turtle: straights ['S', metres] and corners ['L' or 'R', degrees, radius].
  // The road is then joined back to the start with the shortest smooth curve-straight-curve of radius `close`.
  const STAGES = [
    {
      id: 1, name: 'Desert', pic: '🏜️', seed: 11,
      grip: 1, sky: 0xf6d7b8, ground: 0xd79a7f, road: 0xedcba6, edge: 0xc98468,
      props: ['rock', 'cactus', 'cactus', 'bush'], far: 'dune',
      close: 40,
      path: [['S', 70], ['R', 77, 60], ['S', 113], ['L', 101, 35], ['S', 34], ['R', 79, 50], ['S', 101], ['R', 55, 40],
        ['S', 52], ['R', 180, 14], ['S', 24], ['L', 99, 28], ['S', 107], ['R', 50, 45], ['S', 26], ['L', 41, 80],
        ['S', 134], ['R', 80, 60], ['S', 35]],
    },
    {
      id: 2, name: 'Canyon', pic: '🏞️', seed: 23,
      grip: 0.95, sky: 0xf4c9a4, ground: 0xc8714e, road: 0xe3b48d, edge: 0xa85a3c,
      props: ['rock', 'rock', 'bush', 'cactus'], far: 'mesa',
      close: 35,
      path: [['S', 70], ['L', 60, 30], ['S', 20], ['R', 90, 22], ['S', 20], ['L', 120, 18], ['S', 77], ['R', 40, 40],
        ['S', 20], ['L', 40, 40], ['S', 20], ['R', 180, 13], ['S', 112], ['L', 180, 13], ['S', 23], ['R', 90, 25],
        ['S', 21], ['R', 120, 30], ['S', 160], ['L', 50, 35], ['S', 20], ['R', 100, 30], ['S', 160], ['R', 60, 40], ['S', 107]],
    },
    {
      id: 3, name: 'Snow', pic: '🏔️', seed: 37,
      grip: 0.72, sky: 0xd6e2ee, ground: 0xeef3f8, road: 0x9fadbd, edge: 0xc4d0dc,
      props: ['pine', 'pine', 'pine', 'rock'], far: 'hill',
      close: 45,
      path: [['S', 70], ['R', 105, 45], ['S', 20], ['L', 76, 30], ['S', 20], ['R', 20, 70], ['S', 24], ['L', 160, 16],
        ['S', 103], ['R', 125, 35], ['S', 24], ['L', 43, 55], ['S', 20], ['R', 70, 55], ['S', 36], ['R', 111, 22],
        ['S', 114], ['L', 40, 50], ['S', 38], ['R', 72, 35], ['S', 135], ['R', 46, 40], ['S', 114]],
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

  // Walk a turtle path: road samples about a metre apart, and a pacenote for each corner.
  function trace(path) {
    const pts = [];   // {x, z, h, k} where k is the bend (1/radius, + for left)
    const notes = [];
    let x = 0, z = 0, h = 0, s = 0;
    pts.push({ x, z, h, k: 0 });
    for (const seg of path) {
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
    return { pts, notes, x, z, h };
  }

  // The shortest way from the end of the road back to the start (heading the same way):
  // turn, straight, turn ("Dubins path"). Only joins that make one proper loop are allowed.
  function closer(path, r) {
    const e = trace(path);
    const mod = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // work in a frame where z is "east" and x is "north", so a left turn is anticlockwise
    const dX = -e.z, dY = -e.x, d = Math.hypot(dX, dY) / r, phi = Math.atan2(dY, dX);
    const a = mod(e.h - phi), b = mod(-phi);
    const sa = Math.sin(a), sb = Math.sin(b), ca = Math.cos(a), cb = Math.cos(b), cab = Math.cos(a - b);
    const opts = [];
    let q = 2 + d * d - 2 * cab + 2 * d * (sa - sb);
    if (q >= 0) { const th = Math.atan2(cb - ca, d + sa - sb); opts.push(['L', mod(-a + th), Math.sqrt(q), 'L', mod(b - th)]); }
    q = 2 + d * d - 2 * cab + 2 * d * (sb - sa);
    if (q >= 0) { const th = Math.atan2(ca - cb, d - sa + sb); opts.push(['R', mod(a - th), Math.sqrt(q), 'R', mod(-b + th)]); }
    q = -2 + d * d + 2 * cab + 2 * d * (sa + sb);
    if (q >= 0) { const p = Math.sqrt(q), th = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p); opts.push(['L', mod(-a + th), p, 'R', mod(-b + th)]); }
    q = d * d - 2 + 2 * cab - 2 * d * (sa + sb);
    if (q >= 0) { const p = Math.sqrt(q), th = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p); opts.push(['R', mod(a - th), p, 'L', mod(b - th)]); }
    const turned = p => p.reduce((t, s) => t + (s[0] === 'L' ? s[1] : s[0] === 'R' ? -s[1] : 0), 0);
    let best = null;
    for (const [t1, A, p, t2, B] of opts) {
      const segs = [[t1, A * 180 / Math.PI, r], ['S', p * r], [t2, B * 180 / Math.PI, r]].filter(s => s[1] > 0.5);
      if (Math.abs(Math.abs(turned(path.concat(segs))) - 360) > 1) continue;
      const len = (A + B + p) * r;
      if (!best || len < best.len) best = { segs, len };
    }
    return best ? best.segs : [];
  }

  // Lay the road out as one loop, plus the pacenotes for each corner.
  function build(stage) {
    const { pts, notes } = trace(stage.path.concat(closer(stage.path, stage.close)));
    pts.pop();   // the last sample is back on the first
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const length = cum[cum.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
    const t = { stage, pts, cum, length, notes, grid: null };
    t.grid = gridOf(pts, 25);
    // join up corners that come straight after one another: "Left three into right four"
    notes.forEach((n, i) => {
      const next = notes[(i + 1) % notes.length];
      const nextS = next.s + (i + 1 === notes.length ? length : 0);
      n.into = nextS - (n.s + n.len) < 30;
    });
    return t;
  }
  // Where the finish line is after this many laps.
  const finishAt = (t, laps) => LINE_S + laps * t.length;
  // How far round the course the car has got, counting laps. Only moves on when the car is near
  // the road and hasn't jumped a big chunk (so cutting across the sand doesn't count).
  function advance(t, prog, w) {
    const s = w.s + t.length * Math.round((prog - w.s) / t.length);
    return Math.abs(w.d) < 25 && s > prog && s - prog < 60 ? s : prog;
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
    const n = t.pts.length;
    if (hint >= 0) for (let j = -30; j < 60; j++) look((hint + j + n) % n);
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
    s = ((s % t.length) + t.length) % t.length;
    let lo = 0, hi = t.cum.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t.cum[m] <= s) lo = m; else hi = m - 1; }
    const p = t.pts[lo];
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
        // big hills and cliffs can't be driven through (or squashed)
        far.push({ kind: t.stage.far, x: p.x, z: p.z, size, rot: r() * Math.PI * 2, rad: { dune: 13, mesa: 14, hill: 17 }[t.stage.far] * size, big: true });
      }
    }
    // the grandstands by the start line (drawn in rally.js) are solid too, and nothing grows in them
    const stands = [];
    for (const side of [-1, 1]) for (const a of STANDS) for (let u = -5; u <= 5; u += 2) for (const dd of [13.9, 16.2, 18.5]) {
      const p = at(t, LINE_S + a + u, side * dd);
      stands.push({ kind: 'stand', x: p.x, z: p.z, rad: 1.5, big: true });
    }
    for (let i = props.length - 1; i >= 0; i--) {
      if (stands.some(q => (q.x - props[i].x) ** 2 + (q.z - props[i].z) ** 2 < 16)) props.splice(i, 1);
    }
    const solid = props.filter(p => p.rad > 0).concat(stands);
    return { props, far, solid, grid: gridOf(solid, 20), farGrid: gridOf(far, 80) };
  }

  // ---------- the vehicles
  // top: top speed on the road (28 is about 100 km/h); lat: how hard it can corner before it slides;
  // edge/sand: how much of its top speed it keeps off the road; drift: extra turn in a handbrake slide.
  const VEHICLES = {
    car: { name: 'Rally car', pic: '🏎️', top: 28, accel: 9, brake: 15, wheelbase: 2.6, lat: 11, radius: 1.3, edge: 0.75, sand: 0.45, drift: 1.9 },
    // quick and nippy, turns tight, squeezes past things
    bike: { name: 'Motorbike', pic: '🏍️', top: 31, accel: 11.5, brake: 14, wheelbase: 1.6, lat: 10.5, radius: 0.7, edge: 0.75, sand: 0.4, drift: 1.5 },
    // slower, but sand hardly slows it and it squashes rocks, cacti and trees flat
    truck: { name: 'Monster truck', pic: '🛻', top: 24, accel: 7.5, brake: 12, wheelbase: 3.2, lat: 9.5, radius: 1.8, edge: 0.95, sand: 0.8, drift: 1.9, crush: true },
  };
  const CAR = VEHICLES.car;

  function newCar(t, kind = 'car') {
    const p = at(t, START_S, 0);
    return { kind, v: VEHICLES[kind], x: p.x, z: p.z, h: p.h, vx: 0, vz: 0, yaw: 0, steer: 0, speed: 0, slide: 0, drift: false, surface: 'road', hint: START_S, bump: 0, crushed: [] };
  }

  // Move the car on by dt seconds. input = {steer: -1..1 (+ is right), brake: bool, go: bool}
  function step(t, sc, car, input, dt) {
    const grip = t.stage.grip, V = car.v;
    car.steer += (input.steer - car.steer) * Math.min(1, dt * 7);
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    const rx = Math.cos(car.h), rz = -Math.sin(car.h);
    let vf = car.vx * fx + car.vz * fz;
    let vl = car.vx * rx + car.vz * rz;

    const where = locate(t, car.x, car.z, car.hint);
    car.hint = where.i;
    const ad = Math.abs(where.d);
    car.surface = ad <= HALF ? 'road' : ad <= HALF + SHOULDER ? 'edge' : 'sand';
    const top = V.top * (car.surface === 'road' ? 1 : car.surface === 'edge' ? V.edge : V.sand);

    car.drift = input.brake && Math.abs(car.steer) > 0.3 && vf > 9;
    if (!input.go) vf = Math.max(0, vf - V.brake * dt);
    else if (input.brake) vf = Math.max(0, vf - (car.drift ? 6 : V.brake) * dt);
    else if (vf < top) vf += V.accel * (1 - vf / top) * dt * (vf < 3 ? 1.6 : 1);
    else vf = Math.max(top, vf - 7 * dt);
    // turning hard scrubs a little speed off
    vf -= Math.abs(car.steer) * 0.25 * vf * dt;

    // steering: tighter at low speed, limited by grip at high speed
    const ang = 0.55 / (1 + vf / 14);
    let want = -car.steer * vf * Math.tan(ang) / V.wheelbase;
    const lim = V.lat * grip * (car.drift ? V.drift : 1) / Math.max(vf, 2);
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

    // bump into rocks and trees (the monster truck squashes them instead)
    car.bump = 0;
    car.crushed = [];
    const hits = near(sc.grid, car.x, car.z, 1).map(i => sc.solid[i]).concat(near(sc.farGrid, car.x, car.z, 1).map(i => sc.far[i]));
    for (const o of hits) {
      if (o.gone) continue;
      const dx = car.x - o.x, dz = car.z - o.z;
      const min = o.rad + V.radius;
      const dd = dx * dx + dz * dz;
      if (dd < min * min && V.crush && !o.big) {
        o.gone = true;
        car.crushed.push(o);
        car.vx *= 0.9; car.vz *= 0.9;
        continue;
      }
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
    const lat = car.v.lat * t.stage.grip * 0.95, n = t.pts.length;
    for (let j = 0; j < 90; j++) {
      const k = Math.abs(t.pts[(here.i + j) % n].k);
      if (!k) continue;
      const vmax = Math.sqrt(lat / k);
      if (car.speed * car.speed > vmax * vmax + 2 * car.v.brake * 0.8 * j) { brake = true; break; }
    }
    return { steer, brake, go: true };
  }

  // How long the autopilot takes; medals are a bit slower than that.
  const medalCache = {};
  function medals(t, kind = 'car', laps = 1) {
    const key = `${t.stage.id}-${kind}-${laps}`;
    if (medalCache[key]) return medalCache[key];
    const sc = scenery(t);
    const car = newCar(t, kind);
    const dt = 1 / 60, end = finishAt(t, laps);
    let time = 0, prog = START_S;
    for (let n = 0; n < 60 * 300 * laps && prog < end; n++) {
      prog = advance(t, prog, step(t, sc, car, autopilot(t, car), dt));
      time += dt;
    }
    const round = v => Math.ceil(v);
    return (medalCache[key] = { ai: time, gold: round(time * 1.12), silver: round(time * 1.35), bronze: round(time * 1.7) });
  }

  // What the co-driver says for a corner.
  const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
  function call(n) {
    const side = n.dir === 'left' ? 'Left' : 'Right';
    const base = n.sev === 1 ? `Hairpin ${n.dir}` : `${side} ${WORDS[n.sev]}`;
    return (n.deg >= 100 && n.sev > 1 ? 'Long ' + base.toLowerCase() : base);
  }

  return { WIDTH, HALF, SHOULDER, START_S, LINE_S, STANDS, STAGES, VEHICLES, CAR, rng, build, closer, finishAt, advance, locate, at, scenery, newCar, step, autopilot, medals, call, severity };
})();

if (typeof module !== 'undefined') module.exports = Rally;
