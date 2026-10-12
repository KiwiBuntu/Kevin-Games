// Dots & Boxes: take turns joining two dots. Finish a box and it's yours, and you go again.
// Play the Android (three levels of clever) or a friend on the same tablet.
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#board');
  const ctx = canvas.getContext('2d');
  const INK = '#2b2d42';
  const COLOUR = { 1: '#ff3b3b', 2: '#2f7bff' };
  const LIGHT = { 1: '#ffc2c2', 2: '#bcd5ff' };
  const ORANGE = '#ff8a1c';
  const HINT_AFTER = 8;  // seconds before the "take this box" glow (easier Androids only)
  const EMOJI = () => getComputedStyle(document.body).getPropertyValue('--emoji');

  // ---------- saved choices
  let saved = { size: 3, mode: 'android', level: 1 };
  try { saved = { ...saved, ...JSON.parse(localStorage.getItem('kg-boxes')) }; } catch (e) {}
  if (![3, 5, 7].includes(saved.size)) saved.size = 3;
  const save = () => { try { localStorage.setItem('kg-boxes', JSON.stringify(saved)); } catch (e) {} };

  // ---------- state
  let board = Boxes.make(saved.size);
  let turn = 1;
  let starter = 1;
  let wins = { 1: 0, 2: 0 };   // games won this visit
  let held = -1;               // the line under the finger (or the Android's choice)
  let last = null;             // { e, t } the line just drawn, glows for a moment
  let pops = {};               // box -> time since it was won (for the pop-in)
  let over = true;
  let thinking = false;
  let holding = false;
  let idle = 0;
  let hints = [];
  let warnedThisHold = false;
  let time = 0;
  let gameNo = 0;              // so an Android move from a finished game can't land in the next one
  const vw = { w: 0, h: 0, s: 50, x0: 0, y0: 0 };
  const android = () => saved.mode === 'android';
  const faces = () => android() ? { 1: '🧒', 2: '🤖' } : { 1: '🧒', 2: '🧑' };
  const humanTurn = () => !over && !thinking && !(android() && turn === 2);
  const warnOn = () => android() && saved.level === 1 && humanTurn();

  // ---------- a new game
  function newGame() {
    $('#result').hidden = true;
    Win.hide();
    board = Boxes.make(saved.size);
    gameNo++;
    turn = starter;
    held = -1;
    last = null;
    pops = {};
    over = false;
    thinking = false;
    idle = 0;
    hints = [];
    Guard.round(`${saved.size}×${saved.size} · ${android() ? '🤖' + '⭐'.repeat(saved.level) : '👫 friend'}`);
    layout();
    showScore();
    if (android() && turn === 2) androidMove();
  }
  function nextGame() { starter = 3 - starter; newGame(); }

  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    vw.w = r.width; vw.h = r.height;
    canvas.width = Math.round(vw.w * dpr);
    canvas.height = Math.round(vw.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = board.n;
    vw.s = Math.min((vw.w - 40) / n, (vw.h - 40) / n, 120);
    vw.x0 = (vw.w - n * vw.s) / 2;
    vw.y0 = (vw.h - n * vw.s) / 2;
  }
  const dot = ([r, c]) => [vw.x0 + c * vw.s, vw.y0 + r * vw.s];

  // The score shows boxes this game; whoever's turn it is bounces.
  function showScore() {
    const el = $('#score');
    el.innerHTML = '';
    const f = faces();
    const add = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; el.appendChild(s); return s; };
    const sq = p => { const d = add('disc' + (!over && turn === p ? ' turn' : ''), ''); d.style.background = COLOUR[p]; };
    add('who', f[1]); sq(1);
    add('n', `${board.score[1]} – ${board.score[2]}`);
    sq(2); add('who', f[2]);
  }

  // ---------- drawing a line
  function drawLine(e) {
    const p = turn;
    const gave = warnOn() && Boxes.givesAway(board, e);
    const got = Boxes.play(board, e, p);
    if (!got) return;
    if (gave) Guard.count('🎁 gave a box away');
    last = { e, t: 0 };
    held = -1;
    hints = [];
    idle = 0;
    Sound.snap();
    if (navigator.vibrate) navigator.vibrate(15);
    if (got.length) {
      got.forEach(b => { pops[b] = 0; });
      setTimeout(() => { Sound.sparkle(); if (navigator.vibrate) navigator.vibrate(40); }, 120);
      if (Boxes.done(board)) return finish();
      // the bonus turn: say it, so the rule sinks in
      if (!android() || p === 1) Sound.say(android() ? 'Go again!' : `${p === 1 ? 'Red' : 'Blue'}, go again!`);
    } else {
      turn = 3 - turn;
    }
    showScore();
    if (android() && turn === 2) androidMove();
  }

  function finish() {
    over = true;
    const p = board.score[1] > board.score[2] ? 1 : 2; // odd number of boxes: never a tie
    wins[p]++;
    showScore();
    setTimeout(() => {
      if (!android() || p === 1) {
        Win.show({ picture: android() ? '🏆' : (p === 1 ? '🟥🏆' : '🟦🏆'), again: nextGame });
      } else {
        Guard.failed();
        $('#result-pic').textContent = '🤖';
        $('#result-text').textContent = 'Android wins!';
        $('#result').hidden = false;
        Sound.say('The Android wins this time. Have another go!');
      }
    }, 1300);
  }

  // The Android points at its line for a moment, then draws it. Taking boxes is quicker.
  function androidMove() {
    thinking = true;
    showScore();
    const busy = Boxes.takers(board).length > 0;
    const g = gameNo;
    setTimeout(() => {
      if (over || g !== gameNo) return;
      const e = Boxes.bestMove(board, 2, saved.level);
      held = e;
      setTimeout(() => { if (g !== gameNo) return; thinking = false; if (!over) drawLine(e); }, busy ? 250 : 400);
    }, busy ? 350 : 700);
  }

  // ---------- touch: the nearest gap lights up; let go to draw it
  function lineAt(ev) {
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    const g = Boxes.shape(board.n);
    let best = -1, bestD = vw.s * 0.5;
    for (const e of Boxes.open(board)) {
      const [[ax, ay], [bx, by]] = g.ends[e].map(dot);
      // distance to the line, measured from its middle part so dots don't confuse things
      const t = Math.max(0.1, Math.min(0.9, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (vw.s * vw.s)));
      const d = Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t));
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
  function hold(e) {
    if (e === held) return;
    held = e;
    if (e < 0) return;
    Sound.step(e);
    if (warnOn() && Boxes.givesAway(board, e) && !warnedThisHold) { warnedThisHold = true; Sound.nope(); }
  }
  canvas.addEventListener('pointerdown', ev => {
    Sound.unlock();
    idle = 0;
    if (!humanTurn()) return;
    holding = true;
    warnedThisHold = false;
    hints = [];
    hold(lineAt(ev));
  });
  canvas.addEventListener('pointermove', ev => { if (holding && humanTurn()) hold(lineAt(ev)); });
  canvas.addEventListener('pointerup', ev => {
    if (!holding) return;
    holding = false;
    if (!humanTurn()) return;
    const e = lineAt(ev);
    held = -1;
    if (e >= 0) drawLine(e);
  });
  canvas.addEventListener('pointercancel', () => { holding = false; if (humanTurn()) held = -1; });

  // ---------- drawing
  function stroke(e, colour, width, alpha = 1) {
    const [[ax, ay], [bx, by]] = Boxes.shape(board.n).ends[e].map(dot);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.strokeStyle = INK; ctx.lineWidth = width + Math.max(3, vw.s * 0.06); ctx.stroke();
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.stroke();
    ctx.restore();
  }
  function boxRect(b) {
    const n = board.n, r = Math.floor(b / n), c = b % n;
    return [vw.x0 + c * vw.s, vw.y0 + r * vw.s];
  }

  function draw() {
    const { w, h, s, x0, y0 } = vw;
    const n = board.n, g = Boxes.shape(n);
    ctx.clearRect(0, 0, w, h);
    // paper
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x0 - s * 0.3 - 6, y0 - s * 0.3 - 6, n * s + s * 0.6 + 12, n * s + s * 0.6 + 12, 18);
    ctx.fill(); ctx.stroke();

    // boxes that are won, popping in with a face
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const f = faces();
    board.owner.forEach((p, b) => {
      if (!p) return;
      const [bx, by] = boxRect(b);
      const t = pops[b] ?? 1;
      const k = t < 1 ? Math.min(1, t * 1.6) * (1 + 0.25 * Math.sin(Math.min(1, t) * Math.PI)) : 1;
      ctx.fillStyle = LIGHT[p];
      ctx.fillRect(bx + s * (1 - k) / 2, by + s * (1 - k) / 2, s * k, s * k);
      ctx.font = `${s * 0.5 * k}px ${EMOJI()}`;
      ctx.fillText(f[p], bx + s / 2, by + s / 2 + 2);
    });
    // boxes waiting to be taken glow (hint), and on ⭐ the boxes a held line would give away go orange
    const pulse = 0.35 + 0.25 * Math.sin(time * 6);
    for (const b of hints) { const [bx, by] = boxRect(b); ctx.fillStyle = `rgba(255, 214, 10, ${pulse})`; ctx.fillRect(bx, by, s, s); }
    const warn = held >= 0 && warnOn() && Boxes.givesAway(board, held);
    if (warn) {
      for (const b of g.lineBoxes[held]) if (board.sides[b] === 2) {
        const [bx, by] = boxRect(b);
        ctx.fillStyle = `rgba(255, 138, 28, ${pulse})`;
        ctx.fillRect(bx, by, s, s);
      }
    }
    // where lines can go: faint dashes
    ctx.save();
    ctx.setLineDash([s * 0.08, s * 0.1]);
    ctx.strokeStyle = 'rgba(43, 45, 66, 0.18)';
    ctx.lineWidth = Math.max(2, s * 0.04);
    for (const e of Boxes.open(board)) {
      const [[ax, ay], [bx, by]] = g.ends[e].map(dot);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.restore();
    // lines drawn so far, in the colour of whoever drew them
    const lw = Math.max(5, s * 0.11);
    board.lines.forEach((p, e) => { if (p) stroke(e, COLOUR[p], lw); });
    if (last && last.t < 1.5) stroke(last.e, '#fff', lw * 0.45, 0.8 * (1 - last.t / 1.5) * (0.6 + 0.4 * Math.sin(time * 12)));
    // the line under the finger (or the Android's choice)
    if (held >= 0 && !over) stroke(held, warn ? ORANGE : COLOUR[turn], lw * (1.1 + 0.1 * Math.sin(time * 10)), warn ? 1 : 0.75);
    // dots on top
    ctx.fillStyle = INK;
    for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) {
      const [x, y] = dot([r, c]);
      ctx.beginPath(); ctx.arc(x, y, Math.max(5, s * 0.09), 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- frame
  let prev = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    time += dt;
    if (last) last.t += dt;
    for (const b in pops) { pops[b] += dt * 2.5; if (pops[b] > 1) delete pops[b]; }
    if (humanTurn() && android() && saved.level < 3 && !holding) {
      idle += dt;
      if (idle > HINT_AFTER && !hints.length) {
        hints = Boxes.hintBoxes(board);
        if (hints.length) Guard.count('💡 hint');
        else idle = -1000; // nothing to take this turn
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- the setup sheet
  function miniBoard(cv, n) {
    const m = cv.getContext('2d');
    const s = (cv.width - 16) / n, o = 8;
    m.clearRect(0, 0, cv.width, cv.height);
    m.fillStyle = '#fff'; m.strokeStyle = INK; m.lineWidth = 2;
    m.beginPath(); m.roundRect(1, 1, cv.width - 2, cv.height - 2, 10); m.fill(); m.stroke();
    // one red box in the corner, one blue box next to it
    [[0, 0, 1], [0, 1, 2]].forEach(([r, c, p]) => { m.fillStyle = LIGHT[p]; m.fillRect(o + c * s, o + r * s, s, s); });
    m.lineWidth = Math.max(2, s * 0.14); m.lineCap = 'round';
    const seg = (r1, c1, r2, c2, p) => { m.strokeStyle = COLOUR[p]; m.beginPath(); m.moveTo(o + c1 * s, o + r1 * s); m.lineTo(o + c2 * s, o + r2 * s); m.stroke(); };
    seg(0, 0, 0, 1, 1); seg(0, 0, 1, 0, 1); seg(1, 0, 1, 1, 2); seg(0, 1, 1, 1, 1);
    seg(0, 1, 0, 2, 2); seg(0, 2, 1, 2, 2); seg(1, 1, 1, 2, 1);
    m.fillStyle = INK;
    for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) { m.beginPath(); m.arc(o + c * s, o + r * s, Math.max(2, s * 0.12), 0, Math.PI * 2); m.fill(); }
  }
  document.querySelectorAll('#sizes canvas').forEach(cv => miniBoard(cv, +cv.parentNode.dataset.size));

  function showSetup() {
    document.querySelectorAll('#sizes .choice').forEach(b => b.classList.toggle('on', +b.dataset.size === saved.size));
    document.querySelectorAll('#modes .choice').forEach(b => b.classList.toggle('on', b.dataset.mode === saved.mode));
    document.querySelectorAll('#brain .choice').forEach(b => b.classList.toggle('on', +b.dataset.level === saved.level));
    $('#brain').hidden = saved.mode !== 'android';
    $('#setup').hidden = false;
  }
  const pick = (sel, fn) => document.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    fn(b);
    save();
    showSetup();
  }));
  pick('#sizes .choice', b => { saved.size = +b.dataset.size; Sound.say(['Small', 'Middle', 'Big'][[3, 5, 7].indexOf(saved.size)]); });
  pick('#modes .choice', b => { saved.mode = b.dataset.mode; Sound.say(android() ? 'Play with the Android' : 'Play with a friend'); });
  pick('#brain .choice', b => { saved.level = +b.dataset.level; Sound.say(['Easy', 'Clever', 'Super clever'][saved.level - 1]); });
  let lastKey = '';
  $('#go').addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    $('#setup').hidden = true;
    // new choices: the player (red) goes first; same choices again: take turns starting
    const key = `${saved.size}${saved.mode}${saved.level}`;
    if (key !== lastKey) { wins = { 1: 0, 2: 0 }; starter = 1; lastKey = key; }
    else if (over) starter = 3 - starter;
    newGame();
  });

  // ---------- buttons
  $('#new').addEventListener('click', () => { Sound.unlock(); Sound.pop(); showSetup(); });
  $('#again').addEventListener('click', () => { Sound.unlock(); Sound.pop(); nextGame(); });
  $('#result-setup').addEventListener('click', () => { Sound.unlock(); Sound.pop(); $('#result').hidden = true; showSetup(); });
  const muteBtn = $('#mute');
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);
  // Handy for poking at the game from the browser console.
  window.boxesGame = { get board() { return board; }, get turn() { return turn; }, get over() { return over; }, get busy() { return thinking; },
    get hints() { return hints; }, get held() { return held; }, vw, play: e => humanTurn() && drawLine(e), _idle(v) { idle = v; } };

  layout();
  showScore();
  showSetup();
  Sound.intro('Take turns joining two dots. Finish a box and it\'s yours, and you go again! Watch out: don\'t draw the third side of a box.');
  requestAnimationFrame(loop);
})();
