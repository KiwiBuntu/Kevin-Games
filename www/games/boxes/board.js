// Dots & Boxes: the rules and the Android's brain. No drawing here, so it can be tested with node.
// A board of n×n boxes has (n+1)×(n+1) dots. Lines are numbered: first the across lines
// (row r of dots, gap c) = r*n + c, then the up-and-down lines (row r, dot c) = n*(n+1) + r*(n+1) + c.
const Boxes = (() => {
  const geo = {};
  // Which boxes each line touches, and the four lines round each box (worked out once per size).
  function shape(n) {
    if (geo[n]) return geo[n];
    const H = n * (n + 1), E = 2 * H;
    const h = (r, c) => r * n + c, v = (r, c) => H + r * (n + 1) + c;
    const boxLines = [], lineBoxes = Array.from({ length: E }, () => []);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const b = r * n + c;
      const ls = [h(r, c), h(r + 1, c), v(r, c), v(r, c + 1)];
      boxLines.push(ls);
      ls.forEach(l => lineBoxes[l].push(b));
    }
    // the two dots at each end of a line, as [row, col]
    const ends = [];
    for (let e = 0; e < E; e++) {
      if (e < H) { const r = Math.floor(e / n), c = e % n; ends.push([[r, c], [r, c + 1]]); }
      else { const k = e - H, r = Math.floor(k / (n + 1)), c = k % (n + 1); ends.push([[r, c], [r + 1, c]]); }
    }
    return (geo[n] = { n, H, E, boxLines, lineBoxes, ends });
  }

  const make = n => {
    const g = shape(n);
    return { n, lines: Array(g.E).fill(0), owner: Array(n * n).fill(0), sides: Array(n * n).fill(0), score: { 1: 0, 2: 0 } };
  };
  const copy = s => ({ n: s.n, lines: s.lines.slice(), owner: s.owner.slice(), sides: s.sides.slice(), score: { ...s.score } });
  const open = s => { const m = []; s.lines.forEach((p, e) => { if (!p) m.push(e); }); return m; };
  const done = s => s.lines.every(p => p);

  // Draw line e for player p. Returns the boxes it finished (0, 1 or 2 of them).
  function play(s, e, p) {
    if (s.lines[e]) return null;
    s.lines[e] = p;
    const got = [];
    for (const b of shape(s.n).lineBoxes[e]) {
      if (++s.sides[b] === 4) { s.owner[b] = p; s.score[p]++; got.push(b); }
    }
    return got;
  }

  // Lines that finish a box straight away.
  function takers(s) {
    const g = shape(s.n), out = [];
    s.sides.forEach((k, b) => { if (k === 3) for (const l of g.boxLines[b]) if (!s.lines[l] && !out.includes(l)) out.push(l); });
    return out;
  }
  // Would this line leave a box with three sides (a present for the other player)?
  function givesAway(s, e) {
    const g = shape(s.n);
    if (g.lineBoxes[e].some(b => s.sides[b] === 3)) return false; // it takes a box, not gives one
    return g.lineBoxes[e].some(b => s.sides[b] === 2);
  }
  const safe = s => open(s).filter(e => !givesAway(s, e) && !shape(s.n).lineBoxes[e].some(b => s.sides[b] === 3));

  // Take every box going, as many times as possible. Returns how many.
  function grab(s, p) {
    let got = 0, t;
    while ((t = takers(s)).length) got += play(s, t[0], p).length;
    return got;
  }
  // How many boxes the other player would get if p drew line e (and they took everything).
  function sacrifice(s, e, p) {
    const t = copy(s);
    play(t, e, p);
    return grab(t, 3 - p);
  }

  // The rest of the board as a list of "chains": how many boxes go with each give-away.
  // Only meaningful once there are no safe lines left.
  function chains(s, p = 1) {
    const t = copy(s), out = [];
    let guard = 200;
    while (!done(t) && guard--) {
      grab(t, p);
      const ms = open(t);
      if (!ms.length) break;
      let best = ms[0], bestK = Infinity;
      for (const e of ms) { const k = sacrifice(t, e, p); if (k < bestK) { bestK = k; best = e; } }
      play(t, best, p);
      const k = grab(t, 3 - p);
      if (k) out.push(k);
    }
    return out;
  }

  // Net boxes (mine minus theirs) for whoever has to open the next chain, if both play well:
  // the other player either takes the whole chain (and then has to open the next one), or
  // takes all but two and hands back the last two (keeping control). Only chains of 3+ can be handed back.
  const memo = new Map();
  function value(cs) {
    if (!cs.length) return 0;
    const key = cs.slice().sort((a, b) => a - b).join(',');
    if (memo.has(key)) return memo.get(key);
    let best = -Infinity;
    const tried = new Set();
    for (let i = 0; i < cs.length; i++) {
      const k = cs[i];
      if (tried.has(k)) continue;
      tried.add(k);
      const rest = cs.slice(0, i).concat(cs.slice(i + 1));
      const v = value(rest);
      let theirBest = k + v;                     // they take all k, then they must open
      if (k >= 3) theirBest = Math.max(theirBest, k - 4 - v); // they take k-2, give 2, we must open again
      best = Math.max(best, -theirBest);
    }
    if (memo.size > 50000) memo.clear();
    memo.set(key, best);
    return best;
  }

  const LEVELS = {
    // ⭐ draws mostly any old line, sometimes misses a box
    1: { take: 0.6, careful: 0.35 },
    // ⭐⭐ always takes boxes, never gives one away while it has a choice, gives away as few as it can
    2: { take: 1, careful: 1 },
    // ⭐⭐ plus the endgame trick: hands back the last two boxes of a chain to keep control
    3: { take: 1, careful: 1, clever: true },
  };
  const pickOne = (a, rand) => a[Math.floor(rand() * a.length)];

  // Choose the Android's next line.
  function bestMove(st, p, level, rand = Math.random) {
    const L = LEVELS[level] || LEVELS[2];
    const s = copy(st);
    const g = shape(s.n);
    const ms = open(s);
    if (ms.length === 1) return ms[0];
    const take = takers(s);
    const safeNow = safe(s);

    if (take.length && rand() < L.take) {
      // The endgame trick: with exactly two boxes left to take, and nothing safe anywhere else,
      // decide whether to hand them back so the other player has to open the next chain.
      if (L.clever) {
        const after = copy(s);
        const k = grab(after, p);
        if (k === 2 && !safe(after).length && !done(after)) {
          const v = value(chains(after, p));
          if (v < -2) {
            // a line that leaves exactly those two boxes for them, and nothing else
            for (const e of ms) {
              if (take.includes(e)) continue;
              const t = copy(s);
              if (play(t, e, p).length) continue;
              if (grab(copy(t), 3 - p) === 2 && takers(t).length === 1) return e;
            }
          }
        }
      }
      return pickOne(take, rand);
    }

    if (rand() >= L.careful) {
      // ⭐ being careless: any line, a little more likely a safe one
      return pickOne(safeNow.length && rand() < 0.5 ? safeNow : ms, rand);
    }
    if (safeNow.length) return pickOne(safeNow, rand);

    // No safe lines: give away as little as possible (⭐⭐⭐ picks which chain by looking ahead).
    const cost = ms.map(e => ({ e, k: sacrifice(s, e, p) }));
    let pool;
    if (L.clever) {
      const cs = chains(s, p);
      let bestK = cs[0], bestV = -Infinity;
      for (let i = 0; i < cs.length; i++) {
        const k = cs[i], rest = cs.slice(0, i).concat(cs.slice(i + 1)), v = value(rest);
        let theirs = k + v;
        if (k >= 3) theirs = Math.max(theirs, k - 4 - v);
        if (-theirs > bestV) { bestV = -theirs; bestK = k; }
      }
      pool = cost.filter(c => c.k === bestK);
      if (!pool.length) { const min = Math.min(...cost.map(c => c.k)); pool = cost.filter(c => c.k === min); }
      // open a two-box chain in the middle, so it can't be handed back
      if (bestK === 2) {
        const mid = pool.filter(c => g.lineBoxes[c.e].length === 2 && g.lineBoxes[c.e].every(b => s.sides[b] === 2));
        if (mid.length) pool = mid;
      }
    } else {
      const min = Math.min(...cost.map(c => c.k));
      pool = cost.filter(c => c.k === min);
    }
    return pickOne(pool, rand).e;
  }

  // Boxes waiting to be taken (for the hint glow).
  function hintBoxes(s) { const out = []; s.sides.forEach((k, b) => { if (k === 3) out.push(b); }); return out; }

  return { shape, make, copy, open, done, play, takers, givesAway, safe, grab, sacrifice, chains, value, bestMove, hintBoxes, LEVELS };
})();

if (typeof module !== 'undefined') module.exports = Boxes;
