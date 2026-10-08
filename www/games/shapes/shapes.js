// Shape Sorter: drag each shape into the hole that matches it.
(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const muteBtn = document.getElementById('mute');
  const INK = '#2b2d42';

  const SIZES = { small: 3, medium: 5, big: 8 };
  const COLOURS = ['#ff4d4d', '#3a86ff', '#ffd60a', '#8ac926', '#ff9f1c', '#8338ec', '#ff5fa2', '#2ec4b6'];

  // Each shape draws itself centred on (x, y) with "radius" r.
  function poly(c, x, y, pts) {
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(x + px, y + py) : c.moveTo(x + px, y + py)));
    c.closePath();
  }
  const SHAPES = [
    { name: 'Circle', path: (c, x, y, r) => { c.beginPath(); c.arc(x, y, r * 0.88, 0, Math.PI * 2); } },
    { name: 'Square', path: (c, x, y, r) => { c.beginPath(); c.roundRect(x - r * 0.78, y - r * 0.78, r * 1.56, r * 1.56, r * 0.14); } },
    { name: 'Triangle', path: (c, x, y, r) => poly(c, x, y, [[0, -r * 0.92], [r * 0.95, r * 0.72], [-r * 0.95, r * 0.72]]) },
    {
      name: 'Star', path: (c, x, y, r) => poly(c, x, y, Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.45 : r;
        return [Math.cos(a) * d, Math.sin(a) * d + r * 0.08];
      })),
    },
    {
      name: 'Heart', path: (c, x, y, r) => {
        c.beginPath();
        c.moveTo(x, y + r * 0.85);
        c.bezierCurveTo(x - r * 1.45, y - r * 0.05, x - r * 0.6, y - r * 1.15, x, y - r * 0.45);
        c.bezierCurveTo(x + r * 0.6, y - r * 1.15, x + r * 1.45, y - r * 0.05, x, y + r * 0.85);
        c.closePath();
      },
    },
    { name: 'Diamond', path: (c, x, y, r) => poly(c, x, y, [[0, -r], [r * 0.72, 0], [0, r], [-r * 0.72, 0]]) },
    {
      name: 'Hexagon', path: (c, x, y, r) => poly(c, x, y, Array.from({ length: 6 }, (_, i) => {
        const a = (i * Math.PI) / 3;
        return [Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92];
      })),
    },
    { name: 'Oval', path: (c, x, y, r) => { c.beginPath(); c.ellipse(x, y, r * 0.62, r * 0.92, 0, 0, Math.PI * 2); } },
  ];

  let size = 'small';
  try { size = localStorage.getItem('kg-shapes-size') || 'small'; } catch (e) {}
  if (!SIZES[size]) size = 'small';

  let holes = [];   // { shape, cx, cy, filled, wiggle }
  let pieces = [];  // { shape, colour, slot: {cx, cy}, cx, cy, placed, hole }
  let drag = null;
  let won = false;
  let time = 0;
  const view = { w: 0, h: 0, R: 40, box: null, tray: null };

  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function newGame() {
    Win.hide();
    const picks = shuffle(SHAPES.slice()).slice(0, SIZES[size]);
    const colours = shuffle(COLOURS.slice());
    holes = shuffle(picks.slice()).map(shape => ({ shape, cx: 0, cy: 0, filled: false, wiggle: 0 }));
    pieces = shuffle(picks.slice()).map((shape, i) => ({ shape, colour: colours[i], slot: null, cx: 0, cy: 0, placed: false, hole: null }));
    drag = null;
    won = false;
    layout(true);
    document.querySelectorAll('#sizes .btn').forEach(b => b.classList.toggle('selected', b.dataset.size === size));
  }

  // Best grid for n things in a rectangle: returns the centres and the room each gets.
  function grid(rect, n) {
    let best = { cell: 0, gc: 1, gr: 1 };
    for (let gc = 1; gc <= n; gc++) {
      const gr = Math.ceil(n / gc);
      const cell = Math.min(rect.w / gc, rect.h / gr);
      if (cell > best.cell) best = { cell, gc, gr };
    }
    const cw = rect.w / best.gc, ch = rect.h / best.gr;
    const spots = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / best.gc);
      const inRow = Math.min(best.gc, n - row * best.gc); // centre a short last row
      const offset = (rect.w - inRow * cw) / 2;
      spots.push({ cx: rect.x + offset + ((i % best.gc) + 0.5) * cw, cy: rect.y + (row + 0.5) * ch });
    }
    return { spots, cell: best.cell };
  }

  function layout(fresh) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = view.w, H = view.h, g = 14;
    if (H > W) {
      view.box = { x: g, y: g, w: W - 2 * g, h: H * 0.5 - g };
      view.tray = { x: g, y: H * 0.5 + g, w: W - 2 * g, h: H * 0.5 - 2 * g };
    } else {
      view.box = { x: g, y: g, w: W * 0.55 - g, h: H - 2 * g };
      view.tray = { x: W * 0.55 + g, y: g, w: W * 0.45 - 2 * g, h: H - 2 * g };
    }
    const inset = r => ({ x: r.x + 16, y: r.y + 16, w: r.w - 32, h: r.h - 32 });
    const hg = grid(inset(view.box), holes.length);
    const tg = grid(inset(view.tray), pieces.length);
    view.R = Math.min(hg.cell, tg.cell) * 0.36;
    holes.forEach((h, i) => Object.assign(h, hg.spots[i]));
    pieces.forEach((p, i) => {
      p.slot = tg.spots[i];
      if (p.placed) { p.cx = p.hole.cx; p.cy = p.hole.cy; }
      else if (fresh || !drag || drag.piece !== p) { p.cx = p.slot.cx; p.cy = p.slot.cy; }
    });
  }

  // ---------- input
  function pointAt(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e) {
    Sound.unlock();
    if (won) return;
    const { x, y } = pointAt(e);
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      if (p.placed || Math.hypot(x - p.cx, y - p.cy) > view.R * 1.15) continue;
      pieces.splice(i, 1);
      pieces.push(p);
      drag = { piece: p, dx: x - p.cx, dy: y - p.cy };
      Sound.pop();
      canvas.setPointerCapture(e.pointerId);
      return;
    }
  }

  function move(e) {
    if (!drag) return;
    const { x, y } = pointAt(e);
    drag.piece.cx = x - drag.dx;
    drag.piece.cy = y - drag.dy;
  }

  function up() {
    if (!drag) return;
    const p = drag.piece;
    drag = null;
    const hole = holes.find(h => Math.hypot(h.cx - p.cx, h.cy - p.cy) < view.R * 0.95);
    if (hole && hole.shape === p.shape && !hole.filled) {
      hole.filled = true;
      p.placed = true;
      p.hole = hole;
      p.drop = 1;
      Sound.snap();
      Sound.say(p.shape.name);
      if (navigator.vibrate) navigator.vibrate(30);
      if (pieces.every(q => q.placed)) {
        won = true;
        setTimeout(() => Win.show({ picture: '⭐🔺🟦', again: newGame }), 1300);
      }
    } else if (hole) {
      hole.wiggle = 1; // not that one!
      Sound.boing();
    }
  }

  // ---------- drawing
  function drawFace(x, y, r) {
    ctx.fillStyle = INK;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + s * r * 0.24, y - r * 0.08, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.arc(x, y + r * 0.08, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  function draw() {
    const { box, tray, R } = view;
    ctx.clearRect(0, 0, view.w, view.h);

    // wooden box
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 28);
    ctx.fillStyle = '#d99a5b';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(120, 70, 30, 0.25)';
    ctx.lineWidth = 3;
    for (let y = box.y + 24; y < box.y + box.h; y += 34) {
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.bezierCurveTo(box.x + box.w * 0.3, y - 8, box.x + box.w * 0.6, y + 8, box.x + box.w, y);
      ctx.stroke();
    }
    ctx.restore();

    // tray for the shapes
    ctx.beginPath();
    ctx.roundRect(tray.x, tray.y, tray.w, tray.h, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    // holes
    for (const h of holes) {
      const wob = h.wiggle > 0 ? Math.sin(time * 40) * R * 0.08 * h.wiggle : 0;
      h.shape.path(ctx, h.cx + wob, h.cy, R * 1.08);
      ctx.fillStyle = '#4a3020';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = h.wiggle > 0 ? '#ff4d4d' : '#2b1a10';
      ctx.stroke();
    }

    // shapes: ones in holes, then loose ones, then the one being carried
    const order = [...pieces.filter(p => p.placed), ...pieces.filter(p => !p.placed && (!drag || drag.piece !== p))];
    if (drag) order.push(drag.piece);
    for (const p of order) {
      const lifted = drag && drag.piece === p;
      const sc = lifted ? 1.1 : p.drop > 0 ? 1 + Math.sin(p.drop * Math.PI) * 0.15 : 1;
      ctx.save();
      if (lifted) { ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8; }
      p.shape.path(ctx, p.cx, p.cy, R * sc);
      ctx.fillStyle = p.colour;
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      p.shape.path(ctx, p.cx, p.cy, R * sc);
      ctx.stroke();
      // shine
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(p.cx - R * 0.3 * sc, p.cy - R * 0.35 * sc, R * 0.12 * sc, R * 0.2 * sc, 0.6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
      drawFace(p.cx, p.cy + (p.shape.name === 'Triangle' ? R * 0.2 : 0), R * sc);
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    for (const h of holes) h.wiggle = Math.max(0, h.wiggle - dt * 2.5);
    for (const p of pieces) {
      if (p.drop > 0) p.drop = Math.max(0, p.drop - dt * 3);
      if (drag && drag.piece === p) continue;
      // glide into the hole, or back to its spot in the tray
      const target = p.placed ? p.hole : p.slot;
      p.cx += (target.cx - p.cx) * Math.min(1, dt * 12);
      p.cy += (target.cy - p.cy) * Math.min(1, dt * 12);
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- wire up
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  document.getElementById('new').addEventListener('click', () => { Sound.unlock(); Sound.pop(); newGame(); });
  document.querySelectorAll('#sizes .btn').forEach(b => b.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    size = b.dataset.size;
    try { localStorage.setItem('kg-shapes-size', size); } catch (e) {}
    newGame();
  }));
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', () => layout(false));
  // Handy for poking at the game from the browser console.
  window.shapeSorter = { get pieces() { return pieces; }, get holes() { return holes; } };

  newGame();
  Sound.intro('Put each shape in the hole that matches!');
  requestAnimationFrame(loop);
})();
