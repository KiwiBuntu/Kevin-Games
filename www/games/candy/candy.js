// Candy Pop: swap neighbouring candies to make lines of three or more.
// Each level has goals and a number of moves; specials and combos make big things happen.
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#board');
  const ctx = canvas.getContext('2d');
  const INK = '#2b2d42';
  const COLOURS = ['#ff4d6d', '#ffd23f', '#3a86ff', '#5cd65c', '#a24cf0', '#ff8a1c'];
  const NAMES = ['red', 'yellow', 'blue', 'green', 'purple', 'orange'];
  const CHEERS = ['Sweet!', 'Yummy!', 'Super!', 'Wow!', 'Delicious!'];
  const HINT_AFTER = 8; // seconds of thinking before a hint wiggles

  // ---------- saved progress: best stars per level
  let progress = { stars: {} };
  try { progress = { stars: {}, ...JSON.parse(localStorage.getItem('kg-candy')) }; } catch (e) {}
  const saveProgress = () => { try { localStorage.setItem('kg-candy', JSON.stringify(progress)); } catch (e) {} };
  const reached = () => { let n = 0; while (progress.stars[n]) n++; return Math.min(n, Levels.LIST.length - 1); };

  // ---------- state
  let li = 0;               // level index
  let board = null;
  let moves = 0;
  let bonusUsed = false;
  let busy = false;
  let selected = null;      // [r, c]
  let idle = 0;             // seconds since the last move (for hints)
  let hint = null;          // a move to wiggle
  let time = 0;
  const pos = new Map();    // item id → drawn position { x, y, vy }
  let pops = [];            // candies popping { x, y, col, sp, t }
  let beams = [];           // special effects { type, r, c, t }
  let bits = [];            // sparkles
  let nudge = null;         // a swap that didn't work, bouncing back
  const vw = { w: 0, h: 0, S: 50, ox: 0, oy: 0 };

  // ---------- drawing candies (each colour has its own shape)
  function candyPath(c, col, s) {
    const r = s * 0.42;
    c.beginPath();
    if (col === 0) { // heart
      c.moveTo(0, r * 0.95);
      c.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.6, -r * 1.2, 0, -r * 0.45);
      c.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.5, -r * 0.1, 0, r * 0.95);
    } else if (col === 1) { // star
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.5 : r * 1.05;
        c.lineTo(Math.cos(a) * d, Math.sin(a) * d + r * 0.06);
      }
    } else if (col === 2) { c.arc(0, 0, r * 0.95, 0, Math.PI * 2); } // orb
    else if (col === 3) { c.roundRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.35); } // gumdrop square
    else if (col === 4) { c.arc(0, 0, r * 0.95, 0, Math.PI * 2); } // lollipop swirl
    else { // triangle
      c.moveTo(0, -r * 0.95); c.lineTo(r * 1.0, r * 0.75); c.lineTo(-r * 1.0, r * 0.75);
    }
    c.closePath();
  }

  function drawCandy(c, col, sp, x, y, s, alpha = 1, scale = 1) {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    c.globalAlpha = alpha;
    if (sp === 'rainbow') {
      // chocolate ball with sprinkles
      c.beginPath();
      c.arc(0, 0, s * 0.4, 0, Math.PI * 2);
      c.fillStyle = '#6b4226';
      c.fill();
      c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4 + time * 0.8, d = s * (0.12 + (i % 3) * 0.08);
        c.fillStyle = COLOURS[i % COLOURS.length];
        c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d); c.rotate(a);
        c.fillRect(-s * 0.05, -s * 0.02, s * 0.1, s * 0.04); c.restore();
      }
      c.restore();
      return;
    }
    if (sp === 'bomb') {
      // wrapper twists either side
      c.fillStyle = COLOURS[col];
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.moveTo(sx * s * 0.3, 0); c.lineTo(sx * s * 0.5, -s * 0.16); c.lineTo(sx * s * 0.5, s * 0.16); c.closePath();
        c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
      }
    }
    candyPath(c, col, s);
    const g = c.createLinearGradient(-s * 0.3, -s * 0.4, s * 0.3, s * 0.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, COLOURS[col]);
    g.addColorStop(1, COLOURS[col]);
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    if (sp === 'h' || sp === 'v') {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = -2; k <= 2; k += 2) {
        if (sp === 'h') c.fillRect(-s, k * s * 0.1 - s * 0.04, s * 2, s * 0.08);
        else c.fillRect(k * s * 0.1 - s * 0.04, -s, s * 0.08, s * 2);
      }
    }
    if (col === 4) { // lollipop swirl
      c.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.2) c.lineTo(Math.cos(a) * a * s * 0.027, Math.sin(a) * a * s * 0.027);
      c.lineWidth = s * 0.05; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
    }
    if (sp === 'bomb') {
      c.beginPath(); c.arc(0, 0, s * 0.16, 0, Math.PI * 2);
      c.lineWidth = s * 0.06; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke();
    }
    c.restore();
    candyPath(c, col, s);
    c.lineWidth = 3;
    c.lineJoin = 'round';
    c.strokeStyle = INK;
    c.stroke();
    // shine
    c.beginPath();
    c.ellipse(-s * 0.13, -s * 0.15, s * 0.07, s * 0.04, -0.6, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fill();
    c.restore();
  }

  function drawCrate(x, y, s, hp) {
    const h = s * 0.42;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath(); ctx.roundRect(-h, -h, h * 2, h * 2, s * 0.08);
    ctx.fillStyle = '#c68642'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.moveTo(-h, -h); ctx.lineTo(h, h); ctx.moveTo(-h, -h * 0.3); ctx.lineTo(h, -h * 0.3); ctx.moveTo(-h, h * 0.3); ctx.lineTo(h, h * 0.3); ctx.stroke();
    if (hp > 1) { // metal straps on strong crates
      ctx.fillStyle = '#8d93a8';
      ctx.fillRect(-h * 0.7, -h, h * 0.25, h * 2); ctx.fillRect(h * 0.45, -h, h * 0.25, h * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = INK;
      ctx.strokeRect(-h * 0.7, -h, h * 0.25, h * 2); ctx.strokeRect(h * 0.45, -h, h * 0.25, h * 2);
    }
    ctx.restore();
  }

  function emoji(ch, x, y, s) {
    ctx.font = `${Math.round(s)}px "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y);
  }

  // ---------- level map
  function showMap() {
    $('#game').hidden = true;
    $('#map').hidden = false;
    const path = $('.path');
    path.innerHTML = '';
    const top = reached();
    Levels.LIST.forEach((L, i) => {
      const b = document.createElement('button');
      const stars = progress.stars[i] || 0;
      b.className = 'node' + (i > top ? ' locked' : stars ? ' done' : ' next');
      // wind left and right like a path
      b.style.marginLeft = `calc(${50 + Math.sin(i * 0.9) * 32}% - 42px)`;
      b.innerHTML = `${i > top ? '🔒' : i + 1}<span class="stars">${stars ? '⭐'.repeat(stars) : ''}</span>`;
      if (i <= top) b.addEventListener('click', () => { Sound.unlock(); Sound.pop(); start(i); });
      path.appendChild(b);
    });
    const next = path.children[top];
    if (next) setTimeout(() => next.scrollIntoView({ block: 'center' }), 50);
  }

  // ---------- playing
  function start(i) {
    Win.hide();
    $('#out').hidden = true;
    li = i;
    const L = Levels.LIST[i];
    board = new Board(L);
    moves = L.moves;
    bonusUsed = false;
    busy = false;
    selected = null;
    idle = 0;
    hint = null;
    pos.clear();
    pops = []; beams = []; bits = []; nudge = null;
    $('#map').hidden = true;
    $('#game').hidden = false;
    layout();
    // candies tumble in from above at the start
    for (let r = 0; r < board.H; r++) for (let c = 0; c < board.W; c++) {
      const it = board.g[r][c];
      if (it && it.kind !== 'crate') pos.set(it.id, { x: cx(c), y: cy(r) - vw.S * (board.H + 2) - r * 6, vy: 0 });
    }
    showGoals();
  }

  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    vw.w = r.width; vw.h = r.height;
    canvas.width = Math.round(vw.w * dpr);
    canvas.height = Math.round(vw.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!board) return;
    vw.S = Math.floor(Math.min((vw.w - 16) / board.W, (vw.h - 16) / board.H, 96));
    vw.ox = (vw.w - vw.S * board.W) / 2;
    vw.oy = (vw.h - vw.S * board.H) / 2;
  }
  const cx = c => vw.ox + (c + 0.5) * vw.S;
  const cy = r => vw.oy + (r + 0.5) * vw.S;

  function goalChips(into) {
    into.innerHTML = '';
    const G = board.goals;
    const chip = (draw, n) => {
      const d = document.createElement('div');
      d.className = 'goal' + (n === 0 ? ' done' : '');
      d.appendChild(draw());
      const span = document.createElement('span');
      span.className = 'n';
      span.textContent = n;
      d.appendChild(span);
      into.appendChild(d);
    };
    const icon = paint => () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 68;
      const c = cv.getContext('2d');
      paint(c);
      return cv;
    };
    const em = ch => () => { const s = document.createElement('span'); s.className = 'e'; s.textContent = ch; return s; };
    if (G.collect) for (const [col, n] of Object.entries(G.collect)) chip(icon(c => drawCandy(c, +col, null, 34, 34, 70)), n);
    if (G.jelly !== undefined) chip(icon(c => { c.beginPath(); c.roundRect(8, 8, 52, 52, 12); c.fillStyle = '#ff7eb6'; c.fill(); c.lineWidth = 4; c.strokeStyle = INK; c.stroke(); }), G.jelly);
    if (G.crates !== undefined) chip(em('📦'), G.crates);
    if (G.cherries !== undefined) chip(em('🍒'), G.cherries);
  }

  function showGoals() {
    goalChips($('#goals'));
    const m = $('#moves');
    m.textContent = moves;
    m.classList.toggle('low', moves <= 3);
  }

  // ---------- swapping
  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left - vw.ox) / vw.S), rr = Math.floor((e.clientY - r.top - vw.oy) / vw.S);
    return board.ok(rr, c) ? [rr, c] : null;
  }

  let press = null;
  canvas.addEventListener('pointerdown', e => {
    Sound.unlock();
    if (busy || !board) return;
    const cell = cellAt(e);
    if (!cell) { selected = null; return; }
    press = { cell, x: e.clientX, y: e.clientY, swiped: false };
    canvas.setPointerCapture(e.pointerId);
    if (selected && Math.abs(selected[0] - cell[0]) + Math.abs(selected[1] - cell[1]) === 1) {
      const a = selected;
      selected = null;
      press.swiped = true;
      trySwap(a, cell);
      return;
    }
    selected = board.canSwap(...cell) ? cell : null;
    if (selected) Sound.pop();
  });
  canvas.addEventListener('pointermove', e => {
    if (!press || press.swiped || busy) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < vw.S * 0.35) return;
    press.swiped = true;
    const [r, c] = press.cell;
    const to = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
    selected = null;
    if (board.ok(...to)) trySwap([r, c], to);
  });
  canvas.addEventListener('pointerup', () => { press = null; });

  function trySwap(a, b) {
    idle = 0;
    hint = null;
    if (!board.canSwap(...a) || !board.canSwap(...b)) { Sound.nope(); return; }
    if (!board.swap(a, b)) {
      // doesn't make a match: wobble towards each other and back
      nudge = { a, b, t: 0 };
      Sound.boing();
      return;
    }
    moves--;
    showGoals();
    Sound.flip();
    resolve();
  }

  const wait = ms => new Promise(res => setTimeout(res, ms));
  function settled() {
    return new Promise(res => {
      const check = () => {
        let moving = false;
        for (let r = 0; r < board.H; r++) for (let c = 0; c < board.W; c++) {
          const it = board.g[r][c];
          if (!it || it.kind === 'crate') continue;
          const p = pos.get(it.id);
          if (!p || Math.abs(p.y - cy(r)) > 1 || Math.abs(p.x - cx(c)) > 1) moving = true;
        }
        if (moving) requestAnimationFrame(check); else res();
      };
      check();
    });
  }

  // Pop, fall, pop, fall… until the board is still. Then: won? out of moves? no moves (shuffle)?
  async function resolve() {
    busy = true;
    await settled();
    for (let guard = 0; guard < 60; guard++) {
      const ev = board.clear();
      if (ev) {
        showPops(ev);
        await wait(230);
      }
      const f = board.fall();
      if (f && f.collected.length) f.collected.forEach(cl => { const p = pos.get(cl.id); burst(p ? p.x : cx(cl.c), p ? p.y : cy(cl.r), '#ff4d6d', 16); Sound.cork(); pos.delete(cl.id); });
      showGoals();
      if (!ev && !f) break;
      await settled();
    }
    if (board.won()) { busy = false; return winLevel(); }
    if (moves <= 0) { busy = false; return outOfMoves(); }
    if (!board.findMoves().length) {
      banner('Shuffle!');
      Sound.sparkle();
      await wait(600);
      board.shuffle();
      for (let r = 0; r < board.H; r++) for (let c = 0; c < board.W; c++) { const it = board.g[r][c]; const p = it && pos.get(it.id); if (p) { p.y -= vw.S * 0.4; p.vy = -200; } }
      await settled();
    }
    busy = false;
    idle = 0;
  }

  function showPops(ev) {
    for (const p of ev.pops) {
      const at = pos.get(p.id) || { x: cx(p.c), y: cy(p.r) };
      pops.push({ x: at.x, y: at.y, col: p.col, sp: p.sp, t: 0 });
      if (p.col >= 0) burst(at.x, at.y, COLOURS[p.col], 5);
      pos.delete(p.id);
    }
    for (const b of ev.blasts) beams.push({ ...b, t: 0 });
    if (ev.blasts.length) { Sound.zap(); if (navigator.vibrate) navigator.vibrate(40); } else if (navigator.vibrate) navigator.vibrate(20);
    if (ev.cratesHit.length) Sound.cork();
    // each cascade step plays a higher note
    Sound.note([523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319][Math.min(9, ev.combo - 1)]);
    if (ev.made.length) Sound.sparkle();
    if (ev.combo === 3 || (ev.combo > 3 && ev.combo % 2 === 1) || ev.pops.length >= 12) {
      const word = CHEERS[Math.floor(Math.random() * CHEERS.length)];
      banner(word);
      Sound.say(word);
    }
  }

  function banner(text) {
    const b = $('#banner');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(b.t);
    b.t = setTimeout(() => b.classList.remove('show'), 900);
  }

  function burst(x, y, colour, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 220;
      bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 1, colour, s: vw.S * (0.06 + Math.random() * 0.08) });
    }
    if (bits.length > 400) bits.splice(0, bits.length - 400);
  }

  // ---------- end of a level
  function winLevel() {
    const L = Levels.LIST[li];
    const left = moves / L.moves;
    const stars = bonusUsed ? 1 : left >= 0.3 ? 3 : left >= 0.1 ? 2 : 1;
    progress.stars[li] = Math.max(progress.stars[li] || 0, stars);
    saveProgress();
    const next = li + 1 < Levels.LIST.length ? li + 1 : li;
    setTimeout(() => Win.show({ picture: '⭐'.repeat(stars), again: () => start(next) }), 400);
  }

  function outOfMoves() {
    goalChips($('#out-left'));
    $('#bonus').hidden = bonusUsed;
    $('#out').hidden = false;
    Sound.nope();
    setTimeout(() => Sound.say('So close! Try again?'), 300);
  }
  $('#bonus').addEventListener('click', () => {
    Sound.unlock();
    bonusUsed = true;
    moves += 5;
    showGoals();
    $('#out').hidden = true;
    Sound.sparkle();
  });
  $('#retry').addEventListener('click', () => { Sound.unlock(); Sound.pop(); start(li); });
  $('#out-map').addEventListener('click', () => { Sound.pop(); $('#out').hidden = true; showMap(); });

  // ---------- each frame
  function draw(dt) {
    const S = vw.S;
    ctx.clearRect(0, 0, vw.w, vw.h);
    // board background and jelly
    for (let r = 0; r < board.H; r++) for (let c = 0; c < board.W; c++) {
      if (!board.mask[r][c]) continue;
      const x = vw.ox + c * S, y = vw.oy + r * S;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, S - 4, S - 4, S * 0.18);
      ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.4)';
      ctx.fill();
      const j = board.jelly[r][c];
      if (j) {
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, S - 6, S - 6, S * 0.2);
        ctx.fillStyle = j > 1 ? '#ff4f9a' : '#ff9ec7';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = j > 1 ? '#b8005a' : '#e0608f';
        ctx.stroke();
      }
    }
    // new candies start as a neat stack just above where they'll land
    const fresh = new Array(board.W).fill(0);
    for (let r = 0; r < board.H; r++) for (let c = 0; c < board.W; c++) { const it = board.g[r][c]; if (it && it.kind !== 'crate' && !pos.has(it.id)) fresh[c]++; }
    // items, sliding / falling to where they belong
    for (let r = 0; r < board.H; r++) for (let c = 0; c < board.W; c++) {
      const it = board.g[r][c];
      if (!it) continue;
      if (it.kind === 'crate') { drawCrate(cx(c), cy(r), S, it.hp); continue; }
      let p = pos.get(it.id);
      if (!p) { p = { x: cx(c), y: cy(r) - S * (fresh[c] + 0.5), vy: 0 }; pos.set(it.id, p); }
      p.x += (cx(c) - p.x) * Math.min(1, dt * 16);
      if (p.y < cy(r) - 0.5) {
        p.vy += 2600 * dt * (S / 60);
        p.y = Math.min(cy(r), p.y + p.vy * dt);
        if (p.y >= cy(r)) { p.vy = 0; }
      } else { p.y += (cy(r) - p.y) * Math.min(1, dt * 16); p.vy = 0; }
      let x = p.x, y = p.y, sc = 1;
      if (nudge) {
        const [a, b] = [nudge.a, nudge.b];
        const k = Math.sin(Math.min(1, nudge.t / 0.3) * Math.PI) * 0.4;
        if (r === a[0] && c === a[1]) { x += (b[1] - a[1]) * S * k; y += (b[0] - a[0]) * S * k; }
        if (r === b[0] && c === b[1]) { x += (a[1] - b[1]) * S * k; y += (a[0] - b[0]) * S * k; }
      }
      if (selected && selected[0] === r && selected[1] === c) sc = 1.12 + Math.sin(time * 8) * 0.04;
      if (hint && ((hint.a[0] === r && hint.a[1] === c) || (hint.b[0] === r && hint.b[1] === c))) y += Math.sin(time * 9) * S * 0.08;
      if (it.kind === 'cherry') emoji('🍒', x, y, S * 0.72);
      else drawCandy(ctx, it.col, it.sp, x, y, S, 1, sc);
      if (board.ice[r][c]) {
        ctx.beginPath();
        ctx.roundRect(cx(c) - S * 0.44, cy(r) - S * 0.44, S * 0.88, S * 0.88, S * 0.14);
        ctx.fillStyle = 'rgba(200, 240, 255, 0.55)';
        ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#7fc8f8'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx(c) - S * 0.3, cy(r) - S * 0.1); ctx.lineTo(cx(c) - S * 0.1, cy(r) - S * 0.3);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
      }
    }
    // pops grow and fade
    for (const p of pops) { p.t += dt / 0.22; if (p.col >= 0) drawCandy(ctx, p.col, p.sp, p.x, p.y, S, Math.max(0, 1 - p.t), 1 + p.t * 0.6); }
    pops = pops.filter(p => p.t < 1);
    // special effects
    for (const b of beams) {
      b.t += dt / 0.35;
      const a = Math.max(0, 1 - b.t);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fffbe0';
      ctx.shadowColor = '#fff36b';
      ctx.shadowBlur = 20;
      const rows = { h: [0], row: [0], cross: [0], bigcross: [-1, 0, 1] }[b.type] || [];
      const cols = { v: [0], col: [0], cross: [0], bigcross: [-1, 0, 1] }[b.type] || [];
      for (const d of rows) ctx.fillRect(vw.ox, cy(b.r + d) - S * 0.18, S * board.W, S * 0.36);
      for (const d of cols) ctx.fillRect(cx(b.c + d) - S * 0.18, vw.oy, S * 0.36, S * board.H);
      if (b.type === 'bomb' || b.type === 'bigbomb' || b.type === 'all' || b.type === 'rainbow') {
        ctx.beginPath();
        ctx.arc(cx(b.c), cy(b.r), S * (0.5 + b.t * (b.type === 'bomb' ? 1.6 : 3.5)), 0, Math.PI * 2);
        ctx.lineWidth = S * 0.25 * a;
        ctx.strokeStyle = b.type === 'rainbow' || b.type === 'all' ? `hsl(${time * 400 % 360}, 90%, 60%)` : '#ffd23f';
        ctx.stroke();
      }
      ctx.restore();
    }
    beams = beams.filter(b => b.t < 1);
    for (const p of bits) {
      p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.5;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.colour;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    bits = bits.filter(p => p.life > 0);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (board && !$('#game').hidden) {
      if (nudge) { nudge.t += dt; if (nudge.t > 0.3) nudge = null; }
      if (!busy && $('#out').hidden) {
        idle += dt;
        if (idle > HINT_AFTER && !hint) {
          const ms = board.findMoves().sort((a, b) => b.value - a.value);
          if (ms.length) hint = ms[0];
        }
      }
      draw(dt);
    }
    requestAnimationFrame(loop);
  }

  // ---------- buttons
  $('#to-map').addEventListener('click', () => { Sound.pop(); if (!busy) showMap(); });
  const muteBtn = $('#mute');
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', () => { if (board) layout(); });
  // Handy for poking at the game from the browser console.
  window.candyPop = { get board() { return board; }, get busy() { return busy; }, get moves() { return moves; }, start, vw, get hint() { return hint; }, setMoves(n) { moves = n; showGoals(); } };

  showMap();
  Sound.intro('Swap two sweets to make a line of three. Match four or more to make super sweets!');
  requestAnimationFrame(loop);
})();
