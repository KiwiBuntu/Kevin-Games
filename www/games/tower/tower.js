// Number Tower: answer to shoot a web to the right window and climb higher.
// No falling and no lives — a wrong window just goes "boing".
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#tower');
  const ctx = canvas.getContext('2d');
  const INK = '#2b2d42';
  const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  const TEXT_FONT = '"Fredoka", "Comic Sans MS", sans-serif';
  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

  // ---------- saved settings (grown-ups), hero and best heights
  const store = {
    get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const DEFAULTS = { modes: { count: true, howmany: true, add: true, sub: false, mul: false, div: false }, top: 10, choices: 3, help: 'auto' };
  let settings = { ...DEFAULTS, ...store.get('kg-tower-settings', {}) };
  settings.modes = { ...DEFAULTS.modes, ...settings.modes };
  let heroKey = store.get('kg-tower-hero', 'kevin');
  let best = store.get('kg-tower-best', {});

  const enabledModes = () => {
    const list = Object.keys(Quiz.MODES).filter(m => m !== 'mix' && settings.modes[m]);
    if (['add', 'sub', 'mul', 'div'].filter(m => settings.modes[m]).length >= 2) list.push('mix');
    return list.length ? list : ['count'];
  };

  // ---------- menu
  function showMenu() {
    $('#game').hidden = true;
    $('#menu').hidden = false;
    playing = false;
    const heroes = $('.heroes');
    heroes.innerHTML = '';
    for (const h of Heroes.LIST) {
      const card = document.createElement('div');
      card.className = 'hero' + (h.key === heroKey ? ' selected' : '');
      card.innerHTML = '<canvas></canvas><div></div>';
      card.querySelector('div').textContent = h.name;
      const cv = card.querySelector('canvas');
      const dpr = window.devicePixelRatio || 1;
      cv.width = 130 * dpr; cv.height = 150 * dpr;
      const c = cv.getContext('2d');
      c.scale(dpr, dpr);
      Heroes.draw(c, h.key, 65, 142, 125, { aim: -Math.PI / 2 - 0.5, t: 0, cheer: h.key === heroKey });
      card.addEventListener('click', () => {
        Sound.unlock();
        Sound.pop();
        heroKey = h.key;
        store.set('kg-tower-hero', heroKey);
        Sound.say(h.name + '!');
        showMenu();
      });
      heroes.appendChild(card);
    }
    const colours = ['#ffd6a5', '#caffbf', '#9bf6ff', '#ffc6ff', '#fdffb6', '#bdb2ff', '#ffadad'];
    const modes = $('.modes');
    modes.innerHTML = '';
    enabledModes().forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'mode';
      b.style.setProperty('--c', colours[i % colours.length]);
      b.innerHTML = `<span class="icon"></span><span class="name"></span><div class="best"></div>`;
      b.querySelector('.icon').textContent = Quiz.MODES[m].icon;
      b.querySelector('.name').textContent = Quiz.MODES[m].name;
      b.querySelector('.best').textContent = best[m] ? `⭐ ${best[m]}` : '';
      b.addEventListener('click', () => { Sound.unlock(); Sound.pop(); start(m); });
      modes.appendChild(b);
    });
  }

  // ---------- game state
  let mode = 'count';
  let floor = 0;        // floor the hero is standing on
  let slot = 1;         // which of the 3 windows (0 left, 1 middle, 2 right)
  let q = null;         // current question
  let choiceSlots = []; // slot for each option
  let wrong = new Set();
  let wrongTries = 0;
  let trail = {};       // floor -> { slot, value }: the windows he climbed through
  let anim = null;      // { kind: 'shoot' | 'swing' | 'snap', t, ... }
  let playing = false;
  let time = 0;
  const view = { w: 0, h: 0, F: 160, TW: 600, tx: 0, ww: 140, wh: 100, camY: 0, feetScreen: 0 };
  let hero = { x: 0, y: 0, aim: -Math.PI / 2, cheer: 0 };

  function start(m) {
    mode = m;
    floor = 0;
    slot = 1;
    trail = {};
    anim = null;
    $('#menu').hidden = true;
    $('#game').hidden = false;
    playing = true;
    layout();
    hero.x = view.tx + view.TW * 0.5; hero.y = ledgeY(0); // starts at the front door
    view.camY = hero.y - view.feetScreen;
    updateBadge();
    nextQuestion();
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.F = Math.max(110, Math.min(220, view.h * 0.24));
    view.TW = Math.min(view.w * 0.9, 760);
    view.tx = (view.w - view.TW) / 2;
    view.ww = Math.min(view.TW * 0.22, view.F * 0.95);
    view.wh = view.F * 0.6;
  }

  // World coordinates: floor k's floor-line is at y = -k * F (up is negative).
  const ledgeY = k => -k * view.F;
  const slotPos = (k, s) => ({ x: view.tx + view.TW * [0.18, 0.5, 0.82][s], y: ledgeY(k) - view.F * 0.48 });
  // He stands on the ledge beside the window he climbed through, so its number still shows.
  const standX = s => slotPos(0, s).x + (s === 2 ? -1 : 1) * (view.ww / 2 + view.TW * 0.05);

  function nextQuestion() {
    q = Quiz.make(mode, settings, floor);
    wrong = new Set();
    wrongTries = 0;
    const slots = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, q.options.length).sort();
    choiceSlots = slots;
    showAsk();
    setTimeout(() => { if (playing && q) Sound.say(q.say); }, 250);
  }

  // ---------- the question card (with picture help)
  function dotsHTML(n, colour, goneFrom = Infinity, cols = 5) {
    let h = `<div class="dots" style="grid-template-columns:repeat(${Math.min(cols, Math.max(1, n))},auto)">`;
    for (let i = 0; i < n; i++) h += `<i style="--c:${colour}" class="${i >= goneFrom ? 'gone' : ''}"></i>`;
    return h + '</div>';
  }

  function showHelp() {
    const h = q.help;
    if (!h || !q.canHelp) return '';
    switch (h.type) {
      case 'things': return `<div class="things">${h.emoji.repeat(h.n)}</div>`;
      case 'add': return `${dotsHTML(h.a, '#ff4d4d')}<span class="sign">+</span>${dotsHTML(h.b, '#3a86ff')}`;
      case 'sub': return dotsHTML(h.a, '#8ac926', h.a - h.b);
      case 'mul': return Array.from({ length: h.a }, () => dotsHTML(h.b, '#ff9f1c', Infinity, 10)).join('');
      case 'div': return Array.from({ length: h.b }, () => `<div class="group">${dotsHTML(h.a / h.b, '#8338ec')}</div>`).join('');
    }
    return '';
  }

  function helpWanted() {
    if (!q.canHelp) return false;
    if (q.always) return true;                // "How many?" is the picture
    if (settings.help === 'always') return true;
    if (settings.help === 'never') return false;
    return q.answer <= 10 || wrongTries > 0;  // auto
  }

  function showAsk() {
    $('#ask .q').textContent = q.text;
    $('#ask .help').innerHTML = helpWanted() ? showHelp() : '';
  }

  function updateBadge() {
    $('#floor').textContent = floor;
    $('#best').textContent = best[mode] || 0;
  }

  // ---------- answering
  function windowRect(k, s) {
    const p = slotPos(k, s);
    return { x: p.x - view.ww / 2, y: p.y - view.wh / 2, w: view.ww, h: view.wh, cx: p.x, cy: p.y };
  }
  const toScreen = y => y - view.camY;

  function tap(e) {
    Sound.unlock();
    if (!playing || anim || !q) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    choiceSlots.forEach((s, i) => {
      const w = windowRect(floor + 1, s);
      const pad = 12;
      if (x > w.x - pad && x < w.x + w.w + pad && y > toScreen(w.y) - pad && y < toScreen(w.y + w.h) + pad && !wrong.has(i)) choose(i);
    });
  }

  function choose(i) {
    const w = windowRect(floor + 1, choiceSlots[i]);
    const right = q.options[i] === q.answer;
    Sound.thwip();
    anim = { kind: 'shoot', t: 0, i, right, tx: w.cx, ty: w.y + w.h + 4 };
  }

  function landed(i) {
    floor++;
    slot = choiceSlots[i];
    trail[floor] = { slot, value: q.answer };
    hero.cheer = 1;
    const isBest = floor > (best[mode] || 0);
    if (isBest) { best[mode] = floor; store.set('kg-tower-best', best); }
    updateBadge();
    if (floor % 10 === 0) {
      banner(`⭐ Floor ${floor}!`);
      Sound.cheer();
      Celebrate.burst(120);
      setTimeout(() => Sound.say(`Floor ${floor <= 10 ? NUMBER_WORDS[floor] : floor}! ${Sound.praise()}`), 700);
      setTimeout(nextQuestion, 2600);
    } else {
      Sound.sparkle();
      if (floor % 5 === 0) setTimeout(() => Sound.say(['Great climbing!', 'Higher and higher!', 'Super!'][Math.floor(Math.random() * 3)]), 200);
      setTimeout(nextQuestion, floor % 5 === 0 ? 1300 : 450);
    }
    q = null;
  }

  function banner(text) {
    const b = $('#banner');
    b.textContent = text;
    b.classList.add('show');
    setTimeout(() => b.classList.remove('show'), 1900);
  }

  // ---------- drawing
  // Sky colour by height: day → clouds → sunset → night → space.
  const SKY = [[0, '#7fd3ff', '#d6f3ff'], [10, '#8fdcff', '#eefaff'], [20, '#ffb36b', '#ffe7a8'], [30, '#6a4c93', '#f4a261'], [40, '#1b1f4b', '#3d2a7a'], [60, '#05060f', '#1b1f4b']];
  function lerpColour(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    let o = '#';
    for (const sh of [16, 8, 0]) o += Math.round(((A >> sh) & 255) + ((((B >> sh) & 255) - ((A >> sh) & 255)) * t)).toString(16).padStart(2, '0');
    return o;
  }
  function skyAt(f) {
    let i = 0;
    while (i < SKY.length - 1 && f >= SKY[i + 1][0]) i++;
    if (i === SKY.length - 1) return [SKY[i][1], SKY[i][2]];
    const t = Math.min(1, (f - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]));
    const ease = Math.max(0, (t - 0.6) / 0.4); // hold each look, then blend near the next
    return [lerpColour(SKY[i][1], SKY[i + 1][1], ease), lerpColour(SKY[i][2], SKY[i + 1][2], ease)];
  }

  // Fixed "random" scenery so it doesn't jump about.
  const seeded = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

  function drawBackground() {
    const f = -(view.camY + view.h / 2) / view.F; // floor at the middle of the screen
    const [top, bottom] = skyAt(Math.max(0, f));
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    // stars at night and in space
    const starAlpha = Math.max(0, Math.min(1, (f - 33) / 8));
    if (starAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${starAlpha})`;
      for (let i = 0; i < 90; i++) {
        const x = seeded(i) * view.w, y = ((seeded(i + 99) * view.h * 3 - view.camY * 0.2) % view.h + view.h) % view.h;
        ctx.beginPath(); ctx.arc(x, y, 1 + seeded(i + 7) * 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
    // planets far up
    if (f > 45) {
      ctx.font = `${Math.round(view.F * 0.9)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [k, e, side] of [[50, '🪐', 0.12], [62, '🌙', 0.88], [75, '🌍', 0.1], [90, '☄️', 0.85], [110, '🚀', 0.15]]) {
        const y = toScreen(ledgeY(k) * 0.9);
        if (y > -100 && y < view.h + 100) ctx.fillText(e, view.w * side, y);
      }
    }
    // clouds and birds on the way up (move slower than the tower)
    ctx.font = `${Math.round(view.F * 0.55)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 3; k < 45; k += 2) {
      const screenY = (ledgeY(k) - view.camY) * 0.6; // slower than the tower, so it feels far away
      if (screenY < -80 || screenY > view.h + 80) continue;
      const side = seeded(k) < 0.5 ? seeded(k + 3) * view.tx * 0.9 : view.w - seeded(k + 3) * view.tx * 0.9;
      const drift = Math.sin(time * 0.3 + k) * 12;
      ctx.globalAlpha = 0.9;
      ctx.fillText(k > 12 && k < 30 && k % 4 === 1 ? '🐦' : '☁️', (side || view.w * 0.1) + drift, screenY);
      ctx.globalAlpha = 1;
    }
    // city at the bottom
    const groundY = toScreen(0);
    if (groundY < view.h + 200) {
      for (let i = 0; i < 9; i++) {
        const bw = view.w / 8, bh = view.F * (1 + seeded(i + 40) * 2.2);
        const x = i * bw - bw * 0.3;
        ctx.fillStyle = i % 2 ? '#9fb8d9' : '#b6c9e6';
        ctx.fillRect(x, groundY - bh * 0.85, bw * 0.9, bh);
      }
      ctx.fillStyle = '#5cc85a';
      ctx.fillRect(0, groundY, view.w, view.h);
    }
  }

  function drawWindow(k, s, kind, label, alpha = 1) {
    const w = windowRect(k, s);
    const x = w.x, y = toScreen(w.y);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(x, y, w.w, w.h, 14);
    if (kind === 'choice') {
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      ctx.shadowColor = '#fff36b';
      ctx.shadowBlur = 14 + 10 * pulse;
      ctx.fillStyle = '#fffbe0';
    } else if (kind === 'wrong') ctx.fillStyle = '#c9ced9';
    else if (kind === 'done') ctx.fillStyle = '#ffe9a8';
    else ctx.fillStyle = '#2b4c7e';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 5;
    ctx.strokeStyle = kind === 'choice' ? '#ffb703' : INK;
    ctx.stroke();
    if (kind === 'dark') {
      // curtains and a shine
      ctx.fillStyle = '#ff9ec7';
      ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.quadraticCurveTo(x + w.w * 0.28, y + w.h * 0.4, x + 4, y + w.h - 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + w.w - 4, y + 4); ctx.quadraticCurveTo(x + w.w * 0.72, y + w.h * 0.4, x + w.w - 4, y + w.h - 4); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + w.w * 0.45, y + w.h * 0.25); ctx.lineTo(x + w.w * 0.6, y + w.h * 0.12); ctx.stroke();
    }
    if (label !== undefined) {
      ctx.fillStyle = kind === 'wrong' ? '#8d93a8' : INK;
      ctx.font = `700 ${Math.round(w.h * (String(label).length > 2 ? 0.48 : 0.62))}px ${TEXT_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w.cx, y + w.h * 0.54);
    }
    ctx.restore();
  }

  function drawTower() {
    const F = view.F, TW = view.TW, tx = view.tx;
    const topK = Math.ceil(-(view.camY) / F) + 1;
    const lowK = Math.max(0, Math.floor(-(view.camY + view.h) / F) - 1);
    // walls
    const yTop = toScreen(ledgeY(topK + 1)), yBottom = toScreen(0);
    ctx.fillStyle = '#e07a5f';
    ctx.fillRect(tx, yTop, TW, yBottom - yTop);
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(tx, yTop); ctx.lineTo(tx, yBottom); ctx.moveTo(tx + TW, yTop); ctx.lineTo(tx + TW, yBottom); ctx.stroke();
    // bricks
    ctx.strokeStyle = 'rgba(120, 50, 30, 0.25)';
    ctx.lineWidth = 2;
    const bh = F / 6;
    for (let y = Math.floor((yTop - toScreen(0)) / bh) * bh + toScreen(0); y < yBottom; y += bh) {
      ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + TW, y); ctx.stroke();
      const row = Math.round((y - toScreen(0)) / bh);
      for (let x = tx + (row % 2 ? 0 : bh); x < tx + TW; x += bh * 2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); }
    }
    for (let k = lowK; k <= topK; k++) {
      // ledge for each floor
      const ly = toScreen(ledgeY(k));
      ctx.fillStyle = '#f4f1de';
      ctx.fillRect(tx - 10, ly - 8, TW + 20, 14);
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.strokeRect(tx - 10, ly - 8, TW + 20, 14);
      // milestone flags every 10 floors
      if (k > 0 && k % 10 === 0) {
        ctx.font = `700 ${Math.round(F * 0.22)}px ${TEXT_FONT}`;
        ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 5; ctx.strokeStyle = INK;
        ctx.strokeText(`⭐${k}`, tx - 14, ly - F * 0.5);
        ctx.fillStyle = '#ffd60a';
        ctx.fillText(`⭐${k}`, tx - 14, ly - F * 0.5);
      }
      // windows
      for (let s = 0; s < 3; s++) {
        if (k === floor + 1 && q) {
          const i = choiceSlots.indexOf(s);
          if (i >= 0) { drawWindow(k, s, wrong.has(i) ? 'wrong' : 'choice', q.options[i]); continue; }
        }
        if (trail[k] && trail[k].slot === s) drawWindow(k, s, 'done', trail[k].value);
        else drawWindow(k, s, 'dark');
      }
    }
    // front door at the bottom
    const gy = toScreen(0);
    if (gy < view.h + 50) {
      ctx.fillStyle = '#9c6b3c';
      ctx.beginPath(); ctx.roundRect(tx + TW / 2 - F * 0.25, gy - F * 0.7, F * 0.5, F * 0.7, [F * 0.25, F * 0.25, 0, 0]); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
    }
  }

  function drawWeb(fromX, fromY, toX, toY, amount) {
    const ex = fromX + (toX - fromX) * amount, ey = fromY + (toY - fromY) * amount;
    const web = Heroes.LIST.find(h => h.key === heroKey).web;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = web; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fillStyle = web; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  }

  function draw() {
    drawBackground();
    drawTower();
    const s = view.F * 0.62;
    const hx = hero.x, hy = toScreen(hero.y);
    let aim = -Math.PI / 2;
    if (anim) aim = Math.atan2(toScreen(anim.ty) - (hy - s * 0.6), anim.tx - hx);
    else if (q) {
      // point up towards the answers, gently looking around
      aim = -Math.PI / 2 + Math.sin(time * 1.2) * 0.35;
    }
    const hand = Heroes.draw(ctx, heroKey, hx, hy, s, { aim, t: time, cheer: hero.cheer > 0 });
    if (anim && (anim.kind === 'shoot' || anim.kind === 'snap' || anim.kind === 'swing')) {
      const amount = anim.kind === 'shoot' ? Math.min(1, anim.t / 0.22) : anim.kind === 'snap' ? Math.max(0, 1 - anim.t / 0.3) : 1;
      drawWeb(hand.handX, hand.handY, anim.tx, toScreen(anim.ty), amount);
    }
  }

  // ---------- animation
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (playing) {
      hero.cheer = Math.max(0, hero.cheer - dt);
      if (anim) {
        anim.t += dt;
        if (anim.kind === 'shoot' && anim.t >= 0.22) {
          if (anim.right) {
            Sound.whoosh();
            const from = { x: hero.x, y: hero.y };
            anim = { ...anim, kind: 'swing', t: 0, from, to: { x: standX(choiceSlots[anim.i]), y: ledgeY(floor + 1) } };
          } else {
            Sound.boing();
            wrong.add(anim.i);
            wrongTries++;
            if (navigator.vibrate) navigator.vibrate(40);
            showAsk(); // picture help may appear now
            anim = { ...anim, kind: 'snap', t: 0 };
          }
        } else if (anim.kind === 'swing') {
          const u = Math.min(1, anim.t / 0.6);
          const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
          // swing out in an arc, then land on the next ledge
          hero.x = anim.from.x + (anim.to.x - anim.from.x) * e + Math.sin(u * Math.PI) * view.F * 0.25 * (anim.to.x >= anim.from.x ? -1 : 1);
          hero.y = anim.from.y + (anim.to.y - anim.from.y) * e;
          if (u >= 1) { const i = anim.i; anim = null; landed(i); }
        } else if (anim.kind === 'snap' && anim.t >= 0.3) {
          anim = null;
        }
      }
      // camera: keep the hero low on screen with the answer windows just under the question card
      const card = $('#ask').getBoundingClientRect(), stage = canvas.getBoundingClientRect();
      const cardBottom = card.bottom - stage.top;
      view.feetScreen = Math.min(view.h - 12, cardBottom + view.F * 1.48 + view.wh * 0.5 + 18);
      const target = hero.y - view.feetScreen;
      view.camY += (target - view.camY) * Math.min(1, dt * 5);
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---------- grown-up settings (behind the sum)
  function openPanel() {
    const tog = $('#t-modes');
    tog.innerHTML = '';
    for (const m of ['count', 'howmany', 'add', 'sub', 'mul', 'div']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = settings.modes[m] ? 'on' : '';
      b.innerHTML = `<span class="emoji">${Quiz.MODES[m].icon}</span> ${Quiz.MODES[m].name}`;
      b.addEventListener('click', () => {
        settings.modes[m] = !settings.modes[m];
        if (!Object.values(settings.modes).some(Boolean)) settings.modes.count = true; // always leave one
        save();
        openPanel();
      });
      tog.appendChild(b);
    }
    seg('#t-top', [10, 20, 50, 100], settings.top, v => { settings.top = v; });
    seg('#t-choices', [2, 3], settings.choices, v => { settings.choices = v; });
    seg('#t-help', [['auto', 'Auto'], ['always', 'Always'], ['never', 'Never']], settings.help, v => { settings.help = v; });
    const names = Object.keys(best).filter(m => best[m]).map(m => `${Quiz.MODES[m].icon} ${Quiz.MODES[m].name}: floor ${best[m]}`);
    $('#t-best').textContent = names.length ? names.join(' · ') : 'No climbs yet.';
    $('#panel').hidden = false;
  }
  function seg(sel, items, current, set) {
    const el = $(sel);
    el.innerHTML = '';
    for (const it of items) {
      const [v, label] = Array.isArray(it) ? it : [it, String(it)];
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = v === current ? 'on' : '';
      b.addEventListener('click', () => { set(v); save(); openPanel(); });
      el.appendChild(b);
    }
  }
  const save = () => store.set('kg-tower-settings', settings);
  $('#settings').addEventListener('click', () => { Sound.unlock(); Gate.ask(openPanel); });
  $('#panel-close').addEventListener('click', () => { $('#panel').hidden = true; showMenu(); });
  $('#t-reset-best').addEventListener('click', () => { best = {}; store.set('kg-tower-best', best); openPanel(); });

  // ---------- buttons
  canvas.addEventListener('pointerdown', tap);
  $('#hear').addEventListener('click', () => { Sound.unlock(); if (q) Sound.say(q.say); });
  $('#to-menu').addEventListener('click', () => { Sound.pop(); showMenu(); });
  const muteBtn = $('#mute');
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', () => {
    if (!playing) return;
    layout();
    if (!anim) { hero.x = floor ? standX(slot) : view.tx + view.TW * 0.5; hero.y = ledgeY(floor); }
  });
  // Handy for poking at the game from the browser console.
  window.numberTower = {
    get q() { return q; }, get floor() { return floor; }, get choiceSlots() { return choiceSlots; }, get anim() { return anim; },
    windowRect, toScreen, get settings() { return settings; },
  };

  showMenu();
  Sound.intro('Pick a hero, then climb the tower! Tap the right answer to swing up.');
  requestAnimationFrame(loop);
})();
