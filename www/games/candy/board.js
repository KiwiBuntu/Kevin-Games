// Candy Pop rules engine. No DOM code, so it can be tested with node.
//
// The board is a grid of cells. A cell can hold an item:
//   { id, kind: 'candy', col: 0-5, sp: null | 'h' | 'v' | 'bomb' | 'rainbow' }
//   { id, kind: 'cherry' }                 — bring it down to the bottom
//   { id, kind: 'crate', hp: 1 | 2 }       — broken by matches next to it, or blasts
// and can also have jelly under it (pop a candy on it to clear) and ice over a candy
// (the candy can't be swapped until it's been popped once).
//
// The game drives it like this:  swap(a, b)  →  then repeat  clear() / fall()  until both
// return nothing, animating between steps. All randomness comes from `rand` so tests repeat.
class Board {
  constructor(level, rand = Math.random) {
    this.rand = rand;
    this.L = level;
    this.colours = level.colours;
    this.H = level.layout.length;
    this.W = level.layout[0].length;
    this.nextId = 1;
    this.mask = [];   // playable?
    this.jelly = [];  // 0, 1 or 2 layers
    this.ice = [];    // locked candy?
    this.g = [];      // items
    for (let r = 0; r < this.H; r++) {
      this.mask.push([]); this.jelly.push([]); this.ice.push([]); this.g.push([]);
      for (let c = 0; c < this.W; c++) {
        const ch = level.layout[r][c];
        this.mask[r][c] = ch !== '.';
        this.jelly[r][c] = ch === 'j' || ch === 'k' ? 1 : ch === 'J' ? 2 : 0;
        this.ice[r][c] = ch === 'i' || ch === 'k';
        this.g[r][c] = ch === 'c' ? this.crate(1) : ch === 'C' ? this.crate(2) : null;
      }
    }
    this.goals = JSON.parse(JSON.stringify(level.goals)); // remaining amounts
    // "jelly: true" / "crates: true" mean all of them on the board
    if (this.goals.jelly === true) this.goals.jelly = this.jelly.flat().reduce((a, b) => a + b, 0);
    if (this.goals.crates === true) this.goals.crates = this.g.flat().filter(it => it && it.kind === 'crate').length;
    this.cherriesMade = 0;
    this.pending = [];   // special effects waiting to go off (from swapping specials)
    this.swapped = [];   // where the last swap happened (new specials appear there)
    this.combo = 0;
    this.fillStart();
  }

  // ---------- items
  candy(col, sp = null) { return { id: this.nextId++, kind: 'candy', col, sp }; }
  crate(hp) { return { id: this.nextId++, kind: 'crate', hp }; }
  cherry() { return { id: this.nextId++, kind: 'cherry' }; }
  randCol() { return Math.floor(this.rand() * this.colours); }
  ok(r, c) { return r >= 0 && c >= 0 && r < this.H && c < this.W && this.mask[r][c]; }
  at(r, c) { return this.ok(r, c) ? this.g[r][c] : null; }
  isCandy(it) { return it && it.kind === 'candy'; }
  // can it form part of a three-in-a-row?
  matchCol(r, c) { const it = this.at(r, c); return this.isCandy(it) && it.sp !== 'rainbow' ? it.col : -1; }
  canSwap(r, c) { const it = this.at(r, c); return !!it && (it.kind === 'candy' || it.kind === 'cherry') && !this.ice[r][c]; }

  // Fill the board so nothing matches yet, but there is at least one move.
  fillStart() {
    for (let tries = 0; tries < 200; tries++) {
      for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) {
        if (!this.mask[r][c] || (this.g[r][c] && this.g[r][c].kind === 'crate')) continue;
        let col;
        do { col = this.randCol(); } while (
          (this.matchCol(r, c - 1) === col && this.matchCol(r, c - 2) === col) ||
          (this.matchCol(r - 1, c) === col && this.matchCol(r - 2, c) === col));
        this.g[r][c] = this.candy(col);
      }
      if (this.findMoves().length) return;
      for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) if (this.isCandy(this.g[r][c])) this.g[r][c] = null;
    }
  }

  // ---------- matches
  runs() {
    const out = [];
    for (const dir of ['h', 'v']) {
      const [dr, dc] = dir === 'h' ? [0, 1] : [1, 0];
      for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) {
        const col = this.matchCol(r, c);
        if (col < 0 || this.matchCol(r - dr, c - dc) === col) continue; // only start at the beginning of a run
        const cells = [];
        let rr = r, cc = c;
        while (this.matchCol(rr, cc) === col) { cells.push([rr, cc]); rr += dr; cc += dc; }
        if (cells.length >= 3) out.push({ dir, col, cells });
      }
    }
    return out;
  }

  // Runs that share a candy join into one group (that's how an L or T shape is found).
  groups() {
    const runs = this.runs();
    const groups = [];
    for (const run of runs) {
      const touching = groups.filter(gr => gr.col === run.col && run.cells.some(([r, c]) => gr.keys.has(`${r},${c}`)));
      const merged = { col: run.col, runs: [run], keys: new Set(run.cells.map(([r, c]) => `${r},${c}`)) };
      for (const t of touching) { t.runs.forEach(x => merged.runs.push(x)); t.keys.forEach(k => merged.keys.add(k)); groups.splice(groups.indexOf(t), 1); }
      groups.push(merged);
    }
    return groups;
  }

  // What a group of matched candies turns into.
  specialFor(group) {
    const longest = Math.max(...group.runs.map(r => r.cells.length));
    const dirs = new Set(group.runs.map(r => r.dir));
    if (longest >= 5) return 'rainbow';
    if (dirs.size === 2) return 'bomb';
    if (longest === 4) return group.runs[0].dir === 'h' ? 'v' : 'h'; // stripes point the way they'll blast
    return null;
  }

  // ---------- what a special candy hits
  effectCells(sp, r, c, col) {
    const out = [];
    const add = (rr, cc) => { if (this.ok(rr, cc)) out.push([rr, cc]); };
    if (sp === 'h' || sp === 'row') for (let cc = 0; cc < this.W; cc++) add(r, cc);
    if (sp === 'v' || sp === 'col') for (let rr = 0; rr < this.H; rr++) add(rr, c);
    if (sp === 'cross') { for (let cc = 0; cc < this.W; cc++) add(r, cc); for (let rr = 0; rr < this.H; rr++) add(rr, c); }
    if (sp === 'bigcross') for (let d = -1; d <= 1; d++) { for (let cc = 0; cc < this.W; cc++) add(r + d, cc); for (let rr = 0; rr < this.H; rr++) add(rr, c + d); }
    if (sp === 'bomb') for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(r + dr, c + dc);
    if (sp === 'bigbomb') for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) add(r + dr, c + dc);
    if (sp === 'all') for (let rr = 0; rr < this.H; rr++) for (let cc = 0; cc < this.W; cc++) add(rr, cc);
    if (sp === 'rainbow') {
      if (col === undefined || col < 0) col = this.commonColour();
      for (let rr = 0; rr < this.H; rr++) for (let cc = 0; cc < this.W; cc++) { const it = this.at(rr, cc); if (this.isCandy(it) && it.col === col && it.sp !== 'rainbow') out.push([rr, cc]); }
      add(r, c);
    }
    return out;
  }
  commonColour() {
    const n = new Array(this.colours).fill(0);
    for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) { const it = this.at(r, c); if (this.isCandy(it) && it.sp !== 'rainbow') n[it.col]++; }
    return n.indexOf(Math.max(...n));
  }

  // ---------- swapping
  // Returns false (and changes nothing) if the swap does nothing; true if it's a move.
  swap(a, b) {
    const [r1, c1] = a, [r2, c2] = b;
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1 || !this.canSwap(r1, c1) || !this.canSwap(r2, c2)) return false;
    const A = this.g[r1][c1], B = this.g[r2][c2];
    // two specials (or a rainbow with anything) go off together, no match needed
    const sa = this.isCandy(A) && A.sp, sb = this.isCandy(B) && B.sp;
    if ((sa && sb) || (sa === 'rainbow' && this.isCandy(B)) || (sb === 'rainbow' && this.isCandy(A))) {
      this.g[r1][c1] = B; this.g[r2][c2] = A;
      this.comboSwap(A, B, r2, c2, r1, c1);
      this.swapped = [];
      this.combo = 0;
      return true;
    }
    this.g[r1][c1] = B; this.g[r2][c2] = A;
    if (!this.runs().length) { this.g[r1][c1] = A; this.g[r2][c2] = B; return false; }
    this.swapped = [[r1, c1], [r2, c2]];
    this.combo = 0;
    return true;
  }

  // A swapped A now sits at (ra, ca), B at (rb, cb).
  comboSwap(A, B, ra, ca, rb, cb) {
    const sa = A.sp, sb = B.sp;
    const striped = s => s === 'h' || s === 'v';
    const clear = (r, c) => { this.pending.push({ cells: [[r, c]] }); };
    if (sa === 'rainbow' && sb === 'rainbow') { this.pending.push({ effect: 'all', r: ra, c: ca, used: [A, B] }); return; }
    if (sa === 'rainbow' || sb === 'rainbow') {
      const [R, other, ro, co, rr, cr] = sa === 'rainbow' ? [A, B, rb, cb, ra, ca] : [B, A, ra, ca, rb, cb];
      if (striped(other.sp) || other.sp === 'bomb') {
        // every candy of that colour turns into the other special, then they all go off
        const cells = [];
        for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) {
          const it = this.at(r, c);
          if (this.isCandy(it) && it.col === other.col && it.sp !== 'rainbow') {
            it.sp = other.sp === 'bomb' ? 'bomb' : (this.rand() < 0.5 ? 'h' : 'v');
            cells.push([r, c]);
          }
        }
        this.pending.push({ cells, trigger: true });
        clear(rr, cr);
        R.used = true;
        return;
      }
      this.pending.push({ effect: 'rainbow', r: rr, c: cr, col: other.col, used: [R] });
      return;
    }
    const used = [A, B];
    if (striped(sa) && striped(sb)) this.pending.push({ effect: 'cross', r: ra, c: ca, used });
    else if ((striped(sa) && sb === 'bomb') || (sa === 'bomb' && striped(sb))) this.pending.push({ effect: 'bigcross', r: ra, c: ca, used });
    else if (sa === 'bomb' && sb === 'bomb') this.pending.push({ effect: 'bigbomb', r: ra, c: ca, used });
  }

  // ---------- one round of popping. Returns what happened, or null if nothing to pop.
  clear() {
    const hit = new Map();      // "r,c" → 'match' | 'blast'
    const blasts = [];          // for the beams and booms on screen
    const queue = [];
    const mark = (r, c, why) => { const k = `${r},${c}`; if (!hit.has(k) || why === 'blast') hit.set(k, why); };
    const usedSpecials = new Set();

    // 1) specials set off by a swap
    for (const p of this.pending) {
      (p.used || []).forEach(it => usedSpecials.add(it.id));
      if (p.cells) p.cells.forEach(([r, c]) => { mark(r, c, 'blast'); if (p.trigger) queue.push([r, c]); });
      if (p.effect) {
        blasts.push({ type: p.effect, r: p.r, c: p.c });
        this.effectCells(p.effect, p.r, p.c, p.col).forEach(([r, c]) => mark(r, c, 'blast'));
      }
    }
    this.pending = [];

    // 2) matches, and the specials they make
    const made = [];
    for (const gr of this.groups()) {
      for (const k of gr.keys) mark(...k.split(',').map(Number), 'match');
      const sp = this.specialFor(gr);
      if (!sp) continue;
      let spot = this.swapped.find(([r, c]) => gr.keys.has(`${r},${c}`));
      if (!spot) { const ks = [...gr.keys]; spot = ks[Math.floor(ks.length / 2)].split(',').map(Number); }
      made.push({ r: spot[0], c: spot[1], col: gr.col, sp });
    }
    this.swapped = [];
    if (!hit.size) return null;

    // 3) specials caught in it go off too (and so on)
    for (const k of hit.keys()) queue.push(k.split(',').map(Number));
    const fired = new Set();
    while (queue.length) {
      const [r, c] = queue.shift();
      const it = this.at(r, c);
      if (!this.isCandy(it) || !it.sp || fired.has(it.id) || usedSpecials.has(it.id)) continue;
      fired.add(it.id);
      blasts.push({ type: it.sp, r, c, col: it.col });
      for (const [rr, cc] of this.effectCells(it.sp, r, c, it.sp === 'rainbow' ? -1 : it.col)) {
        if (!hit.has(`${rr},${cc}`)) queue.push([rr, cc]);
        mark(rr, cc, 'blast');
      }
    }

    // 4) pop!
    const pops = [], cratesHit = [];
    const crateDamage = new Set();
    for (const [k, why] of hit) {
      const [r, c] = k.split(',').map(Number);
      const it = this.g[r][c];
      if (!it) continue;
      if (it.kind === 'crate') { if (why === 'blast') crateDamage.add(k); continue; }
      if (it.kind === 'cherry') continue;
      pops.push({ id: it.id, r, c, col: it.col, sp: it.sp });
      this.g[r][c] = null;
      this.ice[r][c] = false;
      if (this.jelly[r][c] > 0) { this.jelly[r][c]--; if (this.goals.jelly !== undefined) this.goals.jelly = Math.max(0, this.goals.jelly - 1); }
      if (this.goals.collect && it.sp !== 'rainbow' && this.goals.collect[it.col] !== undefined) this.goals.collect[it.col] = Math.max(0, this.goals.collect[it.col] - 1);
      if (why === 'match') for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.at(r + dr, c + dc);
        if (n && n.kind === 'crate') crateDamage.add(`${r + dr},${c + dc}`);
      }
    }
    for (const k of crateDamage) {
      const [r, c] = k.split(',').map(Number);
      const it = this.g[r][c];
      if (!it || it.kind !== 'crate') continue;
      it.hp--;
      cratesHit.push({ id: it.id, r, c, broken: it.hp <= 0 });
      if (it.hp <= 0) { this.g[r][c] = null; if (this.goals.crates !== undefined) this.goals.crates = Math.max(0, this.goals.crates - 1); }
    }
    // 5) the new specials appear where the match was
    for (const m of made) this.g[m.r][m.c] = this.candy(m.sp === 'rainbow' ? -1 : m.col, m.sp);
    this.combo++;
    return { pops, made, blasts, cratesHit, combo: this.combo };
  }

  // ---------- gravity: things fall, new candies drop in. Crates and holes stay put,
  // and new candies appear just below them. Also collects cherries that reach the bottom.
  fall() {
    const collected = [];
    let moved = false;
    for (let c = 0; c < this.W; c++) {
      // collect cherries sitting on the lowest cell of their column
      const bottom = this.lowest(c);
      if (bottom >= 0 && this.g[bottom][c] && this.g[bottom][c].kind === 'cherry') {
        collected.push({ id: this.g[bottom][c].id, r: bottom, c });
        this.g[bottom][c] = null;
        if (this.goals.cherries !== undefined) this.goals.cherries = Math.max(0, this.goals.cherries - 1);
      }
      // each stretch of cells between blockers (holes, crates, frozen candies) falls on its own,
      // and new candies drop in at the top of each stretch
      let r = this.H - 1;
      while (r >= 0) {
        if (this.blocks(r, c)) { r--; continue; }
        const seg = [];
        while (r >= 0 && !this.blocks(r, c)) { seg.push(r); r--; }
        const items = seg.map(rr => this.g[rr][c]).filter(Boolean); // bottom → top
        seg.forEach((rr, i) => {
          const it = items[i] || this.spawn();
          if (this.g[rr][c] !== it) moved = true;
          this.g[rr][c] = it;
        });
      }
    }
    return moved || collected.length ? { collected } : null;
  }
  blocks(r, c) { const it = this.g[r][c]; return !this.mask[r][c] || (it && it.kind === 'crate') || (this.ice[r][c] && !!it); }
  lowest(c) { for (let r = this.H - 1; r >= 0; r--) if (this.mask[r][c]) return r; return -1; }

  spawn() {
    const want = this.goals.cherries;
    if (want !== undefined && want > 0) {
      let onBoard = 0;
      for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) if (this.g[r][c] && this.g[r][c].kind === 'cherry') onBoard++;
      if (onBoard < Math.min(2, want) && this.rand() < 0.35) return this.cherry();
    }
    return this.candy(this.randCol());
  }

  // ---------- moves
  // Every swap that does something, with how good it looks (for hints and the test player).
  findMoves() {
    const out = [];
    for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const r2 = r + dr, c2 = c + dc;
      if (!this.canSwap(r, c) || !this.canSwap(r2, c2)) continue;
      const A = this.g[r][c], B = this.g[r2][c2];
      const sa = this.isCandy(A) && A.sp, sb = this.isCandy(B) && B.sp;
      if ((sa && sb) || (sa === 'rainbow' && this.isCandy(B)) || (sb === 'rainbow' && this.isCandy(A))) { out.push({ a: [r, c], b: [r2, c2], value: 20 }); continue; }
      this.g[r][c] = B; this.g[r2][c2] = A;
      let value = 0;
      for (const run of this.runs()) if (run.cells.some(([rr, cc]) => (rr === r && cc === c) || (rr === r2 && cc === c2))) {
        value += run.cells.length + (run.cells.length >= 4 ? 5 : 0);
        // matches that help the goals are worth more: on jelly, next to crates, under cherries, the colour we're collecting
        for (const [rr, cc] of run.cells) {
          value += this.jelly[rr][cc] * 3;
          for (const [dr2, dc2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = this.at(rr + dr2, cc + dc2); if (n && n.kind === 'crate') value += 3; }
          for (let up = rr - 1; up >= 0; up--) { const n = this.at(up, cc); if (n && n.kind === 'cherry') { value += 3; break; } }
          if (this.goals.collect && this.goals.collect[run.col] > 0) value += 1;
        }
      }
      this.g[r][c] = A; this.g[r2][c2] = B;
      if (value) out.push({ a: [r, c], b: [r2, c2], value });
    }
    return out;
  }

  // No moves left: mix up the plain candies (specials, cherries, crates and ice stay put).
  shuffle() {
    const spots = [];
    for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) {
      const it = this.g[r][c];
      if (this.isCandy(it) && !it.sp && !this.ice[r][c]) spots.push([r, c]);
    }
    const cols = spots.map(([r, c]) => this.g[r][c].col);
    for (let tries = 0; tries < 300; tries++) {
      for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; }
      spots.forEach(([r, c], i) => { this.g[r][c].col = cols[i]; });
      if (!this.runs().length && this.findMoves().length) return true;
    }
    // very stuck: give it brand new colours
    spots.forEach(([r, c]) => { this.g[r][c].col = this.randCol(); });
    return this.findMoves().length > 0 || this.shuffle();
  }

  // ---------- goals
  goalsLeft() {
    let n = 0;
    if (this.goals.collect) for (const v of Object.values(this.goals.collect)) n += v;
    for (const k of ['jelly', 'crates', 'cherries']) if (this.goals[k] !== undefined) n += this.goals[k];
    return n;
  }
  won() { return this.goalsLeft() === 0; }
}

if (typeof module !== 'undefined') module.exports = Board;
