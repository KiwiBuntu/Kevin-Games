// Cube Pop: tap a colour blaster to pop every block of that colour you can see.
// Drag to spin the model; it snaps to one of four corner views.
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#model');
  const ctx = canvas.getContext('2d');
  const INK = '#2b2d42';
  const PITCH = 0.55;                                   // how far we look down on the model (radians)
  const VIEWS = [0, 1, 2, 3].map(k => 0.5 + k * Math.PI / 2); // four views, each mostly facing one side
  const C = Levels.COLOURS;

  // ---------- progress (this device)
  let progress = { done: [] };
  try { progress = { done: [], ...JSON.parse(localStorage.getItem('kg-cubes')) }; } catch (e) {}
  const saveProgress = () => { try { localStorage.setItem('kg-cubes', JSON.stringify(progress)); } catch (e) {} };
  const unlocked = () => Math.min(Levels.LIST.length - 1, progress.done.length ? Math.max(...progress.done) + 1 : 0);

  // ---------- state
  let level = 0;
  let blocks = new Map();     // "x,y,z" → colour letter
  let size = [1, 1, 1];
  let view = 0;               // which of VIEWS we're snapped to
  let yaw = VIEWS[0];         // current angle (moves while dragging / spinning)
  let spin = null;            // { from, to, t } spinning animation
  let busy = false;           // firing or spinning: wait for it
  let visible = null;         // Map key → true, for the current snapped view
  let popping = new Map();    // key → { t, colour }
  let shots = [];             // projectiles in flight
  let sinceRainbow = 0;
  let rainbowReady = false;
  let wobble = 0;
  let time = 0;
  let noteN = 0;
  const vw = { w: 0, h: 0, S: 40, ox: 0, oy: 0 };

  // ---------- 3D → screen
  const center = () => [(size[0] - 1) / 2, (size[1] - 1) / 2, (size[2] - 1) / 2];
  function project(x, y, z, a, S, ox, oy) {
    const [cx, cy, cz] = center();
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const rx = dx * Math.cos(a) - dz * Math.sin(a);
    const rz = dx * Math.sin(a) + dz * Math.cos(a);
    return {
      x: ox + S * rx,
      y: oy - S * (dy * Math.cos(PITCH) - rz * Math.sin(PITCH)),
      d: rz * Math.cos(PITCH) + dy * Math.sin(PITCH), // bigger = nearer to us
    };
  }

  // The six faces of a block: outward normal and its four corners.
  const FACES = [
    { n: [0, 1, 0], c: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], shade: 0.18 },
    { n: [0, -1, 0], c: [[-1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, -1, -1]], shade: -0.4 },
    { n: [1, 0, 0], c: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]], shade: -0.12 },
    { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]], shade: -0.12 },
    { n: [0, 0, 1], c: [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]], shade: -0.26 },
    { n: [0, 0, -1], c: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], shade: -0.26 },
  ];
  const facesToward = a => FACES.filter(f => {
    const nz = f.n[0] * Math.sin(a) + f.n[2] * Math.cos(a);
    return f.n[1] * Math.sin(PITCH) + nz * Math.cos(PITCH) > 0.01;
  });

  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    let o = '#';
    for (const sh of [16, 8, 0]) o += Math.round(((A >> sh) & 255) + ((((B >> sh) & 255) - ((A >> sh) & 255)) * t)).toString(16).padStart(2, '0');
    return o;
  }
  const shadeOf = (hex, s) => (s >= 0 ? mix(hex, '#ffffff', s) : mix(hex, '#000000', -s));

  // Blocks in back-to-front order, with the faces we'd see from angle a.
  function drawList(a) {
    const out = [];
    for (const [k, col] of blocks) {
      const [x, y, z] = k.split(',').map(Number);
      out.push({ k, col, x, y, z, d: project(x, y, z, a, 1, 0, 0).d });
    }
    return out.sort((p, q) => p.d - q.d);
  }

  function drawBlocks(c, a, S, ox, oy, idMode, ids) {
    const faces = facesToward(a);
    for (const b of drawList(a)) {
      const pop = popping.get(b.k);
      const grow = pop ? 1 + pop.t * 0.6 : 1;
      if (pop && idMode) continue;
      if (!idMode && pop) c.globalAlpha = Math.max(0, 1 - pop.t * 1.3);
      for (const f of faces) {
        const nb = `${b.x + f.n[0]},${b.y + f.n[1]},${b.z + f.n[2]}`;
        if (blocks.has(nb) && !popping.has(nb)) continue; // hidden against a neighbour
        c.beginPath();
        f.c.forEach(([u, v, w], i) => {
          const p = project(b.x + u * 0.5 * grow, b.y + v * 0.5 * grow, b.z + w * 0.5 * grow, a, S, ox, oy);
          if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
        });
        c.closePath();
        if (idMode) {
          const id = ids.get(b.k);
          c.fillStyle = `rgb(${id & 255},${(id >> 8) & 255},77)`;
          c.fill();
        } else {
          c.fillStyle = shadeOf(C[b.col][0], f.shade);
          c.fill();
          c.lineWidth = Math.max(1.5, S * 0.06);
          c.lineJoin = 'round';
          c.strokeStyle = INK;
          c.stroke();
        }
      }
      c.globalAlpha = 1;
    }
  }

  // ---------- which blocks can we see? Paint each block in its own secret colour and count pixels.
  const idCanvas = document.createElement('canvas');
  idCanvas.width = idCanvas.height = 360;
  const idCtx = idCanvas.getContext('2d', { willReadFrequently: true });
  function visibleFrom(a) {
    const ids = new Map(), back = [];
    [...blocks.keys()].forEach((k, i) => { ids.set(k, i + 1); back[i + 1] = k; });
    const S = 300 / (Math.hypot(...size) + 1);
    idCtx.clearRect(0, 0, 360, 360);
    drawBlocks(idCtx, a, S, 180, 180, true, ids);
    const px = idCtx.getImageData(0, 0, 360, 360).data;
    const counts = new Map();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 2] !== 77 || px[i + 3] < 250) continue;
      const k = back[px[i] | (px[i + 1] << 8)];
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
    const min = S * S * 0.06; // a decent bit of a face must show
    const vis = new Map();
    for (const [k, n] of counts) if (n >= min) vis.set(k, true);
    return vis;
  }
  const visibleOfColour = (vis, col) => [...vis.keys()].filter(k => blocks.get(k) === col);

  // ---------- level picker
  function showPicker() {
    $('#game').hidden = true;
    $('#picker').hidden = false;
    const grid = $('.levels');
    grid.innerHTML = '';
    const open = unlocked();
    Levels.LIST.forEach((L, i) => {
      const b = document.createElement('button');
      const locked = i > open;
      b.className = 'lvl' + (locked ? ' locked' : '') + (i === open && !progress.done.includes(i) ? ' next' : '');
      b.innerHTML = `<span class="emoji"></span><span>${i + 1}</span>${progress.done.includes(i) ? '<span class="star">⭐</span>' : ''}`;
      b.querySelector('.emoji').textContent = locked ? '🔒' : L.emoji;
      if (!locked) b.addEventListener('click', () => { Sound.unlock(); Sound.pop(); start(i); });
      grid.appendChild(b);
    });
  }

  // ---------- playing
  function start(i) {
    Guard.round(`L${i + 1}`);
    Win.hide();
    level = i;
    blocks = Levels.blocksFor(i);
    size = [0, 0, 0];
    for (const k of blocks.keys()) k.split(',').map(Number).forEach((v, j) => { size[j] = Math.max(size[j], v + 1); });
    view = 0;
    yaw = VIEWS[0];
    spin = null;
    busy = false;
    popping = new Map();
    shots = [];
    sinceRainbow = 0;
    rainbowReady = false;
    noteN = 0;
    $('#picker').hidden = true;
    $('#game').hidden = false;
    $('#lvl-emoji').textContent = Levels.LIST[i].emoji;
    $('#lvl-num').textContent = i + 1;
    layout();
    refresh();
  }

  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    vw.w = r.width; vw.h = r.height;
    canvas.width = Math.round(vw.w * dpr);
    canvas.height = Math.round(vw.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // fit the model whichever way it is turned
    const across = Math.hypot(size[0], size[2]) + 0.6;
    const tall = size[1] * Math.cos(PITCH) + Math.hypot(size[0], size[2]) * Math.sin(PITCH) + 0.6;
    vw.S = Math.min((vw.w - 30) / across, (vw.h - 50) / tall, 90);
    vw.ox = vw.w / 2;
    vw.oy = vw.h / 2;
  }

  // After anything changes: what can we see now, and which blasters are there?
  function refresh() {
    visible = visibleFrom(VIEWS[view]);
    // Only colours you can actually reach (from some side) get a blaster;
    // buried ones turn up as soon as they're uncovered.
    const reachable = new Set();
    for (let v = 0; v < 4; v++) for (const k of (v === view ? visible : visibleFrom(VIEWS[v])).keys()) reachable.add(blocks.get(k));
    const bar = $('.blasters');
    const before = new Set([...bar.querySelectorAll('.blaster')].map(b => b.dataset.col));
    bar.innerHTML = '';
    for (const col of Object.keys(C).filter(c => reachable.has(c))) {
      const n = visibleOfColour(visible, col).length;
      const b = document.createElement('button');
      b.className = 'blaster' + (n ? '' : ' hidden-side');
      b.dataset.col = col;
      b.style.setProperty('--c', C[col][0]);
      b.setAttribute('aria-label', `${C[col][1]} blaster`);
      b.innerHTML = `<span class="count">${n || '🔄'}</span>`;
      if (before.size && !before.has(col)) { b.classList.add('hint'); Sound.sparkle(); } // a new colour uncovered!
      b.addEventListener('click', () => blast(col, b));
      bar.appendChild(b);
    }
    if (rainbowReady) {
      const b = document.createElement('button');
      b.className = 'blaster rainbow';
      b.setAttribute('aria-label', 'Rainbow blaster');
      b.innerHTML = '<span class="count">🌈</span>';
      b.addEventListener('click', () => blast('*', b));
      bar.appendChild(b);
    }
  }

  // Tap a blaster: pop every visible block of that colour (or everything, for the rainbow).
  function blast(col, btn) {
    Sound.unlock();
    if (busy) return;
    btn.classList.remove('fire');
    void btn.offsetWidth;
    btn.classList.add('fire');
    let targets = col === '*' ? [...visible.keys()] : visibleOfColour(visible, col);
    if (!targets.length) {
      // that colour is round the back: spin to the nearest side where we can see some, then fire
      for (const step of [1, -1, 2]) {
        const v = (view + step + 4) % 4;
        if (visibleOfColour(visibleFrom(VIEWS[v]), col).length) {
          turnTo(v, () => blast(col, $(`.blaster[data-col="${col}"]`) || btn));
          return;
        }
      }
      Sound.nope(); // still hidden inside: pop other colours first
      return;
    }
    if (col !== '*') Sound.say(C[col][1]);
    else { Sound.sparkle(); rainbowReady = false; sinceRainbow = 0; Guard.count('🌈 rainbow'); }
    fire(targets, btn, col);
  }

  function fire(targets, btn, col) {
    busy = true;
    const r = btn.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    const from = { x: r.left + r.width / 2 - cr.left, y: r.top - cr.top };
    // nearest blocks first, so the pops ripple across the model
    const pos = k => { const [x, y, z] = k.split(',').map(Number); return project(x, y, z, yaw, vw.S, vw.ox, vw.oy); };
    targets.sort((a, b) => pos(b).y - pos(a).y);
    const gap = Math.max(35, Math.min(110, 900 / targets.length));
    targets.forEach((k, i) => setTimeout(() => {
      Sound.zap();
      const to = pos(k);
      const colour = col === '*' ? C[blocks.get(k)][0] : C[col][0];
      shots.push({ k, x0: from.x, y0: from.y, x1: to.x, y1: to.y, t: 0, colour });
    }, i * gap));
    setTimeout(() => {
      // wait for the last shot to land and pop
      const wait = () => {
        if (shots.length || popping.size) { requestAnimationFrame(wait); return; }
        busy = false;
        if (!blocks.size) { won(); return; }
        if (col !== '*' && ++sinceRainbow >= 5 && blocks.size > 8) rainbowReady = true;
        refresh();
      };
      wait();
    }, targets.length * gap);
  }

  function popBlock(k, colour) {
    popping.set(k, { t: 0, colour });
    Sound.popNote(noteN++);
    wobble = 1;
    if (navigator.vibrate) navigator.vibrate(15);
    const [x, y, z] = k.split(',').map(Number);
    const p = project(x, y, z, yaw, vw.S, vw.ox, vw.oy);
    burst(p.x, p.y, colour);
  }

  function won() {
    if (!progress.done.includes(level)) progress.done.push(level);
    saveProgress();
    const next = level + 1 < Levels.LIST.length ? level + 1 : 0;
    setTimeout(() => Win.show({ picture: Levels.LIST[level].emoji + '⭐', again: () => start(next) }), 500);
  }

  // ---------- turning the model
  function turnTo(v, then) {
    busy = true;
    let to = VIEWS[v];
    while (to - yaw > Math.PI) to -= Math.PI * 2;
    while (yaw - to > Math.PI) to += Math.PI * 2;
    spin = { from: yaw, to, t: 0, then: () => { view = v; yaw = VIEWS[v]; busy = false; refresh(); if (then) then(); } };
    Sound.whoosh();
  }

  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    Sound.unlock();
    if (busy) return;
    drag = { x: e.clientX, y: e.clientY, yaw, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    if (drag.moved) yaw = drag.yaw - dx * 0.012;
  });
  canvas.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) { tapModel(e); return; }
    // he's found out how to spin it: no need for the hint any more
    $('.spin-hint').hidden = true;
    try { localStorage.setItem('kg-cubes-spun', '1'); } catch (err) {}
    // snap to the nearest corner view
    let best = 0, bestD = Infinity;
    VIEWS.forEach((v, i) => {
      let diff = ((yaw - v) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      if (Math.abs(diff) < bestD) { bestD = Math.abs(diff); best = i; }
    });
    turnTo(best);
  });

  // Tapping a block shows which blaster to use: that blaster hops and says its colour.
  function tapModel(e) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let hit = null, best = Infinity;
    for (const k of visible.keys()) {
      const [bx, by, bz] = k.split(',').map(Number);
      const p = project(bx, by, bz, yaw, vw.S, vw.ox, vw.oy);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < vw.S * 0.8 && d < best) { best = d; hit = k; }
    }
    if (!hit) return;
    const col = blocks.get(hit);
    const btn = $(`.blaster[data-col="${col}"]`);
    if (btn) { btn.classList.remove('hint'); void btn.offsetWidth; btn.classList.add('hint'); }
    Sound.say(C[col][1]);
  }

  // ---------- particles (a fixed pool, reused, so it stays smooth)
  const POOL = Array.from({ length: 500 }, () => ({ life: 0 }));
  function burst(x, y, colour) {
    let made = 0;
    for (const p of POOL) {
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 320;
      Object.assign(p, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 180, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12,
        s: vw.S * (0.12 + Math.random() * 0.18), colour: Math.random() < 0.2 ? '#ffffff' : colour, life: 1, star: Math.random() < 0.15 });
      if (++made >= 14) break;
    }
  }

  // ---------- frame
  function draw() {
    ctx.clearRect(0, 0, vw.w, vw.h);
    // soft shadow under the model
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(vw.ox, vw.oy + vw.S * (size[1] / 2 * Math.cos(PITCH) + 0.4), vw.S * Math.hypot(size[0], size[2]) * 0.5, vw.S * Math.hypot(size[0], size[2]) * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    const squash = 1 + Math.sin(time * 40) * 0.025 * wobble;
    ctx.save();
    ctx.translate(vw.ox, vw.oy);
    ctx.scale(1 / squash, squash);
    ctx.translate(-vw.ox, -vw.oy);
    drawBlocks(ctx, yaw, vw.S, vw.ox, vw.oy, false);
    ctx.restore();
    // shots in flight
    for (const s of shots) {
      const u = Math.min(1, s.t / 0.22);
      const x = s.x0 + (s.x1 - s.x0) * u, y = s.y0 + (s.y1 - s.y0) * u - Math.sin(u * Math.PI) * 40;
      ctx.beginPath();
      ctx.arc(x, y, vw.S * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = s.colour;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    for (const p of POOL) {
      if (p.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.colour;
      if (p.star) { ctx.font = `${Math.round(p.s * 2)}px "Noto Color Emoji", sans-serif`; ctx.fillText('⭐', -p.s, p.s); }
      else ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
      ctx.restore();
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (!$('#game').hidden) {
      if (spin) {
        spin.t = Math.min(1, spin.t + dt / 0.45);
        const e = 1 - (1 - spin.t) ** 3;
        yaw = spin.from + (spin.to - spin.from) * e;
        if (spin.t >= 1) { const then = spin.then; spin = null; then(); }
      }
      for (const s of shots) s.t += dt;
      for (const s of shots.filter(s => s.t >= 0.22)) popBlock(s.k, s.colour);
      shots = shots.filter(s => s.t < 0.22);
      for (const [k, p] of popping) {
        p.t += dt / 0.2;
        if (p.t >= 1) { popping.delete(k); blocks.delete(k); }
      }
      wobble = Math.max(0, wobble - dt * 3);
      for (const p of POOL) {
        if (p.life <= 0) continue;
        p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt; p.life -= dt * 1.2;
      }
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---------- buttons
  $('#to-levels').addEventListener('click', () => { Sound.pop(); showPicker(); });
  $('#restart').addEventListener('click', () => { Sound.unlock(); Sound.pop(); if (!busy) start(level); });
  const muteBtn = $('#mute');
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', () => { if (!$('#game').hidden) layout(); });
  // Handy for poking at the game from the browser console.
  window.cubePop = { get blocks() { return blocks; }, get visible() { return visible; }, get busy() { return busy; }, get level() { return level; }, start, get view() { return view; } };

  try { if (localStorage.getItem('kg-cubes-spun')) $('.spin-hint').hidden = true; } catch (e) {}
  showPicker();
  Sound.intro('Tap a colour blaster to pop the blocks you can see. Drag the model to spin it round!');
  requestAnimationFrame(loop);
})();
