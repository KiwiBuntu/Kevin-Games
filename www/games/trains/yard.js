// Train Yard puzzle logic: board generation and "can this train leave?" checks.
// No DOM code here, so it can be tested on its own with node.
const Yard = (() => {
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up

  const LEVELS = {
    small: { n: 5, minLen: 2, maxLen: 3, fill: 0.8 },
    medium: { n: 7, minLen: 2, maxLen: 4, fill: 0.85 },
    big: { n: 9, minLen: 3, maxLen: 6, fill: 0.88 },
  };

  const COLORS = ['#ff4d4d', '#ff9f1c', '#ffd60a', '#2ec4b6', '#3a86ff', '#8338ec', '#ff5fa2', '#8ac926'];

  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const inside = (cols, rows, c, r) => c >= 0 && r >= 0 && c < cols && r < rows;

  // Cells from the engine's nose to the edge of the board, in order.
  function rayCells(cols, rows, train) {
    const [c0, r0] = train.cells[0];
    const [dx, dy] = train.dir;
    const out = [];
    for (let c = c0 + dx, r = r0 + dy; inside(cols, rows, c, r); c += dx, r += dy) out.push([c, r]);
    return out;
  }

  // Returns the first blocking cell, or null when the way out is clear.
  // `occ` is a cols*rows array of train ids (-1 = empty).
  function blocker(cols, rows, train, occ) {
    for (const [c, r] of rayCells(cols, rows, train)) {
      const id = occ[r * cols + c];
      if (id !== -1 && id !== train.id) return [c, r];
    }
    return null;
  }

  // Removing a train only ever frees space, so greedily removing any train
  // that can leave tells us whether the whole board can be cleared.
  function solvable(cols, rows, trains) {
    const occ = new Array(cols * rows).fill(-1);
    for (const t of trains) for (const [c, r] of t.cells) occ[r * cols + c] = t.id;
    let left = trains.slice();
    let progress = true;
    while (left.length && progress) {
      progress = false;
      left = left.filter(t => {
        if (blocker(cols, rows, t, occ)) return true;
        for (const [c, r] of t.cells) occ[r * cols + c] = -1;
        progress = true;
        return false;
      });
    }
    return left.length === 0;
  }

  // A train grows backwards from its engine like a wiggly snake.
  function randomTrain(cols, rows, occ, cfg, id) {
    const c0 = randInt(0, cols - 1), r0 = randInt(0, rows - 1);
    if (occ[r0 * cols + c0] !== -1) return null;
    const dir = DIRS[randInt(0, 3)];
    const len = randInt(cfg.minLen, cfg.maxLen);
    const cells = [[c0, r0]];
    const used = new Set([r0 * cols + c0]);
    let back = [-dir[0], -dir[1]]; // direction from engine towards the tail
    let [c, r] = [c0, r0];
    while (cells.length < len) {
      // The car right behind the engine must be in line with it; after that prefer straight track.
      const opts = cells.length === 1
        ? [back]
        : [back, back, back, [back[1], -back[0]], [-back[1], back[0]]];
      const ok = opts.filter(([dx, dy]) => {
        const nc = c + dx, nr = r + dy;
        return inside(cols, rows, nc, nr) && occ[nr * cols + nc] === -1 && !used.has(nr * cols + nc);
      });
      if (!ok.length) break;
      back = ok[randInt(0, ok.length - 1)];
      c += back[0];
      r += back[1];
      cells.push([c, r]);
      used.add(r * cols + c);
    }
    if (cells.length < cfg.minLen) return null;
    const train = { id, cells, dir };
    // A train whose own carriages are in front of its engine could never leave.
    if (rayCells(cols, rows, train).some(([rc, rr]) => used.has(rr * cols + rc))) return null;
    return train;
  }

  function generateOnce(cols, rows, cfg) {
    const occ = new Array(cols * rows).fill(-1);
    const trains = [];
    const target = Math.floor(cols * rows * cfg.fill);
    let filled = 0;
    for (let tries = 0; tries < 1500 && filled < target; tries++) {
      const t = randomTrain(cols, rows, occ, cfg, trains.length);
      if (!t) continue;
      trains.push(t);
      if (!solvable(cols, rows, trains)) { trains.pop(); continue; }
      for (const [c, r] of t.cells) occ[r * cols + c] = t.id;
      filled += t.cells.length;
    }
    return { trains, filled };
  }

  // Every board this returns can always be cleared.
  function generate(cols, rows, cfg) {
    let best = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const b = generateOnce(cols, rows, cfg);
      if (!best || b.filled > best.filled) best = b;
      if (b.filled >= cols * rows * cfg.fill) break;
    }
    paint(cols, rows, best.trains);
    return best.trains;
  }

  // Give each train a colour that differs from the trains touching it.
  function paint(cols, rows, trains) {
    const occ = new Array(cols * rows).fill(-1);
    for (const t of trains) for (const [c, r] of t.cells) occ[r * cols + c] = t.id;
    for (const t of trains) {
      const near = new Set();
      for (const [c, r] of t.cells) {
        for (const [dx, dy] of DIRS) {
          const nc = c + dx, nr = r + dy;
          if (!inside(cols, rows, nc, nr)) continue;
          const id = occ[nr * cols + nc];
          if (id !== -1 && id !== t.id && trains[id].color) near.add(trains[id].color);
        }
      }
      const free = COLORS.filter(col => !near.has(col));
      const pool = free.length ? free : COLORS;
      t.color = pool[randInt(0, pool.length - 1)];
    }
  }

  return { DIRS, LEVELS, COLORS, rayCells, blocker, solvable, generate };
})();

if (typeof module !== 'undefined') module.exports = Yard;
