// Family readings for Read Along: "Grandpa reads it".
// A reading is one person's recording of a book, page by page, kept on this device.
// { id, bookId, name, face, created, pages: { [pageNo]: { blob, mime, hash, dur, times } } }
// `times[s][w]` is when word w of sentence s starts (seconds), found by lining the
// page's words up with the pauses in the recording.
const Readings = (() => {
  // ---------- storage (separate database, so books are never touched)
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('kg-read-voices', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('readings', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction('readings', mode);
    const req = fn(t.objectStore('readings'));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
  }));
  const all = () => run('readonly', s => s.getAll()).catch(() => []);
  const forBook = async bookId => (await all()).filter(r => r.bookId === bookId).sort((a, b) => a.created - b.created);
  const put = r => run('readwrite', s => s.put(r));
  const del = id => run('readwrite', s => s.delete(id));

  // ---------- a page's words, to notice when the text changes after recording
  function hashPage(page) {
    const text = page.paras.map(p => p.sentences.map(s => s.map(w => w.w).join(' ')).join(' ')).join('\n');
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // ---------- lining words up with the recording
  // How long a word takes, roughly: letters plus the pause punctuation brings.
  const units = w => w.length + 1 + (/[.!?…]["'”’)]*$/.test(w) ? 5 : /[,;:—–]["'”’)]*$/.test(w) ? 3 : 0);

  // Loudness every 20ms.
  function envelope(samples, rate) {
    const step = Math.round(rate * 0.02), env = [];
    for (let i = 0; i + step <= samples.length; i += step) {
      let sum = 0;
      for (let j = i; j < i + step; j++) sum += samples[j] * samples[j];
      env.push(Math.sqrt(sum / step));
    }
    return env;
  }

  // Quiet stretches between `from` and `to` (seconds) that last at least `min` seconds.
  function gaps(env, thr, from, to, min) {
    const out = [];
    let start = -1;
    for (let i = Math.floor(from / 0.02); i <= Math.ceil(to / 0.02) && i < env.length; i++) {
      if (env[i] < thr) { if (start < 0) start = i; }
      else if (start >= 0) {
        const len = (i - start) * 0.02;
        if (len >= min) out.push({ a: start * 0.02, b: i * 0.02, len, mid: (start + i) * 0.01 });
        start = -1;
      }
    }
    return out;
  }

  // Pick a pause for each expected break (in order), preferring long pauses near where we expect them.
  // With enough pauses, choose the best set for all breaks together (dynamic programming).
  function snap(expected, candidates, from, to) {
    const K = expected.length, n = candidates.length;
    if (!K) return [];
    if (n >= K) {
      const unit = Math.max(0.3, (to - from) / (K + 1));
      const score = (k, g) => candidates[g].len * 3 - Math.abs(candidates[g].mid - expected[k]) / unit;
      const dp = [], from_ = [];
      for (let k = 0; k < K; k++) {
        dp.push(new Array(n).fill(-Infinity));
        from_.push(new Array(n).fill(-1));
        for (let g = k; g <= n - (K - k); g++) {
          if (k === 0) { dp[0][g] = score(0, g); continue; }
          let best = -Infinity, arg = -1;
          for (let h = k - 1; h < g; h++) if (dp[k - 1][h] > best) { best = dp[k - 1][h]; arg = h; }
          if (arg >= 0) { dp[k][g] = best + score(k, g); from_[k][g] = arg; }
        }
      }
      let g = dp[K - 1].indexOf(Math.max(...dp[K - 1]));
      const chosen = [];
      for (let k = K - 1; k >= 0; k--) { chosen.unshift(g); g = from_[k][g]; }
      return chosen.map(i => candidates[i].b - 0.04);
    }
    const picks = [];
    let after = from;
    expected.forEach((e, k) => {
      const left = expected.length - k - 1;
      let best = null, bestScore = -Infinity;
      candidates.forEach((g, gi) => {
        if (g.mid <= after) return;
        // leave enough later pauses for the breaks still to come
        if (candidates.filter(x => x.mid > g.mid).length < left && candidates.length >= expected.length) return;
        const score = g.len * 2 - Math.abs(g.mid - e) / Math.max(0.5, (to - from) / (expected.length + 1));
        if (score > bestScore) { bestScore = score; best = gi; }
      });
      const t = best !== null && Math.abs(candidates[best].mid - e) < (to - from) * 0.35 ? candidates[best].b - 0.04 : e;
      picks.push(Math.max(after + 0.05, t));
      after = picks[picks.length - 1];
    });
    return picks;
  }

  // Spread words over [a, b]: every word takes a little time, plus time per letter.
  const spoken = w => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2.5;
  function spread(words, a, b) {
    const u = words.map(w => spoken(w));
    const total = u.reduce((x, y) => x + y, 0) || 1;
    const out = [];
    let acc = 0;
    u.forEach(x => { out.push(a + (b - a) * (acc / total)); acc += x; });
    return out;
  }

  // sentences: [[word text...], ...]  →  times[s][w]
  // Every punctuation mark is a likely pause. Line all of them up with the real pauses in one go,
  // then spread the words of each phrase over the speech between those pauses.
  function align(samples, rate, sentences) {
    const env = envelope(samples, rate);
    const sorted = env.slice().sort((x, y) => x - y);
    const floor = sorted[Math.floor(sorted.length * 0.1)] || 0, peak = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const thr = floor + (peak - floor) * 0.12;
    let s0 = env.findIndex(v => v > thr), s1 = env.length - 1;
    while (s1 > 0 && env[s1] <= thr) s1--;
    if (s0 < 0) s0 = 0;
    const start = Math.max(0, s0 * 0.02 - 0.05), end = Math.max(start + 0.2, (s1 + 1) * 0.02);
    const voicedEnd = (a, b) => {
      let i = Math.min(env.length - 1, Math.floor(b / 0.02));
      while (i > a / 0.02 && env[i] <= thr) i--;
      return Math.max(a + 0.1, (i + 1) * 0.02);
    };

    // phrases across the whole page: [{ s, from, words }]
    const phrases = [];
    sentences.forEach((ws, si) => {
      let cur = null;
      ws.forEach((w, wi) => {
        if (!cur) { cur = { s: si, from: wi, words: [] }; phrases.push(cur); }
        cur.words.push(w);
        if (/[,;:—–.!?…]["'”’)]*$/.test(w)) cur = null;
      });
    });
    // expected break times by length (a pause is worth a few letters)
    const size = ph => ph.words.reduce((n, w) => n + spoken(w), 0) + (/[.!?…]["'”’)]*$/.test(ph.words[ph.words.length - 1]) ? 5 : 3);
    const sizes = phrases.map(size);
    const total = sizes.reduce((x, y) => x + y, 0) || 1;
    const expected = [];
    let acc = 0;
    for (let i = 0; i < phrases.length - 1; i++) { acc += sizes[i]; expected.push(start + (end - start) * (acc / total)); }
    let bounds = [start, ...snap(expected, gaps(env, thr, start, end, 0.12), start, end), end];
    // Safety net: if any phrase ends up far too squashed or stretched for its words,
    // the pauses weren't trustworthy, so fall back to steady timing across the page.
    const perUnit = (end - start) / total;
    const odd = phrases.some((ph, i) => {
      const got = bounds[i + 1] - bounds[i], want = sizes[i] * perUnit;
      return got < want * 0.35 || got > want * 3;
    });
    if (odd) bounds = [start, ...expected, end];

    const times = sentences.map(() => []);
    phrases.forEach((ph, i) => {
      const t = spread(ph.words, bounds[i], voicedEnd(bounds[i], bounds[i + 1]));
      t.forEach((x, k) => { times[ph.s][ph.from + k] = x; });
    });
    return times;
  }

  // Decode a recording and line it up with a page.
  async function timesFor(blob, page, ctx) {
    const buf = await new Promise((res, rej) => blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab, res, rej), rej));
    const sentences = page.paras.flatMap(p => p.sentences.map(s => s.map(w => w.w)));
    return { times: align(buf.getChannelData(0), buf.sampleRate, sentences), dur: buf.duration };
  }

  // ---------- sharing a reading as one file
  async function toBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromBase64(b64, mime) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function exportFile(reading, book) {
    const pages = [];
    for (const [no, p] of Object.entries(reading.pages)) {
      pages.push({ page: Number(no), mime: p.mime, hash: p.hash, dur: p.dur, times: p.times, data: await toBase64(p.blob) });
    }
    const data = {
      kind: 'kevins-games-reading', version: 1,
      reader: { name: reading.name, face: reading.face },
      book: { title: book.title, text: book.text, emoji: book.emoji, colour: book.colour },
      pages,
    };
    const name = `${reading.name} reads ${book.title}`.replace(/[^\w\s'-]/g, '').trim() + '.json';
    return new File([JSON.stringify(data)], name, { type: 'application/json' });
  }

  async function parseFile(file) {
    const data = JSON.parse(await file.text());
    if (data.kind !== 'kevins-games-reading') throw new Error('Not a reading file');
    const pages = {};
    for (const p of data.pages) pages[p.page] = { blob: fromBase64(p.data, p.mime), mime: p.mime, hash: p.hash, dur: p.dur, times: p.times };
    return { reader: data.reader, book: data.book, pages };
  }

  return { all, forBook, put, del, hashPage, align, timesFor, exportFile, parseFile, units };
})();

if (typeof module !== 'undefined') module.exports = Readings;
