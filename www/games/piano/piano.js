// Animal Piano: a rainbow xylophone. Tap (or slide along) the bars to play.
(() => {
  const keysEl = document.getElementById('keys');
  const modeBtn = document.getElementById('mode');
  const songBtn = document.getElementById('song');
  const listenBtn = document.getElementById('listen');
  const muteBtn = document.getElementById('mute');

  // Low to high: C D E F G A B C. Bigger animals get the lower notes.
  const KEYS = [
    { freq: 261.63, colour: '#ff4d4d', animal: '🐮', sound: 'cow', noise: 'Moo!' },
    { freq: 293.66, colour: '#ff9f1c', animal: '🐷', sound: 'pig', noise: 'Oink!' },
    { freq: 329.63, colour: '#ffd60a', animal: '🐑', sound: 'sheep', noise: 'Baa!' },
    { freq: 349.23, colour: '#8ac926', animal: '🐶', sound: 'dog', noise: 'Woof!' },
    { freq: 392.0, colour: '#2ec4b6', animal: '🦆', sound: 'duck', noise: 'Quack!' },
    { freq: 440.0, colour: '#3a86ff', animal: '🐱', sound: 'cat', noise: 'Meow!' },
    { freq: 493.88, colour: '#8338ec', animal: '🐸', sound: 'frog', noise: 'Ribbit!' },
    { freq: 523.25, colour: '#ff5fa2', animal: '🐭', sound: 'mouse', noise: 'Squeak!' },
  ];

  // Songs as key numbers (0 = low C … 7 = high C).
  const SONGS = [
    { icon: '⭐', name: 'Twinkle twinkle little star', notes: [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0, 4, 4, 3, 3, 2, 2, 1, 4, 4, 3, 3, 2, 2, 1, 0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0] },
    { icon: '🐑', name: 'Mary had a little lamb', notes: [2, 1, 0, 1, 2, 2, 2, 1, 1, 1, 2, 4, 4, 2, 1, 0, 1, 2, 2, 2, 2, 1, 1, 2, 1, 0] },
    { icon: '🚣', name: 'Row row row your boat', notes: [0, 0, 0, 1, 2, 2, 1, 2, 3, 4, 7, 7, 7, 4, 4, 4, 2, 2, 2, 0, 0, 0, 4, 3, 2, 1, 0] },
  ];

  // 🎵 notes → 🐮 real animal recordings → 🗣️ the phone's voice at a different pitch for each bar
  const MODES = ['🎵', '🐮', '🗣️'];
  let mode = 0;
  try { mode = Number(localStorage.getItem('kg-piano-mode')) || 0; } catch (e) {}
  if (!MODES[mode]) mode = 0;
  const clips = {};
  KEYS.forEach(k => Sound.loadClip(`sounds/${k.sound}.mp3`).then(b => { clips[k.sound] = b; }));
  let songIdx = -1; // -1 = free play
  let step = 0;
  let listening = false;
  const els = [];

  KEYS.forEach((k, i) => {
    const el = document.createElement('div');
    el.className = 'key';
    el.style.setProperty('--c', k.colour);
    el.style.setProperty('--i', i);
    el.innerHTML = `<span class="animal">${k.animal}</span><span class="bubble"></span>`;
    keysEl.appendChild(el);
    els.push(el);
  });

  function play(i, fromSong) {
    const k = KEYS[i], el = els[i];
    Sound.note(k.freq);
    if (mode === 1) Sound.clip(clips[k.sound]);
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(el.offT);
    el.offT = setTimeout(() => el.classList.remove('on'), 180);
    if (mode === 2) {
      // Each animal speaks at its own pitch: low cow, squeaky mouse.
      Sound.say(k.noise, { pitch: 0.4 + i * 0.22, rate: 1.1 });
    }
    if (mode) {
      el.querySelector('.bubble').textContent = k.noise;
    } else {
      el.querySelector('.bubble').textContent = '♪';
    }
    el.classList.add('talk');
    clearTimeout(el.talkT);
    el.talkT = setTimeout(() => el.classList.remove('talk'), 700);
    if (!fromSong) follow(i);
  }

  // ---------- song following: the next bar to play glows
  function showGlow() {
    els.forEach(e => e.classList.remove('glow'));
    if (songIdx >= 0 && !listening) els[SONGS[songIdx].notes[step]].classList.add('glow');
  }

  function follow(i) {
    if (songIdx < 0 || listening) return;
    const song = SONGS[songIdx];
    if (i !== song.notes[step]) return; // any other bar just plays its note
    step++;
    if (step >= song.notes.length) {
      step = 0;
      Guard.count(`🎶 played ${song.name}`);
      els.forEach(e => e.classList.remove('glow'));
      setTimeout(() => {
        Sound.cheer();
        Celebrate.burst();
        setTimeout(() => Sound.say(Sound.praise()), 900);
        setTimeout(showGlow, 2500);
      }, 400);
      return;
    }
    showGlow();
  }

  function listen() {
    if (songIdx < 0 || listening) return;
    listening = true;
    showGlow();
    const song = SONGS[songIdx];
    song.notes.forEach((n, j) => setTimeout(() => play(n, true), j * 420));
    setTimeout(() => { listening = false; step = 0; showGlow(); }, song.notes.length * 420 + 300);
  }

  // ---------- touch: tap a bar, or slide a finger along them
  const lastKey = new Map();
  function keyAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const key = el && el.closest('.key');
    return key ? els.indexOf(key) : -1;
  }
  keysEl.addEventListener('pointerdown', e => {
    Sound.unlock();
    const i = keyAt(e.clientX, e.clientY);
    lastKey.set(e.pointerId, i);
    if (i >= 0) play(i);
  });
  keysEl.addEventListener('pointermove', e => {
    if (!lastKey.has(e.pointerId)) return;
    const i = keyAt(e.clientX, e.clientY);
    if (i >= 0 && i !== lastKey.get(e.pointerId)) play(i);
    lastKey.set(e.pointerId, i);
  });
  const lift = e => lastKey.delete(e.pointerId);
  keysEl.addEventListener('pointerup', lift);
  keysEl.addEventListener('pointercancel', lift);

  // ---------- buttons
  modeBtn.addEventListener('click', () => {
    Sound.unlock();
    mode = (mode + 1) % MODES.length;
    try { localStorage.setItem('kg-piano-mode', String(mode)); } catch (e) {}
    modeBtn.textContent = MODES[mode];
    Sound.pop();
  });
  songBtn.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    songIdx = songIdx + 1 >= SONGS.length ? -1 : songIdx + 1;
    step = 0;
    songBtn.textContent = songIdx < 0 ? '🎶' : SONGS[songIdx].icon;
    listenBtn.hidden = songIdx < 0;
    showGlow();
    if (songIdx >= 0) Sound.say(`${SONGS[songIdx].name}. Follow the shiny bar!`);
  });
  listenBtn.addEventListener('click', () => { Sound.unlock(); listen(); });
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  // Handy for poking at the game from the browser console.
  window.animalPiano = { get step() { return step; }, get songIdx() { return songIdx; }, SONGS };

  modeBtn.textContent = MODES[mode];
  Sound.intro('Tap the bars to make music! Press the animal button to hear the animals.');
})();
