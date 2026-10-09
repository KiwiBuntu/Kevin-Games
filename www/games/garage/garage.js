// Parking Garage: slide the cars back and forth so each one can drive out of its
// own coloured door. Every car that leaves makes more room for the others.
(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const muteBtn = document.getElementById('mute');
  const INK = '#2b2d42';

  const COLOURS = [
    ['#ff4d4d', 'red'], ['#3a86ff', 'blue'], ['#ffd60a', 'yellow'], ['#8ac926', 'green'], ['#ff9f1c', 'orange'],
    ['#8338ec', 'purple'], ['#ff5fa2', 'pink'], ['#2ec4b6', 'turquoise'], ['#9c6b3c', 'brown'], ['#8d93a8', 'grey'],
  ];

  let size = 'small';
  try { size = localStorage.getItem('kg-garage-size') || 'small'; } catch (e) {}
  if (!Lot.LEVELS[size]) size = 'small';

  let n = 5;
  let cars = [];   // from Lot.generate, plus colour/name
  let pos = [];    // where each car is (first square along its lane)
  let out = [];    // 1 once a car has left
  let shown = [];  // drawn position, glides towards pos (or out of the door)
  let leaving = [];
  let wiggle = [];
  let undo = [];
  let drag = null;
  let hint = null;
  let won = false;
  let time = 0;
  const view = { w: 0, h: 0, s: 60, ox: 0, oy: 0 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    let o = '#';
    for (const sh of [16, 8, 0]) o += Math.round(((A >> sh) & 255) + ((((B >> sh) & 255) - ((A >> sh) & 255)) * t)).toString(16).padStart(2, '0');
    return o;
  }

  // ---------- setup
  // Garages are built by a background worker, and the next one is always ready in advance.
  let worker = null;
  try { worker = new Worker('lot-worker.js'); } catch (e) {}
  let ticket = 0;
  const ready = {}; // size -> promise of a garage
  function build(sz) {
    const cfg = Lot.LEVELS[sz];
    if (!worker) return Promise.resolve(Lot.generate(cfg));
    return new Promise(res => {
      const id = ++ticket;
      const got = e => {
        if (e.data.id !== id) return;
        worker.removeEventListener('message', got);
        res(e.data.puzzle);
      };
      worker.addEventListener('message', got);
      worker.postMessage({ id, cfg });
    });
  }
  let loading = false;

  async function newGame() {
    Win.hide();
    const sz = size;
    loading = true;
    cars = [];
    n = Lot.LEVELS[sz].n;
    layout();
    const puzzle = await (ready[sz] || build(sz));
    ready[sz] = build(sz); // get the next one going
    if (sz !== size) return; // he picked another size while we waited
    loading = false;
    setup(puzzle);
  }

  function setup(puzzle) {
    Guard.round(size);
    const cfg = Lot.LEVELS[size];
    n = cfg.n;
    const order = COLOURS.map((c, i) => i).sort(() => Math.random() - 0.5);
    cars = puzzle.cars.map((c, i) => ({ ...c, colour: COLOURS[order[i]][0], name: COLOURS[order[i]][1] }));
    pos = cars.map(c => c.pos);
    out = cars.map(() => 0);
    shown = pos.slice();
    leaving = cars.map(() => 0);
    wiggle = cars.map(() => 0);
    undo = [];
    drag = null;
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
    // room around the garage for the doors and for cars driving away
    view.s = Math.min(view.w / (n + 1.6), view.h / (n + 1.6), 110);
    view.ox = (view.w - n * view.s) / 2;
    view.oy = (view.h - n * view.s) / 2;
  }

  const gridNow = () => Lot.grid(n, cars, pos, out);
  const save = () => undo.push({ pos: pos.slice(), out: out.slice() });

  // ---------- moving cars
  function drive(i, to) {
    if (to === pos[i]) return false;
    save();
    pos[i] = to;
    hint = null;
    Sound.step(to);
    return true;
  }

  function leave(i) {
    save();
    out[i] = 1;
    leaving[i] = 1;
    hint = null;
    Sound.vroom();
    setTimeout(() => Sound.say(`Bye bye ${cars[i].name} car!`), 250);
    if (navigator.vibrate) navigator.vibrate(40);
    if (out.every(Boolean)) {
      won = true;
      setTimeout(() => Win.show({ picture: '🚗🏁', again: newGame }), 1500);
    }
  }

  // Tap: drive towards its door as far as it can — and out if the way is clear.
  function tapCar(i) {
    const g = gridNow();
    if (Lot.canExit(n, cars, g, i, pos[i])) { leave(i); return; }
    const [lo, hi] = Lot.range(n, cars, g, i, pos[i]);
    if (!drive(i, cars[i].door > 0 ? hi : lo)) {
      wiggle[i] = 1;
      Sound.nope();
    }
  }

  function carAt(x, y) {
    const c = Math.floor((x - view.ox) / view.s), r = Math.floor((y - view.oy) / view.s);
    if (c < 0 || r < 0 || c >= n || r >= n) return -1;
    return gridNow()[r * n + c];
  }

  function pointAt(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e) {
    Sound.unlock();
    if (won || loading) return;
    const p = pointAt(e);
    const i = carAt(p.x, p.y);
    if (i < 0) return;
    const g = gridNow();
    const [lo, hi] = Lot.range(n, cars, g, i, pos[i]);
    const exitOk = Lot.canExit(n, cars, g, i, pos[i]);
    drag = { car: i, x: p.x, y: p.y, start: pos[i], lo, hi, exitOk, moved: false, f: pos[i] };
    canvas.setPointerCapture(e.pointerId);
  }

  function move(e) {
    if (!drag) return;
    const p = pointAt(e);
    const c = cars[drag.car];
    const d = ((c.horiz ? p.x - drag.x : p.y - drag.y)) / view.s;
    if (Math.abs(c.horiz ? p.x - drag.x : p.y - drag.y) > 8) drag.moved = true;
    // can be pulled a little past the wall if its door is open
    const lo = drag.lo - (drag.exitOk && c.door < 0 ? 1 : 0);
    const hi = drag.hi + (drag.exitOk && c.door > 0 ? 1 : 0);
    drag.f = clamp(drag.start + d, lo, hi);
    shown[drag.car] = drag.f;
  }

  function up() {
    if (!drag) return;
    const d = drag, i = d.car, c = cars[i];
    if (!d.moved) { drag = null; tapCar(i); return; }
    const pastWall = c.door > 0 ? d.f > d.hi + 0.35 : d.f < d.lo - 0.35;
    if (d.exitOk && pastWall) leave(i);
    else drive(i, clamp(Math.round(d.f), d.lo, d.hi));
    drag = null;
  }

  function showHint() {
    Sound.unlock();
    if (won || loading) return;
    const sol = Lot.solve(n, cars, pos, out);
    if (!sol || !sol.first) return;
    hint = { ...sol.first, t: 3.5 };
    Guard.count('💡 hint');
    Sound.sparkle();
  }

  function undoMove() {
    Sound.unlock();
    if (!undo.length || won || loading) return;
    const u = undo.pop();
    Guard.count('↩️ undo');
    pos = u.pos;
    out = u.out;
    out.forEach((o, i) => { if (!o) { leaving[i] = 0; } });
    hint = null;
    Sound.pop();
  }

  // ---------- drawing
  // Rectangle of a car (in pixels) when its first square is at position f.
  function box(c, f) {
    const s = view.s;
    return c.horiz
      ? { x: view.ox + f * s, y: view.oy + c.lane * s, w: c.len * s, h: s }
      : { x: view.ox + c.lane * s, y: view.oy + f * s, w: s, h: c.len * s };
  }

  function drawCar(c, f, alpha, glow) {
    const s = view.s, b = box(c, f);
    const angle = c.horiz ? (c.door > 0 ? 0 : Math.PI) : (c.door > 0 ? Math.PI / 2 : -Math.PI / 2);
    const L = c.len * s - s * 0.18, W = s * 0.74;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.rotate(angle);
    if (glow) { ctx.shadowColor = '#fff36b'; ctx.shadowBlur = s * 0.6 * (0.6 + 0.4 * Math.sin(time * 10)); }
    // wheels
    ctx.fillStyle = INK;
    for (const wx of [L / 2 - s * 0.3, -L / 2 + s * 0.3]) for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(wx - s * 0.13, sy * W / 2 - s * 0.07, s * 0.26, s * 0.14, s * 0.05);
      ctx.fill();
    }
    // body
    ctx.beginPath();
    ctx.roundRect(-L / 2, -W / 2, L, W, W * 0.32);
    ctx.fillStyle = c.colour;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.strokeStyle = mix(c.colour, '#000000', 0.4);
    ctx.stroke();
    if (c.len === 3) {
      // truck: cargo box behind the cab
      ctx.beginPath();
      ctx.roundRect(-L / 2 + s * 0.08, -W / 2 + s * 0.08, L - s * 0.95, W - s * 0.16, s * 0.08);
      ctx.fillStyle = mix(c.colour, '#ffffff', 0.45);
      ctx.fill();
      ctx.stroke();
    } else {
      // roof and back window
      ctx.beginPath();
      ctx.roundRect(-L / 2 + s * 0.42, -W / 2 + s * 0.1, L - s * 0.95, W - s * 0.2, s * 0.1);
      ctx.fillStyle = mix(c.colour, '#ffffff', 0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-L / 2 + s * 0.16, -W / 2 + s * 0.14, s * 0.16, W - s * 0.28, s * 0.05);
      ctx.fillStyle = '#bde9ff';
      ctx.fill();
    }
    // windscreen with friendly eyes, headlights at the front
    const wx = L / 2 - s * 0.42;
    ctx.beginPath();
    ctx.roundRect(wx, -W / 2 + s * 0.1, s * 0.22, W - s * 0.2, s * 0.06);
    ctx.fillStyle = '#bde9ff';
    ctx.fill();
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(wx + s * 0.11, sy * W * 0.17, s * 0.075, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(wx + s * 0.14, sy * W * 0.17, s * 0.038, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(L / 2 - s * 0.06, sy * W * 0.3, s * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6a8';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDoor(c, i) {
    const s = view.s, t = s * 0.32;
    const k = c.lane;
    let x, y, w, h, ax, ay;
    if (c.horiz) {
      y = view.oy + (k + 0.1) * s; h = s * 0.8; w = t;
      x = c.door > 0 ? view.ox + n * s : view.ox - t;
      ax = c.door > 0 ? 1 : -1; ay = 0;
    } else {
      x = view.ox + (k + 0.1) * s; w = s * 0.8; h = t;
      y = c.door > 0 ? view.oy + n * s : view.oy - t;
      ax = 0; ay = c.door > 0 ? 1 : -1;
    }
    ctx.save();
    ctx.globalAlpha = out[i] && !leaving[i] ? 0.35 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, s * 0.08);
    ctx.fillStyle = c.colour;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // arrow pointing out
    const cx = x + w / 2, cy = y + h / 2, r = t * 0.32;
    ctx.beginPath();
    ctx.moveTo(cx + ax * r, cy + ay * r);
    ctx.lineTo(cx - ax * r + ay * r, cy - ay * r + ax * r);
    ctx.lineTo(cx - ax * r - ay * r, cy - ay * r - ax * r);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const s = view.s, W = n * s, t = s * 0.32;
    ctx.clearRect(0, 0, view.w, view.h);
    // walls and floor
    ctx.beginPath();
    ctx.roundRect(view.ox - t, view.oy - t, W + 2 * t, W + 2 * t, t);
    ctx.fillStyle = '#6b7088';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#c9ced9';
    ctx.fillRect(view.ox, view.oy, W, W);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([s * 0.18, s * 0.14]);
    ctx.beginPath();
    for (let k = 1; k < n; k++) {
      ctx.moveTo(view.ox + k * s, view.oy); ctx.lineTo(view.ox + k * s, view.oy + W);
      ctx.moveTo(view.ox, view.oy + k * s); ctx.lineTo(view.ox + W, view.oy + k * s);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    cars.forEach(drawDoor);
    if (loading) {
      ctx.font = `${Math.round(s)}px "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚗', view.ox + W / 2 + Math.sin(time * 6) * s, view.oy + W / 2);
      return;
    }

    // hint: where to move
    if (hint && !out[hint.car]) {
      const c = cars[hint.car];
      if (!hint.exit) {
        const b = box(c, hint.to);
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 8);
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 4;
        ctx.strokeStyle = c.colour;
        ctx.beginPath();
        ctx.roundRect(b.x + s * 0.08, b.y + s * 0.08, b.w - s * 0.16, b.h - s * 0.16, s * 0.2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // cars (leaving ones fade as they go through their door)
    cars.forEach((c, i) => {
      if (out[i] && !leaving[i]) return;
      let f = shown[i];
      if (wiggle[i] > 0) f += Math.sin(time * 50) * 0.06 * wiggle[i];
      const past = c.door > 0 ? f - (n - c.len) : -f;
      const alpha = leaving[i] ? clamp(1 - (past - 0.3) / c.len, 0, 1) : 1;
      drawCar(c, f, alpha, hint && hint.car === i);
    });
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    cars.forEach((c, i) => {
      wiggle[i] = Math.max(0, wiggle[i] - dt * 3);
      if (leaving[i]) {
        // speed up out of the door
        const dir = c.door;
        shown[i] += dir * dt * (6 + Math.abs(shown[i] - pos[i]) * 6);
        const past = dir > 0 ? shown[i] - n : -shown[i] - c.len;
        if (past > 1) leaving[i] = 0;
      } else if (!drag || drag.car !== i) {
        shown[i] += (pos[i] - shown[i]) * Math.min(1, dt * 14);
      }
    });
    if (hint) { hint.t -= dt; if (hint.t <= 0) hint = null; }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- wire up
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { drag = null; });
  document.getElementById('hint').addEventListener('click', showHint);
  document.getElementById('undo').addEventListener('click', undoMove);
  document.getElementById('new').addEventListener('click', () => { Sound.unlock(); Sound.pop(); newGame(); });
  document.querySelectorAll('#sizes .btn').forEach(b => b.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    size = b.dataset.size;
    try { localStorage.setItem('kg-garage-size', size); } catch (e) {}
    newGame();
  }));
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);
  // Handy for poking at the game from the browser console.
  window.garage = { get cars() { return cars; }, get pos() { return pos; }, get out() { return out; }, view, get n() { return n; } };

  newGame();
  Sound.intro('Each car drives out of the door that matches its colour. Slide the cars out of the way!');
  requestAnimationFrame(loop);
})();
