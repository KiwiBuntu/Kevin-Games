// Train Yard: tap a train — if the track ahead is clear it drives away!
(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const muteBtn = document.getElementById('mute');
  const INK = '#2b2d42';

  let size = 'small';
  try { size = localStorage.getItem('kg-trains-size') || 'small'; } catch (e) {}
  if (!Yard.LEVELS[size]) size = 'small';

  let cols = 5, rows = 5;
  let trains = [];
  let smoke = [];
  let won = false;
  let time = 0;
  const view = { w: 0, h: 0, cell: 40, ox: 0, oy: 0 };

  // ---------- helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    let out = '#';
    for (const sh of [16, 8, 0]) {
      const x = (A >> sh) & 255, y = (B >> sh) & 255;
      out += Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
    }
    return out;
  }
  const dark = c => mix(c, '#000000', 0.35);
  const light = c => mix(c, '#ffffff', 0.35);

  function lerpAngle(a, b, t) {
    const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * t;
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

  const px = g => view.ox + (g + 0.5) * view.cell;
  const py = g => view.oy + (g + 0.5) * view.cell;

  // ---------- game setup
  function makeTrain(t) {
    const len = t.cells.length;
    // The track a train follows: tail ... engine, then straight on off the board.
    const path = t.cells.slice().reverse();
    const [ec, er] = t.cells[0];
    for (let k = 1; k <= len + Math.max(cols, rows) + 6; k++) path.push([ec + t.dir[0] * k, er + t.dir[1] * k]);
    return Object.assign(t, {
      path, state: 'idle', s: 0, speed: 0,
      red: 0, shake: 0, hint: 0, blockAt: null,
      blink: rnd(1, 5), puff: 0,
    });
  }

  function newGame() {
    const cfg = Yard.LEVELS[size];
    const rect = canvas.getBoundingClientRect();
    const aspect = rect.height / Math.max(1, rect.width);
    // Stretch the yard to suit the screen shape (portrait phone, landscape tablet).
    if (aspect >= 1) {
      cols = cfg.n;
      rows = clamp(Math.round(cfg.n * aspect), cfg.n, Math.round(cfg.n * 1.4));
    } else {
      rows = cfg.n;
      cols = clamp(Math.round(cfg.n / aspect), cfg.n, Math.round(cfg.n * 1.4));
    }
    trains = Yard.generate(cols, rows, cfg).map(makeTrain);
    smoke = [];
    won = false;
    Win.hide();
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
    const m = 20;
    view.cell = Math.min((view.w - 2 * m) / cols, (view.h - 2 * m) / rows, 120);
    view.ox = (view.w - cols * view.cell) / 2;
    view.oy = (view.h - rows * view.cell) / 2;
  }

  // Where car number `i` (0 = engine) of a train is right now, in grid units.
  function carPose(t, i) {
    const P = t.path, n = P.length;
    const x = clamp(t.cells.length - 1 - i + t.s, 0, n - 1);
    let k = Math.floor(x);
    if (k >= n - 1) k = n - 2;
    const f = x - k;
    const seg = j => {
      j = clamp(j, 0, n - 2);
      return Math.atan2(P[j + 1][1] - P[j][1], P[j + 1][0] - P[j][0]);
    };
    // Blend the heading so carriages turn smoothly round corners.
    const a = f < 0.5 ? lerpAngle(seg(k - 1), seg(k), f + 0.5) : lerpAngle(seg(k), seg(k + 1), f - 0.5);
    return {
      gx: P[k][0] + (P[k + 1][0] - P[k][0]) * f,
      gy: P[k][1] + (P[k + 1][1] - P[k][1]) * f,
      a,
    };
  }

  // How far outside the yard a point is (0 when on the board).
  const outside = (gx, gy) => Math.max(0, -0.5 - gx, gx - (cols - 0.5), -0.5 - gy, gy - (rows - 0.5));

  // Which train is on each square right now (moving trains count where their cars are).
  function occupancy() {
    const occ = new Array(cols * rows).fill(-1);
    const mark = (c, r, id) => { if (c >= 0 && r >= 0 && c < cols && r < rows) occ[r * cols + c] = id; };
    for (const t of trains) {
      if (t.state === 'idle') for (const [c, r] of t.cells) mark(c, r, t.id);
      else if (t.state === 'leaving') {
        for (let i = 0; i < t.cells.length; i++) {
          const x = t.cells.length - 1 - i + t.s;
          for (const k of [Math.floor(x), Math.ceil(x)]) {
            const p = t.path[Math.min(k, t.path.length - 1)];
            mark(p[0], p[1], t.id);
          }
        }
      }
    }
    return occ;
  }

  // ---------- input
  function tap(e) {
    Sound.unlock();
    if (won) return;
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left - view.ox) / view.cell);
    const r = Math.floor((e.clientY - rect.top - view.oy) / view.cell);
    const t = trains.find(t => t.state === 'idle' && t.cells.some(([tc, tr]) => tc === c && tr === r));
    if (!t) return;
    const b = Yard.blocker(cols, rows, t, occupancy());
    if (b) {
      t.red = 1;
      t.shake = 1;
      t.blockAt = b;
      Sound.bonk();
      if (navigator.vibrate) navigator.vibrate(60);
    } else {
      t.state = 'leaving';
      t.speed = 3;
      t.hint = 0;
      Sound.toot();
    }
  }

  function showHint() {
    Sound.unlock();
    if (won) return;
    const occ = occupancy();
    const free = trains.filter(t => t.state === 'idle' && !Yard.blocker(cols, rows, t, occ));
    if (!free.length) return;
    free[Math.floor(Math.random() * free.length)].hint = 2.5;
    Sound.sparkle();
  }

  // ---------- update
  function puff(t) {
    const p = carPose(t, 0);
    smoke.push({
      gx: p.gx + Math.cos(p.a) * 0.05, gy: p.gy + Math.sin(p.a) * 0.05,
      vx: rnd(-0.2, 0.2), vy: rnd(-0.6, -0.3),
      r: 0.16, grow: 0.5, life: 1,
    });
  }

  function update(dt) {
    time += dt;
    for (const t of trains) {
      t.red = Math.max(0, t.red - dt * 1.4);
      t.shake = Math.max(0, t.shake - dt * 2);
      t.hint = Math.max(0, t.hint - dt);
      t.blink -= dt;
      if (t.blink < -0.15) t.blink = rnd(2, 6);
      t.puff -= dt;
      if (t.state === 'leaving') {
        t.speed = Math.min(t.speed + 22 * dt, 14);
        t.s += t.speed * dt;
        if (t.puff <= 0) { puff(t); t.puff = 0.06; }
        const tail = carPose(t, t.cells.length - 1);
        if (outside(tail.gx, tail.gy) > 1.6) t.state = 'gone';
      }
    }
    for (const s of smoke) {
      s.gx += s.vx * dt;
      s.gy += s.vy * dt;
      s.r += s.grow * dt;
      s.life -= dt * 1.1;
    }
    smoke = smoke.filter(s => s.life > 0);

    if (!won && trains.length && trains.every(t => t.state === 'gone')) {
      won = true;
      setTimeout(() => Win.show({ picture: '🚂💨', again: newGame }), 300);
    }
  }

  // ---------- drawing
  function drawYard() {
    const s = view.cell, pad = s * 0.22;
    roundRect(view.ox - pad, view.oy - pad, cols * s + pad * 2, rows * s + pad * 2, pad * 1.5);
    ctx.fillStyle = '#9c6b3c';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    const gap = Math.max(1.5, s * 0.04);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        roundRect(view.ox + c * s + gap, view.oy + r * s + gap, s - gap * 2, s - gap * 2, s * 0.14);
        ctx.fillStyle = (r + c) % 2 ? '#ffe8a3' : '#fff1c4';
        ctx.fill();
      }
    }
  }

  function wheels(xs, half) {
    const s = view.cell;
    ctx.fillStyle = INK;
    for (const wx of xs) for (const side of [-1, 1]) {
      roundRect(wx * s - 0.1 * s, side * half - 0.06 * s, 0.2 * s, 0.12 * s, 0.05 * s);
      ctx.fill();
    }
  }

  function drawCarriage(x, y, a, col) {
    const s = view.cell, L = 0.8 * s, W = 0.6 * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    wheels([-0.24, 0.24], W / 2);
    roundRect(-L / 2, -W / 2, L, W, 0.14 * s);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = Math.max(2, 0.05 * s);
    ctx.strokeStyle = dark(col);
    ctx.stroke();
    roundRect(-L / 2 + 0.08 * s, -W / 2 + 0.08 * s, L - 0.16 * s, W - 0.16 * s, 0.08 * s);
    ctx.fillStyle = light(col);
    ctx.fill();
    ctx.fillStyle = '#bde9ff';
    ctx.strokeStyle = dark(col);
    ctx.lineWidth = Math.max(1, 0.03 * s);
    for (const wx of [-0.2, 0, 0.2]) {
      roundRect(wx * s - 0.065 * s, -0.09 * s, 0.13 * s, 0.18 * s, 0.03 * s);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEngine(x, y, a, col, t) {
    const s = view.cell;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    wheels([-0.3, -0.02, 0.24], 0.3 * s);
    // cow-catcher poking out the front
    ctx.beginPath();
    ctx.moveTo(0.3 * s, -0.22 * s);
    ctx.lineTo(0.56 * s, 0);
    ctx.lineTo(0.3 * s, 0.22 * s);
    ctx.closePath();
    ctx.fillStyle = '#ffd60a';
    ctx.fill();
    ctx.lineWidth = Math.max(2, 0.04 * s);
    ctx.strokeStyle = INK;
    ctx.stroke();
    // cab
    roundRect(-0.46 * s, -0.33 * s, 0.38 * s, 0.66 * s, 0.1 * s);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = Math.max(2, 0.05 * s);
    ctx.strokeStyle = dark(col);
    ctx.stroke();
    roundRect(-0.41 * s, -0.27 * s, 0.28 * s, 0.54 * s, 0.07 * s);
    ctx.fillStyle = dark(col);
    ctx.fill();
    // boiler
    roundRect(-0.14 * s, -0.24 * s, 0.5 * s, 0.48 * s, 0.14 * s);
    ctx.fillStyle = light(col);
    ctx.fill();
    ctx.strokeStyle = dark(col);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.03 * s);
    for (const bx of [-0.04, 0.1]) {
      ctx.beginPath();
      ctx.moveTo(bx * s, -0.24 * s);
      ctx.lineTo(bx * s, 0.24 * s);
      ctx.stroke();
    }
    // chimney
    ctx.beginPath();
    ctx.arc(0.03 * s, 0, 0.1 * s, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0.03 * s, 0, 0.05 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#666';
    ctx.fill();
    ctx.restore();

    // Friendly face on the front, always drawn upright.
    const fx = x + Math.cos(a) * 0.33 * s, fy = y + Math.sin(a) * 0.33 * s;
    ctx.beginPath();
    ctx.arc(fx, fy, 0.19 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#e4e6ef';
    ctx.fill();
    ctx.lineWidth = Math.max(2, 0.04 * s);
    ctx.strokeStyle = INK;
    ctx.stroke();
    const lookX = Math.cos(a) * 0.015 * s, lookY = Math.sin(a) * 0.015 * s;
    for (const side of [-1, 1]) {
      const ex = fx + side * 0.075 * s, ey = fy - 0.04 * s;
      if (t.blink < 0) {
        ctx.beginPath();
        ctx.moveTo(ex - 0.04 * s, ey);
        ctx.lineTo(ex + 0.04 * s, ey);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(ex, ey, 0.05 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = Math.max(1, 0.02 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex + lookX, ey + lookY, 0.026 * s, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
      }
    }
    // rosy cheeks
    ctx.fillStyle = 'rgba(255,110,140,0.55)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(fx + side * 0.12 * s, fy + 0.05 * s, 0.03 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.5, 0.03 * s);
    ctx.strokeStyle = INK;
    if (t.red > 0) ctx.arc(fx, fy + 0.13 * s, 0.06 * s, 1.15 * Math.PI, 1.85 * Math.PI); // sad
    else ctx.arc(fx, fy + 0.03 * s, 0.07 * s, 0.15 * Math.PI, 0.85 * Math.PI); // happy
    ctx.stroke();
  }

  function drawTrain(t) {
    const s = view.cell, len = t.cells.length;
    const wob = t.shake > 0 ? Math.sin(time * 60) * 0.08 * s * t.shake : 0;
    const wx = -t.dir[1] * wob, wy = t.dir[0] * wob;
    const poses = [];
    for (let i = 0; i < len; i++) {
      const p = carPose(t, i);
      poses.push({
        x: px(p.gx) + wx, y: py(p.gy) + wy, a: p.a,
        alpha: clamp(1 - (outside(p.gx, p.gy) - 0.4) / 1.2, 0, 1),
      });
    }
    const redK = clamp(t.red * 1.6, 0, 1);
    const col = mix(t.color, '#ff1e1e', redK * 0.85);

    ctx.save();
    if (t.hint > 0) {
      ctx.shadowColor = '#fff36b';
      ctx.shadowBlur = s * 0.5 * (0.6 + 0.4 * Math.sin(time * 10));
      const bounce = Math.abs(Math.sin(time * 9)) * 0.1 * s;
      ctx.translate(0, -bounce);
    }
    // couplings between the cars
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.12;
    ctx.strokeStyle = '#555a6e';
    for (let i = 0; i < len - 1; i++) {
      ctx.globalAlpha = Math.min(poses[i].alpha, poses[i + 1].alpha);
      ctx.beginPath();
      ctx.moveTo(poses[i].x, poses[i].y);
      ctx.lineTo(poses[i + 1].x, poses[i + 1].y);
      ctx.stroke();
    }
    for (let i = len - 1; i >= 0; i--) {
      const p = poses[i];
      if (p.alpha <= 0) continue;
      ctx.globalAlpha = p.alpha;
      if (i === 0) drawEngine(p.x, p.y, p.a, col, t);
      else drawCarriage(p.x, p.y, p.a, col);
    }
    ctx.restore();
  }

  // Show what is in the way: a dotted line from the engine to a red X.
  function drawBlocked(t) {
    if (t.red <= 0 || !t.blockAt) return;
    const s = view.cell;
    const [ec, er] = t.cells[0];
    const [bc, br] = t.blockAt;
    ctx.save();
    ctx.globalAlpha = clamp(t.red * 1.5, 0, 1);
    ctx.strokeStyle = '#ff1e1e';
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.07;
    ctx.setLineDash([s * 0.02, s * 0.16]);
    ctx.beginPath();
    ctx.moveTo(px(ec) + t.dir[0] * 0.55 * s, py(er) + t.dir[1] * 0.55 * s);
    ctx.lineTo(px(bc) - t.dir[0] * 0.3 * s, py(br) - t.dir[1] * 0.3 * s);
    ctx.stroke();
    ctx.setLineDash([]);
    const x = px(bc), y = py(br), k = 0.2 * s;
    ctx.beginPath();
    ctx.arc(x, y, 0.3 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.lineWidth = s * 0.08;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - k * 0.6, y - k * 0.6);
    ctx.lineTo(x + k * 0.6, y + k * 0.6);
    ctx.moveTo(x + k * 0.6, y - k * 0.6);
    ctx.lineTo(x - k * 0.6, y + k * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  // A bouncing finger pointing at the hinted engine.
  function drawHint(t) {
    if (t.hint <= 0) return;
    const s = view.cell;
    const [c, r] = t.cells[0];
    const bounce = Math.abs(Math.sin(time * 8)) * 0.25 * s;
    ctx.save();
    ctx.globalAlpha = clamp(t.hint * 2, 0, 1);
    ctx.font = `${Math.round(s * 0.8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('👆', px(c), py(r) + 0.2 * s + bounce);
    ctx.restore();
  }

  function drawSmoke() {
    const s = view.cell;
    for (const p of smoke) {
      ctx.globalAlpha = clamp(p.life, 0, 1) * 0.85;
      ctx.beginPath();
      ctx.arc(px(p.gx), py(p.gy), p.r * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#c8cbd6';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, view.w, view.h);
    drawYard();
    for (const t of trains) if (t.state === 'idle') drawTrain(t);
    for (const t of trains) if (t.state === 'leaving') drawTrain(t);
    for (const t of trains) if (t.state === 'idle') drawBlocked(t);
    for (const t of trains) if (t.state === 'idle') drawHint(t);
    drawSmoke();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- wire up buttons
  canvas.addEventListener('pointerdown', tap);
  document.getElementById('hint').addEventListener('click', showHint);
  document.getElementById('new').addEventListener('click', () => { Sound.unlock(); Sound.pop(); newGame(); });
  document.querySelectorAll('#sizes .btn').forEach(b => b.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    size = b.dataset.size;
    try { localStorage.setItem('kg-trains-size', size); } catch (e) {}
    newGame();
  }));
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);
  // Handy for poking at the game from the browser console.
  window.trainYard = { get trains() { return trains; }, view, get size() { return [cols, rows]; } };

  newGame();
  requestAnimationFrame(loop);
})();
