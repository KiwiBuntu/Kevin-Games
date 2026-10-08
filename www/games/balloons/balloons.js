// Balloon Pop: tap the balloons as they float up!
(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const fillEl = document.getElementById('fill');
  const spellEl = document.getElementById('spell');
  const spellPic = spellEl.querySelector('.pic');
  const spellTiles = spellEl.querySelector('.tiles');
  const modeBtn = document.getElementById('mode');
  const speedBtn = document.getElementById('speed');
  const muteBtn = document.getElementById('mute');
  const INK = '#2b2d42';
  const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  const TEXT_FONT = '"Fredoka", "Comic Sans MS", sans-serif';
  const TARGET = 20; // pops needed for the Hooray screen
  const SPELL_TARGET = 3; // words to spell for the Hooray screen

  // Words for the spelling mode — add more names here! The first word is always the first in this list.
  const SPELL_WORDS = [
    ['KEVIN', '👦', 'Kevin'], ['GRANNY', '👵', 'Granny'], ['GRANDPA', '👴', 'Grandpa'],
    ['MUM', '👩', 'Mum'], ['DAD', '👨', 'Dad'],
    // Sight words (picture is optional — leave it '' when there isn't a good one)
    ['THE', '', 'the'], ['AND', '', 'and'], ['YOU', '👉', 'you'], ['SEE', '👀', 'see'], ['CAN', '', 'can'],
    ['FOR', '', 'for'], ['NOT', '', 'not'], ['ONE', '1️⃣', 'one'], ['BIG', '🐘', 'big'], ['OUT', '', 'out'],
    ['CAT', '🐱', 'Cat'], ['DOG', '🐶', 'Dog'], ['PIG', '🐷', 'Pig'], ['COW', '🐮', 'Cow'],
    ['HEN', '🐔', 'Hen'], ['BEE', '🐝', 'Bee'], ['BUS', '🚌', 'Bus'], ['CAR', '🚗', 'Car'],
    ['SUN', '☀️', 'Sun'], ['HAT', '🎩', 'Hat'], ['BED', '🛏️', 'Bed'], ['FISH', '🐟', 'Fish'],
    ['DUCK', '🦆', 'Duck'], ['FROG', '🐸', 'Frog'], ['TRAIN', '🚂', 'Train'], ['BOAT', '⛵', 'Boat'],
    ['STAR', '⭐', 'Star'], ['MOON', '🌙', 'Moon'], ['CAKE', '🎂', 'Cake'], ['BALL', '⚽', 'Ball'],
    ['TREE', '🌳', 'Tree'], ['APPLE', '🍎', 'Apple'], ['HOUSE', '🏠', 'House'],
  ];

  const COLOURS = [
    ['#ff4d4d', 'Red'], ['#ff9f1c', 'Orange'], ['#ffd60a', 'Yellow'], ['#8ac926', 'Green'],
    ['#3a86ff', 'Blue'], ['#8338ec', 'Purple'], ['#ff5fa2', 'Pink'],
  ];
  const NUMBERS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const ANIMALS = [
    ['🐶', 'Puppy'], ['🐱', 'Kitty'], ['🐰', 'Bunny'], ['🐻', 'Bear'], ['🐼', 'Panda'], ['🐨', 'Koala'],
    ['🦁', 'Lion'], ['🐮', 'Cow'], ['🐷', 'Pig'], ['🐸', 'Frog'], ['🐵', 'Monkey'], ['🐧', 'Penguin'],
  ];

  // What is written on each balloon, and what gets said when it pops.
  const MODES = [
    { icon: '🎨', make: () => ({ label: '', say: null }) },
    { icon: '🔢', make: () => { const n = randInt(1, 10); return { label: String(n), say: NUMBERS[n - 1] }; } },
    { icon: '🔤', make: () => { const l = LETTERS[randInt(0, 25)]; return { label: l, say: l }; } },
    { icon: '🐶', make: () => { const [e, name] = ANIMALS[randInt(0, ANIMALS.length - 1)]; return { label: e, say: name, emoji: true }; } },
    { icon: '✏️', spell: true, make: () => { const l = spellLetter(); return { label: l, say: l }; } },
  ];
  const SPEEDS = {
    slow: { icon: '🐢', rise: 0.11, every: 1.0, max: 5 },
    fast: { icon: '🐇', rise: 0.2, every: 0.6, max: 8 },
  };

  let modeIdx = 0;
  let speed = 'slow';
  try {
    modeIdx = Number(localStorage.getItem('kg-balloons-mode')) || 0;
    speed = localStorage.getItem('kg-balloons-speed') || 'slow';
  } catch (e) {}
  if (!MODES[modeIdx]) modeIdx = 0;
  if (!SPEEDS[speed]) speed = 'slow';

  let balloons = [];
  let bits = [];
  let words = [];
  let popped = 0;
  let sinceSpecial = 0;
  let spawnT = 0;
  let done = false;
  let time = 0;
  // Spelling mode
  let spell = null; // { text, pic, name, idx }
  let spellBag = [];
  let wordsSpelled = 0;
  let spellPause = false;
  let firstWord = true;
  const view = { w: 0, h: 0, r: 50 };

  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    let out = '#';
    for (const sh of [16, 8, 0]) {
      const x = (A >> sh) & 255, y = (B >> sh) & 255;
      out += Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
    }
    return out;
  }

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    view.w = innerWidth;
    view.h = innerHeight;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.r = clamp(Math.min(view.w, view.h) * 0.1, 38, 85);
  }

  function newGame() {
    Win.hide();
    balloons = [];
    bits = [];
    words = [];
    popped = 0;
    sinceSpecial = 0;
    spawnT = 0;
    done = false;
    wordsSpelled = 0;
    spellPause = false;
    spell = null;
    spellEl.hidden = !MODES[modeIdx].spell;
    if (MODES[modeIdx].spell) nextWord();
    showProgress();
    modeBtn.textContent = MODES[modeIdx].icon;
    speedBtn.textContent = SPEEDS[speed].icon;
  }

  function showProgress() {
    const frac = MODES[modeIdx].spell ? wordsSpelled / SPELL_TARGET : popped / TARGET;
    fillEl.style.width = `${frac * 100}%`;
  }

  // ---------- spelling mode
  function nextWord() {
    let pick;
    if (firstWord) {
      pick = SPELL_WORDS[0];
      firstWord = false;
    } else {
      if (!spellBag.length) spellBag = SPELL_WORDS.slice().sort(() => Math.random() - 0.5);
      pick = spellBag.pop();
      if (spell && pick[0] === spell.text && spellBag.length) pick = spellBag.pop();
    }
    spell = { text: pick[0], pic: pick[1], name: pick[2], idx: 0 };
    spellPause = false;
    spellPic.textContent = spell.pic;
    spellPic.hidden = !spell.pic;
    spellTiles.innerHTML = '';
    for (const ch of spell.text) {
      const t = document.createElement('span');
      t.className = 'tile';
      t.textContent = ch;
      spellTiles.appendChild(t);
    }
    spellEl.style.setProperty('--n', spell.text.length);
    showSpell();
    setTimeout(() => Sound.say(`Can you spell, ${spell.name}?`), 400);
  }

  function showSpell() {
    [...spellTiles.children].forEach((t, i) => {
      t.classList.toggle('done', i < spell.idx);
      t.classList.toggle('next', i === spell.idx && !spellPause);
    });
  }

  // The letter on a new balloon: make sure the one he needs is always about.
  function spellLetter() {
    if (!spell || spellPause) return LETTERS[randInt(0, 25)];
    const need = spell.text[spell.idx];
    const showing = balloons.some(b => b.label === need && b.y > view.h * 0.3);
    if (!showing || Math.random() < 0.35) return need;
    // Other letters: half from the word itself, half from the alphabet.
    const pool = Math.random() < 0.5 ? spell.text : LETTERS;
    let l = need;
    for (let i = 0; i < 10 && l === need; i++) l = pool[randInt(0, pool.length - 1)];
    return l;
  }

  function spellPop(b) {
    const need = spell.text[spell.idx];
    if (spellPause || b.label !== need) {
      setTimeout(() => Sound.say(b.say), 120);
      if (!spellPause) {
        // Wiggle the letter he is looking for.
        const t = spellTiles.children[spell.idx];
        t.classList.remove('hint');
        void t.offsetWidth;
        t.classList.add('hint');
      }
      return;
    }
    spell.idx++;
    Sound.sparkle();
    setTimeout(() => Sound.say(b.say), 120);
    if (spell.idx < spell.text.length) { showSpell(); return; }
    // Word finished!
    spellPause = true;
    showSpell();
    spellEl.classList.add('yay');
    wordsSpelled++;
    showProgress();
    setTimeout(() => {
      Sound.say(`${spell.name}! Well done!`);
      Celebrate.burst(80);
    }, 600);
    setTimeout(() => {
      spellEl.classList.remove('yay');
      if (wordsSpelled >= SPELL_TARGET) {
        done = true;
        Win.show({ picture: '✏️🎉', again: newGame });
      } else nextWord();
    }, 3000);
  }

  function spawn() {
    const r = view.r * rnd(0.9, 1.1);
    // Try a few spots and keep the one furthest from the other low-down balloons.
    let x = 0, bestGap = -1;
    for (let i = 0; i < 6; i++) {
      const cx = rnd(r * 1.2, view.w - r * 1.2);
      const gap = Math.min(Infinity, ...balloons.filter(b => b.y > view.h * 0.6).map(b => Math.abs(b.x0 - cx)));
      if (gap > bestGap) { bestGap = gap; x = cx; }
    }
    sinceSpecial++;
    const special = !MODES[modeIdx].spell && sinceSpecial > 6 && Math.random() < 0.2;
    if (special) sinceSpecial = 0;
    const [color, colourName] = COLOURS[randInt(0, COLOURS.length - 1)];
    const content = special ? { label: '⭐', say: 'Wow!', emoji: true } : MODES[modeIdx].make();
    balloons.push({
      x0: x, x, y: view.h + r * 1.4, r,
      color, colourName, special, ...content,
      say: content.say || colourName,
      rise: view.h * SPEEDS[speed].rise * rnd(0.85, 1.2),
      phase: rnd(0, Math.PI * 2), sway: rnd(0.15, 0.35) * r,
    });
  }

  // ---------- input
  function tap(e) {
    Sound.unlock();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    // Check the front-most balloon first; be generous with little fingers.
    for (let i = balloons.length - 1; i >= 0; i--) {
      const b = balloons[i];
      const dx = (x - b.x) / (b.r * 1.15), dy = (y - b.y) / (b.r * 1.35);
      if (dx * dx + dy * dy <= 1) {
        pop(b);
        balloons.splice(i, 1);
        return;
      }
    }
  }

  function pop(b) {
    Sound.balloon();
    if (navigator.vibrate) navigator.vibrate(30);
    const colours = b.special ? COLOURS.map(c => c[0]) : [b.color];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd(-0.2, 0.2);
      const v = rnd(150, 380);
      bits.push({
        x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        rot: rnd(0, 6), spin: rnd(-10, 10), size: b.r * rnd(0.15, 0.3),
        color: colours[i % colours.length], life: 1,
      });
    }
    words.push({
      text: b.label && !b.special ? b.label : b.colourName, emoji: b.emoji && !b.special,
      x: b.x, y: b.y, color: b.special ? '#ff5fa2' : b.color, life: 1,
    });
    if (MODES[modeIdx].spell) {
      if (!done) spellPop(b);
      return;
    }
    setTimeout(() => Sound.say(b.say), 120);
    if (b.special) {
      Celebrate.burst(60);
      Sound.sparkle();
    }
    if (done) return;
    popped++;
    showProgress();
    if (popped >= TARGET) {
      done = true;
      setTimeout(() => Win.show({ picture: '🎈🎉', again: newGame }), 900);
    }
  }

  // ---------- update
  function update(dt) {
    time += dt;
    spawnT -= dt;
    const sp = SPEEDS[speed];
    if (!done && spawnT <= 0 && balloons.length < sp.max) {
      spawn();
      spawnT = sp.every * rnd(0.7, 1.3);
    }
    for (const b of balloons) {
      b.y -= b.rise * dt;
      b.x = b.x0 + Math.sin(time * 1.3 + b.phase) * b.sway;
    }
    // Missed balloons just float away — no penalty.
    balloons = balloons.filter(b => b.y > -b.r * 4);
    for (const p of bits) {
      p.vy += 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt * 1.4;
    }
    bits = bits.filter(p => p.life > 0);
    for (const w of words) {
      w.y -= 40 * dt;
      w.life -= dt * 0.9;
    }
    words = words.filter(w => w.life > 0);
  }

  // ---------- drawing
  function drawBalloon(b) {
    const { x, y, r } = b;
    const rx = r, ry = r * 1.2;
    // wavy string
    ctx.beginPath();
    ctx.moveTo(x, y + ry);
    const wig = Math.sin(time * 3 + b.phase) * r * 0.15;
    ctx.bezierCurveTo(x + wig, y + ry + r * 0.7, x - wig, y + ry + r * 1.4, x + wig * 0.5, y + ry + r * 2.2);
    ctx.strokeStyle = '#6b6f80';
    ctx.lineWidth = 2;
    ctx.stroke();

    // knot
    ctx.beginPath();
    ctx.moveTo(x, y + ry - 2);
    ctx.lineTo(x - r * 0.13, y + ry + r * 0.18);
    ctx.lineTo(x + r * 0.13, y + ry + r * 0.18);
    ctx.closePath();
    ctx.fillStyle = b.special ? '#ff9f1c' : mix(b.color, '#000000', 0.2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // body
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (b.special) {
      const g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
      COLOURS.forEach(([c], i) => g.addColorStop(i / (COLOURS.length - 1), c));
      ctx.fillStyle = g;
    } else {
      const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.4, r * 0.1, x, y, r * 1.3);
      g.addColorStop(0, mix(b.color, '#ffffff', 0.45));
      g.addColorStop(0.6, b.color);
      g.addColorStop(1, mix(b.color, '#000000', 0.2));
      ctx.fillStyle = g;
    }
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // shine
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.42, y - ry * 0.42, rx * 0.14, ry * 0.24, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    if (b.label) drawLabel(b.label, b.emoji, x, y + r * 0.05, r);
  }

  function drawLabel(text, emoji, x, y, r) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (emoji) {
      ctx.font = `${Math.round(r * 0.95)}px ${EMOJI_FONT}`;
      ctx.fillText(text, x, y);
    } else {
      ctx.font = `700 ${Math.round(r * 1.05)}px ${TEXT_FONT}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = r * 0.14;
      ctx.strokeStyle = INK;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x, y);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, view.w, view.h);
    for (const b of balloons) drawBalloon(b);
    for (const p of bits) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(-p.size / 2, -p.size / 3);
      ctx.lineTo(p.size / 2, -p.size / 4);
      ctx.lineTo(0, p.size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // The popped balloon's number/letter/colour floats up for a moment.
    for (const w of words) {
      ctx.save();
      ctx.globalAlpha = clamp(w.life * 1.5, 0, 1);
      const r = view.r * (1 + (1 - w.life) * 0.3);
      if (w.emoji) drawLabel(w.text, true, w.x, w.y, r);
      else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(r * 0.8)}px ${TEXT_FONT}`;
        ctx.lineJoin = 'round';
        ctx.lineWidth = r * 0.14;
        ctx.strokeStyle = INK;
        ctx.strokeText(w.text, w.x, w.y);
        ctx.fillStyle = w.color;
        ctx.fillText(w.text, w.x, w.y);
      }
      ctx.restore();
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- buttons
  canvas.addEventListener('pointerdown', tap);
  spellEl.addEventListener('click', () => { Sound.unlock(); if (spell) Sound.say(spell.name); });
  modeBtn.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    modeIdx = (modeIdx + 1) % MODES.length;
    try { localStorage.setItem('kg-balloons-mode', String(modeIdx)); } catch (e) {}
    newGame();
  });
  speedBtn.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    speed = speed === 'slow' ? 'fast' : 'slow';
    try { localStorage.setItem('kg-balloons-speed', speed); } catch (e) {}
    speedBtn.textContent = SPEEDS[speed].icon;
  });
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);
  // Handy for poking at the game from the browser console.
  window.balloonPop = { get balloons() { return balloons; }, get popped() { return popped; }, get spell() { return spell; } };

  layout();
  newGame();
  requestAnimationFrame(loop);
})();
