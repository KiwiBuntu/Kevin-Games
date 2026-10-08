// Connect the Colours: drag from a dot to its matching dot. Lines can't cross!
(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const muteBtn = document.getElementById('mute');
  const INK = '#2b2d42';

  const COLOURS = [
    ['#ff4d4d', 'Red'], ['#3a86ff', 'Blue'], ['#ffd60a', 'Yellow'], ['#8ac926', 'Green'],
    ['#ff9f1c', 'Orange'], ['#8338ec', 'Purple'], ['#ff5fa2', 'Pink'], ['#2ec4b6', 'Turquoise'],
    ['#9c6b3c', 'Brown'],
  ];

  let size = 'small';
  try { size = localStorage.getItem('kg-colours-size') || 'small'; } catch (e) {}
  if (!Puzzle.LEVELS[size]) size = 'small';

  let n = 5;
  let pairs = [];      // { a, b, solution, colour, name, path: [cells], joined, joy }
  let dotAt = [];      // cell -> pair index of the dot there, or -1
  let active = -1;     // pair being drawn
  let finger = null;   // { x, y } while dragging
  let hint = null;     // { pair, t }
  let won = false;
  let time = 0;
  const view = { w: 0, h: 0, cell: 40, ox: 0, oy: 0 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    let out = '#';
    for (const sh of [16, 8, 0]) {
      const x = (A >> sh) & 255, y = (B >> sh) & 255;
      out += Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
    }
    return out;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const cx = i => view.ox + ((i % n) + 0.5) * view.cell;
  const cy = i => view.oy + (Math.floor(i / n) + 0.5) * view.cell;

  // ---------- setup
  function newGame() {
    Win.hide();
    const pz = Puzzle.generate(Puzzle.LEVELS[size]);
    n = pz.n;
    const order = COLOURS.map((c, i) => i).sort(() => Math.random() - 0.5);
    pairs = pz.pairs.map((p, k) => ({
      ...p, colour: COLOURS[order[k]][0], name: COLOURS[order[k]][1],
      path: [], joined: false, joy: 0,
    }));
    dotAt = new Array(n * n).fill(-1);
    pairs.forEach((p, k) => { dotAt[p.a] = k; dotAt[p.b] = k; });
    active = -1;
    finger = null;
    hint = null;
    won = false;
    layout();
    document.querySelectorAll('#sizes .btn').forEach(b => b.classList.toggle('selected', b.dataset.size === size));
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.cell = Math.min((view.w - 40) / n, (view.h - 40) / n, 110);
    view.ox = (view.w - n * view.cell) / 2;
    view.oy = (view.h - n * view.cell) / 2;
  }

  // ---------- drawing lines
  const isJoined = p => p.path.length > 1 && dotAt[p.path[0]] === dotAt[p.path[p.path.length - 1]] &&
    p.path[0] !== p.path[p.path.length - 1];

  function ownerOf(cell) {
    for (let k = 0; k < pairs.length; k++) if (pairs[k].path.includes(cell)) return k;
    return -1;
  }

  function cellAt(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const c = Math.floor((x - view.ox) / view.cell), r = Math.floor((y - view.oy) / view.cell);
    return { x, y, cell: c >= 0 && r >= 0 && c < n && r < n ? r * n + c : -1, c, r };
  }

  // Try to move the active line into `cell` (always next to its end). Returns false if blocked.
  function enter(cell) {
    const p = pairs[active];
    const at = p.path.indexOf(cell);
    if (at >= 0) { p.path.length = at + 1; refreshJoined(); return true; } // going backwards
    if (isJoined(p)) return false;
    const dot = dotAt[cell];
    if (dot !== -1 && dot !== active) return false; // another colour's dot
    const other = ownerOf(cell);
    if (other !== -1) {
      // Cut the other colour's line where we cross it.
      const op = pairs[other];
      op.path.length = op.path.indexOf(cell);
    }
    p.path.push(cell);
    Sound.step(p.path.length);
    refreshJoined();
    return true;
  }

  function refreshJoined() {
    pairs.forEach(p => {
      const j = isJoined(p);
      if (j && !p.joined) {
        p.joy = 1;
        Sound.sparkle();
        Sound.say(p.name);
        if (navigator.vibrate) navigator.vibrate(40);
        if (hint && pairs[hint.pair] === p) hint = null;
      }
      p.joined = j;
    });
  }

  function down(e) {
    Sound.unlock();
    if (won) return;
    const { cell, x, y } = cellAt(e);
    if (cell < 0) return;
    if (dotAt[cell] !== -1) {
      active = dotAt[cell];
      pairs[active].path = [cell]; // start fresh from this dot
      Sound.step(0);
    } else {
      const k = ownerOf(cell);
      if (k === -1) return;
      active = k;
      const p = pairs[k];
      p.path.length = p.path.indexOf(cell) + 1; // carry on from here
    }
    refreshJoined();
    finger = { x, y };
    canvas.setPointerCapture(e.pointerId);
  }

  function move(e) {
    if (active < 0) return;
    const { x, y, c, r } = cellAt(e);
    finger = { x, y };
    const p = pairs[active];
    // Step one square at a time towards the finger so fast swipes still work.
    for (let guard = 0; guard < 2 * n; guard++) {
      const head = p.path[p.path.length - 1];
      const hc = head % n, hr = Math.floor(head / n);
      const tc = clamp(c, 0, n - 1), tr = clamp(r, 0, n - 1);
      if (hc === tc && hr === tr) break;
      const dc = tc - hc, dr = tr - hr;
      const next = Math.abs(dc) >= Math.abs(dr) ? head + Math.sign(dc) : head + Math.sign(dr) * n;
      if (!enter(next)) break;
    }
  }

  function up() {
    if (active < 0) return;
    active = -1;
    finger = null;
    if (!won && pairs.every(p => p.joined)) {
      won = true;
      setTimeout(() => Win.show({ picture: '🌈⭐', again: newGame }), 900);
    }
  }

  function showHint() {
    Sound.unlock();
    if (won) return;
    const open = pairs.map((p, k) => k).filter(k => !pairs[k].joined);
    if (!open.length) return;
    hint = { pair: open[Math.floor(Math.random() * open.length)], t: 3 };
    Sound.sparkle();
  }

  // ---------- render
  function drawFace(x, y, rad, happy) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, rad * 0.08);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + s * rad * 0.33, y - rad * 0.15, rad * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s * rad * 0.33, y - rad * 0.12, rad * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.fillStyle = '#fff';
    }
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.5, rad * 0.1);
    ctx.lineCap = 'round';
    if (happy) ctx.arc(x, y + rad * 0.12, rad * 0.32, 0.1 * Math.PI, 0.9 * Math.PI);
    else ctx.arc(x, y + rad * 0.3, rad * 0.14, 0, Math.PI * 2);
    ctx.stroke();
  }

  function linePath(cells) {
    ctx.beginPath();
    cells.forEach((i, k) => (k ? ctx.lineTo(cx(i), cy(i)) : ctx.moveTo(cx(i), cy(i))));
  }

  function draw() {
    const s = view.cell;
    ctx.clearRect(0, 0, view.w, view.h);
    // board
    const pad = s * 0.18;
    roundRect(view.ox - pad, view.oy - pad, n * s + pad * 2, n * s + pad * 2, pad * 1.6);
    ctx.fillStyle = '#5a4fcf';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    const gap = Math.max(1.5, s * 0.04);
    const tint = new Array(n * n).fill(null);
    pairs.forEach(p => { if (p.joined) p.path.forEach(i => { tint[i] = p.colour; }); });
    for (let i = 0; i < n * n; i++) {
      roundRect(view.ox + (i % n) * s + gap, view.oy + Math.floor(i / n) * s + gap, s - gap * 2, s - gap * 2, s * 0.16);
      ctx.fillStyle = tint[i] ? mix(tint[i], '#ffffff', 0.6) : ((i % n) + Math.floor(i / n)) % 2 ? '#f4f1ff' : '#ebe6ff';
      ctx.fill();
    }

    // hint: dotted answer for one colour
    if (hint) {
      const p = pairs[hint.pair];
      ctx.save();
      ctx.globalAlpha = clamp(hint.t, 0, 1) * (0.6 + 0.3 * Math.sin(time * 8));
      ctx.setLineDash([s * 0.02, s * 0.22]);
      ctx.lineCap = 'round';
      ctx.lineWidth = s * 0.16;
      ctx.strokeStyle = p.colour;
      linePath(p.solution);
      ctx.stroke();
      ctx.restore();
    }

    // lines
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of pairs) {
      if (p.path.length < 2) continue;
      linePath(p.path);
      ctx.lineWidth = s * 0.42;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = s * 0.32;
      ctx.strokeStyle = p.colour;
      ctx.stroke();
    }

    // dots with faces
    pairs.forEach(p => {
      for (const i of [p.a, p.b]) {
        const bounce = p.joy > 0 ? Math.sin((1 - p.joy) * Math.PI * 3) * s * 0.08 * p.joy : 0;
        const x = cx(i), y = cy(i) - Math.abs(bounce);
        const rad = s * 0.36;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fillStyle = p.colour;
        ctx.fill();
        ctx.lineWidth = Math.max(2, s * 0.06);
        ctx.strokeStyle = INK;
        ctx.stroke();
        drawFace(x, y, rad, p.joined);
      }
    });

    // finger blob while dragging
    if (finger && active >= 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(finger.x, finger.y, s * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = pairs[active].colour;
      ctx.fill();
      ctx.restore();
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    pairs.forEach(p => { p.joy = Math.max(0, p.joy - dt * 1.5); });
    if (hint) { hint.t -= dt; if (hint.t <= 0) hint = null; }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- wire up
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  document.getElementById('hint').addEventListener('click', showHint);
  document.getElementById('new').addEventListener('click', () => { Sound.unlock(); Sound.pop(); newGame(); });
  document.querySelectorAll('#sizes .btn').forEach(b => b.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    size = b.dataset.size;
    try { localStorage.setItem('kg-colours-size', size); } catch (e) {}
    newGame();
  }));
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);
  // Handy for poking at the game from the browser console.
  window.connectColours = { get pairs() { return pairs; }, view, get n() { return n; } };

  newGame();
  Sound.intro('Draw a line to join the dots that are the same colour. The lines can\'t cross!');
  requestAnimationFrame(loop);
})();
