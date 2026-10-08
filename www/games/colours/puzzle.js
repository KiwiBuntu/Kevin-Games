// Connect the Colours puzzle maker. Builds the answer first (random wiggly paths
// that never cross), then keeps only the two ends of each path as the dots —
// so every puzzle can always be solved. No DOM code, so it can be tested with node.
const Puzzle = (() => {
  const LEVELS = {
    small: { n: 5, pairs: [4, 5], minLen: 3 },
    medium: { n: 6, pairs: [5, 6], minLen: 4 },
    big: { n: 8, pairs: [7, 9], minLen: 4 },
  };

  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  function neighbours(n, i) {
    const c = i % n, r = Math.floor(i / n), out = [];
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    return out;
  }

  const adjacent = (n, a, b) => neighbours(n, a).includes(b);

  // Wander from a random empty square, preferring squares with few free
  // neighbours so the paths hug each other and fill the board nicely.
  function walk(n, grid, maxLen) {
    const empty = [];
    grid.forEach((v, i) => { if (v === -1) empty.push(i); });
    if (!empty.length) return null;
    const path = [empty[randInt(0, empty.length - 1)]];
    const used = new Set(path);
    const target = randInt(3, maxLen);
    while (path.length < target) {
      const head = path[path.length - 1];
      const opts = neighbours(n, head).filter(j => grid[j] === -1 && !used.has(j));
      if (!opts.length) break;
      opts.sort((a, b) => free(n, grid, used, a) - free(n, grid, used, b) + (Math.random() - 0.5) * 2.5);
      path.push(opts[0]);
      used.add(opts[0]);
    }
    return path;
  }

  function free(n, grid, used, i) {
    return neighbours(n, i).filter(j => grid[j] === -1 && !used.has(j)).length;
  }

  function generateOnce(n, cfg) {
    const grid = new Array(n * n).fill(-1);
    const paths = [];
    const maxLen = Math.ceil((n * n) / cfg.pairs[0]) + 2;
    for (let tries = 0; tries < 300 && paths.length < cfg.pairs[1]; tries++) {
      const p = walk(n, grid, maxLen);
      if (!p) break;
      if (p.length < cfg.minLen || adjacent(n, p[0], p[p.length - 1])) continue;
      p.forEach(i => { grid[i] = paths.length; });
      paths.push(p);
    }
    // Stretch path ends into any leftover squares next to them.
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== -1) continue;
        for (const j of neighbours(n, i)) {
          const k = grid[j];
          if (k === -1) continue;
          const p = paths[k];
          if (p[p.length - 1] === j && !adjacent(n, i, p[0])) { p.push(i); grid[i] = k; grew = true; break; }
          if (p[0] === j && !adjacent(n, i, p[p.length - 1])) { p.unshift(i); grid[i] = k; grew = true; break; }
        }
      }
    }
    const filled = grid.filter(v => v !== -1).length;
    return { paths, filled };
  }

  // Returns { n, pairs: [{ a, b, solution: [cells...] }] } with cells as index r*n+c.
  function generate(cfg) {
    const n = cfg.n;
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const g = generateOnce(n, cfg);
      if (g.paths.length < cfg.pairs[0]) continue;
      if (!best || g.filled > best.filled) best = g;
      if (g.filled >= n * n * 0.9) break;
    }
    return {
      n,
      pairs: best.paths.map(p => ({ a: p[0], b: p[p.length - 1], solution: p })),
    };
  }

  return { LEVELS, neighbours, adjacent, generate };
})();

if (typeof module !== 'undefined') module.exports = Puzzle;
