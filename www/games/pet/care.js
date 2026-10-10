// My Pet: the looking-after rules. No DOM code, so it can be tested with node.
//
// Needs go from 0 to 100: food, fun, clean, energy, health.
// Real time, but gentle: while he's away needs never fall below FLOOR, everything slows
// right down at night (or stops with the lights off), and holiday mode stops it all.
// Only the pet in the room needs looking after; friends in the Friends' House are frozen.
const Care = (() => {
  const SPECIES = {
    dino: { name: 'Dino', emoji: '🦖' }, kitty: { name: 'Kitty', emoji: '🐱' }, dragon: { name: 'Dragon', emoji: '🐉' },
    bunny: { name: 'Bunny', emoji: '🐰' }, doggie: { name: 'Doggie', emoji: '🐶' },
  };
  const STAGES = ['egg', 'baby', 'kid', 'grown'];
  const MAX_FRIENDS = 6;
  const FLOOR = 15;                        // needs never drop below this on their own
  const STEP = 10 * 60 * 1000;             // catch up in 10-minute steps
  // points lost per hour while awake
  const DRAIN = { gentle: { food: 4, fun: 4, clean: 2, energy: 4 }, normal: { food: 7, fun: 6, clean: 3, energy: 6 } };
  const POOP_EVERY = { gentle: 4, normal: 3 }; // hours between poops after eating
  // While he's playing, things happen much faster so there's always something to do:
  // points lost per MINUTE (each need takes ~7–20 minutes to start asking), a poop ~4 min after eating.
  const PLAY = { gentle: { food: 7, fun: 9, clean: 3, energy: 4 }, normal: { food: 9, fun: 11, clean: 4, energy: 5 } };
  const PLAY_POOP_MIN = 4;
  const CALM_MS = 40 * 1000;               // after looking after it, it's content for a little while
  const LOVE_TO_GROW = 100;

  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  function fresh() {
    return { v: 1, active: null, pets: [], eggReady: true, holiday: false, speed: 'gentle', nextId: 1 };
  }

  function newPet(state, now) {
    const pet = {
      id: state.nextId++, species: null, name: '', stage: 'egg', born: now, hatched: 0, eggTaps: 0,
      needs: { food: 80, fun: 80, clean: 100, energy: 90, health: 100 },
      poops: 0, sinceMeal: 0, treats: 0, ache: false, sick: false, asleep: false, lightsOff: false,
      careDays: [], todayCare: {}, lastTick: now, stagesSeen: ['egg'], love: 0, grewDay: '', calmUntil: 0, playMeal: 0, outfit: {},
    };
    state.pets.push(pet);
    return pet;
  }

  const activePet = state => state.pets.find(p => p.id === state.active) || null;

  // ---------- night: the grown-ups' bedtime if set, otherwise 7:30pm to 7am
  function isNight(now, bed) {
    const d = new Date(now);
    const m = d.getHours() * 60 + d.getMinutes();
    const toM = t => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
    const a = bed && bed.from ? toM(bed.from) : 19 * 60 + 30;
    const b = bed && bed.to ? toM(bed.to) : 7 * 60;
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }

  // ---------- time passing
  // Moves the active pet forward to `now`. Returns notes about what happened while away.
  function tick(state, now, bed, opts = {}) {
    const pet = activePet(state);
    if (!pet || pet.stage === 'egg') { if (pet) pet.lastTick = now; return {}; }
    if (state.holiday) { pet.lastTick = now; return {}; }
    const away = now - pet.lastTick;
    const live = opts.live; // true while he's watching (no floor needed then)
    const rate = DRAIN[state.speed] || DRAIN.gentle;
    let t = pet.lastTick;
    const startPoops = pet.poops;
    while (t < now) {
      const dt = Math.min(STEP, now - t);
      const h = dt / 3600000;
      const night = isNight(t, bed);
      // sleeping: lights off at night, or a nap when tired with the lights off
      pet.asleep = pet.lightsOff && (night || pet.needs.energy < 60 || pet.asleep);
      if (pet.asleep && pet.needs.energy >= 95 && !night) { pet.asleep = false; pet.lightsOff = false; pet.wokeAt = t; } // good morning!
      const slow = pet.asleep ? 0.1 : night ? 0.4 : 1;
      const floor = live ? 0 : FLOOR;
      const n = pet.needs;
      // playing: per-minute rates, paused just after care, and gentler if it's already asking for two things
      let r = rate, per = h;
      if (live) {
        r = PLAY[state.speed] || PLAY.gentle;
        const asking = [n.food, n.fun, n.clean].filter(v => v < 40).length;
        per = (t < (pet.calmUntil || 0) ? 0 : h * 60) * (asking >= 2 ? 0.3 : 1);
      }
      n.food = clamp(n.food - r.food * per * slow, Math.min(n.food, floor));
      n.fun = clamp(n.fun - r.fun * per * slow, Math.min(n.fun, floor));
      n.clean = clamp(n.clean - (r.clean + pet.poops * (live ? 1 : 3)) * per * slow, Math.min(n.clean, floor));
      n.energy = pet.asleep ? clamp(n.energy + (live ? 45 * 60 : 25) * h) : clamp(n.energy - r.energy * per * slow, Math.min(n.energy, floor));
      // poops a while after eating (not while asleep); at most 3 waiting
      if (!pet.asleep) {
        pet.sinceMeal += h;
        if (pet.sinceMeal >= POOP_EVERY[state.speed] && pet.poops < 3) { pet.poops++; pet.sinceMeal = 0; }
        if (live && pet.playMeal > 0) {
          pet.playMeal += h * 60;
          if (pet.playMeal >= PLAY_POOP_MIN && pet.poops < 2) { pet.poops++; pet.playMeal = 0; }
        }
      }
      // treats wear off
      pet.treats = Math.max(0, pet.treats - h * 0.5);
      if (pet.ache && pet.treats < 1) pet.ache = false;
      // health: slips if hungry or very messy for a long time; gets poorly below 40
      const neglect = (n.food < 25 ? 1 : 0) + (n.clean < 25 ? 1 : 0) + (pet.poops >= 3 ? 1 : 0);
      n.health = neglect ? clamp(n.health - neglect * 2 * h, live ? 0 : 35) : clamp(n.health + 3 * h);
      if (n.health < 40) pet.sick = true;
      t += dt;
    }
    pet.lastTick = now;
    checkCareDay(state, pet, now);
    const notes = {};
    const g = tryGrow(state, pet, now);
    if (g) notes.grew = g;
    if (away > 8 * 3600000) notes.missed = true;
    if (pet.poops > startPoops) notes.newPoops = pet.poops - startPoops;
    return notes;
  }

  // A "good care day" = he fed it and it was happy and clean at some point that day (kept for the stats).
  function checkCareDay(state, pet, now) {
    const k = dayKey(now);
    const tc = pet.todayCare.day === k ? pet.todayCare : (pet.todayCare = { day: k });
    if (pet.needs.fun >= 60 && pet.needs.clean >= 60 && pet.needs.food >= 50) tc.happy = true;
    if (tc.fed && tc.happy && !pet.careDays.includes(k)) {
      pet.careDays.push(k);
      if (pet.careDays.length > 60) pet.careDays.shift();
    }
    return null;
  }

  // Growing up: love fills up from looking after what it actually needs.
  // A full heart means growing — but only one stage per day (at least a night in between).
  function addLove(state, pet, amount, now) {
    if (pet.stage === 'egg' || pet.stage === 'grown') return null;
    pet.love = Math.min(LOVE_TO_GROW, (pet.love || 0) + amount);
    pet.calmUntil = now + CALM_MS;
    return tryGrow(state, pet, now);
  }
  function tryGrow(state, pet, now) {
    if (pet.stage !== 'baby' && pet.stage !== 'kid') return null;
    if ((pet.love || 0) < LOVE_TO_GROW || pet.grewDay === dayKey(now)) return null;
    pet.stage = pet.stage === 'baby' ? 'kid' : 'grown';
    pet.love = 0;
    pet.grewDay = dayKey(now);
    pet.stagesSeen.push(pet.stage);
    pet.grewAt = now;
    if (pet.stage === 'grown') state.eggReady = true;
    return pet.stage;
  }
  // Full heart but already grew today → "ready tomorrow"
  const readyTomorrow = (pet, now) => (pet.stage === 'baby' || pet.stage === 'kid') && (pet.love || 0) >= LOVE_TO_GROW && pet.grewDay === dayKey(now);

  // ---------- looking after (each returns { ok, say, ... })
  function feed(state, pet, kind, now) {
    if (pet.asleep) return { ok: false, say: 'Shh… sleeping' };
    const n = pet.needs;
    const needed = n.food < 60;
    if (kind === 'meal') {
      if (n.food >= 95) return { ok: false, say: "I'm full!" };
      pet.playMeal = 0.001; // starts the "poop soon" timer while playing
      n.food = clamp(n.food + 35);
      n.health = clamp(n.health + 3);
      pet.sinceMeal = Math.min(pet.sinceMeal, 0);
    } else {
      n.food = clamp(n.food + 10);
      n.fun = clamp(n.fun + 15);
      pet.treats += 1;
      if (pet.treats >= 4 && !pet.ache) { pet.ache = true; n.health = clamp(n.health - 10); return { ok: true, ache: true, say: 'Ow… my tummy hurts!' }; }
    }
    (pet.todayCare.day === dayKey(now) ? pet.todayCare : (pet.todayCare = { day: dayKey(now) })).fed = true;
    checkCareDay(state, pet, now);
    const grew = addLove(state, pet, needed ? (kind === 'meal' ? 14 : 6) : 2, now);
    return { ok: true, say: kind === 'meal' ? 'Yum yum!' : 'Sweet!', grew };
  }

  function scrub(pet, amount) { pet.needs.clean = clamp(pet.needs.clean + amount); return pet.needs.clean; }
  // a whole bath, counted once when it gets squeaky clean
  function bathed(state, pet, wasDirty, now) { return addLove(state, pet, wasDirty ? 12 : 3, now); }

  function cleanPoop(pet) {
    if (pet.poops <= 0) return false;
    pet.poops--;
    pet.needs.clean = clamp(pet.needs.clean + 8);
    return true;
  }

  function medicine(pet) {
    if (!pet.sick && !pet.ache) return { ok: false, say: "I'm not poorly!" };
    pet.sick = false;
    pet.ache = false;
    pet.treats = 0;
    pet.needs.health = clamp(Math.max(pet.needs.health, 70));
    return { ok: true, say: 'I feel better!' };
  }

  function lights(state, pet, now, bed) {
    pet.lightsOff = !pet.lightsOff;
    if (pet.lightsOff && (isNight(now, bed) || pet.needs.energy < 60)) pet.asleep = true;
    if (!pet.lightsOff) pet.asleep = false;
    return { asleep: pet.asleep };
  }

  function tickle(pet) {
    if (pet.asleep) return false;
    pet.needs.fun = clamp(pet.needs.fun + 4);
    return true;
  }

  // ---------- what the pet wants most right now (for its face and speech)
  function mood(pet, now, bed) {
    if (pet.stage === 'egg') return 'egg';
    if (pet.asleep) return 'asleep';
    if (pet.sick) return 'sick';
    if (pet.ache) return 'ache';
    const n = pet.needs;
    if (n.food < 30) return 'hungry';
    if (n.energy < 25 || isNight(now, bed)) return 'sleepy';
    if (n.clean < 35 || pet.poops >= 2) return 'dirty';
    if (n.fun < 35) return 'sad';
    return n.fun > 70 && n.food > 60 ? 'happy' : 'ok';
  }

  // ---------- the Friends' House
  function hatch(state, pet, species, name, now) {
    pet.species = species;
    pet.name = name;
    pet.stage = 'baby';
    pet.stagesSeen.push('baby');
    pet.hatched = now;
    pet.lastTick = now;
    pet.love = 0;
    pet.grewDay = dayKey(now);
  }

  // Start a new egg (when one is ready). The current pet moves to the Friends' House.
  function takeEgg(state, now, force) {
    if (!force && !state.eggReady) return null;
    if (state.pets.length >= MAX_FRIENDS) return null;
    const cur = activePet(state);
    if (cur) cur.lastTick = now;
    const egg = newPet(state, now);
    state.active = egg.id;
    state.eggReady = false;
    return egg;
  }

  // Bring a friend home: they pick up exactly where they left off.
  function bringHome(state, id, now) {
    const cur = activePet(state);
    if (cur && cur.stage === 'egg') return false; // finish hatching first
    if (cur) cur.lastTick = now;
    const p = state.pets.find(x => x.id === id);
    if (!p) return false;
    state.active = id;
    p.lastTick = now; // frozen while away
    p.lightsOff = false;
    p.asleep = false;
    return true;
  }

  // Can he start a new egg right now?
  function canTakeEgg(state) {
    const cur = activePet(state);
    return state.eggReady && state.pets.length < MAX_FRIENDS && (!cur || cur.stage === 'grown' || state.pets.some(p => p.stage === 'grown'));
  }

  // Playing with a toy: fun up, a little hungrier and more tired.
  function play(state, pet, amount, now) {
    if (pet.asleep) return null;
    const bored = pet.needs.fun < 60;
    pet.needs.fun = clamp(pet.needs.fun + amount);
    pet.needs.energy = clamp(pet.needs.energy - amount * 0.15);
    pet.needs.food = clamp(pet.needs.food - amount * 0.1);
    return addLove(state, pet, bored ? 5 : 1, now);
  }

  return {
    SPECIES, LOVE_TO_GROW, addLove, tryGrow, readyTomorrow, bathed, play, STAGES, MAX_FRIENDS, fresh, newPet, activePet, isNight, tick, feed, scrub, cleanPoop, medicine, lights, tickle,
    mood, hatch, takeEgg, bringHome, canTakeEgg, dayKey,
  };
})();

if (typeof module !== 'undefined') module.exports = Care;
