// My Pet: look after a little pet in real time. It never dies — it just needs love.
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#room');
  const ctx = canvas.getContext('2d');
  const INK = '#2b2d42';
  const NAMES = ['Rex', 'Sparky', 'Bubbles', 'Biscuit', 'Luna', 'Coco', 'Max', 'Pip', 'Ziggy', 'Noodle', 'Peanut', 'Blue'];

  // ---------- saved pets (this device only)
  let state;
  try { state = JSON.parse(localStorage.getItem('kg-pet')); } catch (e) {}
  if (!state || state.v !== 1) state = Care.fresh();
  const save = () => { try { localStorage.setItem('kg-pet', JSON.stringify(state)); } catch (e) {} };
  const bed = () => { const s = Guard.settings(); return { from: s.bedFrom, to: s.bedTo }; };
  const pet = () => Care.activePet(state);
  if (!pet()) Care.takeEgg(state, Date.now(), true);

  // ---------- what's happening on screen
  const vw = { w: 0, h: 0, floor: 0, s: 200 };
  let time = 0;
  let px = 0.5, target = 0.5, face = 1;      // pet position (0–1 across the room)
  let squish = 0;
  let bits = [];                               // hearts, bubbles, crumbs, sparkles
  let flying = null;                           // food / medicine on its way to the mouth
  let bath = false, bathDirty = false;
  let toy = null;                              // 'ball' | 'bubbles' | null
  let ball = null;                             // { x, y, vx, vy, held, carried }
  let floaters = [];                           // bubbles to pop
  let dragBall = null;
  let visitor = null;                          // { pet, x, target, face, until }
  let lastMood = '';
  let lastSaid = 0;
  let head = { x: 0, y: 0 };
  const poopSlots = [0.12, 0.88, 0.3, 0.72];

  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    vw.w = r.width; vw.h = r.height;
    canvas.width = Math.round(vw.w * dpr);
    canvas.height = Math.round(vw.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vw.floor = vw.h * 0.86;
    vw.s = Math.min(vw.h * 0.62, vw.w * 0.42, 330);
  }

  // ---------- talking
  function say(text, voice = true) {
    const b = $('#bubble');
    b.textContent = text;
    b.style.left = `${head.x}px`;
    b.style.top = `${head.y - vw.s * 0.32}px`;
    b.classList.add('show');
    clearTimeout(b.t);
    b.t = setTimeout(() => b.classList.remove('show'), 2200);
    if (voice) Sound.say(text, { pitch: 1.6, rate: 1.05 });
    lastSaid = time;
  }
  function banner(text) {
    const b = $('#banner');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(b.t);
    b.t = setTimeout(() => b.classList.remove('show'), 2400);
  }
  const giggle = () => { [880, 1100, 990, 1320].forEach((f, i) => setTimeout(() => Sound.note(f), i * 70)); };

  // ---------- needs bars and buttons
  function showNeeds() {
    const p = pet();
    $('#pet-name').textContent = p.stage === 'egg' ? 'An egg!' : p.name;
    $('#pet-stars').textContent = '⭐'.repeat(Math.max(0, p.stagesSeen.length - 2));
    const hatched = p.stage !== 'egg';
    $('#meters').style.visibility = hatched ? 'visible' : 'hidden';
    document.querySelectorAll('.act').forEach(b => { b.disabled = !hatched; });
    if (!hatched) return;
    for (const m of document.querySelectorAll('.meter')) {
      if (m.dataset.need === 'love') {
        const full = p.stage === 'grown' ? 100 : p.love || 0;
        m.querySelector('b').style.width = `${full}%`;
        m.classList.toggle('full', Care.readyTomorrow(p, Date.now()));
        continue;
      }
      const v = p.needs[m.dataset.need];
      const bar = m.querySelector('b');
      bar.style.width = `${v}%`;
      bar.style.background = v < 30 ? '#ff4d4d' : v < 55 ? '#ffb703' : '#8ac926';
      m.classList.toggle('low', v < 30);
    }
    $('[data-act="lights"]').textContent = p.lightsOff ? '🌙' : '💡';
    $('[data-act="bath"]').classList.toggle('on', bath);
    $('[data-act="toys"]').classList.toggle('on', !$('#toys').hidden);
    document.querySelectorAll('[data-toy]').forEach(b => b.classList.toggle('on', b.dataset.toy === toy));
  }

  // Every 10 seconds (and on opening): time passes, needs change, the pet may ask for something.
  function update(first) {
    const p = pet();
    const watching = document.visibilityState === 'visible' && $('#house').hidden && $('#panel').hidden && $('#dress').hidden;
    const notes = Care.tick(state, Date.now(), bed(), { live: !first && watching });
    if (notes.grew) grewUp(notes.grew);
    save();
    showNeeds();
    if (p.stage === 'egg') return;
    Guard.best('good-care days', p.careDays.length);
    const mood = Care.mood(p, Date.now(), bed());
    if (first) {
      setTimeout(() => say(notes.missed ? 'I missed you!' : mood === 'asleep' ? 'Zzz…' : `Hello ${['!', 'friend!', 'Kevin!'][Math.floor(Math.random() * 3)]}`), 700);
    } else if (mood !== lastMood || time - lastSaid > 45) {
      const ask = { hungry: "I'm hungry!", sleepy: "I'm sleepy… lights off please!", dirty: "I'm all yucky!", sad: 'Play with me!', sick: "I don't feel well…", ache: 'My tummy hurts!' }[mood];
      if (ask && (mood !== lastMood || time - lastSaid > 90)) say(ask);
      if (!ask && Care.readyTomorrow(p, Date.now()) && !p.toldTomorrow) { p.toldTomorrow = true; say("My heart is full! I'll grow tomorrow!"); }
    }
    lastMood = mood;
  }

  // ---------- caring
  function act(kind) {
    Sound.unlock();
    const p = pet();
    if (p.stage === 'egg') return;
    const now = Date.now();
    if (kind === 'meal' || kind === 'treat') {
      if (p.asleep) { say('Zzz…', false); return; }
      if (kind === 'meal' && p.needs.food >= 95) { squish = 0.6; say("I'm full!"); return; }
      flying = { emoji: kind === 'meal' ? ['🍎', '🥕', '🍌', '🥦', '🍗'][Math.floor(Math.random() * 5)] : ['🍪', '🧁', '🍭'][Math.floor(Math.random() * 3)], t: 0, then: () => {
        const r = Care.feed(state, p, kind, now);
        if (visitor) { visitor.pet.needs.food = Math.min(100, visitor.pet.needs.food + (kind === 'meal' ? 20 : 8)); visitor.pet.needs.fun = Math.min(100, visitor.pet.needs.fun + 5); }
        for (let i = 0; i < 6; i++) bits.push({ x: head.x, y: head.y + 20, vx: (Math.random() - 0.5) * 120, vy: -80 - Math.random() * 60, life: 1, kind: 'crumb' });
        [330, 262].forEach((f, i) => setTimeout(() => Sound.note(f), i * 140));
        if (r.ache) Sound.nope();
        say(r.say);
        Guard.count(kind === 'meal' ? '🍎 meals' : '🍪 treats');
        if (r.ache) Guard.count('🤢 tummy aches');
        if (r.grew) grewUp(r.grew);
        afterCare();
      } };
    } else if (kind === 'medicine') {
      if (!p.sick && !p.ache) { say("I'm not poorly!"); return; }
      flying = { emoji: '💊', t: 0, then: () => {
        const r = Care.medicine(p);
        say(r.say);
        const g = Care.addLove(state, p, 10, now);
        if (g) grewUp(g);
        Sound.sparkle();
        sparkle(head.x, head.y, 12);
        Guard.count('💊 medicine');
        afterCare();
      } };
    } else if (kind === 'lights') {
      const wasTired = p.needs.energy < 40 || Care.isNight(now, bed());
      const r = Care.lights(state, p, now, bed());
      if (r.asleep && wasTired) { const g = Care.addLove(state, p, 8, now); if (g) grewUp(g); }
      Sound.pop();
      if (p.lightsOff && !r.asleep) say("I'm not tired yet!");
      if (r.asleep) { say('Night night…'); Guard.count('🌙 lights off'); }
      if (!p.lightsOff) bath = false;
      afterCare();
    } else if (kind === 'bath') {
      if (p.asleep) { say('Zzz…', false); return; }
      bath = !bath;
      if (bath) { say('Splish splash!'); Guard.count('🛁 baths'); bathDirty = p.needs.clean < 60; stopToy(); } else afterCare();
      showNeeds();
    }
  }
  function afterCare() { save(); showNeeds(); lastMood = Care.mood(pet(), Date.now(), bed()); }

  // ---------- the toy box
  function stopToy() { toy = null; ball = null; floaters = []; showNeeds(); }
  function startToy(kind) {
    Sound.unlock();
    const p = pet();
    if (p.stage === 'egg') return;
    if (kind === 'dress') { openDress(); return; }
    if (p.asleep) { say('Zzz…', false); return; }
    if (toy === kind) { stopToy(); return; }
    bath = false;
    ball = null; floaters = [];
    toy = kind;
    Sound.pop();
    if (kind === 'ball') {
      ball = { x: vw.w * 0.5, y: vw.floor - vw.s * 1.1, vx: (Math.random() - 0.5) * 300, vy: 0, carried: false };
      say('Throw the ball!');
      Guard.count('🎾 ball');
    } else {
      floaters = [];
      say('Bubbles!');
      Guard.count('🫧 bubbles');
    }
    showNeeds();
  }
  function played(amount) {
    const g = Care.play(state, pet(), amount, Date.now());
    if (g) grewUp(g);
    save();
    showNeeds();
  }

  // Ball: drag it and let go to throw. The pet chases it and brings it back.
  function stepBall(dt) {
    const r = vw.s * 0.09;
    if (dragBall) return;
    if (ball.carried) {
      ball.x = head.x + face * vw.s * 0.12; ball.y = head.y + vw.s * 0.18;
      if (Math.abs(petX() - vw.w * 0.5) < vw.w * 0.03) { // brought it back: drop it
        ball.carried = false; ball.vx = (Math.random() - 0.5) * 120; ball.vy = -250;
        played(10);
        hearts(head.x, head.y);
        if (Math.random() < 0.4) say(['Again! Again!', 'Got it!', 'Throw it again!'][Math.floor(Math.random() * 3)]);
      }
      return;
    }
    ball.vy += 1400 * dt;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.y > vw.floor - r) { ball.y = vw.floor - r; ball.vy *= -0.55; ball.vx *= 0.8; if (Math.abs(ball.vy) > 120) Sound.note(200 + Math.random() * 60); }
    if (ball.x < r) { ball.x = r; ball.vx = Math.abs(ball.vx) * 0.7; }
    if (ball.x > vw.w - r) { ball.x = vw.w - r; ball.vx = -Math.abs(ball.vx) * 0.7; }
    if (ball.y < r) { ball.y = r; ball.vy = Math.abs(ball.vy); }
    // the pet picks it up once it has nearly stopped near its feet
    const resting = Math.abs(ball.vx) < 60 && ball.y > vw.floor - r * 3;
    if (resting && Math.abs(ball.x - petX()) < vw.s * 0.25 && !pet().asleep) { ball.carried = true; squish = 0.6; Sound.pop(); }
  }

  // Bubbles: they float up; the pet jumps to pop them (and so can he).
  function stepBubbles(dt) {
    if (floaters.length < 5 && Math.random() < dt * 1.2) floaters.push({ x: vw.w * (0.15 + Math.random() * 0.7), y: vw.floor - 10, r: vw.s * (0.06 + Math.random() * 0.05), vy: -(40 + Math.random() * 40), wob: Math.random() * 6 });
    for (const b of floaters) { b.y += b.vy * dt; b.x += Math.sin(time * 2 + b.wob) * 20 * dt; }
    // pet pops bubbles that drift past its head
    for (const b of floaters) {
      if (Math.hypot(b.x - head.x, b.y - head.y) < vw.s * 0.3 && !b.popped) { b.popped = true; squish = 1; popBubble(b, true); }
    }
    floaters = floaters.filter(b => !b.popped && b.y > -b.r);
  }
  function popBubble(b, byPet) {
    for (let i = 0; i < 6; i++) bits.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.5, kind: 'bubble', r: 3 + Math.random() * 4 });
    Sound.note(900 + Math.random() * 500);
    if (byPet) played(4);
  }

  // ---------- dress-up
  const OUTFITS = [
    { id: 'none', emoji: '🚫', slot: 'all', from: 'baby' },
    { id: '🎀', emoji: '🎀', slot: 'top', from: 'baby' }, { id: '🌸', emoji: '🌸', slot: 'top', from: 'baby' },
    { id: '👓', emoji: '👓', slot: 'face', from: 'baby' },
    { id: '🧢', emoji: '🧢', slot: 'top', from: 'kid' }, { id: '🎩', emoji: '🎩', slot: 'top', from: 'kid' },
    { id: '🕶️', emoji: '🕶️', slot: 'face', from: 'kid' }, { id: '🥸', emoji: '🥸', slot: 'face', from: 'kid' },
    { id: '👑', emoji: '👑', slot: 'top', from: 'grown' }, { id: '🤠', emoji: '🤠', slot: 'top', from: 'grown' },
    { id: '🎓', emoji: '🎓', slot: 'top', from: 'grown' },
  ];
  const stageRank = st => ['egg', 'baby', 'kid', 'grown'].indexOf(st);
  function openDress() {
    const p = pet();
    if (p.stage === 'egg') return;
    p.outfit = p.outfit || {};
    const list = $('#outfits');
    list.innerHTML = '';
    for (const o of OUTFITS) {
      const b = document.createElement('button');
      const locked = stageRank(p.stage) < stageRank(o.from);
      const on = o.id === 'none' ? !p.outfit.top && !p.outfit.face : p.outfit[o.slot] === o.id;
      b.className = (locked ? 'locked' : '') + (on ? ' on' : '');
      b.innerHTML = `${o.emoji}${locked ? `<span class="lk">${o.from === 'kid' ? '🌱' : '⭐'}</span>` : ''}`;
      if (!locked) b.addEventListener('click', () => {
        if (o.id === 'none') p.outfit = {};
        else p.outfit[o.slot] = p.outfit[o.slot] === o.id ? undefined : o.id;
        Sound.pop(); save(); openDress();
        Guard.count(`🎩 wore ${o.emoji}`);
      });
      list.appendChild(b);
    }
    const cv = $('#dress-pet'), c = cv.getContext('2d');
    c.clearRect(0, 0, 220, 220);
    const info = PetArt.draw(c, { species: p.species, stage: p.stage, mood: 'happy', x: 110, y: 214, s: p.stage === 'grown' ? 200 : 240, t: 0.4, face: 1, noCrown: !!p.outfit.top });
    wear(c, p, info);
    $('#dress').hidden = false;
  }
  // Draw what it's wearing on top of the pet.
  function wear(c, p, info) {
    if (!info || !p.outfit) return;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (p.outfit.top) { c.font = `${Math.round(info.hr * 1.05)}px "Noto Color Emoji", sans-serif`; c.fillText(p.outfit.top, info.headX, info.headY - info.hr * 0.95); }
    if (p.outfit.face) { c.font = `${Math.round(info.hr * 0.95)}px "Noto Color Emoji", sans-serif`; c.fillText(p.outfit.face, info.headX, info.headY + (p.outfit.face === '🥸' ? info.hr * 0.15 : -info.hr * 0.05)); }
  }
  $('#dress-close').addEventListener('click', () => { Sound.pop(); $('#dress').hidden = true; hearts(head.x, head.y); say(['Do I look nice?', 'Ta-da!', 'I love it!'][Math.floor(Math.random() * 3)]); });

  function grewUp(stage) {
    Sound.cheer();
    Celebrate.burst();
    banner(stage === 'grown' ? 'All grown up!' : "I'm growing up!");
    setTimeout(() => say(stage === 'grown' ? "I'm all grown up! There's a new egg in the Friends' House!" : 'Look how big I am!'), 1200);
    Guard.count(`🌱 grew to ${stage}`);
  }

  function sparkle(x, y, n) { for (let i = 0; i < n; i++) bits.push({ x, y, vx: (Math.random() - 0.5) * 260, vy: -60 - Math.random() * 200, life: 1, kind: 'star' }); }

  // ---------- touching the room
  const petX = () => vw.w * px;
  function onPet(x, y, cx) {
    return Math.abs(x - cx) < vw.s * 0.32 && y > vw.floor - vw.s * 0.95 && y < vw.floor + 10;
  }
  let rubbing = false, lastRub = null;
  canvas.addEventListener('pointerdown', e => {
    Sound.unlock();
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const p = pet();
    if (p.stage === 'egg') { if (onPet(x, y, petX())) tapEgg(); return; }
    // poops: tap to whoosh away
    for (let i = 0; i < p.poops; i++) {
      const pxp = vw.w * poopSlots[i];
      if (Math.abs(x - pxp) < 40 && Math.abs(y - (vw.floor - 18)) < 40) {
        Care.cleanPoop(p);
        { const g = Care.addLove(state, p, 4, Date.now()); if (g) grewUp(g); }
        Sound.pop();
        sparkle(pxp, vw.floor - 20, 8);
        Guard.count('💩 cleaned up');
        if (!p.poops) say('Thank you!');
        afterCare();
        return;
      }
    }
    if (bath) { rubbing = true; lastRub = { x, y }; canvas.setPointerCapture(e.pointerId); return; }
    if (toy === 'ball' && ball && !ball.carried && Math.hypot(x - ball.x, y - ball.y) < vw.s * 0.2) {
      dragBall = { x, y, t: performance.now(), vx: 0, vy: 0 }; canvas.setPointerCapture(e.pointerId); return;
    }
    if (toy === 'bubbles') {
      const b = floaters.find(f => Math.hypot(x - f.x, y - f.y) < f.r + 20);
      if (b) { b.popped = true; popBubble(b, false); floaters = floaters.filter(f => f !== b); return; }
    }
    if (onPet(x, y, petX())) {
      if (p.asleep) { say('Zzz…', false); return; }
      const bored = p.needs.fun < 60;
      if (Care.tickle(p)) {
        if (bored) { const g = Care.addLove(state, p, 2, Date.now()); if (g) grewUp(g); } squish = 1; giggle(); hearts(head.x, head.y); Guard.count('🤗 tickles'); if (Math.random() < 0.35) say(['Hee hee!', 'That tickles!', 'I love you!'][Math.floor(Math.random() * 3)]); save(); showNeeds(); }
      return;
    }
    if (visitor && onPet(x, y, vw.w * visitor.x)) { visitor.squish = 1; giggle(); hearts(vw.w * visitor.x, vw.floor - vw.s * 0.7); visitor.pet.needs.fun = Math.min(100, visitor.pet.needs.fun + 4); }
  });
  canvas.addEventListener('pointermove', e => {
    if (dragBall) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top, nowT = performance.now();
      const dtm = Math.max(1, nowT - dragBall.t) / 1000;
      dragBall.vx = (x - dragBall.x) / dtm; dragBall.vy = (y - dragBall.y) / dtm;
      dragBall.x = x; dragBall.y = y; dragBall.t = nowT;
      ball.x = x; ball.y = Math.min(y, vw.floor - vw.s * 0.09); ball.vx = 0; ball.vy = 0;
      return;
    }
    if (!rubbing) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const d = Math.hypot(x - lastRub.x, y - lastRub.y);
    lastRub = { x, y };
    if (onPet(x, y, petX()) && d > 2) {
      const before = pet().needs.clean;
      const now = Care.scrub(pet(), d * 0.12);
      if (Math.random() < 0.5) bits.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, life: 1.3, kind: 'bubble', r: 6 + Math.random() * 12 });
      if (before < 100 && now >= 100) {
        Sound.sparkle(); say('Squeaky clean!');
        const g = Care.bathed(state, pet(), bathDirty, Date.now()); if (g) setTimeout(() => grewUp(g), 1300);
        setTimeout(() => { bath = false; afterCare(); }, 1200);
      }
      showNeeds();
    }
  });
  const stopRub = () => {
    if (dragBall) {
      ball.vx = Math.max(-1600, Math.min(1600, dragBall.vx * 0.9)); ball.vy = Math.max(-1600, Math.min(1600, dragBall.vy * 0.9));
      if (Math.hypot(ball.vx, ball.vy) > 300) { Sound.whoosh(); if (Math.random() < 0.5) say('Wheee!'); }
      dragBall = null;
    }
    if (rubbing) { rubbing = false; save(); }
  };
  canvas.addEventListener('pointerup', stopRub);
  canvas.addEventListener('pointercancel', stopRub);

  function hearts(x, y) { for (let i = 0; i < 4; i++) bits.push({ x: x + (Math.random() - 0.5) * 40, y, vx: (Math.random() - 0.5) * 50, vy: -70 - Math.random() * 50, life: 1.2, kind: 'heart' }); }

  // ---------- the egg
  function tapEgg() {
    const p = pet();
    p.eggTaps++;
    squish = 0.5;
    Sound.note([392, 440, 494, 523, 587][Math.min(4, p.eggTaps - 1)]);
    if (p.eggTaps >= 5) { Sound.cork(); sparkle(petX(), vw.floor - vw.s * 0.3, 20); setTimeout(showPicker, 500); }
    save();
  }

  function showPicker() {
    const box = $('#species');
    box.innerHTML = '';
    for (const [key, sp] of Object.entries(Care.SPECIES)) {
      const b = document.createElement('button');
      const cv = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      cv.width = 120 * dpr; cv.height = 120 * dpr;
      const c = cv.getContext('2d');
      c.scale(dpr, dpr);
      PetArt.draw(c, { species: key, stage: 'baby', mood: 'happy', x: 60, y: 112, s: 150, t: 0.4, face: 1 });
      b.appendChild(cv);
      b.appendChild(document.createTextNode(sp.name));
      b.addEventListener('click', () => { Sound.pop(); Sound.say(sp.name + '!'); chooseName(key); });
      box.appendChild(b);
    }
    $('#pick').hidden = false;
    Sound.say("Who's in the egg?");
  }

  function chooseName(species) {
    $('#pick').hidden = true;
    const cv = $('#name-pet');
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 200, 200);
    PetArt.draw(c, { species, stage: 'baby', mood: 'happy', x: 100, y: 190, s: 240, t: 0.4, face: 1 });
    const box = $('#names');
    box.innerHTML = '';
    const pick = NAMES.slice().sort(() => Math.random() - 0.5).slice(0, 6);
    for (const n of pick) {
      const b = document.createElement('button');
      b.textContent = n;
      b.addEventListener('click', () => { Sound.say(n); hatchAs(species, n); });
      box.appendChild(b);
    }
    $('#own-ok').onclick = () => { const n = $('#own-name').value.trim(); if (n) hatchAs(species, n.slice(0, 12)); };
    $('#naming').hidden = false;
  }

  function hatchAs(species, name) {
    $('#naming').hidden = true;
    Care.hatch(state, pet(), species, name, Date.now());
    save();
    Sound.cheer();
    Celebrate.burst();
    Guard.count(`🥚 hatched a ${Care.SPECIES[species].name}`);
    lastMood = '';
    showNeeds();
    setTimeout(() => say(`Hello! I'm ${name}!`), 900);
  }

  // ---------- the Friends' House
  function preview(p) {
    const cv = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    cv.width = 120 * dpr; cv.height = 120 * dpr;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    PetArt.draw(c, { species: p.species, stage: p.stage, mood: p.stage === 'egg' ? 'egg' : 'happy', x: 60, y: 114, s: p.stage === 'grown' ? 128 : 150, t: 0.4, face: 1, eggTaps: p.eggTaps });
    return cv;
  }

  function openHouse() {
    Sound.unlock();
    Sound.pop();
    const list = $('#friend-list');
    list.innerHTML = '';
    const cur = pet();
    for (const p of state.pets) {
      const d = document.createElement('div');
      d.className = 'friend' + (p.id === state.active ? ' here' : '');
      d.appendChild(preview(p));
      const info = document.createElement('div');
      info.innerHTML = `<div>${p.stage === 'egg' ? 'Egg' : escape(p.name)}</div><div class="stars">${'⭐'.repeat(Math.max(0, p.stagesSeen.length - 2))}</div><div class="when">${p.hatched ? 'Hatched ' + new Date(p.hatched).toLocaleDateString() : ''}</div>`;
      d.appendChild(info);
      const row = document.createElement('div');
      row.className = 'row';
      if (p.id === state.active) row.innerHTML = '<span class="emoji" style="font-size:26px">🏠</span>';
      else {
        const home = document.createElement('button');
        home.className = 'btn'; home.textContent = '🏠'; home.setAttribute('aria-label', 'Bring home');
        home.disabled = cur.stage === 'egg';
        home.addEventListener('click', () => bringHome(p));
        row.appendChild(home);
        if (cur.stage !== 'egg' && p.stage !== 'egg') {
          const play = document.createElement('button');
          play.className = 'btn'; play.textContent = '🎉'; play.setAttribute('aria-label', 'Playdate');
          play.addEventListener('click', () => startPlaydate(p));
          row.appendChild(play);
        }
      }
      d.appendChild(row);
      list.appendChild(d);
    }
    if (Care.canTakeEgg(state) && cur.stage !== 'egg') {
      const d = document.createElement('div');
      d.className = 'friend egg';
      d.appendChild(preview({ stage: 'egg', eggTaps: 0 }));
      d.insertAdjacentHTML('beforeend', '<div>A new egg!</div><div class="when">Tap to bring it home</div>');
      d.addEventListener('click', () => {
        Care.takeEgg(state, Date.now());
        endPlaydate(true);
        save();
        $('#house').hidden = true;
        Sound.sparkle();
        lastMood = '';
        showNeeds();
        Guard.count('🥚 new egg');
      });
      list.appendChild(d);
    }
    $('#house').hidden = false;
  }
  const escape = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

  function bringHome(p) {
    endPlaydate(true);
    if (!Care.bringHome(state, p.id, Date.now())) return;
    save();
    $('#house').hidden = true;
    Sound.sparkle();
    lastMood = '';
    showNeeds();
    px = 0.5;
    setTimeout(() => say(`${p.name} is home!`), 300);
    Guard.count('🏠 brought a friend home');
  }

  // ---------- playdates
  function startPlaydate(p) {
    $('#house').hidden = true;
    visitor = { pet: p, x: px < 0.5 ? 0.85 : 0.15, target: 0.5, face: -1, squish: 0, until: Date.now() + 5 * 60 * 1000 };
    pet().needs.fun = Math.min(100, pet().needs.fun + 20);
    p.needs.fun = Math.min(100, p.needs.fun + 20);
    $('#playdate-end').hidden = false;
    Sound.cheer();
    hearts(vw.w * visitor.x, vw.floor - vw.s * 0.6);
    setTimeout(() => say(`${p.name} came to play!`), 400);
    Guard.count('🎉 playdates');
    save();
  }
  function endPlaydate(quiet) {
    if (!visitor) return;
    if (!quiet) say(`Bye bye ${visitor.pet.name}!`);
    visitor = null;
    $('#playdate-end').hidden = true;
    save();
  }
  $('#playdate-end').addEventListener('click', () => { Sound.unlock(); Sound.pop(); endPlaydate(); });

  // ---------- drawing the room
  function drawRoom() {
    const p = pet();
    const night = Care.isNight(Date.now(), bed());
    const dark = p.lightsOff;
    const { w, h, floor } = vw;
    // wall
    const g = ctx.createLinearGradient(0, 0, 0, floor);
    g.addColorStop(0, night ? '#4a4e8c' : '#bfe6ff');
    g.addColorStop(1, night ? '#6b6fb0' : '#e6f6ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, floor);
    // wallpaper dots
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let x = 20; x < w; x += 60) for (let y = 20; y < floor - 20; y += 60) { ctx.beginPath(); ctx.arc(x + ((y / 60) % 2) * 30, y, 5, 0, Math.PI * 2); ctx.fill(); }
    // window with sky
    const wx = w * 0.08, wy = h * 0.08, ww = Math.min(w * 0.22, 200), wh = ww * 0.8;
    ctx.fillStyle = night ? '#1b1f4b' : '#7fd3ff';
    ctx.fillRect(wx, wy, ww, wh);
    ctx.font = `${Math.round(ww * 0.32)}px "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(night ? '🌙' : '☀️', wx + ww * 0.68, wy + wh * 0.35);
    if (night) { ctx.font = `${Math.round(ww * 0.12)}px "Noto Color Emoji", sans-serif`; ctx.fillText('⭐', wx + ww * 0.25, wy + wh * 0.25); ctx.fillText('⭐', wx + ww * 0.35, wy + wh * 0.7); }
    else { ctx.font = `${Math.round(ww * 0.22)}px "Noto Color Emoji", sans-serif`; ctx.fillText('☁️', wx + ww * 0.3 + Math.sin(time * 0.2) * 10, wy + wh * 0.65); }
    ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.strokeRect(wx, wy, ww, wh);
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(wx - 3, wy - 3, ww + 6, wh + 6);
    // lamp
    const lx = w * 0.9, ly = h * 0.12;
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx - 30, ly + 30); ctx.lineTo(lx - 14, ly); ctx.lineTo(lx + 14, ly); ctx.lineTo(lx + 30, ly + 30); ctx.closePath();
    ctx.fillStyle = dark ? '#8d93a8' : '#ffd60a'; ctx.fill(); ctx.stroke();
    if (!dark) { ctx.fillStyle = 'rgba(255, 240, 150, 0.18)'; ctx.beginPath(); ctx.moveTo(lx - 30, ly + 30); ctx.lineTo(lx - 140, floor); ctx.lineTo(lx + 140, floor); ctx.lineTo(lx + 30, ly + 30); ctx.fill(); }
    // floor and rug
    ctx.fillStyle = '#c98b56'; ctx.fillRect(0, floor, w, h - floor);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 70) { ctx.beginPath(); ctx.moveTo(x, floor); ctx.lineTo(x - 20, h); ctx.stroke(); }
    ctx.fillStyle = '#ff9ec7'; ctx.beginPath(); ctx.ellipse(w / 2, floor + (h - floor) * 0.45, w * 0.3, (h - floor) * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    // cushion bed on the right
    ctx.fillStyle = '#8338ec'; ctx.beginPath(); ctx.ellipse(w * 0.8, floor - 6, vw.s * 0.36, vw.s * 0.09, 0, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    // poops
    for (let i = 0; i < p.poops; i++) {
      const x = w * poopSlots[i];
      ctx.font = '44px "Noto Color Emoji", sans-serif';
      ctx.fillText('💩', x, floor - 18);
      ctx.strokeStyle = 'rgba(120, 160, 60, 0.7)'; ctx.lineWidth = 3;
      for (const dx of [-10, 6]) { ctx.beginPath(); for (let k = 0; k < 6; k++) ctx.lineTo(x + dx + Math.sin(time * 4 + k) * 4, floor - 48 - k * 5); ctx.stroke(); }
    }
  }

  // ---------- each frame
  let last = performance.now();
  let wanderAt = 0;
  function loop(nowT) {
    const dt = Math.min(0.05, (nowT - last) / 1000);
    last = nowT;
    time += dt;
    if (document.visibilityState === 'visible') frame(dt);
    requestAnimationFrame(loop);
  }

  function frame(dt) {
    const p = pet();
    const now = Date.now();
    const mood = Care.mood(p, now, bed());
    // wandering about (or off to bed, or standing still in the bath)
    if (p.stage !== 'egg') {
      if (p.asleep) target = 0.8;
      else if (bath) target = 0.5;
      else if (toy === 'ball' && ball) target = ball.carried ? 0.5 : Math.max(0.08, Math.min(0.92, ball.x / vw.w));
      else if (toy === 'bubbles' && floaters.length) { const nb = floaters.reduce((a, b) => (Math.abs(b.x - petX()) < Math.abs(a.x - petX()) ? b : a)); target = nb.x / vw.w; }
      else if (time > wanderAt) { target = 0.25 + Math.random() * 0.5; wanderAt = time + 3 + Math.random() * 5; }
      if (visitor && !p.asleep && !bath) target = (visitor.x + 0.5) / 2 + Math.sin(time * 0.8) * 0.18; // chasing each other
      const dx = target - px;
      const speed = toy ? 0.4 : 0.15; // runs after toys
      if (Math.abs(dx) > 0.005) { px += Math.sign(dx) * Math.min(Math.abs(dx), dt * speed); face = dx > 0 ? 1 : -1; }
    } else px = 0.5;
    if (toy === 'ball' && ball) stepBall(dt);
    if (toy === 'bubbles') stepBubbles(dt);
    if (toy && p.asleep) stopToy();
    squish = Math.max(0, squish - dt * 3);
    if (visitor) {
      if (now > visitor.until) endPlaydate();
      else {
        if (time > (visitor.next || 0)) { visitor.target = 0.15 + Math.random() * 0.7; visitor.next = time + 2 + Math.random() * 3; }
        const dx = visitor.target - visitor.x;
        if (Math.abs(dx) > 0.005) { visitor.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.2); visitor.face = dx > 0 ? 1 : -1; }
        visitor.squish = Math.max(0, (visitor.squish || 0) - dt * 3);
        if (Math.abs(visitor.x - px) < 0.12 && Math.random() < dt * 0.6) hearts(vw.w * (visitor.x + px) / 2, vw.floor - vw.s * 0.75);
      }
    }

    ctx.clearRect(0, 0, vw.w, vw.h);
    drawRoom();
    // bath tub behind the pet
    if (bath) {
      const x = petX();
      ctx.fillStyle = '#e8f6ff'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(x - vw.s * 0.45, vw.floor - vw.s * 0.3, vw.s * 0.9, vw.s * 0.32, [0, 0, 40, 40]); ctx.fill(); ctx.stroke();
    }
    if (visitor) { const vi = PetArt.draw(ctx, { species: visitor.pet.species, stage: visitor.pet.stage, mood: 'happy', x: vw.w * visitor.x, y: vw.floor, s: vw.s * 0.9, t: time + 1.3, face: visitor.face, squish: visitor.squish, noCrown: !!(visitor.pet.outfit && visitor.pet.outfit.top) }); wear(ctx, visitor.pet, vi); }
    const info = PetArt.draw(ctx, {
      species: p.species, stage: p.stage, mood, x: petX(), y: vw.floor, s: p.stage === 'egg' ? vw.s * 0.9 : vw.s, t: time, face, squish, eggTaps: p.eggTaps,
      dirt: p.stage === 'egg' ? 0 : (60 - p.needs.clean) / 60, noCrown: !!(p.outfit && p.outfit.top),
    });
    if (p.stage !== 'egg') wear(ctx, p, info);
    if (info) head = { x: info.headX, y: info.headY };
    else head = { x: petX(), y: vw.floor - vw.s * 0.8 };
    { const bb = $('#bubble'); if (bb.classList.contains('show')) { bb.style.left = `${head.x}px`; bb.style.top = `${head.y - vw.s * 0.32}px`; } }
    if (bath) {
      // bubbles in the tub, and a sponge to rub with
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(petX() - vw.s * 0.38 + i * vw.s * 0.095, vw.floor - vw.s * 0.3 + Math.sin(time * 3 + i) * 4, vw.s * 0.07, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.save();
      ctx.beginPath(); ctx.roundRect(petX() - vw.s * 0.45, vw.floor - vw.s * 0.3, vw.s * 0.9, vw.s * 0.32, [0, 0, 40, 40]);
      ctx.fillStyle = '#cfefff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
      if (lastRub && rubbing) { ctx.font = '48px "Noto Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🧽', lastRub.x, lastRub.y); }
    }
    // toys
    if (ball) {
      const r = vw.s * 0.09;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2); ctx.fillStyle = '#d4ff3a'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(ball.x - r * 0.9, ball.y, r * 0.9, -0.9, 0.9); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    }
    for (const b of floaters) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 235, 255, 0.35)'; ctx.fill();
      ctx.strokeStyle = `hsl(${(time * 80 + b.wob * 60) % 360}, 80%, 65%)`; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    }
    // sleeping Zzz
    if (mood === 'asleep') {
      ctx.font = `700 ${Math.round(vw.s * 0.12)}px "Fredoka", sans-serif`;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const k = (time * 0.4 + i / 3) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.strokeText('Z', head.x + 30 + k * 40, head.y - 20 - k * 80);
        ctx.fillText('Z', head.x + 30 + k * 40, head.y - 20 - k * 80);
      }
      ctx.globalAlpha = 1;
    }
    // food or medicine on its way
    if (flying) {
      flying.t += dt / 0.55;
      const u = Math.min(1, flying.t);
      const sx = vw.w / 2, sy = vw.h + 20;
      const x = sx + (head.x - sx) * u, y = sy + (head.y + 20 - sy) * u - Math.sin(u * Math.PI) * 120;
      ctx.font = `${Math.round(vw.s * 0.22)}px "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(flying.emoji, x, y);
      if (flying.t >= 1) { const then = flying.then; flying = null; squish = 0.8; then(); }
    }
    // lights off: darkness
    if (p.lightsOff) { ctx.fillStyle = 'rgba(10, 12, 40, 0.55)'; ctx.fillRect(0, 0, vw.w, vw.h); }
    // little particles
    for (const b of bits) {
      b.vy += (b.kind === 'crumb' ? 600 : b.kind === 'bubble' ? -20 : 120) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, b.life));
      if (b.kind === 'heart' || b.kind === 'star') { ctx.font = '26px "Noto Color Emoji", sans-serif'; ctx.fillText(b.kind === 'heart' ? '💖' : '✨', b.x, b.y); }
      else if (b.kind === 'bubble') { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 2; ctx.stroke(); }
      else { ctx.fillStyle = '#c98b56'; ctx.fillRect(b.x, b.y, 6, 6); }
    }
    ctx.globalAlpha = 1;
    bits = bits.filter(b => b.life > 0);
    if (bits.length > 200) bits.splice(0, bits.length - 200);
  }

  // ---------- grown-ups (behind the sum)
  function openPanel() {
    const seg = (sel, items, cur, set) => {
      const el = $(sel);
      el.innerHTML = '';
      for (const [v, label] of items) {
        const b = document.createElement('button');
        b.textContent = label;
        b.className = cur === v ? 'on' : '';
        b.addEventListener('click', () => { set(v); save(); openPanel(); });
        el.appendChild(b);
      }
    };
    seg('#t-holiday', [[false, 'At home'], [true, '🏖️ On holiday']], state.holiday, v => {
      state.holiday = v;
      const p = pet(); if (p) p.lastTick = Date.now();
      Guard.count(v ? '🏖️ holiday on' : '🏖️ holiday off');
    });
    seg('#t-speed', [['gentle', 'Gentle'], ['normal', 'Normal']], state.speed, v => { state.speed = v; });
    const p = pet();
    $('#t-name').value = p.name || '';
    const list = $('#t-pets');
    list.innerHTML = '';
    for (const f of state.pets) {
      const row = document.createElement('div');
      row.className = 'p';
      row.innerHTML = `<span>${f.stage === 'egg' ? '🥚 Egg' : `${Care.SPECIES[f.species].emoji} ${escape(f.name)} — ${f.stage}${f.id === state.active ? ' (at home)' : ''}`}</span>`;
      if (f.id !== state.active) {
        const del = document.createElement('button');
        del.textContent = '👋';
        del.title = 'Say goodbye (remove)';
        del.addEventListener('click', () => {
          if (!confirm(`Say goodbye to ${f.name || 'this egg'}? This can't be undone.`)) return;
          state.pets = state.pets.filter(x => x.id !== f.id);
          save(); openPanel();
        });
        row.appendChild(del);
      }
      list.appendChild(row);
    }
    $('#t-egg').disabled = state.pets.length >= Care.MAX_FRIENDS || p.stage === 'egg';
    $('#t-egg-note').textContent = state.pets.length >= Care.MAX_FRIENDS ? `The Friends' House is full (${Care.MAX_FRIENDS}). Say goodbye to one to make room.`
      : 'New eggs normally appear once a pet is all grown up (about 5 days of good care).';
    $('#panel').hidden = false;
  }
  $('#t-rename').addEventListener('click', () => { const n = $('#t-name').value.trim(); if (n && pet().stage !== 'egg') { pet().name = n.slice(0, 12); save(); showNeeds(); } });
  $('#t-egg').addEventListener('click', () => {
    if (!Care.takeEgg(state, Date.now(), true)) return;
    endPlaydate(true);
    save(); showNeeds(); $('#panel').hidden = true;
  });
  $('#settings').addEventListener('click', () => { Sound.unlock(); Gate.ask(openPanel); });
  $('#panel-close').addEventListener('click', () => { $('#panel').hidden = true; update(false); });

  // ---------- buttons
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'toys') { Sound.unlock(); Sound.pop(); $('#toys').hidden = !$('#toys').hidden; if ($('#toys').hidden) stopToy(); showNeeds(); return; }
    act(b.dataset.act);
  }));
  document.querySelectorAll('[data-toy]').forEach(b => b.addEventListener('click', () => startToy(b.dataset.toy)));
  $('#friends').addEventListener('click', openHouse);
  $('#house-close').addEventListener('click', () => { Sound.pop(); $('#house').hidden = true; });
  const muteBtn = $('#mute');
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') update(true); else save(); });
  // Handy for poking at the game from the browser console.
  window.myPet = { get state() { return state; }, act, startToy, get ball() { return ball; }, get floaters() { return floaters; }, update, openHouse, vw, get px() { return px; }, tapEgg, get visitor() { return visitor; } };

  layout();
  Guard.round('visit');
  update(true);
  setInterval(() => { if (document.visibilityState === 'visible') update(false); }, 10000);
  // while napping, update often so the energy bar visibly fills and it wakes on time
  setInterval(() => { const q = pet(); if (document.visibilityState === 'visible' && q.asleep && !Care.isNight(Date.now(), bed())) update(false); }, 1000);
  if (pet().stage === 'egg') Sound.intro('Tap the egg to help it hatch!');
  else Sound.intro('Look after your pet! Feed it, wash it, and turn the light off at bedtime.');
  requestAnimationFrame(loop);
})();
