// Dot to Dot: join the dots in order to make a picture.
(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const modeBtn = document.getElementById('mode');
  const muteBtn = document.getElementById('mute');
  const INK = '#2b2d42';
  const TEXT_FONT = '"Fredoka", "Comic Sans MS", sans-serif';

  const NUMBER_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // ---------- pictures: dot positions (0–1 across the square), colour, and extra details
  function poly(c, S, pts, colour) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x * S, y * S) : c.moveTo(x * S, y * S)));
    c.closePath();
    c.fillStyle = colour;
    c.fill();
    c.lineWidth = Math.max(2, S * 0.008);
    c.strokeStyle = INK;
    c.stroke();
  }
  function circle(c, S, x, y, r, colour, outline = true) {
    c.beginPath();
    c.arc(x * S, y * S, r * S, 0, Math.PI * 2);
    c.fillStyle = colour;
    c.fill();
    if (outline) { c.lineWidth = Math.max(2, S * 0.006); c.strokeStyle = INK; c.stroke(); }
  }
  function face(c, S, x, y, r) {
    for (const s of [-1, 1]) circle(c, S, x + s * r * 0.35, y - r * 0.1, r * 0.13, INK, false);
    c.beginPath();
    c.lineWidth = Math.max(2, S * 0.008);
    c.lineCap = 'round';
    c.strokeStyle = INK;
    c.arc(x * S, (y + r * 0.1) * S, r * 0.3 * S, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  }

  const star = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? 0.19 : 0.43;
    return [0.5 + Math.cos(a) * d, 0.54 + Math.sin(a) * d];
  });
  const heart = [[0.5, 0.32], [0.62, 0.18], [0.78, 0.17], [0.89, 0.3], [0.87, 0.48], [0.7, 0.67], [0.5, 0.86],
    [0.3, 0.67], [0.13, 0.48], [0.11, 0.3], [0.22, 0.17], [0.38, 0.18]];

  const PICTURES = [
    {
      name: 'A house!', colour: '#ffb4a2',
      dots: [[0.2, 0.9], [0.2, 0.5], [0.1, 0.5], [0.5, 0.14], [0.9, 0.5], [0.8, 0.5], [0.8, 0.9]],
      extra(c, S) {
        poly(c, S, [[0.1, 0.5], [0.5, 0.14], [0.9, 0.5]], '#e63946');
        poly(c, S, [[0.43, 0.9], [0.43, 0.68], [0.57, 0.68], [0.57, 0.9]], '#9c6b3c');
        poly(c, S, [[0.26, 0.58], [0.38, 0.58], [0.38, 0.7], [0.26, 0.7]], '#bde9ff');
        poly(c, S, [[0.62, 0.58], [0.74, 0.58], [0.74, 0.7], [0.62, 0.7]], '#bde9ff');
      },
    },
    {
      name: 'A sailboat!', colour: '#ffffff',
      dots: [[0.12, 0.66], [0.47, 0.66], [0.47, 0.12], [0.82, 0.6], [0.88, 0.66], [0.74, 0.85], [0.26, 0.85]],
      extra(c, S) {
        poly(c, S, [[0.12, 0.66], [0.88, 0.66], [0.74, 0.85], [0.26, 0.85]], '#9c6b3c');
        poly(c, S, [[0.5, 0.17], [0.79, 0.6], [0.5, 0.6]], '#ffffff');
        poly(c, S, [[0.5, 0.4], [0.65, 0.4], [0.71, 0.48], [0.5, 0.48]], '#ff4d4d');
        poly(c, S, [[0.47, 0.12], [0.47, 0.03], [0.36, 0.075]], '#ffd60a');
        c.beginPath();
        for (let x = 0.05; x <= 0.95; x += 0.1) c.arc((x + 0.05) * S, 0.92 * S, 0.05 * S, Math.PI, 0);
        c.lineWidth = S * 0.012;
        c.strokeStyle = '#3a86ff';
        c.stroke();
      },
    },
    {
      name: 'A star!', colour: '#ffd60a', dots: star,
      extra(c, S) { face(c, S, 0.5, 0.56, 0.14); },
    },
    {
      name: 'A rocket!', colour: '#e9ecf5',
      dots: [[0.5, 0.08], [0.62, 0.25], [0.62, 0.62], [0.76, 0.78], [0.62, 0.78], [0.58, 0.88], [0.42, 0.88], [0.38, 0.78], [0.24, 0.78], [0.38, 0.62], [0.38, 0.25]],
      extra(c, S) {
        poly(c, S, [[0.5, 0.08], [0.62, 0.25], [0.38, 0.25]], '#ff4d4d');
        poly(c, S, [[0.62, 0.62], [0.76, 0.78], [0.62, 0.78]], '#ff4d4d');
        poly(c, S, [[0.38, 0.62], [0.24, 0.78], [0.38, 0.78]], '#ff4d4d');
        circle(c, S, 0.5, 0.42, 0.07, '#7fd3ff');
        poly(c, S, [[0.44, 0.89], [0.56, 0.89], [0.5, 1.0]], '#ff9f1c');
      },
    },
    {
      name: 'A fish!', colour: '#ff9f1c',
      dots: [[0.12, 0.5], [0.25, 0.32], [0.45, 0.25], [0.62, 0.3], [0.72, 0.42], [0.9, 0.25], [0.86, 0.5], [0.9, 0.75], [0.72, 0.58], [0.62, 0.7], [0.45, 0.75], [0.25, 0.68]],
      extra(c, S) {
        circle(c, S, 0.27, 0.45, 0.045, '#ffffff');
        circle(c, S, 0.28, 0.45, 0.022, INK, false);
        c.beginPath();
        c.lineWidth = Math.max(2, S * 0.008);
        c.strokeStyle = INK;
        c.arc(0.2 * S, 0.55 * S, 0.04 * S, 0.1 * Math.PI, 0.7 * Math.PI);
        c.stroke();
        c.strokeStyle = '#e07000';
        c.lineWidth = S * 0.02;
        for (const x of [0.42, 0.52]) { c.beginPath(); c.arc(x * S, 0.5 * S, 0.17 * S, -0.35 * Math.PI, 0.35 * Math.PI); c.stroke(); }
        for (const [x, y, r] of [[0.08, 0.3, 0.025], [0.12, 0.2, 0.018], [0.06, 0.12, 0.012]]) {
          c.beginPath(); c.arc(x * S, y * S, r * S, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = '#3a86ff'; c.stroke();
        }
      },
    },
    {
      name: 'A heart!', colour: '#ff5fa2', dots: heart,
      extra(c, S) { face(c, S, 0.5, 0.45, 0.13); },
    },
  ];

  let letters = false;
  try { letters = localStorage.getItem('kg-dots-letters') === '1'; } catch (e) {}
  let picIdx = Math.floor(Math.random() * PICTURES.length);
  let next = 0;       // index of the dot to touch next
  let done = false;
  let reveal = 0;     // 0 → 1 as the finished picture colours in
  let wobble = [];    // per-dot wiggle after a wrong tap
  let pressing = false;
  let time = 0;
  const view = { w: 0, h: 0, S: 300, ox: 0, oy: 0 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pic = () => PICTURES[picIdx];
  const label = i => (letters ? LETTERS[i] : String(i + 1));
  const spoken = i => (letters ? LETTERS[i] : NUMBER_WORDS[i]);

  function newGame(advance) {
    Win.hide();
    if (advance) picIdx = (picIdx + 1) % PICTURES.length;
    Guard.round(pic().name);
    next = 0;
    done = false;
    reveal = 0;
    wobble = pic().dots.map(() => 0);
    modeBtn.textContent = letters ? '🔤' : '🔢';
    layout();
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.S = Math.min(view.w, view.h) - 50;
    view.ox = (view.w - view.S) / 2;
    view.oy = (view.h - view.S) / 2;
  }

  const dx = d => view.ox + d[0] * view.S;
  const dy = d => view.oy + d[1] * view.S;

  // ---------- input: tap the dots, or slide a finger through them
  function touch(e, isDown) {
    if (done) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dots = pic().dots;
    const hit = r => i => Math.hypot(dx(dots[i]) - x, dy(dots[i]) - y) < r;
    if (hit(view.S * 0.075)(next)) {
      join();
    } else if (isDown) {
      const wrong = dots.findIndex((d, i) => i > next && hit(view.S * 0.05)(i));
      if (wrong >= 0) {
        wobble[wrong] = 1;
        wobble[next] = 1;
        Sound.nope();
        Guard.count('❌ wrong dot');
      }
    }
  }

  function join() {
    const n = pic().dots.length;
    Sound.step(next);
    Sound.say(spoken(next));
    next++;
    if (next >= n) {
      done = true;
      setTimeout(() => { Sound.sparkle(); Sound.say(pic().name); Celebrate.burst(60); }, 500);
      setTimeout(() => Win.show({ picture: '✏️⭐', again: () => newGame(true) }), 2800);
    }
  }

  // ---------- drawing
  function draw() {
    const { S, ox, oy } = view;
    const dots = pic().dots;
    ctx.clearRect(0, 0, view.w, view.h);

    // paper
    ctx.beginPath();
    ctx.roundRect(ox - 20, oy - 20, S + 40, S + 40, 28);
    ctx.fillStyle = '#fffdf5';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // finished picture fades in
    if (reveal > 0) {
      ctx.save();
      ctx.globalAlpha = reveal;
      ctx.translate(ox, oy);
      poly(ctx, S, dots, pic().colour);
      pic().extra(ctx, S);
      ctx.restore();
    }

    // lines joined so far (and the closing line once finished)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, S * 0.014);
    ctx.strokeStyle = INK;
    ctx.beginPath();
    for (let i = 0; i < next; i++) (i ? ctx.lineTo(dx(dots[i]), dy(dots[i])) : ctx.moveTo(dx(dots[i]), dy(dots[i])));
    if (done) ctx.closePath();
    ctx.stroke();

    if (reveal >= 1) return;
    ctx.globalAlpha = 1 - reveal;

    // dots and their numbers
    const cxm = dots.reduce((s, d) => s + d[0], 0) / dots.length;
    const cym = dots.reduce((s, d) => s + d[1], 0) / dots.length;
    dots.forEach((d, i) => {
      const wob = wobble[i] > 0 ? Math.sin(time * 40) * S * 0.01 * wobble[i] : 0;
      const x = dx(d) + wob, y = dy(d);
      const isNext = i === next && !done;
      if (isNext) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 6);
        ctx.beginPath();
        ctx.arc(x, y, S * (0.04 + 0.015 * pulse), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 214, 10, 0.6)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, S * (isNext ? 0.022 : 0.016), 0, Math.PI * 2);
      ctx.fillStyle = i < next ? '#8ac926' : isNext ? '#ff4d4d' : INK;
      ctx.fill();
      // label pushed outwards from the middle of the picture
      const ax = d[0] - cxm, ay = d[1] - cym, len = Math.hypot(ax, ay) || 1;
      const lx = x + (ax / len) * S * 0.055, ly = y + (ay / len) * S * 0.055;
      ctx.font = `700 ${Math.round(S * (isNext ? 0.07 : 0.05))}px ${TEXT_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = S * 0.012;
      ctx.strokeStyle = '#fffdf5';
      ctx.strokeText(label(i), lx, ly);
      ctx.fillStyle = isNext ? '#ff4d4d' : i < next ? '#3a9e3c' : INK;
      ctx.fillText(label(i), lx, ly);
    });
    ctx.globalAlpha = 1;
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    wobble = wobble.map(w => Math.max(0, w - dt * 2.5));
    if (done) reveal = clamp(reveal + dt * 1.2, 0, 1);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- wire up
  canvas.addEventListener('pointerdown', e => {
    Sound.unlock();
    pressing = true;
    canvas.setPointerCapture(e.pointerId);
    touch(e, true);
  });
  canvas.addEventListener('pointermove', e => { if (pressing) touch(e, false); });
  canvas.addEventListener('pointerup', () => { pressing = false; });
  canvas.addEventListener('pointercancel', () => { pressing = false; });
  document.getElementById('new').addEventListener('click', () => { Sound.unlock(); Sound.pop(); newGame(true); });
  modeBtn.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    letters = !letters;
    try { localStorage.setItem('kg-dots-letters', letters ? '1' : '0'); } catch (e) {}
    newGame(false);
  });
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);
  // Handy for poking at the game from the browser console.
  window.dotToDot = { get dots() { return pic().dots; }, view, get next() { return next; }, get name() { return pic().name; } };

  newGame(false);
  Sound.intro(letters ? 'Join the dots in A B C order to make a picture.' : 'Join the dots in order. Start at number one!');
  requestAnimationFrame(loop);
})();
