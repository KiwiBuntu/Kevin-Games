// Potion Sort: tap a flask, then another, to pour. Get every colour into its own flask.
// The magic wand undoes moves; a spare flask can rescue a stuck puzzle (grown-ups can turn that off).
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#lab');
  const ctx = canvas.getContext('2d');
  const INK = '#2b2d42';
  const CAP = Puzzle.CAP;
  const COLOURS = ['#ff3b3b', '#2f7bff', '#ffd60a', '#5cd65c', '#a24cf0', '#ff8a1c', '#ff5fb4', '#25d0c2'];

  // ---------- saved: level reached and the grown-up setting
  let saved = { level: 1, spare: true };
  try { saved = { ...saved, ...JSON.parse(localStorage.getItem('kg-potions')) }; } catch (e) {}
  const save = () => { try { localStorage.setItem('kg-potions', JSON.stringify(saved)); } catch (e) {} };

  // ---------- state
  let level = saved.level;
  let flasks = [];       // the puzzle now
  let initial = [];      // the puzzle as it started (for 🔄)
  let history = [];      // earlier puzzles, for the wand
  let spareUsed = false;
  let stuck = false;
  let selected = -1;
  let anim = null;       // a pour in progress
  let shake = null;      // { i, t } a "no" wobble
  let corks = [];        // { i, t } corks popping in
  let won = false;
  let lift = [];         // how high each flask is lifted (eases towards its target)
  let time = 0;
  const vw = { w: 0, h: 0, fw: 60, fh: 200, slots: [] };

  // ---------- setting up
  function startLevel(n, keepSame) {
    Guard.round(`L${n}`);
    Win.hide();
    level = n;
    saved.level = n;
    save();
    if (!keepSame) initial = Puzzle.make(n);
    flasks = initial.map(f => f.slice());
    history = [];
    spareUsed = false;
    stuck = false;
    selected = -1;
    anim = null;
    shake = null;
    corks = [];
    won = false;
    lift = flasks.map(() => 0);
    $('#level').textContent = n;
    layout();
    updateButtons();
  }

  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    vw.w = r.width; vw.h = r.height;
    canvas.width = Math.round(vw.w * dpr);
    canvas.height = Math.round(vw.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = flasks.length;
    const landscape = vw.w > vw.h;
    const rows = landscape ? (n <= 8 ? 1 : 2) : (n <= 4 ? 1 : 2);
    const perRow = Math.ceil(n / rows);
    const sw = vw.w / perRow;
    // flask size: as big as fits, with room above for lifting and pouring
    vw.fw = Math.min(sw * 0.7, 110, (vw.h / rows - 50) / 4.4);
    vw.fh = vw.fw * 3.4;
    const rowH = vw.h / rows;
    vw.slots = flasks.map((_, i) => {
      const row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
      const col = i % perRow;
      const x = vw.w / 2 + (col - (inRow - 1) / 2) * sw;
      const y = rowH * row + rowH / 2 + vw.fh / 2 + 10; // flask bottom
      return { x, y };
    });
  }

  // ---------- drawing a flask (origin at the bottom middle, upright)
  function flaskPath(c, fw, fh) {
    const r = fw * 0.5, neck = fw * 0.7;
    c.beginPath();
    c.moveTo(-neck / 2, -fh);
    c.lineTo(-neck / 2, -fh + fw * 0.35);
    c.quadraticCurveTo(-fw / 2, -fh + fw * 0.4, -fw / 2, -fh + fw * 0.7);
    c.lineTo(-fw / 2, -r);
    c.arc(0, -r, r, Math.PI, 0, true);
    c.lineTo(fw / 2, -fh + fw * 0.7);
    c.quadraticCurveTo(fw / 2, -fh + fw * 0.4, neck / 2, -fh + fw * 0.35);
    c.lineTo(neck / 2, -fh);
    c.closePath();
  }

  // units: [{ colour, amount }] from the bottom; amount can be a fraction while pouring
  function drawFlask(i, x, y, angle, units, highlight) {
    const { fw, fh } = vw;
    const unitH = (fh - fw * 0.95) / CAP;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (highlight) { ctx.shadowColor = '#fff36b'; ctx.shadowBlur = 24; }
    flaskPath(ctx, fw, fh);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.shadowBlur = 0;
    // liquid, clipped to the glass
    ctx.save();
    flaskPath(ctx, fw, fh);
    ctx.clip();
    let level = -fw * 0.06;
    units.forEach((u, k) => {
      const h = unitH * u.amount;
      ctx.fillStyle = COLOURS[u.colour];
      ctx.fillRect(-fw, level - h, fw * 2, h + 1);
      // a lighter band at the top of each colour, and a wobbly surface on the very top
      if (k === units.length - 1 && h > 0.5) {
        const wob = Math.sin(time * 3 + i) * fw * 0.03;
        ctx.beginPath();
        ctx.ellipse(0, level - h + wob * 0.3, fw * 0.48, fw * 0.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
        // bubbles floating up
        for (let b = 0; b < 3; b++) {
          const p = ((time * 0.35 + b * 0.37 + i * 0.13) % 1);
          const by = -fw * 0.1 - p * (-(level - h) - fw * 0.1);
          ctx.beginPath();
          ctx.arc(Math.sin(time * 2 + b * 2 + i) * fw * 0.22, by, fw * 0.045, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fill();
        }
      }
      level -= h;
    });
    ctx.restore();
    // glass outline and shine
    flaskPath(ctx, fw, fh);
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-fw * 0.32, -fh + fw * 0.85);
    ctx.lineTo(-fw * 0.32, -fw * 0.7);
    ctx.lineWidth = fw * 0.07;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();
    // lip
    ctx.beginPath();
    ctx.roundRect(-fw * 0.43, -fh - fw * 0.06, fw * 0.86, fw * 0.14, fw * 0.06);
    ctx.fillStyle = '#e8e3ff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  function drawCork(x, y, t) {
    const { fw, fh } = vw;
    const drop = (1 - Math.min(1, t)) * fw * 1.2;
    const sq = t < 1 ? 1 : 1 + Math.sin(Math.min(1, t - 1) * Math.PI * 3) * 0.1 * Math.max(0, 2 - t);
    ctx.save();
    ctx.translate(x, y - fh - drop);
    ctx.scale(sq, 1 / sq);
    ctx.beginPath();
    ctx.roundRect(-fw * 0.3, -fw * 0.32, fw * 0.6, fw * 0.42, fw * 0.1);
    ctx.fillStyle = '#c68642';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    if (t >= 1) {
      // golden seal
      ctx.beginPath();
      ctx.arc(x, y - fh * 0.45, fw * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd60a';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.font = `${Math.round(fw * 0.26)}px "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⭐', x, y - fh * 0.45);
    }
  }

  const asUnits = f => f.map(c => ({ colour: c, amount: 1 }));

  function draw() {
    ctx.clearRect(0, 0, vw.w, vw.h);
    const { fw } = vw;
    // shelves
    const rowsY = [...new Set(vw.slots.map(s => Math.round(s.y)))];
    for (const y of rowsY) {
      ctx.beginPath();
      ctx.roundRect(vw.w * 0.04, y + 2, vw.w * 0.92, 16, 8);
      ctx.fillStyle = '#9c6b3c';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    flasks.forEach((f, i) => {
      if (anim && anim.a === i) return; // drawn separately while pouring
      const s = vw.slots[i];
      let x = s.x;
      if (shake && shake.i === i) x += Math.sin(shake.t * 50) * fw * 0.12 * (1 - shake.t / 0.4);
      let units = asUnits(f);
      if (anim && anim.b === i && anim.p > 0) units = units.concat([{ colour: anim.colour, amount: anim.amount * anim.p }]);
      drawFlask(i, x, s.y - lift[i], 0, mergeUnits(units), i === selected);
      const cork = corks.find(c => c.i === i);
      if (cork) drawCork(x, s.y - lift[i], cork.t);
    });
    if (anim) {
      // the pouring flask: moves over, tips, pours, and goes back
      const f = flasks[anim.a];
      const units = asUnits(f);
      if (anim.p > 0) {
        let left = anim.amount * anim.p;
        for (let k = units.length - 1; k >= 0 && left > 0; k--) { const take = Math.min(units[k].amount, left); units[k].amount -= take; left -= take; }
      }
      drawFlask(anim.a, anim.x, anim.y, anim.angle, units.filter(u => u.amount > 0.001), false);
      if (anim.phase === 'pour') {
        // a curving stream from the mouth into the other flask
        const mouth = { x: anim.x + Math.sin(anim.angle) * vw.fh, y: anim.y - Math.cos(anim.angle) * vw.fh };
        const d = vw.slots[anim.b];
        ctx.beginPath();
        ctx.moveTo(mouth.x, mouth.y);
        ctx.quadraticCurveTo(d.x, mouth.y - fw * 0.1, d.x, d.y - vw.fh * 0.4);
        ctx.lineWidth = fw * 0.16;
        ctx.lineCap = 'round';
        ctx.strokeStyle = COLOURS[anim.colour];
        ctx.stroke();
      }
    }
  }

  // Join same-colour neighbours so a growing pour looks like one band.
  function mergeUnits(units) {
    const out = [];
    for (const u of units) {
      const last = out[out.length - 1];
      if (last && last.colour === u.colour) last.amount += u.amount;
      else out.push({ ...u });
    }
    return out;
  }

  // ---------- tapping
  function slotAt(x, y) {
    const { fw, fh } = vw;
    let best = -1, bestD = Infinity;
    vw.slots.forEach((s, i) => {
      // a generous box around each flask
      if (y < s.y - fh - fw * 0.9 || y > s.y + 30) return;
      const d = Math.abs(x - s.x);
      if (d < Math.max(fw, 50) && d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  canvas.addEventListener('pointerdown', e => {
    Sound.unlock();
    if (anim || won) return;
    const r = canvas.getBoundingClientRect();
    const i = slotAt(e.clientX - r.left, e.clientY - r.top);
    if (i < 0) { selected = -1; return; }
    const f = flasks[i];
    if (selected < 0) {
      if (!f.length || Puzzle.done(f)) { shake = { i, t: 0 }; return; }
      selected = i;
      Sound.pop();
      if (navigator.vibrate) navigator.vibrate(25);
      return;
    }
    if (i === selected) { selected = -1; return; }
    if (Puzzle.pourAmount(flasks, selected, i)) { startPour(selected, i); return; }
    // can't pour there: wobble "no" and put it back
    shake = { i: selected, t: 0 };
    Sound.nope();
    selected = -1;
  });

  function startPour(a, b) {
    const amount = Puzzle.pourAmount(flasks, a, b);
    const s = vw.slots[a], d = vw.slots[b];
    const side = d.x >= s.x ? -1 : 1; // pour from the side nearest where it came from
    anim = {
      a, b, amount, colour: Puzzle.top(flasks[a]), phase: 'go', t: 0, p: 0,
      from: { x: s.x, y: s.y - lift[a] },
      to: { x: d.x + side * vw.fw * 0.95, y: d.y - vw.fh * 0.95 },
      tilt: -side * 1.15,
      x: s.x, y: s.y - lift[a], angle: 0,
    };
    selected = -1;
  }

  function stepPour(dt) {
    const A = anim;
    A.t += dt;
    const ease = u => 1 - (1 - u) ** 3;
    if (A.phase === 'go') {
      const u = ease(Math.min(1, A.t / 0.3));
      A.x = A.from.x + (A.to.x - A.from.x) * u;
      A.y = A.from.y + (A.to.y - A.from.y) * u;
      A.angle = A.tilt * u;
      if (A.t >= 0.3) { A.phase = 'pour'; A.t = 0; Sound.glug(A.colour); if (navigator.vibrate) navigator.vibrate(25); }
    } else if (A.phase === 'pour') {
      const dur = 0.25 + A.amount * 0.12;
      A.p = Math.min(1, A.t / dur);
      if (A.t >= dur) {
        // the pour really happens now
        history.push(flasks.map(f => f.slice()));
        flasks = Puzzle.pour(flasks, A.a, A.b).flasks;
        A.p = 0;
        A.phase = 'back';
        A.t = 0;
        A.back = { x: A.x, y: A.y, angle: A.angle };
        afterPour(A.b);
      }
    } else {
      const u = ease(Math.min(1, A.t / 0.3));
      const home = vw.slots[A.a];
      A.x = A.back.x + (home.x - A.back.x) * u;
      A.y = A.back.y + (home.y - A.back.y) * u;
      A.angle = A.back.angle * (1 - u);
      if (A.t >= 0.3) anim = null;
    }
  }

  function afterPour(b) {
    if (Puzzle.done(flasks[b])) {
      corks.push({ i: b, t: 0 });
      setTimeout(() => { Sound.cork(); if (navigator.vibrate) navigator.vibrate(40); }, 250);
    }
    if (Puzzle.solved(flasks)) {
      won = true;
      saved.level = level + 1;
      save();
      setTimeout(() => Win.show({ picture: '🧪⭐', again: () => startLevel(level + 1) }), 1100);
    } else {
      // can this still be finished from here? If not, the wand glows (and the spare flask is offered)
      stuck = Puzzle.solve(flasks, 20000) === -1;
      if (stuck) Guard.count('😬 got stuck');
    }
    updateButtons();
  }

  // ---------- the wand (undo) and the spare flask
  function undo() {
    Sound.unlock();
    if (anim || !history.length || won) return;
    flasks = history.pop();
    Guard.count('🪄 undo');
    corks = corks.filter(c => Puzzle.done(flasks[c.i]));
    selected = -1;
    stuck = Puzzle.solve(flasks, 20000) === -1;
    Sound.sparkle();
    updateButtons();
  }

  function addSpare() {
    Sound.unlock();
    if (anim || spareUsed || won) return;
    spareUsed = true;
    Guard.count('🧪 spare flask');
    flasks.push([]);
    history = history.map(h => h.concat([[]])); // undo keeps the spare flask
    lift.push(0);
    layout();
    stuck = false;
    Sound.cork();
    updateButtons();
  }

  function updateButtons() {
    $('#wand').disabled = !history.length;
    $('#wand').classList.toggle('glow', stuck && history.length > 0);
    $('#spare').hidden = !(stuck && saved.spare && !spareUsed);
  }

  // ---------- frame
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (anim) stepPour(dt);
    if (shake) { shake.t += dt; if (shake.t > 0.4) shake = null; }
    corks.forEach(c => { c.t += dt * 3; });
    lift = flasks.map((f, i) => (lift[i] || 0) + ((i === selected ? vw.fw * 0.45 : 0) - (lift[i] || 0)) * Math.min(1, dt * 14));
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- grown-up settings (behind the sum)
  function openPanel() {
    const seg = $('#t-spare');
    seg.innerHTML = '';
    for (const [v, label] of [[true, 'On'], [false, 'Off']]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = saved.spare === v ? 'on' : '';
      b.addEventListener('click', () => { saved.spare = v; save(); updateButtons(); openPanel(); });
      seg.appendChild(b);
    }
    $('#t-level').textContent = `Kevin is on level ${level}. Levels get one more colour every three levels, up to seven.`;
    $('#panel').hidden = false;
  }
  $('#settings').addEventListener('click', () => { Sound.unlock(); Gate.ask(openPanel); });
  $('#panel-close').addEventListener('click', () => { $('#panel').hidden = true; });
  $('#t-reset').addEventListener('click', () => { if (confirm('Start again from level 1?')) { $('#panel').hidden = true; startLevel(1); } });

  // ---------- buttons
  $('#wand').addEventListener('click', undo);
  $('#spare').addEventListener('click', addSpare);
  $('#restart').addEventListener('click', () => { Sound.unlock(); Sound.pop(); if (!anim) startLevel(level, true); });
  const muteBtn = $('#mute');
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);
  // Handy for poking at the game from the browser console.
  window.potionSort = { get flasks() { return flasks; }, get anim() { return anim; }, get stuck() { return stuck; }, get level() { return level; }, vw, startLevel, get history() { return history; },
    _setFlasks(f) { flasks = f.map(x => x.slice()); lift = flasks.map(() => 0); history = []; spareUsed = false; layout(); updateButtons(); } };

  startLevel(level);
  Sound.intro('Tap a potion, then tap where to pour it. Put each colour in its own bottle! The magic wand takes a move back.');
  requestAnimationFrame(loop);
})();
