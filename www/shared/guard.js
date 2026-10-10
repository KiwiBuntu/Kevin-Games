// Grown-up supervision: game locks, time limits and play stats. Everything stays on this device.
// Every page loads this. It's deliberately light: one touch listener and a 5-second timer.
//
// Games tell it a little about what's happening:
//   Guard.round('L12')        a new level/puzzle starts (an unfinished one counts as "quit")
//   Guard.won() / failed()    how it ended (Win.show calls won() automatically)
//   Guard.count('undo')       add one to a counter
//   Guard.best('floor', 23)   remember the highest value seen
const Guard = (() => {
  const GAMES = [
    ['trains', '🚂', 'Train Yard'], ['memory', '🃏', 'Memory Match'], ['balloons', '🎈', 'Balloon Pop'],
    ['colours', '🌈', 'Connect Colours'], ['jigsaw', '🧩', 'Jigsaw'], ['shapes', '🔺', 'Shape Sorter'],
    ['dots', '✏️', 'Dot to Dot'], ['maze', '🚗', 'Mazes'], ['piano', '🎹', 'Animal Piano'], ['paint', '🎨', 'Paint'],
    ['garage', '🅿️', 'Parking Garage'], ['read', '📚', 'Read Along'], ['tower', '🦸', 'Number Tower'],
    ['cubes', '🧊', 'Cube Pop'], ['potions', '🧪', 'Potion Sort'], ['candy', '🍬', 'Candy Pop'], ['pet', '🐣', 'My Pet'],
  ].map(([key, emoji, name]) => ({ key, emoji, name }));

  const TICK = 5;          // seconds between checks
  const IDLE = 60;         // no touches for this long = not playing
  const KEEP_DAYS = 60;

  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // ---------- settings
  const DEFAULTS = { locked: {}, daily: 0, bedFrom: '', bedTo: '', extra: { date: '', mins: 0 } };
  const settings = () => ({ ...DEFAULTS, ...read('kg-guard', {}) });
  const saveSettings = s => write('kg-guard', s);

  // ---------- stats
  let stats = read('kg-stats', null);
  if (!stats || stats.v !== 1) stats = { v: 1, since: Date.now(), games: {}, days: {} };
  const game = key => (stats.games[key] = stats.games[key] || { plays: 0, secs: 0, last: 0, rounds: {}, counts: {}, best: {} });
  let dirty = false;
  function save() {
    if (!dirty) return;
    // keep only recent days
    const keys = Object.keys(stats.days).sort();
    while (keys.length > KEEP_DAYS) delete stats.days[keys.shift()];
    write('kg-stats', stats);
    dirty = false;
  }

  // which game is this page?
  const m = location.pathname.match(/\/games\/([^/]+)\//);
  const key = m ? m[1] : null;

  // ---------- time limits
  const usedToday = () => Object.values(stats.days[today()] || {}).reduce((a, b) => a + b, 0);
  const mins = t => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
  function isBedtime(s = settings(), now = new Date()) {
    if (!s.bedFrom || !s.bedTo) return false;
    const n = now.getHours() * 60 + now.getMinutes(), a = mins(s.bedFrom), b = mins(s.bedTo);
    return a <= b ? n >= a && n < b : n >= a || n < b; // e.g. 19:30 → 07:00 crosses midnight
  }
  function limitLeft(s = settings()) {
    if (!s.daily) return Infinity;
    const extra = s.extra && s.extra.date === today() ? s.extra.mins : 0;
    return (s.daily + extra) * 60 - usedToday();
  }
  // 'bed' | 'time' | null
  function blocked(s = settings()) {
    if (isBedtime(s)) return 'bed';
    if (limitLeft(s) <= 0) return 'time';
    return null;
  }

  // ---------- the "time for a break" screen
  let breakEl = null;
  function showBreak(why) {
    if (breakEl) return;
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
    document.querySelectorAll('audio').forEach(a => a.pause());
    breakEl = document.createElement('div');
    breakEl.className = 'break-sheet';
    breakEl.innerHTML = `<div class="break-card">
      <div class="break-pic">${why === 'bed' ? '🌙😴' : '🛌⏰'}</div>
      <h2>${why === 'bed' ? 'Sleepy time!' : 'Time for a break!'}</h2>
      <p>${why === 'bed' ? 'The games are asleep. See you tomorrow!' : 'Great playing today! The games will be back tomorrow.'}</p>
      <button class="btn break-lock" aria-label="Grown-ups">🔒</button></div>`;
    document.body.appendChild(breakEl);
    breakEl.querySelector('.break-lock').addEventListener('click', () => {
      if (typeof Gate === 'undefined') return;
      Gate.ask(() => {
        // a grown-up can give 15 more minutes today
        const s = settings();
        s.extra = { date: today(), mins: (s.extra && s.extra.date === today() ? s.extra.mins : 0) + 15 };
        if (isBedtime(s)) { s.bedSkip = today(); }
        saveSettings(s);
        breakEl.remove();
        breakEl = null;
      });
    });
    if (typeof Sound !== 'undefined') setTimeout(() => Sound.say(why === 'bed' ? 'Sleepy time! See you tomorrow.' : 'Time for a break! Great playing today.'), 300);
  }
  const checkBlock = () => {
    if (location.pathname.includes('/grown-ups/')) return; // never lock grown-ups out
    const s = settings();
    let why = blocked(s);
    if (why === 'bed' && s.bedSkip === today()) why = limitLeft(s) <= 0 ? 'time' : null;
    if (why) showBreak(why);
  };

  // ---------- counting play time
  let lastInput = Date.now();
  const touched = () => { lastInput = Date.now(); };
  // a locked game can't be opened, even from a bookmark
  const lockedOut = key && settings().locked[key];
  if (lockedOut) location.replace('../../index.html');
  if (key && !lockedOut) {
    window.addEventListener('pointerdown', touched, { capture: true, passive: true });
    window.addEventListener('keydown', touched, { capture: true, passive: true });
    const g = game(key);
    g.plays++;
    g.last = Date.now();
    dirty = true;
    let sinceSave = 0;
    setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE * 1000 && !breakEl) {
        g.secs += TICK;
        if (current) current.secs += TICK;
        const d = (stats.days[today()] = stats.days[today()] || {});
        d[key] = (d[key] || 0) + TICK;
        dirty = true;
      }
      if ((sinceSave += TICK) >= 30) { sinceSave = 0; save(); }
      checkBlock();
    }, TICK * 1000);
    const leave = () => { if (current) end('quit'); save(); };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  }
  // check straight away once the page is ready (also on the home page)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checkBlock); else setTimeout(checkBlock, 0);

  // ---------- rounds and counters
  let current = null; // { label, secs }
  function end(outcome) {
    if (!current || !key) return;
    const r = (game(key).rounds[current.label] = game(key).rounds[current.label] || { tries: 0, won: 0, failed: 0, quit: 0, secs: 0 });
    r[outcome]++;
    if (outcome === 'won') r.secs += current.secs;
    current = null;
    dirty = true;
  }
  function round(label) {
    if (!key) return;
    if (current) end('quit');
    label = String(label);
    const g = game(key);
    const r = (g.rounds[label] = g.rounds[label] || { tries: 0, won: 0, failed: 0, quit: 0, secs: 0 });
    r.tries++;
    current = { label, secs: 0 };
    dirty = true;
  }
  function count(name, n = 1) {
    if (!key) return;
    const c = game(key).counts;
    if (c[name] === undefined && Object.keys(c).length >= 300) return; // keep it small
    c[name] = (c[name] || 0) + n;
    dirty = true;
  }
  function best(name, value) {
    if (!key) return;
    const b = game(key).best;
    if (!(b[name] >= value)) { b[name] = value; dirty = true; }
  }

  return {
    GAMES, key, today, settings, saveSettings, blocked, isBedtime, limitLeft, usedToday,
    round, won: () => end('won'), failed: () => end('failed'), count, best,
    get stats() { save(); return stats; },
    resetStats() { stats = { v: 1, since: Date.now(), games: {}, days: {} }; dirty = true; save(); },
  };
})();
