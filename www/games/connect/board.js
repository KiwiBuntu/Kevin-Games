// Connect: the rules and the Android's brain. No drawing here, so it can be tested with node.
// A board is { cols, rows, need, cells } where cells[c][r] is 0 (empty), 1 or 2, row 0 at the bottom.
const Connect = (() => {
  const make = (cols, rows, need) => ({ cols, rows, need, cells: Array.from({ length: cols }, () => Array(rows).fill(0)) });
  const copy = b => ({ ...b, cells: b.cells.map(c => c.slice()) });
  const height = (b, c) => { const col = b.cells[c]; let r = 0; while (r < b.rows && col[r]) r++; return r; };
  const canDrop = (b, c) => c >= 0 && c < b.cols && !b.cells[c][b.rows - 1];
  const moves = b => { const m = []; for (let c = 0; c < b.cols; c++) if (canDrop(b, c)) m.push(c); return m; };
  const full = b => moves(b).length === 0;

  // Drop a counter; returns the row it landed in (or -1 if the column is full).
  function drop(b, c, p) {
    if (!canDrop(b, c)) return -1;
    const r = height(b, c);
    b.cells[c][r] = p;
    return r;
  }

  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  // The winning line through (c, r), as [[c, r], ...], or null.
  function lineAt(b, c, r) {
    const p = b.cells[c][r];
    if (!p) return null;
    for (const [dc, dr] of DIRS) {
      const line = [[c, r]];
      for (const s of [1, -1]) {
        let x = c + dc * s, y = r + dr * s;
        while (x >= 0 && x < b.cols && y >= 0 && y < b.rows && b.cells[x][y] === p) {
          line.push([x, y]);
          x += dc * s; y += dr * s;
        }
      }
      if (line.length >= b.need) return line.sort((a, z) => a[0] - z[0] || a[1] - z[1]);
    }
    return null;
  }

  function winner(b) {
    for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) if (lineAt(b, c, r)) return b.cells[c][r];
    return 0;
  }

  // Every straight run of `need` cells on the board (worked out once per board size).
  const windowCache = {};
  function windows(b) {
    const key = `${b.cols}x${b.rows}x${b.need}`;
    if (windowCache[key]) return windowCache[key];
    const out = [];
    for (let c = 0; c < b.cols; c++) for (let r = 0; r < b.rows; r++) {
      for (const [dc, dr] of DIRS) {
        const ec = c + dc * (b.need - 1), er = r + dr * (b.need - 1);
        if (ec < 0 || ec >= b.cols || er < 0 || er >= b.rows) continue;
        const w = [];
        for (let k = 0; k < b.need; k++) w.push([c + dc * k, r + dr * k]);
        out.push(w);
      }
    }
    return (windowCache[key] = out);
  }

  // How good the board looks for p: lines with room to grow, plus the middle columns.
  function score(b, p) {
    const q = 3 - p;
    let s = 0;
    for (const w of windows(b)) {
      let mine = 0, theirs = 0;
      for (const [c, r] of w) { const v = b.cells[c][r]; if (v === p) mine++; else if (v === q) theirs++; }
      if (mine && theirs) continue;
      const left = b.need - mine - theirs;
      if (mine) s += left === 1 ? 50 : left === 2 ? 6 : 1;
      if (theirs) s -= left === 1 ? 60 : left === 2 ? 6 : 1;
    }
    const mid = (b.cols - 1) / 2;
    for (let c = 0; c < b.cols; c++) {
      const w = 3 - Math.min(3, Math.abs(c - mid));
      for (let r = 0; r < b.rows; r++) { const v = b.cells[c][r]; if (v === p) s += w; else if (v === q) s -= w; }
    }
    return s;
  }

  const WIN = 100000;

  // Look ahead `depth` turns (alpha-beta). Returns the score for p, who is about to move.
  function search(b, p, depth, alpha, beta) {
    const ms = order(b);
    if (!ms.length) return 0;
    for (const c of ms) {
      const r = drop(b, c, p);
      const won = lineAt(b, c, r);
      b.cells[c][r] = 0;
      if (won) return WIN + depth;
    }
    if (depth === 0) return score(b, p);
    let best = -Infinity;
    for (const c of ms) {
      const r = drop(b, c, p);
      const v = -search(b, 3 - p, depth - 1, -beta, -alpha);
      b.cells[c][r] = 0;
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Middle columns first: alpha-beta prunes much more that way.
  function order(b) {
    const mid = (b.cols - 1) / 2;
    return moves(b).sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid));
  }

  // A move that wins straight away for p, or -1.
  function winningMove(b, p) {
    for (const c of moves(b)) {
      const r = drop(b, c, p);
      const won = lineAt(b, c, r);
      b.cells[c][r] = 0;
      if (won) return c;
    }
    return -1;
  }

  // Columns that hand the other player a win straight after (they can play on top).
  function givesAway(b, c, p) {
    const r = drop(b, c, p);
    const bad = r + 1 < b.rows && (() => { b.cells[c][r + 1] = 3 - p; const w = lineAt(b, c, r + 1); b.cells[c][r + 1] = 0; return !!w; })();
    b.cells[c][r] = 0;
    return bad;
  }

  const LEVELS = {
    // ⭐ takes a win or a block only some of the time, otherwise plays near the middle
    1: { depth: 0, takeWin: 0.75, block: 0.5, slip: 1 },
    // ⭐⭐ always wins / blocks, looks a couple of moves ahead, makes the odd slip
    2: { depth: 3, takeWin: 1, block: 1, slip: 0.2 },
    // ⭐⭐⭐ looks well ahead and doesn't slip
    3: { depth: 6, takeWin: 1, block: 1, slip: 0 },
  };

  // Pick the Android's column. rand() is Math.random (or a seeded one for tests).
  function bestMove(board, p, level, rand = Math.random) {
    const L = LEVELS[level] || LEVELS[2];
    const b = copy(board);
    const ms = order(b);
    if (ms.length === 1) return ms[0];
    const win = winningMove(b, p);
    if (win >= 0 && rand() < L.takeWin) return win;
    const block = winningMove(b, 3 - p);
    if (block >= 0 && rand() < L.block) return block;
    if (rand() < L.slip) {
      // a friendly, slightly random move: favour the middle, try not to set up their win
      const safe = ms.filter(c => !givesAway(b, c, p));
      const pool = safe.length ? safe : ms;
      const mid = (b.cols - 1) / 2;
      const weights = pool.map(c => 1 / (1 + Math.abs(c - mid)));
      let t = rand() * weights.reduce((a, z) => a + z, 0);
      for (let i = 0; i < pool.length; i++) { t -= weights[i]; if (t <= 0) return pool[i]; }
      return pool[pool.length - 1];
    }
    // a small board is quick to think through, so look further there
    const depth = L.depth + (b.cols * b.rows <= 20 ? 2 : 0);
    let best = -Infinity, choices = [];
    for (const c of ms) {
      const r = drop(b, c, p);
      const v = lineAt(b, c, r) ? WIN + depth + 1 : -search(b, 3 - p, depth - 1, -Infinity, Infinity);
      b.cells[c][r] = 0;
      if (v > best) { best = v; choices = [c]; } else if (v === best) choices.push(c);
    }
    return choices[Math.floor(rand() * choices.length)];
  }

  // A column the player should look at: a win for p, else a block. -1 if neither.
  function hint(b, p) {
    const w = winningMove(copy(b), p);
    return w >= 0 ? w : winningMove(copy(b), 3 - p);
  }

  return { make, copy, height, canDrop, moves, full, drop, lineAt, winner, bestMove, hint, LEVELS };
})();

if (typeof module !== 'undefined') module.exports = Connect;
