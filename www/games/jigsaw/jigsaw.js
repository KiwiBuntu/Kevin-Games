// Jigsaw: drag the pieces into the picture. They click in when they're close.
(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const muteBtn = document.getElementById('mute');
  const INK = '#2b2d42';

  const SIZES = { small: [2, 2], medium: [2, 3], big: [3, 3] }; // rows, cols

  let size = 'small';
  try { size = localStorage.getItem('kg-jigsaw-size') || 'small'; } catch (e) {}
  if (!SIZES[size]) size = 'small';

  let scene = null;
  let rows = 2, cols = 2;
  let hEdges = [], vEdges = []; // tab directions between pieces (+1 / -1)
  let pieces = [];  // { r, c, cx, cy (centre), s (scale now), ts (scale wanted), placed, img }
  let picture = null;
  let drag = null;  // { piece, dx, dy }
  let done = false;
  let glow = 0;
  const view = { w: 0, h: 0, S: 300, bx: 0, by: 0, pw: 150, ph: 150, k: 150, m: 50, tray: null, trayScale: 1 };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- piece shapes
  // One side of a piece from A to B. s = 0 flat, +1 tab sticking out, -1 hole.
  function edge(c, ax, ay, bx, by, s) {
    if (!s) { c.lineTo(bx, by); return; }
    const L = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / L, uy = (by - ay) / L; // along the edge
    const ox = uy, oy = -ux;                      // outwards (we go round clockwise)
    const k = view.k;
    const P = (t, h) => [ax + ux * (L / 2 + (t - 0.5) * k) + ox * h * k * s, ay + uy * (L / 2 + (t - 0.5) * k) + oy * h * k * s];
    c.lineTo(...P(0.35, 0));
    c.bezierCurveTo(...P(0.45, 0), ...P(0.4, 0.12), ...P(0.37, 0.16));
    c.bezierCurveTo(...P(0.3, 0.26), ...P(0.4, 0.33), ...P(0.5, 0.33));
    c.bezierCurveTo(...P(0.6, 0.33), ...P(0.7, 0.26), ...P(0.63, 0.16));
    c.bezierCurveTo(...P(0.6, 0.12), ...P(0.55, 0), ...P(0.65, 0));
    c.lineTo(bx, by);
  }

  function sides(p) {
    return {
      top: p.r === 0 ? 0 : -hEdges[p.r - 1][p.c],
      bottom: p.r === rows - 1 ? 0 : hEdges[p.r][p.c],
      left: p.c === 0 ? 0 : -vEdges[p.r][p.c - 1],
      right: p.c === cols - 1 ? 0 : vEdges[p.r][p.c],
    };
  }

  function piecePath(c, p, x, y) {
    const { pw, ph } = view;
    const s = sides(p);
    c.beginPath();
    c.moveTo(x, y);
    edge(c, x, y, x + pw, y, s.top);
    edge(c, x + pw, y, x + pw, y + ph, s.right);
    edge(c, x + pw, y + ph, x, y + ph, s.bottom);
    edge(c, x, y + ph, x, y, s.left);
    c.closePath();
  }

  // ---------- setup
  function newGame() {
    Win.hide();
    [rows, cols] = SIZES[size];
    const others = Scenes.LIST.filter(s => s !== scene);
    scene = others[Math.floor(Math.random() * others.length)];
    const flip = () => (Math.random() < 0.5 ? 1 : -1);
    hEdges = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, flip));
    vEdges = Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, flip));
    pieces = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pieces.push({ r, c, cx: 0, cy: 0, s: 1, ts: 1, placed: false, img: null });
    pieces.sort(() => Math.random() - 0.5);
    drag = null;
    done = false;
    glow = 0;
    layout(true);
    document.querySelectorAll('#sizes .btn').forEach(b => b.classList.toggle('selected', b.dataset.size === size));
  }

  function layout(scatterAll) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = view.w, H = view.h;
    if (H > W) {
      // Portrait: picture on top, pieces underneath.
      view.S = Math.min(W - 60, H * 0.5);
      view.bx = (W - view.S) / 2;
      view.by = view.S * 0.1 + 6;
      const ty = view.by + view.S + view.S * 0.08;
      view.tray = { x: 8, y: ty, w: W - 16, h: H - ty - 8 };
    } else {
      // Landscape: picture on the left, pieces on the right.
      view.S = Math.min(H - 50, W * 0.5);
      view.by = (H - view.S) / 2;
      view.bx = Math.max(20, view.S * 0.1);
      const tx = view.bx + view.S + view.S * 0.08;
      view.tray = { x: tx, y: 8, w: W - tx - 8, h: H - 16 };
    }
    view.pw = view.S / cols;
    view.ph = view.S / rows;
    view.k = Math.min(view.pw, view.ph);
    view.m = view.k * 0.36 + 4;

    // The picture, then a cut-out image for each piece.
    picture = document.createElement('canvas');
    picture.width = picture.height = Math.round(view.S * dpr);
    const pc = picture.getContext('2d');
    pc.scale(dpr, dpr);
    scene.draw(pc, view.S);

    const { pw, ph, m } = view;
    for (const p of pieces) {
      const img = document.createElement('canvas');
      img.width = Math.round((pw + 2 * m) * dpr);
      img.height = Math.round((ph + 2 * m) * dpr);
      const c = img.getContext('2d');
      c.scale(dpr, dpr);
      piecePath(c, p, m, m);
      c.save();
      c.clip();
      c.drawImage(picture, m - p.c * pw, m - p.r * ph, view.S, view.S);
      c.restore();
      c.lineJoin = 'round';
      c.lineWidth = Math.max(2, view.k * 0.03);
      c.strokeStyle = INK;
      c.stroke();
      p.img = img;
      if (p.placed) Object.assign(p, home(p));
    }
    if (scatterAll) scatter(pieces);
    else scatter(pieces.filter(p => !p.placed));
  }

  // Centre of a piece's right spot in the picture.
  const home = p => ({ cx: view.bx + (p.c + 0.5) * view.pw, cy: view.by + (p.r + 0.5) * view.ph });

  // Lay the loose pieces out in tidy slots in the tray, shrunk so none overlap.
  function scatter(list) {
    const { tray, pw, ph, m } = view;
    const n = pieces.length;
    let best = { scale: 0, gc: 1, gr: 1 };
    for (let gc = 1; gc <= n; gc++) {
      const gr = Math.ceil(n / gc);
      const scale = Math.min(1, (tray.w / gc) / (pw + 2 * m), (tray.h / gr) / (ph + 2 * m)) * 0.94;
      if (scale > best.scale) best = { scale, gc, gr };
    }
    view.trayScale = best.scale;
    const slots = [];
    for (let i = 0; i < best.gc * best.gr; i++) slots.push(i);
    slots.sort(() => Math.random() - 0.5);
    const sw = tray.w / best.gc, sh = tray.h / best.gr;
    list.forEach((p, i) => {
      const slot = slots[i % slots.length];
      p.cx = tray.x + ((slot % best.gc) + 0.5) * sw + rnd(-0.04, 0.04) * sw;
      p.cy = tray.y + (Math.floor(slot / best.gc) + 0.5) * sh + rnd(-0.04, 0.04) * sh;
      p.s = p.ts = best.scale;
    });
  }

  const inTray = (x, y) => { const t = view.tray; return x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.h; };

  // ---------- input
  function pointAt(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e) {
    Sound.unlock();
    if (done) return;
    const { x, y } = pointAt(e);
    const pad = view.k * 0.15;
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      if (p.placed) continue;
      if (Math.abs(x - p.cx) <= (view.pw / 2 + pad) * p.s && Math.abs(y - p.cy) <= (view.ph / 2 + pad) * p.s) {
        pieces.splice(i, 1);
        pieces.push(p); // bring to the front
        p.ts = 1;       // grow to full size while carried
        drag = { piece: p, dx: (x - p.cx) / p.s, dy: (y - p.cy) / p.s };
        Sound.pop();
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
  }

  function move(e) {
    if (!drag) return;
    const { x, y } = pointAt(e);
    const p = drag.piece;
    p.cx = clamp(x - drag.dx * p.s, 0, view.w);
    p.cy = clamp(y - drag.dy * p.s, 0, view.h);
  }

  function up() {
    if (!drag) return;
    const p = drag.piece;
    drag = null;
    const h = home(p);
    // Be generous — close enough clicks into place.
    if (Math.hypot(p.cx - h.cx, p.cy - h.cy) < view.k * 0.45) {
      Object.assign(p, h);
      p.s = p.ts = 1;
      p.placed = true;
      p.pulse = 1;
      Sound.snap();
      if (navigator.vibrate) navigator.vibrate(30);
      if (pieces.every(q => q.placed)) finish();
    } else if (inTray(p.cx, p.cy)) {
      p.ts = view.trayScale; // back in the tray: shrink again
    }
  }

  function finish() {
    done = true;
    glow = 1;
    setTimeout(() => { Sound.sparkle(); Sound.say(scene.name); }, 400);
    setTimeout(() => Win.show({ picture: '🧩⭐', again: newGame }), 2200);
  }

  // ---------- drawing
  function draw() {
    const { S, bx, by, tray, m, pw, ph } = view;
    ctx.clearRect(0, 0, view.w, view.h);

    // tray for the loose pieces
    roundRect(ctx, tray.x, tray.y, tray.w, tray.h, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    // frame + faint picture to help
    const f = S * 0.035;
    roundRect(ctx, bx - f, by - f, S + 2 * f, S + 2 * f, f * 1.6);
    ctx.fillStyle = '#9c6b3c';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx, by, S, S);
    ctx.globalAlpha = done ? 1 : 0.3;
    ctx.drawImage(picture, bx, by, S, S);
    ctx.globalAlpha = 1;
    if (!done) {
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(43,45,66,0.35)';
      for (const p of pieces) {
        if (p.placed) continue;
        const h = home(p);
        piecePath(ctx, p, h.cx - view.pw / 2, h.cy - view.ph / 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // placed pieces first, then loose ones, then the one being dragged
    const order = [...pieces.filter(p => p.placed), ...pieces.filter(p => !p.placed && (!drag || drag.piece !== p))];
    if (!done) for (const p of order) drawPiece(p, false);
    if (drag) drawPiece(drag.piece, true);

    if (glow > 0) {
      ctx.save();
      ctx.globalAlpha = glow * 0.6;
      ctx.lineWidth = 12 * glow + 2;
      ctx.strokeStyle = '#fff36b';
      ctx.strokeRect(bx, by, S, S);
      ctx.restore();
    }
  }

  function drawPiece(p, lifted) {
    const { pw, ph, m } = view;
    const pulse = p.pulse > 0 ? 1 + Math.sin(p.pulse * Math.PI) * 0.06 : 1;
    const sc = p.s * (lifted ? 1.06 : pulse);
    ctx.save();
    ctx.translate(p.cx, p.cy);
    ctx.scale(sc, sc);
    if (lifted || !p.placed) {
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = lifted ? 18 : 6;
      ctx.shadowOffsetY = lifted ? 8 : 3;
    }
    ctx.drawImage(p.img, -pw / 2 - m, -ph / 2 - m, pw + 2 * m, ph + 2 * m);
    ctx.restore();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const p of pieces) {
      if (p.pulse > 0) p.pulse = Math.max(0, p.pulse - dt * 3);
      p.s += (p.ts - p.s) * Math.min(1, dt * 14);
    }
    if (glow > 0 && done) glow = 0.5 + 0.5 * Math.sin(now / 200);
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
    try { localStorage.setItem('kg-jigsaw-size', size); } catch (e) {}
    newGame();
  }));
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', () => layout(false));
  // Handy for poking at the game from the browser console.
  window.jigsaw = { get pieces() { return pieces; }, view, home, get scene() { return scene; } };

  newGame();
  Sound.intro('Drag the pieces into the picture.');
  requestAnimationFrame(loop);
})();
