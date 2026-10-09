// Mazes: drag the car (or mouse, or dog…) along the paths to the goal.
(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const whoBtn = document.getElementById('who');
  const muteBtn = document.getElementById('mute');
  const INK = '#2b2d42';
  const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

  const SIZES = { small: 4, medium: 6, big: 9 }; // cells along the short side
  const WHO = [
    { who: '🚗', goal: '🏠', faceLeft: true, trail: '#ff4d4d', intro: 'Drive the car to the garage!', done: 'Beep beep! You made it home!' },
    { who: '🐭', goal: '🧀', trail: '#ff9f1c', intro: 'Help the mouse find the cheese!', done: 'Yum yum! Cheese!' },
    { who: '🐶', goal: '🦴', trail: '#8338ec', intro: 'Help the puppy find the bone!', done: 'Woof woof! A bone!' },
    { who: '🚀', goal: '🌙', trail: '#3a86ff', intro: 'Fly the rocket to the moon!', done: 'Blast off! To the moon!' },
    { who: '🐝', goal: '🌻', faceLeft: true, trail: '#ffb703', intro: 'Help the bee find the flower!', done: 'Buzz buzz! A flower!' },
  ];

  let size = 'small';
  let whoIdx = 0;
  try {
    size = localStorage.getItem('kg-maze-size') || 'small';
    whoIdx = Number(localStorage.getItem('kg-maze-who')) || 0;
  } catch (e) {}
  if (!SIZES[size]) size = 'small';
  if (!WHO[whoIdx]) whoIdx = 0;

  let cols = 4, rows = 4;
  let open = [];          // open[cell] = Set of neighbouring cells you can walk to
  let trail = [];         // cells walked so far (the character is at the end)
  let goal = 0;
  let pos = { x: 0, y: 0 }; // drawn position (glides to the current cell)
  let faceRight = false;
  let dragging = false;
  let hint = null;
  let won = false;
  let time = 0;
  const view = { w: 0, h: 0, cell: 40, ox: 0, oy: 0 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- maze making (a random walk that backs up when stuck)
  function makeMaze() {
    open = Array.from({ length: cols * rows }, () => new Set());
    const seen = new Array(cols * rows).fill(false);
    const stack = [0];
    seen[0] = true;
    while (stack.length) {
      const c = stack[stack.length - 1];
      const nb = neighbours(c).filter(n => !seen[n]);
      if (!nb.length) { stack.pop(); continue; }
      const n = nb[Math.floor(Math.random() * nb.length)];
      open[c].add(n);
      open[n].add(c);
      seen[n] = true;
      stack.push(n);
    }
  }

  function neighbours(i) {
    const c = i % cols, r = Math.floor(i / cols), out = [];
    if (c > 0) out.push(i - 1);
    if (c < cols - 1) out.push(i + 1);
    if (r > 0) out.push(i - cols);
    if (r < rows - 1) out.push(i + cols);
    return out;
  }

  function route(from, to) {
    const prev = new Map([[from, -1]]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      if (c === to) break;
      for (const n of open[c]) if (!prev.has(n)) { prev.set(n, c); q.push(n); }
    }
    const path = [];
    for (let c = to; c !== -1; c = prev.get(c)) path.unshift(c);
    return path;
  }

  // ---------- setup
  function newGame() {
    Guard.round(size);
    Win.hide();
    const n = SIZES[size];
    const rect = canvas.getBoundingClientRect();
    const aspect = rect.height / Math.max(1, rect.width);
    if (aspect >= 1) { cols = n; rows = clamp(Math.round(n * aspect), n, Math.round(n * 1.5)); }
    else { rows = n; cols = clamp(Math.round(n / aspect), n, Math.round(n * 1.5)); }
    makeMaze();
    goal = cols * rows - 1;
    trail = [0];
    hint = null;
    won = false;
    dragging = false;
    layout();
    pos = { x: cx(0), y: cy(0) };
    whoBtn.textContent = WHO[whoIdx].who;
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
    view.cell = Math.min((view.w - 40) / cols, (view.h - 40) / rows, 120);
    view.ox = (view.w - cols * view.cell) / 2;
    view.oy = (view.h - rows * view.cell) / 2;
  }

  // ---------- moving
  const here = () => trail[trail.length - 1];

  function stepTo(cell) {
    const at = here();
    if (!open[at].has(cell)) return false;
    if (trail.length > 1 && trail[trail.length - 2] === cell) trail.pop(); // going back
    else trail.push(cell);
    if (cell % cols !== at % cols) faceRight = cell % cols > at % cols;
    Sound.step(trail.length);
    if (hint) hint = null;
    if (cell === goal) arrive();
    return true;
  }

  function arrive() {
    won = true;
    dragging = false;
    Sound.honk();
    setTimeout(() => Sound.say(WHO[whoIdx].done), 300);
    setTimeout(() => Win.show({ picture: WHO[whoIdx].who + WHO[whoIdx].goal, again: newGame }), 1800);
  }

  function cellAt(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      c: Math.floor((e.clientX - rect.left - view.ox) / view.cell),
      r: Math.floor((e.clientY - rect.top - view.oy) / view.cell),
    };
  }

  // Move towards the finger one square at a time, stopping at walls.
  function chase(e) {
    const { c, r } = cellAt(e);
    const tc = clamp(c, 0, cols - 1), tr = clamp(r, 0, rows - 1);
    for (let guard = 0; guard < cols + rows && !won; guard++) {
      const at = here();
      const ac = at % cols, ar = Math.floor(at / cols);
      if (ac === tc && ar === tr) break;
      const dc = tc - ac, dr = tr - ar;
      // Try the bigger direction first, then the other one, so corners are easy.
      const tries = Math.abs(dc) >= Math.abs(dr)
        ? [dc ? at + Math.sign(dc) : null, dr ? at + Math.sign(dr) * cols : null]
        : [dr ? at + Math.sign(dr) * cols : null, dc ? at + Math.sign(dc) : null];
      if (!tries.some(t => t !== null && stepTo(t))) break;
    }
  }

  function down(e) {
    Sound.unlock();
    if (won) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    chase(e);
  }
  function move(e) { if (dragging) chase(e); }
  function up() { dragging = false; }

  function showHint() {
    Sound.unlock();
    if (won) return;
    Guard.count('💡 hint');
    hint = { path: route(here(), goal), t: 3 };
    Sound.sparkle();
  }

  // ---------- drawing
  const cx = i => view.ox + ((i % cols) + 0.5) * view.cell;
  const cy = i => view.oy + (Math.floor(i / cols) + 0.5) * view.cell;

  function emoji(ch, x, y, s, flip) {
    ctx.save();
    ctx.font = `${Math.round(s)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }

  function draw() {
    const s = view.cell, W = cols * s, H = rows * s;
    const t = WHO[whoIdx];
    ctx.clearRect(0, 0, view.w, view.h);

    // grass + sandy paths
    const pad = s * 0.2;
    ctx.fillStyle = '#4fae4a';
    ctx.beginPath();
    ctx.roundRect(view.ox - pad, view.oy - pad, W + 2 * pad, H + 2 * pad, pad * 1.5);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#ffeec2';
    ctx.fillRect(view.ox, view.oy, W, H);

    // hint: dotted way to go
    if (hint) {
      ctx.save();
      ctx.globalAlpha = clamp(hint.t, 0, 1) * 0.8;
      ctx.setLineDash([2, s * 0.25]);
      ctx.lineCap = 'round';
      ctx.lineWidth = s * 0.14;
      ctx.strokeStyle = '#ffb703';
      ctx.beginPath();
      hint.path.forEach((c, i) => (i ? ctx.lineTo(cx(c), cy(c)) : ctx.moveTo(cx(c), cy(c))));
      ctx.stroke();
      ctx.restore();
    }

    // trail behind the character
    if (trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s * 0.22;
      ctx.strokeStyle = t.trail;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      trail.forEach((c, i) => (i ? ctx.lineTo(cx(c), cy(c)) : ctx.moveTo(cx(c), cy(c))));
      ctx.stroke();
      ctx.restore();
    }

    // hedges (walls)
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2f7d32';
    ctx.lineWidth = Math.max(4, s * 0.16);
    ctx.beginPath();
    for (let i = 0; i < cols * rows; i++) {
      const x = view.ox + (i % cols) * s, y = view.oy + Math.floor(i / cols) * s;
      const c = i % cols, r = Math.floor(i / cols);
      if (c === cols - 1 || !open[i].has(i + 1)) { ctx.moveTo(x + s, y); ctx.lineTo(x + s, y + s); }
      if (r === rows - 1 || !open[i].has(i + cols)) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y + s); }
      if (c === 0) { ctx.moveTo(x, y); ctx.lineTo(x, y + s); }
      if (r === 0) { ctx.moveTo(x, y); ctx.lineTo(x + s, y); }
    }
    ctx.stroke();
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.strokeStyle = '#5cc85a';
    ctx.stroke(); // lighter middle so hedges look leafy

    // goal (bobbing) and the character
    emoji(t.goal, cx(goal), cy(goal) + Math.sin(time * 3) * s * 0.05, s * 0.72);
    const at = here();
    pos.x += (cx(at) - pos.x) * 0.35;
    pos.y += (cy(at) - pos.y) * 0.35;
    const wiggle = dragging ? Math.sin(time * 20) * s * 0.03 : 0;
    const flip = t.faceLeft ? faceRight : false;
    emoji(t.who, pos.x, pos.y + wiggle, s * (won ? 0.85 + Math.sin(time * 12) * 0.1 : 0.75), flip);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
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
  whoBtn.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    whoIdx = (whoIdx + 1) % WHO.length;
    try { localStorage.setItem('kg-maze-who', String(whoIdx)); } catch (e) {}
    whoBtn.textContent = WHO[whoIdx].who;
    Sound.say(WHO[whoIdx].intro);
  });
  document.querySelectorAll('#sizes .btn').forEach(b => b.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    size = b.dataset.size;
    try { localStorage.setItem('kg-maze-size', size); } catch (e) {}
    newGame();
  }));
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);
  // Handy for poking at the game from the browser console.
  window.maze = { route, get trail() { return trail; }, get goal() { return goal; }, view, get cols() { return cols; } };

  newGame();
  Sound.intro(WHO[whoIdx].intro);
  requestAnimationFrame(loop);
})();
