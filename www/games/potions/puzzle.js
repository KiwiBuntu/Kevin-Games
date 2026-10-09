// Potion Sort puzzle logic. No DOM code, so it can be tested with node.
// A flask is an array of colour numbers from the bottom up; each holds CAP units.
const Puzzle = (() => {
  const CAP = 4;

  // Level n (from 1): how many colours and empty flasks.
  function shapeFor(n) {
    const colours = Math.min(7, 2 + Math.floor((n - 1) / 3));
    return { colours, empties: colours <= 3 ? 1 : 2 };
  }

  const top = f => f[f.length - 1];
  const topRun = f => { let k = 0; while (k < f.length && f[f.length - 1 - k] === top(f)) k++; return k; };
  const done = f => f.length === CAP && f.every(c => c === f[0]);
  const solved = flasks => flasks.every(f => f.length === 0 || done(f));

  // Can we pour from a into b, and how much goes?
  function pourAmount(flasks, a, b) {
    const A = flasks[a], B = flasks[b];
    if (a === b || !A.length || done(A) || B.length >= CAP) return 0;
    if (B.length && top(B) !== top(A)) return 0;
    return Math.min(topRun(A), CAP - B.length);
  }

  function pour(flasks, a, b) {
    const n = pourAmount(flasks, a, b);
    const next = flasks.map(f => f.slice());
    for (let i = 0; i < n; i++) next[b].push(next[a].pop());
    return { flasks: next, amount: n };
  }

  // Moves worth considering: skip tipping a single-colour flask into an empty one (it changes nothing).
  function usefulMoves(flasks) {
    const out = [];
    for (let a = 0; a < flasks.length; a++) for (let b = 0; b < flasks.length; b++) {
      if (!pourAmount(flasks, a, b)) continue;
      if (!flasks[b].length && flasks[a].every(c => c === flasks[a][0])) continue;
      out.push([a, b]);
    }
    return out;
  }

  // Flask order doesn't matter for solving, so sort them for the "seen" check.
  const key = flasks => flasks.map(f => f.join('')).sort().join('|');

  // Depth-first search with memory. Returns the number of moves found, or -1 if
  // it can't be done, or null if we gave up looking (treat as "probably fine").
  function solve(flasks, limit = 60000) {
    const seen = new Set();
    let nodes = 0;
    function go(fl, depth) {
      if (solved(fl)) return depth;
      const k = key(fl);
      if (seen.has(k)) return -1;
      seen.add(k);
      if (++nodes > limit) throw new Error('limit');
      // try moves that finish a colour or pour onto a matching colour first
      const moves = usefulMoves(fl).sort((m1, m2) => score(fl, m2) - score(fl, m1));
      for (const [a, b] of moves) {
        const r = go(pour(fl, a, b).flasks, depth + 1);
        if (r >= 0) return r;
      }
      return -1;
    }
    try { return go(flasks, 0); } catch (e) { return null; }
  }
  function score(fl, [a, b]) {
    const B = fl[b];
    return (B.length ? 3 : 0) + (B.length + pourAmount(fl, a, b) === CAP && B.every(c => c === top(fl[a])) ? 5 : 0) + topRun(fl[a]);
  }

  // A shuffled, solvable level: full flasks of mixed colours plus the empty ones.
  function make(n, rand = Math.random) {
    const { colours, empties } = shapeFor(n);
    let best = null;
    for (let tries = 0; tries < 200; tries++) {
      const units = [];
      for (let c = 0; c < colours; c++) for (let i = 0; i < CAP; i++) units.push(c);
      for (let i = units.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [units[i], units[j]] = [units[j], units[i]]; }
      const flasks = [];
      for (let c = 0; c < colours; c++) flasks.push(units.slice(c * CAP, c * CAP + CAP));
      for (let e = 0; e < empties; e++) flasks.push([]);
      // not too easy: no flask already sorted, and colours well mixed
      if (flasks.some(f => f.length && f.every(c => c === f[0]))) continue;
      const mixed = flasks.reduce((s, f) => s + f.filter((c, i) => i && c !== f[i - 1]).length, 0);
      const moves = solve(flasks);
      if (moves === -1) continue;
      const cand = { flasks, mixed, moves };
      if (!best || cand.mixed > best.mixed) best = cand;
      if (mixed >= colours * (CAP - 1) * 0.75) break;
    }
    return best.flasks;
  }

  return { CAP, shapeFor, top, topRun, done, solved, pourAmount, pour, usefulMoves, solve, make };
})();

if (typeof module !== 'undefined') module.exports = Puzzle;
