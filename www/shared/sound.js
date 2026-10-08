// Tiny synthesized sound effects — no audio files needed.
const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('kg-muted') === '1'; } catch (e) {}

  const PRAISE = ['Well done!', 'Good job buddy!'];
  let introState = 'done'; // 'waiting' (not spoken yet) → 'talking' → 'done'
  const introQueue = [];

  function voice(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.pitch = 1.3;
    return u;
  }

  // Words asked for before the instructions started get said after them.
  function flushQueue() {
    while (introQueue.length) speechSynthesis.speak(voice(introQueue.shift()));
  }

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq, to, type = 'sine', dur = 0.2, vol = 0.3, delay = 0, vibrato = 0 }) {
    const c = ac();
    if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    if (vibrato) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = vibrato;
      lg.gain.value = freq * 0.025;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.3);
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.setTargetAtTime(0, t0 + dur * 0.7, dur * 0.12);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.3);
  }

  function noise({ dur = 0.1, vol = 0.2, delay = 0, freq = 1200 }) {
    const c = ac();
    if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  return {
    unlock() { ac(); },
    isMuted: () => muted,
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('kg-muted', m ? '1' : '0'); } catch (e) {}
    },
    // "Toot toot!" steam whistle plus a few chuffs
    toot() {
      for (const [d, len] of [[0, 0.22], [0.28, 0.4]]) {
        tone({ freq: 587, type: 'triangle', dur: len, vol: 0.18, delay: d, vibrato: 7 });
        tone({ freq: 740, type: 'sine', dur: len, vol: 0.14, delay: d, vibrato: 7 });
        noise({ dur: len, vol: 0.04, delay: d, freq: 3000 });
      }
      for (let i = 0; i < 5; i++) noise({ dur: 0.09, vol: 0.25, delay: 0.1 + i * 0.16, freq: 700 });
    },
    // Friendly "boop-boop" when a train is blocked
    bonk() {
      tone({ freq: 330, to: 260, type: 'square', dur: 0.12, vol: 0.12 });
      tone({ freq: 250, to: 180, type: 'square', dur: 0.18, vol: 0.12, delay: 0.14 });
    },
    pop() { tone({ freq: 700, to: 1100, type: 'sine', dur: 0.08, vol: 0.2 }); },
    // Balloon "POP!"
    balloon() {
      noise({ dur: 0.12, vol: 0.5, freq: 1800 });
      tone({ freq: 900 + Math.random() * 300, to: 180, type: 'triangle', dur: 0.12, vol: 0.18 });
    },
    // Little rising note as a line grows one square
    step(n) {
      const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319];
      tone({ freq: scale[n % scale.length], type: 'sine', dur: 0.07, vol: 0.09 });
    },
    // Card flip "whoosh"
    flip() {
      noise({ dur: 0.08, vol: 0.18, freq: 2500 });
      tone({ freq: 500, to: 900, type: 'sine', dur: 0.07, vol: 0.08 });
    },
    // Gentle "oh well" for a wrong guess
    nope() {
      tone({ freq: 440, to: 330, type: 'triangle', dur: 0.18, vol: 0.14 });
      tone({ freq: 330, to: 262, type: 'triangle', dur: 0.24, vol: 0.14, delay: 0.18 });
    },
    // Read a word out loud with the phone's built-in voice.
    // While the game instructions are being read, other words wait their turn.
    say(text) {
      if (muted || !('speechSynthesis' in window)) return;
      if (introState === 'waiting') { introQueue.push(text); return; }
      if (introState !== 'talking') speechSynthesis.cancel();
      speechSynthesis.speak(voice(text));
    },
    // Random cheer for finishing something
    praise() {
      return PRAISE[Math.floor(Math.random() * PRAISE.length)];
    },
    // Read the game's instructions once when the page opens. Android only lets a page
    // talk after it has been touched, so if that's blocked, read them on the first tap.
    intro(text) {
      if (muted || !('speechSynthesis' in window)) return;
      introState = 'waiting';
      let started = false;
      const speak = () => {
        speechSynthesis.cancel();
        const u = voice(text);
        u.onstart = () => { started = true; introState = 'talking'; flushQueue(); };
        u.onend = u.onerror = () => { if (started) introState = 'done'; };
        speechSynthesis.speak(u);
      };
      speak();
      setTimeout(() => {
        if (started) return;
        window.addEventListener('pointerdown', () => {
          if (started) return;
          speak();
          // No voice on this device? Don't hold up the other words.
          setTimeout(() => { if (!started) { introState = 'done'; flushQueue(); } }, 2000);
        }, { once: true, capture: true });
      }, 700);
    },
    sparkle() {
      [1319, 1568, 2093].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.15, vol: 0.1, delay: i * 0.07 }));
    },
    // Happy fanfare for clearing the board
    cheer() {
      const notes = [523, 659, 784, 1047, 784, 1047];
      const times = [0, 0.12, 0.24, 0.36, 0.52, 0.64];
      notes.forEach((f, i) => {
        const last = i === notes.length - 1;
        tone({ freq: f, type: 'triangle', dur: last ? 0.6 : 0.14, vol: 0.22, delay: times[i], vibrato: last ? 6 : 0 });
        tone({ freq: f * 2, type: 'sine', dur: last ? 0.6 : 0.14, vol: 0.06, delay: times[i] });
      });
    },
  };
})();
