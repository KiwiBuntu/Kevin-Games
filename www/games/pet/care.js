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
  const GROW_DAYS = { baby: 2, kid: 3 };   // good-care days needed to move on from each stage
  const MAX_FRIENDS = 6;
  const FLOOR = 15;                        // needs never drop below this on their own
  const STEP = 10 * 60 * 1000;             // catch up in 10-minute steps
  // points lost per hour while awake
  const DRAIN = { gentle: { food: 4, fun: 4, clean: 2, energy: 4 }, normal: { food: 7, fun: 6, clean: 3, energy: 6 } };
  const POOP_EVERY = { gentle: 4, normal: 3 }; // hours between poops after eating

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
      careDays: [], todayCare: {}, lastTick: now, stagesSeen: ['egg'],
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
      n.food = clamp(n.food - rate.food * h * slow, Math.min(n.food, floor));
      n.fun = clamp(n.fun - rate.fun * h * slow, Math.min(n.fun, floor));
      n.clean = clamp(n.clean - (rate.clean + pet.poops * 3) * h * slow, Math.min(n.clean, floor));
      n.energy = pet.asleep ? clamp(n.energy + 25 * h) : clamp(n.energy - rate.energy * h * slow, Math.min(n.energy, floor));
      // poops a while after eating (not while asleep); at most 3 waiting
      if (!pet.asleep) {
        pet.sinceMeal += h;
        if (pet.sinceMeal >= POOP_EVERY[state.speed] && pet.poops < 3) { pet.poops++; pet.sinceMeal = 0; }
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
    if (away > 8 * 3600000) notes.missed = true;
    if (pet.poops > startPoops) notes.newPoops = pet.poops - startPoops;
    return notes;
  }

  // A "good care day" = he fed it and it was happy and clean at some point that day.
  function checkCareDay(state, pet, now) {
    const k = dayKey(now);
    const tc = pet.todayCare.day === k ? pet.todayCare : (pet.todayCare = { day: k });
    if (pet.needs.fun >= 60 && pet.needs.clean >= 60 && pet.needs.food >= 50) tc.happy = true;
    if (tc.fed && tc.happy && !pet.careDays.includes(k)) {
      pet.careDays.push(k);
      if (pet.careDays.length > 60) pet.careDays.shift();
      tc.counted = true;
      return grow(state, pet);
    }
    return null;
  }

  // Ready to grow? (counts good-care days since reaching the current stage)
  function grow(state, pet) {
    const need = GROW_DAYS[pet.stage];
    if (!need) return null;
    pet.stageDays = (pet.stageDays || 0) + 1;
    if (pet.stageDays < need) return null;
    pet.stage = pet.stage === 'baby' ? 'kid' : 'grown';
    pet.stageDays = 0;
    pet.stagesSeen.push(pet.stage);
    pet.grewAt = Date.now();
    if (pet.stage === 'grown') state.eggReady = true;
    return pet.stage;
  }

  // ---------- looking after (each returns { ok, say, ... })
  function feed(state, pet, kind, now) {
    if (pet.asleep) return { ok: false, say: 'Shh… sleeping' };
    const n = pet.needs;
    if (kind === 'meal') {
      if (n.food >= 95) return { ok: false, say: "I'm full!" };
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
    const grew = checkCareDay(state, pet, now);
    return { ok: true, say: kind === 'meal' ? 'Yum yum!' : 'Sweet!', grew };
  }

  function scrub(pet, amount) { pet.needs.clean = clamp(pet.needs.clean + amount); return pet.needs.clean; }

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
    pet.stageDays = 0;
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

  return {
    SPECIES, STAGES, MAX_FRIENDS, fresh, newPet, activePet, isNight, tick, feed, scrub, cleanPoop, medicine, lights, tickle,
    mood, hatch, takeEgg, bringHome, canTakeEgg, dayKey,
  };
})();

if (typeof module !== 'undefined') module.exports = Care;
