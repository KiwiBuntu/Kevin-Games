// Parking Garage puzzle logic: cars slide along their lane and leave through
// the door of their own colour. No DOM code, so it can be tested with node.
//
// A car: { horiz, lane (row if horiz, else column), pos (first cell along the lane),
//          len, door (-1 = left/top wall, +1 = right/bottom wall) }
const Lot = (() => {
  const LEVELS = {
    small: { n: 5, cars: [4, 5], moves: [1, 2], free: 2 },
    medium: { n: 6, cars: [7, 8], moves: [2, 4], free: 1 },
    big: { n: 6, cars: [9, 10], moves: [3, 6], free: 1 },
  };

  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  const cellsOf = (n, c, pos = c.pos) => {
    const out = [];
    for (let k = 0; k < c.len; k++) out.push(c.horiz ? c.lane * n + pos + k : (pos + k) * n + c.lane);
    return out;
  };

  // Which car (index) is on each square; pos[] and out[] describe the state.
  function grid(n, cars, pos, out) {
    const g = new Int8Array(n * n).fill(-1);
    cars.forEach((c, i) => { if (!out[i]) for (const cell of cellsOf(n, c, pos[i])) g[cell] = i; });
    return g;
  }

  const at = (n, c, k) => (c.horiz ? c.lane * n + k : k * n + c.lane);

  // How far a car can slide each way: [lowest pos, highest pos].
  function range(n, cars, g, i, p) {
    const c = cars[i];
    let lo = p, hi = p;
    while (lo > 0 && g[at(n, c, lo - 1)] === -1) lo--;
    while (hi + c.len < n && g[at(n, c, hi + c.len)] === -1) hi++;
    return [lo, hi];
  }

  // Can the car drive straight out of its door from where it is?
  function canExit(n, cars, g, i, p) {
    const [lo, hi] = range(n, cars, g, i, p);
    return cars[i].door < 0 ? lo === 0 : hi === n - cars[i].len;
  }

  // Let every car that can leave, leave (it never hurts — it only makes room).
  function drain(n, cars, pos, out) {
    let left = 0, again = true;
    while (again) {
      again = false;
      const g = grid(n, cars, pos, out);
      for (let i = 0; i < cars.length; i++) {
        if (!out[i] && canExit(n, cars, g, i, pos[i])) { out[i] = 1; left++; again = true; break; }
      }
    }
    return left;
  }

  // Fewest slides to empty the garage (exits are free). Returns { moves, first } or null.
  // `first` is the first slide to make: { car, to } (or { car, exit: true }).
  function solve(n, cars, pos0, out0, limit = 40000) {
    const pos = pos0.slice(), out = out0.slice();
    const g0 = grid(n, cars, pos, out);
    // If a car can already drive out, that's the best first step.
    let exitNow = null;
    for (let i = 0; i < cars.length && !exitNow; i++) if (!out[i] && canExit(n, cars, g0, i, pos[i])) exitNow = { car: i, exit: true };
    const sol = slides(n, cars, pos, out, limit);
    if (sol && exitNow) sol.first = exitNow;
    return sol;
  }

  function slides(n, cars, pos, out, limit) {
    drain(n, cars, pos, out);
    const key = (p, o) => { let k = 0; for (let i = 0; i < p.length; i++) k = k * 8 + (o[i] ? 7 : p[i]); return k; };
    const start = key(pos, out);
    if (out.every(Boolean)) return { moves: 0, first: null };
    const seen = new Set([start]);
    let frontier = [{ pos, out, first: null }];
    for (let depth = 1; frontier.length; depth++) {
      const next = [];
      for (const s of frontier) {
        const g = grid(n, cars, s.pos, s.out);
        for (let i = 0; i < cars.length; i++) {
          if (s.out[i]) continue;
          const [lo, hi] = range(n, cars, g, i, s.pos[i]);
          for (let p = lo; p <= hi; p++) {
            if (p === s.pos[i]) continue;
            const np = s.pos.slice(), no = s.out.slice();
            np[i] = p;
            drain(n, cars, np, no);
            const k = key(np, no);
            if (seen.has(k)) continue;
            const first = s.first || { car: i, to: p };
            if (no.every(Boolean)) return { moves: depth, first };
            seen.add(k);
            if (seen.size > limit) return null;
            next.push({ pos: np, out: no, first });
          }
        }
      }
      frontier = next;
    }
    return null;
  }

  function attempt(cfg) {
    const n = cfg.n;
    const want = randInt(cfg.cars[0], cfg.cars[1]);
    const cars = [];
    const g = new Int8Array(n * n).fill(-1);
    const perLane = {};
    for (let tries = 0; tries < 300 && cars.length < want; tries++) {
      const horiz = Math.random() < 0.5;
      const len = n >= 6 && Math.random() < 0.25 ? 3 : 2;
      const c = { horiz, lane: randInt(0, n - 1), pos: randInt(0, n - len), len, door: 0 };
      const cells = cellsOf(n, c);
      if (cells.some(x => g[x] !== -1)) continue;
      const lk = `${horiz}${c.lane}`;
      if ((perLane[lk] || 0) >= 2) continue; // a lane has only two doors
      perLane[lk] = (perLane[lk] || 0) + 1;
      cells.forEach(x => { g[x] = cars.length; });
      cars.push(c);
    }
    if (cars.length < want) return null;
    // Doors: mostly put each door on the side with cars in the way, so cars block each other.
    const doors = new Set();
    const blockers = (c, d) => {
      let count = 0;
      const ks = d < 0 ? Array.from({ length: c.pos }, (_, k) => k) : Array.from({ length: n - c.pos - c.len }, (_, k) => c.pos + c.len + k);
      for (const k of ks) if (g[at(n, c, k)] !== -1) count++;
      return count;
    };
    for (const c of cars.slice().sort(() => Math.random() - 0.5)) {
      const sides = [-1, 1].filter(d => !doors.has(`${c.horiz}${c.lane}${d}`));
      sides.sort((a, b) => blockers(c, b) - blockers(c, a) + (Math.random() < 0.2 ? 5 * (Math.random() - 0.5) : 0));
      c.door = sides[0];
      doors.add(`${c.horiz}${c.lane}${c.door}`);
    }
    const pos = cars.map(c => c.pos), out = cars.map(() => 0);
    const sol = solve(n, cars, pos, out, 4000); // anything needing a huge search is too hard anyway
    if (!sol) return null;
    const free = cars.filter((c, i) => canExit(n, cars, grid(n, cars, pos, out), i, pos[i])).length;
    return { cars, moves: sol.moves, free };
  }

  // A garage that can always be emptied, with a solution length that suits the level.
  function generate(cfg, budgetMs = 600) {
    let best = null;
    const t0 = Date.now();
    for (let i = 0; i < 400 && (!best || Date.now() - t0 < budgetMs); i++) {
      const a = attempt(cfg);
      if (!a || a.free === 0 || a.free > cfg.free) continue;
      const [lo, hi] = cfg.moves;
      const miss = a.moves < lo ? lo - a.moves : a.moves > hi ? a.moves - hi : 0;
      if (!best || miss < best.miss) best = { ...a, miss };
      if (miss === 0) break;
    }
    return best;
  }

  return { LEVELS, cellsOf, grid, range, canExit, solve, generate };
})();

if (typeof module !== 'undefined') module.exports = Lot;
