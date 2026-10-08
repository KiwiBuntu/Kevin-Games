// Read Along: a bookshelf of stories that are read aloud with the words lighting up.
// Books are kept on this device only (IndexedDB). Grown-ups add books behind a sum.
(() => {
  const $ = s => document.querySelector(s);
  const SPEEDS = { slow: 0.7, normal: 0.95, fast: 1.2 };
  const EMOJIS = ['📖', '🚂', '🚗', '🚀', '🦕', '🐻', '🐶', '🐱', '🐰', '🦁', '🐘', '🐙', '🐠', '🦄', '🧚', '🏰', '🌳', '🌈', '⭐', '🌙', '☀️', '🍎', '🎈', '⚽'];
  const COLOURS = ['#ff4d4d', '#ff9f1c', '#e0b400', '#6aa31d', '#2ec4b6', '#3a86ff', '#8338ec', '#ff5fa2'];

  const STARTER = `# Kevin and the Big Red Train

Kevin had a **big** red train. It went *choo choo* down the track.

"Where are you going, train?" asked Kevin.

---

"To the farm!" said the train. "Hop on!"

So Kevin hopped on. **Toot toot!** Off they went.

---

At the farm they saw a cow. "Moo!" said the cow.

They saw a pig. "Oink!" said the pig.

They saw a duck. "Quack!" said the duck.

---

Then the train came to a **big** hill.

*Puff, puff, puff.* "I think I can," said the train.

"You can do it!" said Kevin.

---

Over the top they went. **Wheee!**

Down, down, down the hill, all the way to Grandpa and Granny's house.

---

Grandpa and Granny were waiting with a big hug.

"What a fun trip!" said Kevin.

*"Toot toot. See you tomorrow, Kevin,"* said the train.`;

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
    if (!books.length && store.get('kg-read-seeded', '0') !== '1') {
      const starter = newBook({ text: STARTER, emoji: '🚂', colour: '#ff4d4d' });
      await DB.put(starter);
      store.set('kg-read-seeded', '1');
      books = [starter];
    }
    books.sort((a, b) => (b.opened || b.added) - (a.opened || a.added));
    const shelf = $('.books');
    shelf.innerHTML = '';
    for (const b of books) {
      const el = document.createElement('div');
      el.className = 'book';
      el.style.setProperty('--c', b.colour);
      const pages = Story.parse(b.text, b.title).pages.length;
      const done = b.finished ? 1 : pages > 1 ? (b.page || 0) / pages : 0;
      el.innerHTML = `<div class="cover"></div><div class="name"></div><div class="progress"><i style="width:${Math.round(done * 100)}%"></i></div>`;
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
  let exact = store.get('kg-read-exact', '') === '1'; // does this voice report word timing?
  let cps = Number(store.get('kg-read-cps', '14')) || 14; // characters per second at speed 1 (learned as it reads)
  let timers = [];

  function openBook(b) {
    book = b;
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
          box.appendChild(document.createTextNode(' '));
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
    while (el.scrollHeight > el.clientHeight + 2 && fs > 20) {
      fs -= 2;
      el.style.setProperty('--fs', `${fs}px`);
    }
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
    $('#play').textContent = '▶️';
  }

  function play() {
    if (!('speechSynthesis' in window)) return;
    if (playing) { stopReading(); saveSpot(); return; }
    playing = true;
    $('#play').textContent = '⏸️';
    speechSynthesis.cancel();
    readFrom(at, ++ticket);
  }

  // Read sentence `si` (and keep going while playing).
  function readFrom(si, t, once) {
    if (t !== ticket) return;
    if (si >= sents.length) {
      if (pageNo < story.pages.length - 1) {
        timers.push(setTimeout(() => {
          if (t !== ticket) return;
          pageNo++;
          at = 0;
          renderPage();
          saveSpot();
          readFrom(0, t);
        }, 900));
      } else {
        theEnd();
      }
      return;
    }
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
    let began = 0, gotBoundary = false;
    u.onstart = () => {
      if (t !== ticket) return;
      began = performance.now();
      markWord(si, part.idx[0]);
      if (exact) return;
      // Estimate when each word is said; corrected when the next run starts.
      const perChar = 1000 / (cps * u.rate);
      words.forEach((w, k) => {
        if (k === 0) return;
        timers.push(setTimeout(() => { if (t === ticket && !gotBoundary) markWord(si, part.idx[k]); }, starts[k] * perChar));
      });
    };
    u.onboundary = e => {
      if (t !== ticket || (e.name && e.name !== 'word')) return;
      gotBoundary = true;
      if (!exact) { exact = true; store.set('kg-read-exact', '1'); }
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= e.charIndex) k++;
      markWord(si, part.idx[k]);
    };
    u.onend = () => {
      if (t !== ticket) return;
      // Learn how fast this voice really talks, to time the highlighting better.
      const secs = (performance.now() - began) / 1000;
      if (began && secs > 0.4 && text.length > 8) {
        cps = cps * 0.7 + (text.length / secs / u.rate) * 0.3;
        store.set('kg-read-cps', cps.toFixed(2));
      }
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
    setTimeout(() => {
      const u = utter('The end!');
      speechSynthesis.speak(u);
    }, 900);
  }

  // Tap a word: hear just that word, and carry on from that sentence next time.
  function tapWord(si, wi) {
    Sound.unlock();
    stopReading();
    at = si;
    markSentence(si);
    markWord(si, wi);
    saveSpot();
    speechSynthesis.speak(utter(Story.spoken(sents[si].words[wi].w).replace(/[^\p{L}\p{N}'’-]/gu, ''), 0.85, 1.1));
  }

  function again() {
    Sound.unlock();
    const wasPlaying = playing;
    stopReading();
    if (wasPlaying) { play(); return; }
    readFrom(at, ++ticket, true);
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

  // ---------- grown-ups: a sum to get in (answer between 100 and 200)
  let answer = 0, tries = 0;
  function newSum() {
    const a = 50 + Math.floor(Math.random() * 50), b = 50 + Math.floor(Math.random() * 50);
    answer = a + b;
    $('.sum').textContent = `${a} + ${b} = ?`;
    $('#gate-answer').value = '';
  }
  $('#grown-ups').addEventListener('click', () => {
    Sound.unlock();
    tries = 0;
    newSum();
    $('#gate').hidden = false;
    setTimeout(() => $('#gate-answer').focus(), 50);
  });
  const checkSum = () => {
    if (Number($('#gate-answer').value) === answer) {
      $('#gate').hidden = true;
      openAdmin();
      return;
    }
    const inp = $('#gate-answer');
    inp.classList.remove('wrong');
    void inp.offsetWidth;
    inp.classList.add('wrong');
    if (++tries >= 2) { tries = 0; newSum(); }
  };
  $('#gate-ok').addEventListener('click', checkSum);
  $('#gate-answer').addEventListener('keydown', e => { if (e.key === 'Enter') checkSum(); });
  $('#gate-cancel').addEventListener('click', () => { $('#gate').hidden = true; });

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
      li.querySelector('.m').textContent = `${Story.parse(b.text, b.title).pages.length} pages · ${b.voiceName || 'default voice'}`;
      li.addEventListener('click', () => openEditor(b));
      list.appendChild(li);
    }
    $('#timing-note').textContent = exact
      ? 'Word highlighting: exact — this tablet tells us when each word is spoken.'
      : 'Word highlighting: timed — words are lit up by timing, and each sentence re-syncs. (Read a book once and come back to check.)';
    $('#admin').hidden = false;
  }
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
    $('#editor').hidden = false;
  }

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
      if (editing.text !== text) { b.page = 0; b.sentence = 0; b.finished = false; } // story changed: start again
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
    $('#editor').hidden = true;
    openAdmin();
  });
  $('#editor-close').addEventListener('click', () => { $('#editor').hidden = true; });

  // Handy for poking at the reader from the browser console.
  window.readAlong = { get book() { return book; }, get at() { return at; }, get page() { return pageNo; }, get exact() { return exact; }, get playing() { return playing; } };

  loadVoices();
  showShelf();
  Sound.intro('Pick a book, then press the big yellow button to hear the story!');
})();
