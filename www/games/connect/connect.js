// Connect: drop counters into the board and get 3 (small board) or 4 (big board) in a row.
// Play the Android (three levels of clever) or a friend on the same tablet.
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#board');
  const ctx = canvas.getContext('2d');
  const INK = '#2b2d42';
  const COLOUR = { 1: '#ff3b3b', 2: '#ffd60a' };
  const DARK = { 1: '#c41e1e', 2: '#d9a400' };
  const SIZES = { 3: [5, 4, 3], 4: [7, 6, 4] }; // cols, rows, how many in a row
  const HINT_AFTER = 8;  // seconds before a helpful glow (easier Androids only)

  // ---------- saved choices
  let saved = { size: 3, mode: 'android', level: 1 };
  try { saved = { ...saved, ...JSON.parse(localStorage.getItem('kg-connect')) }; } catch (e) {}
  const save = () => { try { localStorage.setItem('kg-connect', JSON.stringify(saved)); } catch (e) {} };

  // ---------- state
  let board = Connect.make(...SIZES[saved.size]);
  let turn = 1;
  let starter = 1;         // who goes first this game (swaps every game)
  let score = { 1: 0, 2: 0 };
  let hover = -1;          // column the counter is held over
  let falling = null;      // { c, r, p, y, vy, ty }
  let line = null;         // the winning row of counters
  let over = true;
  let thinking = false;    // the Android is choosing
  let idle = 0;
  let hintCol = -1;
  let time = 0;
  let gameNo = 0;          // so an Android move from a finished game can't land in the next one
  const vw = { w: 0, h: 0, s: 50, x0: 0, y0: 0 };
  const android = () => saved.mode === 'android';
  const humanTurn = () => !over && !falling && !thinking && !(android() && turn === 2);

  // ---------- a new game
  function newGame() {
    $('#result').hidden = true;
    Win.hide();
    board = Connect.make(...SIZES[saved.size]);
    gameNo++;
    turn = starter;
    hover = -1;
    falling = null;
    line = null;
    over = false;
    thinking = false;
    idle = 0;
    hintCol = -1;
    Guard.round(`${saved.size} in a row · ${android() ? '🤖' + '⭐'.repeat(saved.level) : '👫 friend'}`);
    layout();
    showScore();
    if (android() && turn === 2) androidMove();
  }

  // After the game is over, the other player starts the next one.
  function nextGame() { starter = 3 - starter; newGame(); }

  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    vw.w = r.width; vw.h = r.height;
    canvas.width = Math.round(vw.w * dpr);
    canvas.height = Math.round(vw.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { cols, rows } = board;
    // room above the board for the counter you're holding, and below for its feet
    vw.s = Math.min((vw.w - 16) / (cols + 0.4), (vw.h - 10) / (rows + 1.7), 130);
    vw.x0 = (vw.w - cols * vw.s) / 2;
    vw.y0 = (vw.h - (rows + 1.7) * vw.s) / 2 + vw.s * 1.25;
  }
  const cx = c => vw.x0 + (c + 0.5) * vw.s;
  const cy = r => vw.y0 + (board.rows - 1 - r + 0.5) * vw.s;
  const holdY = () => vw.y0 - vw.s * 0.65;

  function showScore() {
    const face = p => android() ? (p === 1 ? '🧒' : '🤖') : '';
    const el = $('#score');
    el.innerHTML = '';
    const part = p => {
      const d = document.createElement('span');
      d.className = 'disc' + (!over && turn === p ? ' turn' : '');
      d.style.background = COLOUR[p];
      return d;
    };
    const add = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; el.appendChild(s); };
    if (face(1)) add('who', face(1));
    el.appendChild(part(1));
    add('n', `${score[1]} – ${score[2]}`);
    el.appendChild(part(2));
    if (face(2)) add('who', face(2));
  }

  // ---------- playing a counter
  function play(c) {
    if (!Connect.canDrop(board, c)) { Sound.nope(); return false; }
    const r = Connect.height(board, c);
    falling = { c, r, p: turn, y: holdY(), vy: 0, ty: cy(r), bounced: false };
    hover = -1;
    hintCol = -1;
    idle = 0;
    Sound.whoosh();
    return true;
  }

  function landed() {
    const { c, p } = falling;
    const r = Connect.drop(board, c, p);
    falling = null;
    Sound.popNote(r + c);
    if (navigator.vibrate) navigator.vibrate(20);
    line = Connect.lineAt(board, c, r);
    if (line) return finish(p);
    if (Connect.full(board)) return finish(0);
    turn = 3 - turn;
    showScore();
    if (android() && turn === 2) androidMove();
  }

  function finish(p) {
    over = true;
    if (p) score[p]++;
    showScore();
    if (p) Sound.sparkle();
    setTimeout(() => {
      if (p && (!android() || p === 1)) {
        Win.show({ picture: android() ? '🏆' : (p === 1 ? '🔴🏆' : '🟡🏆'), again: nextGame });
      } else if (p === 2) {
        Guard.failed();
        result('🤖', 'Android wins!', 'The Android wins this time. Have another go!');
      } else {
        Guard.count('🤝 draw');
        if (android()) Guard.failed();
        result('🤝', 'It\'s a draw!', 'The board is full. It\'s a draw!');
      }
    }, p ? 1400 : 600);
  }

  function result(pic, text, speech) {
    $('#result-pic').textContent = pic;
    $('#result-text').textContent = text;
    $('#result').hidden = false;
    Sound.say(speech);
  }

  // The Android slides its counter about for a moment, as if thinking, then drops it.
  function androidMove() {
    thinking = true;
    showScore();
    const start = performance.now();
    const g = gameNo;
    setTimeout(() => {
      if (g !== gameNo) return;
      const c = Connect.bestMove(board, 2, saved.level);
      const wait = Math.max(0, 900 - (performance.now() - start));
      // glide over to the chosen column
      const from = hover >= 0 ? hover : Math.floor(board.cols / 2);
      const steps = [];
      const dir = c > from ? 1 : -1;
      for (let k = from; k !== c; k += dir) steps.push(k);
      steps.push(c);
      setTimeout(() => {
        let i = 0;
        const step = () => {
          if (over || g !== gameNo) return;
          hover = steps[i++];
          if (i < steps.length) setTimeout(step, 140);
          else setTimeout(() => { if (g !== gameNo) return; thinking = false; if (!over) play(c); }, 260);
        };
        step();
      }, wait);
    }, 450); // let the last counter finish bouncing before the Android thinks hard
    hover = Math.floor(board.cols / 2);
  }

  // ---------- touch: hold a counter over a column, let go to drop it
  const colAt = e => {
    const r = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left - vw.x0) / vw.s);
    return Math.max(0, Math.min(board.cols - 1, c));
  };
  let holding = false;
  canvas.addEventListener('pointerdown', e => {
    Sound.unlock();
    idle = 0;
    if (!humanTurn()) return;
    holding = true;
    hover = colAt(e);
    hintCol = -1;
    Sound.step(hover);
  });
  canvas.addEventListener('pointermove', e => {
    if (!holding || !humanTurn()) return;
    const c = colAt(e);
    if (c !== hover) { hover = c; Sound.step(c); }
  });
  canvas.addEventListener('pointerup', e => {
    if (!holding) return;
    holding = false;
    if (!humanTurn()) return;
    play(colAt(e));
  });
  canvas.addEventListener('pointercancel', () => { holding = false; hover = -1; });

  // ---------- drawing
  function disc(x, y, p, rad, glow) {
    ctx.save();
    if (glow) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 20 + Math.sin(time * 8) * 10; }
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = COLOUR[p];
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, rad * 0.1);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.68, 0, Math.PI * 2);
    ctx.strokeStyle = DARK[p];
    ctx.lineWidth = rad * 0.12;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - rad * 0.32, y - rad * 0.36, rad * 0.22, rad * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
    ctx.restore();
  }

  function frame(x, y, w, h, s) {
    // the blue board with round holes, drawn over the counters
    ctx.beginPath();
    const pad = s * 0.15, rr = s * 0.3;
    ctx.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, rr);
    for (let c = 0; c < board.cols; c++) for (let r = 0; r < board.rows; r++) {
      const hx = x + (c + 0.5) * s, hy = y + (r + 0.5) * s;
      ctx.moveTo(hx + s * 0.4, hy);
      ctx.arc(hx, hy, s * 0.4, 0, Math.PI * 2);
    }
    ctx.fillStyle = '#2f7bff';
    ctx.fill('evenodd');
    ctx.lineWidth = Math.max(3, s * 0.07);
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function draw() {
    const { w, h, s, x0, y0 } = vw;
    ctx.clearRect(0, 0, w, h);
    const bw = board.cols * s, bh = board.rows * s;
    // the empty holes show a pale sky
    ctx.fillStyle = '#e8f7ff';
    ctx.fillRect(x0, y0, bw, bh);
    // the column you're over gets a soft stripe
    const shine = hover >= 0 && !over ? hover : hintCol;
    if (shine >= 0) {
      ctx.fillStyle = hintCol >= 0 && hover < 0 ? `rgba(255, 214, 10, ${0.35 + 0.25 * Math.sin(time * 6)})` : 'rgba(255, 214, 10, 0.35)';
      ctx.fillRect(x0 + shine * s, y0, s, bh);
    }
    const rad = s * 0.4;
    const inLine = (c, r) => line && line.some(([lc, lr]) => lc === c && lr === r);
    for (let c = 0; c < board.cols; c++) for (let r = 0; r < board.rows; r++) {
      const p = board.cells[c][r];
      if (p) disc(cx(c), cy(r), p, rad * (inLine(c, r) ? 1 + 0.06 * Math.sin(time * 8) : 1), inLine(c, r));
    }
    if (falling) disc(cx(falling.c), falling.y, falling.p, rad);
    frame(x0, y0, bw, bh, s);
    // feet so the board stands up
    ctx.fillStyle = '#1f5fd1';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3, s * 0.07);
    for (const fx of [x0 - s * 0.15, x0 + bw + s * 0.15]) {
      ctx.beginPath();
      ctx.roundRect(fx - s * 0.2, y0 + bh - s * 0.1, s * 0.4, s * 0.45, s * 0.1);
      ctx.fill(); ctx.stroke();
    }
    // stars on the winning row
    if (line) {
      ctx.font = `${s * 0.42}px ${getComputedStyle(document.body).getPropertyValue('--emoji')}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [c, r] of line) {
        ctx.beginPath();
        ctx.arc(cx(c), cy(r), rad * (0.98 + 0.05 * Math.sin(time * 8)), 0, Math.PI * 2);
        ctx.lineWidth = s * 0.1;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = s * 0.06;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.fillText('⭐', cx(c), cy(r) + 2);
      }
    }
    // the counter being held (or the Android's, sliding about)
    if (hover >= 0 && !over && !falling) disc(cx(hover), holdY() + Math.sin(time * 5) * s * 0.04, turn, rad);
    // a bouncing arrow when there's a hint
    if (hintCol >= 0 && hover < 0 && !falling) {
      ctx.font = `${s * 0.6}px ${getComputedStyle(document.body).getPropertyValue('--emoji')}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('👇', cx(hintCol), holdY() + Math.sin(time * 6) * s * 0.1);
    }
  }

  // ---------- frame
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (falling) {
      const f = falling;
      f.vy += vw.s * 70 * dt;
      f.y += f.vy * dt;
      if (f.y >= f.ty) {
        f.y = f.ty;
        if (!f.bounced && f.vy > vw.s * 6) { f.vy = -f.vy * 0.25; f.bounced = true; Sound.popNote(f.r); }
        else landed();
      }
    }
    // a gentle hint for the easier Androids: a win to take, or a row to block
    if (humanTurn() && android() && saved.level < 3 && !holding) {
      idle += dt;
      if (idle > HINT_AFTER && hintCol < 0) {
        hintCol = Connect.hint(board, turn);
        if (hintCol >= 0) Guard.count('💡 hint');
        else idle = -1000; // nothing urgent to point at this turn
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- the setup sheet
  function miniBoard(cv, size) {
    const g = cv.getContext('2d');
    const [cols, rows, need] = SIZES[size];
    const s = Math.min((cv.width - 10) / cols, (cv.height - 10) / rows);
    const x = (cv.width - cols * s) / 2, y = (cv.height - rows * s) / 2;
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#2f7bff';
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x - 3, y - 3, cols * s + 6, rows * s + 6, 8);
    g.fill(); g.stroke();
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const p = r === rows - 1 && c >= 1 && c < 1 + need ? 1 : r === rows - 1 && c === 0 ? 2 : r === rows - 2 && c === 2 ? 2 : 0;
      g.beginPath();
      g.arc(x + (c + 0.5) * s, y + (r + 0.5) * s, s * 0.38, 0, Math.PI * 2);
      g.fillStyle = p ? COLOUR[p] : '#e8f7ff';
      g.fill();
    }
  }
  document.querySelectorAll('#sizes canvas').forEach(cv => miniBoard(cv, cv.parentNode.dataset.size));

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
  pick('#sizes .choice', b => { saved.size = +b.dataset.size; Sound.say(`${saved.size === 3 ? 'Three' : 'Four'} in a row`); });
  pick('#modes .choice', b => { saved.mode = b.dataset.mode; Sound.say(android() ? 'Play with the Android' : 'Play with a friend'); });
  pick('#brain .choice', b => { saved.level = +b.dataset.level; Sound.say(['Easy', 'Clever', 'Super clever'][saved.level - 1]); });
  $('#go').addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    $('#setup').hidden = true;
    // new choices: fresh scores, and the player (red) goes first
    const key = `${saved.size}${saved.mode}${saved.level}`;
    if (key !== lastKey) { score = { 1: 0, 2: 0 }; starter = 1; lastKey = key; }
    else if (over) starter = 3 - starter;
    newGame();
  });
  let lastKey = '';

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
  window.connectGame = { get board() { return board; }, get turn() { return turn; }, get over() { return over; }, get score() { return score; },
    get busy() { return !!falling || thinking; }, get hint() { return hintCol; }, vw, play: c => humanTurn() && play(c), _idle(v) { idle = v; } };

  layout();
  showScore();
  showSetup();
  Sound.intro('Drop your counters into the board. Get them in a row to win! Pick a board, and who to play with.');
  requestAnimationFrame(loop);
})();
