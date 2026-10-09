// Read Along: a bookshelf of stories that are read aloud with the words lighting up.
// Books are kept on this device only (IndexedDB). Grown-ups add books behind a sum.
(() => {
  const $ = s => document.querySelector(s);
  const SPEEDS = { slow: 0.7, normal: 0.95, fast: 1.2 };
  const EMOJIS = ['📖', '❤️', '🦇', '🐊', '🚂', '🚗', '🚀', '🦕', '🐻', '🐶', '🐱', '🐰', '🦁', '🐘', '🐙', '🐠', '🦄', '🧚', '🏰', '🌳', '🌈', '⭐', '🌙', '☀️', '🍎', '🎈', '⚽'];
  const COLOURS = ['#ff4d4d', '#ff9f1c', '#e0b400', '#6aa31d', '#2ec4b6', '#3a86ff', '#8338ec', '#ff5fa2', '#3d405b'];


  // ---------- storage (this device only)
  const DB = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('kg-read', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('books', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('books', mode);
      const req = fn(t.objectStore('books'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    }));
    return {
      all: () => run('readonly', s => s.getAll()),
      put: b => run('readwrite', s => s.put(b)),
      del: id => run('readwrite', s => s.delete(id)),
    };
  })();

  const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // ---------- voices
  let voices = [];
  function loadVoices() {
    return new Promise(res => {
      if (!('speechSynthesis' in window)) return res([]);
      const got = () => { voices = speechSynthesis.getVoices(); if (voices.length) res(voices); };
      got();
      if (voices.length) return;
      speechSynthesis.addEventListener('voiceschanged', got);
      setTimeout(() => res(voices), 1500);
    });
  }
  // The book's own voice if this device has it, otherwise the closest English one.
  function voiceFor(book) {
    const byName = voices.find(v => v.name === book.voiceName);
    if (byName) return byName;
    const prefs = [book.voiceLang, 'en-NZ', 'en-AU', 'en-GB', 'en-US', 'en'].filter(Boolean);
    for (const p of prefs) {
      const v = voices.find(x => x.lang.replace('_', '-').toLowerCase().startsWith(p.toLowerCase()));
      if (v) return v;
    }
    return voices[0] || null;
  }

  // ---------- bookshelf
  let books = [];

  async function showShelf() {
    stopReading();
    $('#reader').hidden = true;
    $('#shelf').hidden = false;
    books = await DB.all().catch(() => []);
    // Add any default books this device hasn't had yet (deleted ones stay deleted).
    let seeded = [];
    try { seeded = JSON.parse(store.get('kg-read-defaults', '[]')); } catch (e) {}
    if (store.get('kg-read-seeded', '0') === '1' && !seeded.includes('train')) seeded.push('train'); // older versions
    for (const d of DefaultBooks) {
      // Already have it? Bring it up to date if the default has been changed since.
      const mine = books.find(b => b.defaultKey === d.key) ||
        books.find(b => !b.defaultKey && b.title === Story.parse(d.text).title); // copies from before versions
      if (mine) {
        if (!mine.edited && (mine.defaultVersion || 1) < (d.version || 1) && mine.text !== d.text) {
          Object.assign(mine, { text: d.text, title: Story.parse(d.text).title, page: 0, sentence: 0, finished: false });
        }
        if (mine.defaultKey !== d.key || mine.defaultVersion !== (d.version || 1)) {
          mine.defaultKey = d.key;
          mine.defaultVersion = d.version || 1;
          await DB.put(mine).catch(() => {});
        }
      }
      if (seeded.includes(d.key)) continue;
      const nb = newBook({ text: d.text, emoji: d.emoji, colour: d.colour, defaultKey: d.key, defaultVersion: d.version || 1 });
      nb.added = Date.now() - DefaultBooks.indexOf(d); // keep them in list order on the shelf
      await DB.put(nb).catch(() => {});
      books.push(nb);
      seeded.push(d.key);
    }
    store.set('kg-read-defaults', JSON.stringify(seeded));
    books.sort((a, b) => (b.opened || b.added) - (a.opened || a.added));
    const readers = {};
    for (const r of await Readings.all()) (readers[r.bookId] = readers[r.bookId] || []).push(r.face);
    const shelf = $('.books');
    shelf.innerHTML = '';
    for (const b of books) {
      const el = document.createElement('div');
      el.className = 'book';
      el.style.setProperty('--c', b.colour);
      const pages = Story.parse(b.text, b.title).pages.length;
      const done = b.finished ? 1 : pages > 1 ? (b.page || 0) / pages : 0;
      el.innerHTML = `<div class="faces"></div><div class="cover"></div><div class="name"></div><div class="progress"><i style="width:${Math.round(done * 100)}%"></i></div>`;
      el.querySelector('.faces').textContent = (readers[b.id] || []).join('');
      el.querySelector('.cover').textContent = b.emoji;
      el.querySelector('.name').textContent = b.title;
      el.addEventListener('click', () => { Sound.unlock(); Sound.pop(); openBook(b); });
      shelf.appendChild(el);
    }
  }

  function newBook(fields) {
    const parsed = Story.parse(fields.text, fields.title);
    return {
      id: Date.now() + Math.floor(Math.random() * 1000),
      title: parsed.title, emoji: '📖', colour: '#3a86ff', voiceName: '', voiceLang: '', speed: 'normal',
      page: 0, sentence: 0, finished: false, added: Date.now(), opened: 0,
      ...fields,
      ...(fields.title ? {} : { title: parsed.title }),
    };
  }

  // ---------- reading
  let book = null;
  let story = null;
  let pageNo = 0;
  let sents = [];   // sentences on this page
  let spans = [];   // spans[sentence][word]
  let at = 0;       // sentence we're up to
  let playing = false;
  let ticket = 0;   // bumps on every stop so old speech callbacks are ignored
  // ---------- word timing
  // Some voices (most desktop ones) tell us as each word is spoken: "exact".
  // Others (many Android ones) don't, so we estimate. For each voice we learn how long it
  // takes per letter, separately from the fixed delay before it reports it has finished
  // (Android reports late, which used to make the highlight lag).
  const loadJSON = (k, d) => { try { return JSON.parse(store.get(k, '')) || d; } catch (e) { return d; } };
  let exactVoices = loadJSON('kg-read-exact-voices', []);
  let timing = loadJSON('kg-read-timing', {});   // voice name -> [[units / rate, seconds], ...]
  let nudge = Number(store.get('kg-read-nudge', '0')) || 0; // grown-up adjustment, -0.4 … +0.4

  // How much "time" a word takes: its letters, plus the little pause after punctuation.
  const units = w => w.length + 1 + (/[.!?…]["'”’)]*$/.test(w) ? 5 : /[,;:—–]["'”’)]*$/.test(w) ? 3 : 0);

  // Seconds per unit at speed 1 for this voice: a straight-line fit of duration against length.
  function secsPerUnit(voiceName) {
    const pts = timing[voiceName] || [];
    let b = 1 / 17; // a typical Android voice, until we have learned this one
    if (pts.length >= 4) {
      const n = pts.length;
      const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
      const vx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
      if (vx > 25) b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / vx;
      else b = pts.reduce((a, p) => a + Math.max(0, p[1] - 0.4) / p[0], 0) / n; // all similar lengths
    }
    return Math.max(0.025, Math.min(0.2, b)) * (1 + nudge);
  }

  function learn(voiceName, x, secs) {
    const pts = timing[voiceName] || (timing[voiceName] = []);
    pts.push([Math.round(x * 10) / 10, Math.round(secs * 1000) / 1000]);
    if (pts.length > 30) pts.shift();
    store.set('kg-read-timing', JSON.stringify(timing));
  }
  let timers = [];

  // ---------- family readings: who reads this book?
  let bookReadings = [];
  let reader = null;           // a Readings entry, or null for the computer voice
  const audio = new Audio();
  const audioURLs = new Map(); // blob -> object URL
  const AUDIO_SPEED = { slow: 0.8, normal: 1, fast: 1.2 };

  async function loadReaders() {
    bookReadings = await Readings.forBook(book.id);
    reader = book.reader === 'voice' ? null : bookReadings.find(r => r.id === book.reader) || bookReadings[0] || null;
    const who = $('#who');
    who.hidden = !bookReadings.length;
    who.textContent = reader ? reader.face : '🗣️';
  }

  // The recording for this page, if the page hasn't changed since it was recorded.
  function recordingFor(no) {
    const p = reader && reader.pages[no];
    return p && p.times && p.hash === Readings.hashPage(story.pages[no]) ? p : null;
  }

  function urlFor(blob) {
    if (!audioURLs.has(blob)) audioURLs.set(blob, URL.createObjectURL(blob));
    return audioURLs.get(blob);
  }

  function openBook(b) {
    book = b;
    reader = null;
    $('#who').hidden = true;
    loadReaders();
    story = Story.parse(b.text, b.title);
    if (b.finished) { b.page = 0; b.sentence = 0; b.finished = false; }
    pageNo = Math.min(b.page || 0, story.pages.length - 1);
    at = b.sentence || 0;
    book.opened = Date.now();
    DB.put(book).catch(() => {});
    $('#shelf').hidden = true;
    $('#reader').hidden = false;
    document.documentElement.style.setProperty('--accent', b.colour);
    showSpeed();
    renderPage();
  }

  function renderPage() {
    const page = story.pages[pageNo];
    const el = $('#page');
    el.innerHTML = '';
    sents = Story.sentencesOf(page);
    spans = sents.map(() => []);
    let si = 0;
    page.paras.forEach(p => {
      const box = document.createElement(p.heading ? 'h2' : 'p');
      p.sentences.forEach(words => {
        const mySi = si;
        words.forEach((w, wi) => {
          const span = document.createElement('span');
          span.className = 'w' + (w.style ? ' ' + w.style : '');
          span.textContent = w.w;
          span.addEventListener('click', e => { e.stopPropagation(); tapWord(mySi, wi); });
          box.appendChild(span);
          box.appendChild(w.br ? document.createElement('br') : document.createTextNode(' '));
          spans[mySi].push(span);
        });
        si++;
      });
      el.appendChild(box);
    });
    if (pageNo === story.pages.length - 1) {
      const end = document.createElement('p');
      end.className = 'the-end';
      end.textContent = 'The End';
      end.hidden = true;
      el.appendChild(end);
    }
    at = Math.min(at, sents.length - 1);
    fitText();
    markSentence(at);
    $('#prev').disabled = pageNo === 0;
    $('#next').disabled = pageNo === story.pages.length - 1;
    const dots = $('#dots');
    dots.innerHTML = story.pages.length > 1 ? story.pages.map((_, i) => `<i class="${i === pageNo ? 'on' : ''}"></i>`).join('') : '';
  }

  // Biggest text that fits on the page without scrolling.
  function fitText() {
    const el = $('#page');
    let fs = Math.min(56, Math.max(28, window.innerWidth / 22));
    el.style.setProperty('--fs', `${fs}px`);
    // Keep poem lines whole, but not at the cost of tiny text: below this, long lines may wrap.
    const verseFloor = Math.max(34, fs * 0.72);
    while ((el.scrollHeight > el.clientHeight + 2 || (fs > verseFloor && verseWraps(el))) && fs > 20) {
      fs -= 2;
      el.style.setProperty('--fs', `${fs}px`);
    }
  }

  // Does any line of a poem spill onto a second line? (It spoils the rhyme.)
  function verseWraps(el) {
    for (const p of el.querySelectorAll('p')) {
      if (!p.querySelector('br')) continue;
      const lines = p.querySelectorAll('br').length + 1;
      const tops = new Set([...p.querySelectorAll('.w')].map(s => s.offsetTop));
      if (tops.size > lines) return true;
    }
    return false;
  }

  function markSentence(si) {
    document.querySelectorAll('.w.sent, .w.now').forEach(s => s.classList.remove('sent', 'now'));
    (spans[si] || []).forEach(s => s.classList.add('sent'));
  }
  function markWord(si, wi) {
    document.querySelectorAll('.w.now').forEach(s => s.classList.remove('now'));
    const s = spans[si] && spans[si][wi];
    if (s) {
      s.classList.add('now');
      if (s.offsetTop < $('#page').scrollTop || s.offsetTop > $('#page').scrollTop + $('#page').clientHeight - 60) s.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function saveSpot() {
    if (!book) return;
    book.page = pageNo;
    book.sentence = at;
    DB.put(book).catch(() => {});
  }

  // ---------- speech
  function utter(text, rateMul = 1, pitch = 1.05) {
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceFor(book);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = SPEEDS[book.speed || 'normal'] * rateMul;
    u.pitch = pitch;
    return u;
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function stopReading() {
    ticket++;
    playing = false;
    clearTimers();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    audio.pause();
    $('#play').textContent = '▶️';
  }

  function play() {
    if (playing) { stopReading(); saveSpot(); return; }
    playing = true;
    $('#play').textContent = '⏸️';
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    readPage(at, ++ticket);
  }

  // Read this page from sentence `si`: a family recording if there is one, otherwise the voice.
  function readPage(si, t, once) {
    if (recordingFor(pageNo)) playRecording(si, t, once);
    else readFrom(si, t, once);
  }

  // Finished a page: turn over and keep going, or it's the end.
  function pageDone(t) {
    if (pageNo < story.pages.length - 1) {
      timers.push(setTimeout(() => {
        if (t !== ticket) return;
        pageNo++;
        at = 0;
        renderPage();
        saveSpot();
        readPage(0, t);
      }, 900));
    } else {
      theEnd();
    }
  }

  // Play the recording from sentence `si`, lighting up words as they are said.
  function playRecording(si, t, once) {
    const rec = recordingFor(pageNo);
    const times = rec.times;
    const startAt = Math.max(0, (times[si] && times[si][0] !== undefined ? times[si][0] : 0) - 0.15);
    const stopAt = once ? (times[si + 1] ? times[si + 1][0] - 0.05 : Infinity) : Infinity;
    audio.src = urlFor(rec.blob);
    audio.playbackRate = AUDIO_SPEED[book.speed || 'normal'];
    let lastS = -1, lastW = -1;
    const start = () => {
      audio.currentTime = startAt;
      audio.play().catch(() => stopReading());
      const tick = () => {
        if (t !== ticket) return;
        const now = audio.currentTime + 0.04;
        // the last word that has started by now
        let s = si, w = 0;
        for (let a = 0; a < times.length; a++) for (let b = 0; b < times[a].length; b++) if (times[a][b] <= now) { s = a; w = b; }
        if (s < si) { s = si; w = 0; }
        if (s !== lastS) { markSentence(s); at = s; if (!once) saveSpot(); lastS = s; lastW = -1; }
        if (w !== lastW) { markWord(s, w); lastW = w; }
        if (audio.currentTime >= stopAt) { stopReading(); return; }
        if (audio.ended) { if (once) stopReading(); else pageDone(t); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (audio.readyState >= 1) start();
    else audio.addEventListener('loadedmetadata', start, { once: true });
  }

  // Read sentence `si` (and keep going while playing).
  function readFrom(si, t, once) {
    if (t !== ticket) return;
    if (si >= sents.length) { pageDone(t); return; }
    at = si;
    markSentence(si);
    saveSpot();
    const s = sents[si];
    const parts = Story.chunks(s.words);
    let ci = 0;
    const next = () => {
      if (t !== ticket) return;
      if (ci >= parts.length) {
        if (once) { stopReading(); return; }
        timers.push(setTimeout(() => readFrom(si + 1, t), s.heading ? 600 : 250));
        return;
      }
      sayChunk(si, parts[ci++], t, next);
    };
    next();
  }

  // Speak a run of words; emphasised runs are slower and higher, like a storyteller.
  function sayChunk(si, part, t, done) {
    const words = part.idx.map(i => Story.spoken(sents[si].words[i].w));
    const text = words.join(' ');
    const starts = [];
    words.reduce((pos, w) => { starts.push(pos); return pos + w.length + 1; }, 0);
    const u = part.style === 'strong' ? utter(text, 0.8, 1.3) : part.style === 'em' ? utter(text, 0.88, 1.15) : utter(text);
    const vname = u.voice ? u.voice.name : 'default';
    const wordUnits = words.map(units);
    const total = wordUnits.reduce((a, b) => a + b, 0);
    let began = 0, gotBoundary = false;
    u.onstart = () => {
      if (t !== ticket) return;
      began = performance.now();
      markWord(si, part.idx[0]);
      // Estimate when each word is said. If the voice reports real word timing, that takes over.
      const msPerUnit = (secsPerUnit(vname) * 1000) / u.rate;
      let soFar = 0;
      words.forEach((w, k) => {
        if (k > 0) timers.push(setTimeout(() => { if (t === ticket && !gotBoundary) markWord(si, part.idx[k]); }, soFar * msPerUnit));
        soFar += wordUnits[k];
      });
    };
    u.onboundary = e => {
      if (t !== ticket || (e.name && e.name !== 'word')) return;
      gotBoundary = true;
      if (!exactVoices.includes(vname)) { exactVoices.push(vname); store.set('kg-read-exact-voices', JSON.stringify(exactVoices)); }
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= e.charIndex) k++;
      markWord(si, part.idx[k]);
    };
    u.onend = () => {
      if (t !== ticket) return;
      // Learn how fast this voice really talks, to time the highlighting better.
      const secs = (performance.now() - began) / 1000;
      if (began && !gotBoundary && secs > 0.3 && words.length >= 2) learn(vname, total / u.rate, secs);
      done();
    };
    u.onerror = e => {
      if (t !== ticket) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      stopReading();
    };
    speechSynthesis.speak(u);
  }

  function theEnd() {
    stopReading();
    const end = $('.the-end');
    if (end) { end.hidden = false; fitText(); }
    book.finished = true;
    saveSpot();
    DB.put(book).catch(() => {});
    Sound.cheer();
    Celebrate.burst();
    if (!reader && 'speechSynthesis' in window) setTimeout(() => speechSynthesis.speak(utter('The end!')), 900);
  }

  // Tap a word: hear just that word, and carry on from that sentence next time.
  function tapWord(si, wi) {
    Sound.unlock();
    stopReading();
    at = si;
    markSentence(si);
    markWord(si, wi);
    saveSpot();
    const rec = recordingFor(pageNo);
    if (rec) {
      const tm = rec.times;
      const from = tm[si][wi], next = tm[si][wi + 1] ?? (tm[si + 1] ? tm[si + 1][0] : from + 0.8);
      const t = ++ticket;
      audio.src = urlFor(rec.blob);
      audio.playbackRate = 0.9;
      const go = () => {
        audio.currentTime = Math.max(0, from - 0.05);
        audio.play().catch(() => {});
        const stopAt = Math.min(next, from + 1.2);
        const tick = () => { if (t !== ticket) return; if (audio.currentTime >= stopAt || audio.ended) audio.pause(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      };
      if (audio.readyState >= 1) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
      return;
    }
    speechSynthesis.speak(utter(Story.spoken(sents[si].words[wi].w).replace(/[^\p{L}\p{N}'’-]/gu, ''), 0.85, 1.1));
  }

  function again() {
    Sound.unlock();
    const wasPlaying = playing;
    stopReading();
    if (wasPlaying) { play(); return; }
    readPage(at, ++ticket, true);
  }

  function turn(d) {
    const to = pageNo + d;
    if (to < 0 || to >= story.pages.length) return;
    const wasPlaying = playing;
    stopReading();
    pageNo = to;
    at = 0;
    renderPage();
    saveSpot();
    Sound.flip();
    if (wasPlaying) play();
  }

  function showSpeed() {
    document.querySelectorAll('.speeds .btn').forEach(b => b.classList.toggle('selected', b.dataset.speed === (book.speed || 'normal')));
  }

  // ---------- reader buttons
  $('#play').addEventListener('click', () => { Sound.unlock(); play(); });
  $('#again').addEventListener('click', again);
  $('#prev').addEventListener('click', () => turn(-1));
  $('#next').addEventListener('click', () => turn(1));
  $('#to-shelf').addEventListener('click', () => { Sound.pop(); saveSpot(); showShelf(); });
  document.querySelectorAll('.speeds .btn').forEach(b => b.addEventListener('click', () => {
    Sound.pop();
    book.speed = b.dataset.speed;
    DB.put(book).catch(() => {});
    showSpeed();
    if (playing) { stopReading(); play(); }
  }));
  // Kevin picks who reads: each family reader, then the computer voice.
  $('#who').addEventListener('click', () => {
    Sound.unlock();
    if (!bookReadings.length) return;
    const order = [...bookReadings, null];
    reader = order[(order.indexOf(reader) + 1) % order.length];
    book.reader = reader ? reader.id : 'voice';
    DB.put(book).catch(() => {});
    $('#who').textContent = reader ? reader.face : '🗣️';
    const wasPlaying = playing;
    stopReading();
    if (reader) {
      // a little hello in their own voice: the start of page one
      const p0 = Object.keys(reader.pages).map(Number).sort((a, b) => a - b)[0];
      if (!wasPlaying && p0 !== undefined) {
        const t = ++ticket;
        audio.src = urlFor(reader.pages[p0].blob);
        audio.playbackRate = 1;
        const go = () => { audio.currentTime = 0; audio.play().catch(() => {}); setTimeout(() => { if (t === ticket) audio.pause(); }, 1500); };
        if (audio.readyState >= 1) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
      }
    } else if ('speechSynthesis' in window && !wasPlaying) {
      speechSynthesis.speak(utter('I will read it!'));
    }
    if (wasPlaying) play();
  });

  // swipe to turn the page
  let swipe = null;
  $('#page-wrap').addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY }; });
  $('#page-wrap').addEventListener('pointerup', e => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
  });
  window.addEventListener('resize', () => { if (!$('#reader').hidden) fitText(); });

  // ---------- grown-ups: a sum to get in (shared/gate.js)
  $('#grown-ups').addEventListener('click', () => { Sound.unlock(); Gate.ask(openAdmin); });

  // ---------- grown-ups: book list
  async function openAdmin() {
    books = await DB.all().catch(() => []);
    books.sort((a, b) => a.title.localeCompare(b.title));
    const list = $('#book-list');
    list.innerHTML = '';
    for (const b of books) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="e"></span><span class="t"></span><span class="m"></span><span>✏️</span>';
      li.querySelector('.e').textContent = b.emoji;
      li.querySelector('.e').style.background = b.colour;
      li.querySelector('.t').textContent = b.title;
      const v = voiceFor(b);
      const mode = !v ? '' : exactVoices.includes(v.name) ? ' · exact timing' : timing[v.name] ? ' · timed' : ' · not read yet';
      li.querySelector('.m').textContent = `${Story.parse(b.text, b.title).pages.length} pages · ${v ? v.name : 'default voice'}${mode}`;
      li.addEventListener('click', () => openEditor(b));
      list.appendChild(li);
    }
    showTiming();
    $('#admin').hidden = false;
  }
  function showTiming() {
    const pct = Math.round(-nudge * 100);
    $('#timing-note').textContent = 'Exact timing = the voice tells us each word. Timed = we learn the voice\'s speed as it reads (it gets better after a page or two). '
      + (nudge ? `Highlight nudged ${pct > 0 ? 'faster' : 'slower'} by ${Math.abs(pct)}%.` : '');
  }
  // Grown-up nudge for voices that are timed: speed the highlight up or slow it down.
  $('#lag').addEventListener('click', () => { nudge = Math.max(-0.4, nudge - 0.08); store.set('kg-read-nudge', String(nudge)); showTiming(); });
  $('#ahead').addEventListener('click', () => { nudge = Math.min(0.4, nudge + 0.08); store.set('kg-read-nudge', String(nudge)); showTiming(); });
  $('#timing-reset').addEventListener('click', () => {
    nudge = 0;
    timing = {};
    store.set('kg-read-nudge', '0');
    store.set('kg-read-timing', '{}');
    showTiming();
  });

  $('#admin-close').addEventListener('click', () => { $('#admin').hidden = true; showShelf(); });
  $('#add-book').addEventListener('click', () => openEditor(null));

  // ---------- grown-ups: edit a book
  let editing = null, pickEmoji = '📖', pickColour = COLOURS[5];

  function picker(sel, items, current, show, set) {
    const el = $(sel);
    el.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      show(b, it);
      if (it === current) b.classList.add('sel');
      b.addEventListener('click', () => { el.querySelectorAll('button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); set(it); });
      el.appendChild(b);
    }
  }

  async function openEditor(b) {
    editing = b;
    await loadVoices();
    $('#editor-title').textContent = b ? 'Edit book' : 'New book';
    $('#f-title').value = b ? b.title : '';
    $('#f-text').value = b ? b.text : '';
    $('#f-speed').value = b ? b.speed || 'normal' : 'normal';
    pickEmoji = b ? b.emoji : '📖';
    pickColour = b ? b.colour : COLOURS[Math.floor(Math.random() * COLOURS.length)];
    picker('#f-emoji', EMOJIS, pickEmoji, (el, e) => { el.textContent = e; }, e => { pickEmoji = e; });
    picker('#f-colour', COLOURS, pickColour, (el, c) => { el.style.background = c; }, c => { pickColour = c; });
    const sel = $('#f-voice');
    sel.innerHTML = '';
    const english = voices.filter(v => /^en/i.test(v.lang));
    const others = voices.filter(v => !/^en/i.test(v.lang));
    const current = b ? voiceFor(b) : voiceFor({});
    for (const v of [...english, ...others]) {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = `${v.name} (${v.lang})${v.localService ? '' : ' ☁️'}`;
      if (current && v.name === current.name) o.selected = true;
      sel.appendChild(o);
    }
    if (!voices.length) sel.innerHTML = '<option value="">No voices found on this device</option>';
    $('#f-delete').hidden = !b;
    showReadings();
    $('#editor').hidden = false;
  }

  // ---------- grown-ups: family readings of this book
  const FACES = ['👴', '👵', '👩', '👨', '🧑', '👱‍♀️', '🧔', '👧', '👦', '🐶', '🐱', '🦸'];

  async function showReadings() {
    const list = $('#readings-list');
    list.innerHTML = '';
    $('#new-reading').hidden = !editing;
    if (!editing) { $('#readings-note').textContent = 'Save the book first, then you can record family members reading it.'; return; }
    const st = Story.parse(editing.text, editing.title);
    const rs = await Readings.forBook(editing.id);
    for (const r of rs) {
      const done = st.pages.filter((pg, i) => r.pages[i] && r.pages[i].hash === Readings.hashPage(pg)).length;
      const stale = st.pages.filter((pg, i) => r.pages[i] && r.pages[i].hash !== Readings.hashPage(pg)).length;
      const li = document.createElement('li');
      li.innerHTML = `<span class="f"></span><span class="n"></span><span class="m"></span>
        <button class="rec" title="Record pages">🎙️</button><button class="exp" title="Export to share">📤</button><button class="del" title="Delete">🗑️</button>`;
      li.querySelector('.f').textContent = r.face;
      li.querySelector('.n').textContent = r.name;
      li.querySelector('.m').textContent = `${done} of ${st.pages.length} pages` + (stale ? ` · ${stale} to record again (words changed)` : '');
      li.querySelector('.rec').addEventListener('click', () => openRecorder(editing, r));
      li.querySelector('.exp').addEventListener('click', () => exportReading(r, editing));
      li.querySelector('.del').addEventListener('click', async () => {
        if (!confirm(`Delete ${r.name}'s reading of "${editing.title}"?`)) return;
        await Readings.del(r.id);
        showReadings();
      });
      list.appendChild(li);
    }
    $('#readings-note').textContent = rs.length ? '' : 'Record yourself reading this book, page by page. Kevin can then pick your voice in the reader.';
  }

  let newFace = FACES[0];
  $('#new-reading').addEventListener('click', () => {
    $('#rn-name').value = '';
    newFace = FACES[0];
    picker('#rn-face', FACES, newFace, (el, f) => { el.textContent = f; }, f => { newFace = f; });
    $('#reading-new').hidden = false;
    setTimeout(() => $('#rn-name').focus(), 50);
  });
  $('#rn-close').addEventListener('click', () => { $('#reading-new').hidden = true; });
  $('#rn-start').addEventListener('click', async () => {
    const name = $('#rn-name').value.trim();
    if (!name) { $('#rn-name').focus(); return; }
    const r = { id: Date.now(), bookId: editing.id, name, face: newFace, created: Date.now(), pages: {} };
    await Readings.put(r);
    $('#reading-new').hidden = true;
    openRecorder(editing, r);
  });

  async function exportReading(r, b) {
    const file = await Readings.exportFile(r, b);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // Import a reading someone exported (adds the book too if this device doesn't have it).
  $('#import-reading').addEventListener('click', () => $('#import-input').click());
  $('#import-input').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let data;
    try { data = await Readings.parseFile(f); } catch (err) { alert("That file isn't a Read Along reading."); return; }
    const all = await DB.all().catch(() => []);
    let b = all.find(x => x.text === data.book.text) || all.find(x => x.title === data.book.title);
    if (!b) {
      b = newBook({ text: data.book.text, title: data.book.title, emoji: data.book.emoji, colour: data.book.colour });
      await DB.put(b);
    }
    const existing = (await Readings.forBook(b.id)).find(r => r.name === data.reader.name);
    if (existing) {
      if (!confirm(`Replace ${existing.name}'s reading of "${b.title}"?`)) return;
      await Readings.del(existing.id);
    }
    await Readings.put({ id: Date.now(), bookId: b.id, name: data.reader.name, face: data.reader.face, created: Date.now(), pages: data.pages });
    alert(`${data.reader.face} ${data.reader.name}'s reading of "${b.title}" is ready.`);
    openAdmin();
  });

  // ---------- grown-ups: the recorder (page by page)
  const rec = { book: null, reading: null, story: null, page: 0, stream: null, media: null, chunks: [], level: null, ctx: null, live: false };

  async function openRecorder(b, r) {
    rec.book = b;
    rec.reading = r;
    rec.story = Story.parse(b.text, b.title);
    const firstTodo = rec.story.pages.findIndex((pg, i) => !(r.pages[i] && r.pages[i].hash === Readings.hashPage(pg)));
    rec.page = firstTodo < 0 ? 0 : firstTodo;
    $('.rec-face').textContent = r.face;
    $('.rec-who').textContent = `${r.name} reads "${b.title}"`;
    $('#recorder').hidden = false;
    recShow();
    try {
      // Chrome's clean-up makes voices clearer; 'kg-read-raw-mic' switches it off (used for testing).
      const raw = store.get('kg-read-raw-mic', '') === '1';
      rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: !raw } });
      rec.ctx = rec.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const an = rec.ctx.createAnalyser();
      an.fftSize = 512;
      rec.ctx.createMediaStreamSource(rec.stream).connect(an);
      rec.level = an;
      recStatus(r.pages[rec.page] ? 'Tap ⏺ to record this page again, or ➡️ to move on.' : 'Tap ⏺ and read this page out loud.');
    } catch (e) {
      recStatus('🎤 The microphone is blocked. Allow it for this site in Chrome settings, then try again.');
    }
  }

  function recStatus(text) { $('.rec-status').textContent = text; }

  function recShow() {
    const pg = rec.story.pages[rec.page];
    const el = $('#rec-page');
    el.innerHTML = '';
    el.dataset.page = rec.page;
    pg.paras.forEach(p => {
      const box = document.createElement(p.heading ? 'h2' : 'p');
      p.sentences.forEach((ws, si) => ws.forEach((w, wi) => {
        const sp = document.createElement('span');
        sp.className = 'w';
        sp.textContent = w.w;
        box.appendChild(sp);
        box.appendChild(w.br ? document.createElement('br') : document.createTextNode(' '));
      }));
      el.appendChild(box);
    });
    // fit like the reader does
    let fs = Math.min(48, Math.max(24, window.innerWidth / 26));
    el.style.setProperty('--fs', `${fs}px`);
    while (el.scrollHeight > el.clientHeight + 2 && fs > 18) { fs -= 2; el.style.setProperty('--fs', `${fs}px`); }
    const r = rec.reading;
    $('.rec-dots').innerHTML = rec.story.pages.map((p, i) => {
      const got = r.pages[i];
      const cls = got ? (got.hash === Readings.hashPage(p) ? 'done' : 'stale') : '';
      return `<i class="${cls} ${i === rec.page ? 'on' : ''}" data-i="${i}">${got && cls === 'done' ? '✓' : i + 1}</i>`;
    }).join('');
    $('.rec-dots').querySelectorAll('i').forEach(d => d.addEventListener('click', () => { if (!rec.live) { rec.page = Number(d.dataset.i); recShow(); } }));
    $('#rec-prev').disabled = rec.page === 0;
    $('#rec-next').disabled = rec.page === rec.story.pages.length - 1;
    $('#rec-listen').disabled = !r.pages[rec.page];
  }

  function recStart() {
    if (!rec.stream || rec.live) return;
    audio.pause();
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const type = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    rec.media = new MediaRecorder(rec.stream, type ? { mimeType: type } : undefined);
    rec.chunks = [];
    rec.media.ondataavailable = e => { if (e.data.size) rec.chunks.push(e.data); };
    rec.media.onstop = recSave;
    rec.media.start();
    rec.live = true;
    rec.began = performance.now();
    $('#rec-go').classList.add('on');
    $('#rec-page').classList.add('live');
    const data = new Uint8Array(rec.level.fftSize);
    const meter = () => {
      if (!rec.live) return;
      rec.level.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      $('#rec-go').style.setProperty('--lvl', Math.min(1, peak * 2).toFixed(2));
      recStatus(`🔴 Recording… ${Math.floor((performance.now() - rec.began) / 1000)}s — tap ⏹ when you finish the page`);
      requestAnimationFrame(meter);
    };
    meter();
  }

  function recStop() {
    if (!rec.live) return;
    rec.live = false;
    rec.media.stop();
    $('#rec-go').classList.remove('on');
    $('#rec-page').classList.remove('live');
    recStatus('Saving…');
  }

  async function recSave() {
    const blob = new Blob(rec.chunks, { type: rec.media.mimeType || 'audio/webm' });
    const pg = rec.story.pages[rec.page];
    try {
      const { times, dur } = await Readings.timesFor(blob, pg, rec.ctx);
      rec.reading.pages[rec.page] = { blob, mime: blob.type, hash: Readings.hashPage(pg), dur, times };
      await Readings.put(rec.reading);
    } catch (e) {
      recStatus("😕 That recording didn't work. Please try this page again.");
      return;
    }
    const last = rec.story.pages.length - 1;
    const allDone = rec.story.pages.every((p, i) => rec.reading.pages[i] && rec.reading.pages[i].hash === Readings.hashPage(p));
    if (allDone) {
      recShow();
      recStatus('🎉 All pages recorded! Tap ✔️ to finish, or ▶️ to listen.');
      return;
    }
    recStatus('✓ Saved.');
    setTimeout(() => {
      if (rec.page < last) rec.page++;
      recShow();
      recStatus('Tap ⏺ and read this page out loud.');
    }, 600);
  }

  // Listen back, with the words lighting up so you can check the timing.
  function recListen() {
    const p = rec.reading.pages[rec.page];
    if (!p || rec.live) return;
    const spansFlat = [...$('#rec-page').querySelectorAll('.w')];
    const flat = p.times.flat();
    audio.src = urlFor(p.blob);
    audio.playbackRate = 1;
    const go = () => {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      const tick = () => {
        let k = -1;
        flat.forEach((x, i) => { if (x <= audio.currentTime + 0.04) k = i; });
        spansFlat.forEach((sp, i) => sp.classList.toggle('now', i === k));
        if (!audio.paused && !audio.ended && !$('#recorder').hidden) requestAnimationFrame(tick);
        else spansFlat.forEach(sp => sp.classList.remove('now'));
      };
      requestAnimationFrame(tick);
    };
    if (audio.readyState >= 1 && audio.src === urlFor(p.blob)) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
  }

  $('#rec-go').addEventListener('click', () => (rec.live ? recStop() : recStart()));
  $('#rec-listen').addEventListener('click', recListen);
  $('#rec-prev').addEventListener('click', () => { if (!rec.live && rec.page > 0) { audio.pause(); rec.page--; recShow(); } });
  $('#rec-next').addEventListener('click', () => { if (!rec.live && rec.page < rec.story.pages.length - 1) { audio.pause(); rec.page++; recShow(); } });
  $('#rec-close').addEventListener('click', () => {
    if (rec.live) recStop();
    audio.pause();
    if (rec.stream) rec.stream.getTracks().forEach(tr => tr.stop());
    rec.stream = null;
    $('#recorder').hidden = true;
    showReadings();
  });

  $('#f-voice-test').addEventListener('click', () => {
    const v = voices.find(x => x.name === $('#f-voice').value);
    const u = new SpeechSynthesisUtterance('Hello Kevin! This is how I will read your story.');
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = SPEEDS[$('#f-speed').value];
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });

  $('#f-file').addEventListener('click', () => $('#f-file-input').click());
  $('#f-file-input').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    $('#f-text').value = await f.text();
    if (!$('#f-title').value && !/^\s*#\s/.test($('#f-text').value)) {
      $('#f-title').value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    }
    e.target.value = '';
  });

  $('#f-save').addEventListener('click', async () => {
    const text = $('#f-text').value.trim();
    if (!text) { $('#f-text').focus(); return; }
    const v = voices.find(x => x.name === $('#f-voice').value);
    const fields = {
      text,
      title: $('#f-title').value.trim() || Story.parse(text).title,
      emoji: pickEmoji,
      colour: pickColour,
      voiceName: v ? v.name : '',
      voiceLang: v ? v.lang : '',
      speed: $('#f-speed').value,
    };
    let b;
    if (editing) {
      b = { ...editing, ...fields };
      if (editing.text !== text) { b.page = 0; b.sentence = 0; b.finished = false; b.edited = true; } // story changed: start again
    } else {
      b = newBook(fields);
    }
    await DB.put(b);
    $('#editor').hidden = true;
    openAdmin();
  });

  $('#f-delete').addEventListener('click', async () => {
    if (!editing || !confirm(`Delete "${editing.title}"?`)) return;
    await DB.del(editing.id);
    for (const r of await Readings.forBook(editing.id)) await Readings.del(r.id);
    $('#editor').hidden = true;
    openAdmin();
  });
  $('#editor-close').addEventListener('click', () => { $('#editor').hidden = true; });

  // Handy for poking at the reader from the browser console.
  window.readAlong = { get book() { return book; }, get at() { return at; }, get page() { return pageNo; }, get exactVoices() { return exactVoices; }, get timing() { return timing; }, get nudge() { return nudge; }, get playing() { return playing; }, get reader() { return reader; }, audio };

  loadVoices();
  showShelf();
  Sound.intro('Pick a book, then press the big yellow button to hear the story!');
})();
