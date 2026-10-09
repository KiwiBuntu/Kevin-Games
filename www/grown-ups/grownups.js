// Grown-ups page: time limits, game locks, and play stats (with share / view-a-file).
(() => {
  const $ = s => document.querySelector(s);
  const NAME = Object.fromEntries(Guard.GAMES.map(g => [g.key, g]));
  let viewing = null; // stats loaded from a file, instead of this device's

  // ---------- get in with the sum (Cancel goes back to the games)
  Gate.ask(() => { $('#main').hidden = false; render(); });
  document.addEventListener('click', e => {
    if (e.target.closest('.gate-cancel') && $('#main').hidden) location.href = '../index.html';
  });

  const fmtMins = secs => {
    const m = Math.round(secs / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };
  const ago = t => {
    if (!t) return '—';
    const d = (Date.now() - t) / 86400000;
    if (d < 1 / 24) return 'just now';
    if (d < 1) return `${Math.round(d * 24)} h ago`;
    if (d < 2) return 'yesterday';
    return `${Math.round(d)} days ago`;
  };
  const dayKey = n => Guard.today(new Date(Date.now() - n * 86400000));

  function render() {
    renderLimits();
    renderLocks();
    renderStats(viewing ? viewing.stats : Guard.stats);
  }

  // ---------- time limits
  function renderLimits() {
    const s = Guard.settings();
    const seg = $('#daily');
    seg.innerHTML = '';
    for (const [v, label] of [[0, 'No limit'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours']]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = s.daily === v ? 'on' : '';
      b.addEventListener('click', () => { const t = Guard.settings(); t.daily = v; Guard.saveSettings(t); renderLimits(); });
      seg.appendChild(b);
    }
    const used = Guard.usedToday();
    const left = Guard.limitLeft(s);
    const extra = s.extra && s.extra.date === Guard.today() ? s.extra.mins : 0;
    const total = s.daily ? (s.daily + extra) * 60 : 0;
    $('#today-bar').style.width = total ? `${Math.min(100, (used / total) * 100)}%` : '0%';
    $('#today-bar').style.background = left <= 0 ? '#ff4d4d' : left < 600 ? '#ff9f1c' : '#8ac926';
    $('#today-note').textContent = `Played today: ${fmtMins(used)}` +
      (s.daily ? ` of ${fmtMins(total)}${extra ? ` (including ${extra} extra)` : ''} · ${left > 0 ? fmtMins(left) + ' left' : 'time is up'}` : '') +
      (Guard.isBedtime(s) ? ' · it is bedtime now' : '');
    $('#bed-from').value = s.bedFrom || '';
    $('#bed-to').value = s.bedTo || '';
  }
  const saveBed = () => {
    const t = Guard.settings();
    t.bedFrom = $('#bed-from').value;
    t.bedTo = $('#bed-to').value;
    Guard.saveSettings(t);
    renderLimits();
  };
  $('#bed-from').addEventListener('change', saveBed);
  $('#bed-to').addEventListener('change', saveBed);
  $('#bed-off').addEventListener('click', () => { $('#bed-from').value = ''; $('#bed-to').value = ''; saveBed(); });
  $('#extra').addEventListener('click', () => {
    const t = Guard.settings();
    const today = Guard.today();
    t.extra = { date: today, mins: (t.extra && t.extra.date === today ? t.extra.mins : 0) + 15 };
    Guard.saveSettings(t);
    renderLimits();
  });

  // ---------- game locks
  function renderLocks() {
    const s = Guard.settings();
    const list = $('#games');
    list.innerHTML = '';
    for (const g of Guard.GAMES) {
      const off = !!s.locked[g.key];
      const b = document.createElement('div');
      b.className = 'toggle' + (off ? ' off' : '');
      b.innerHTML = `<span class="e">${off ? '🔒' : g.emoji}</span><span>${g.name}</span>`;
      b.addEventListener('click', () => {
        const t = Guard.settings();
        if (t.locked[g.key]) delete t.locked[g.key]; else t.locked[g.key] = true;
        Guard.saveSettings(t);
        renderLocks();
      });
      list.appendChild(b);
    }
  }

  // ---------- stats
  function weekSecs(st, key) {
    let s = 0;
    for (let n = 0; n < 7; n++) s += ((st.days[dayKey(n)] || {})[key] || 0);
    return s;
  }

  // Things worth knowing: levels he's stuck on, help he leans on, games he's left behind.
  function insights(st) {
    const out = [];
    for (const [key, g] of Object.entries(st.games)) {
      const name = NAME[key] ? NAME[key].name : key;
      for (const [label, r] of Object.entries(g.rounds || {})) {
        const ends = r.won + r.failed + r.quit;
        if (r.tries >= 4 && r.won === 0) out.push(`🧱 ${name} ${label}: ${r.tries} tries and not finished yet — maybe too hard?`);
        else if (ends >= 5 && r.quit / ends >= 0.6) out.push(`🚪 ${name} ${label}: left part-way ${r.quit} of ${ends} times — boring or frustrating?`);
        else if (r.won >= 5 && r.won === r.tries && r.secs / r.won < 40) out.push(`⚡ ${name} ${label}: won ${r.won}/${r.won}, about ${Math.round(r.secs / r.won)}s each — probably too easy.`);
      }
      const c = g.counts || {};
      const wrong = Object.entries(c).filter(([k]) => k.startsWith('❌ '));
      for (const [k, n] of wrong) {
        const right = c[k.replace('❌', '✔️')] || 0;
        if (n + right >= 10 && n / (n + right) >= 0.3) out.push(`🔢 ${name}: ${k.slice(2)} — ${n} wrong out of ${n + right} (${Math.round((n / (n + right)) * 100)}%).`);
      }
      if (g.last && Date.now() - g.last > 14 * 86400000 && g.plays >= 5) out.push(`💤 ${name}: not played for 2 weeks (was played ${g.plays} times).`);
    }
    return out.length ? out : ['Nothing stands out yet — check back after a few more days of play.'];
  }

  function renderStats(st) {
    $('#since').textContent = `Counting since ${new Date(st.since).toLocaleDateString()}. Play time only counts while a game is on screen and being touched.`;
    // last 14 days
    const bars = $('#bars'), labels = $('#bar-labels');
    bars.innerHTML = ''; labels.innerHTML = '';
    const days = [];
    for (let n = 13; n >= 0; n--) days.push([dayKey(n), Object.values(st.days[dayKey(n)] || {}).reduce((a, b) => a + b, 0)]);
    const max = Math.max(600, ...days.map(d => d[1]));
    days.forEach(([d, secs], i) => {
      const b = document.createElement('div');
      b.style.height = `${(secs / max) * 100}%`;
      b.title = `${d}: ${fmtMins(secs)}`;
      if (i === 13) b.className = 'today';
      bars.appendChild(b);
      const l = document.createElement('span');
      l.textContent = i === 13 ? 'today' : new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' });
      labels.appendChild(l);
    });
    // table of games, most played first
    const tbody = $('#table');
    tbody.innerHTML = '';
    const rows = Object.entries(st.games).sort((a, b) => b[1].secs - a[1].secs);
    if (!rows.length) tbody.innerHTML = '<tr><td colspan="5" class="note">No games played yet.</td></tr>';
    for (const [key, g] of rows) {
      const info = NAME[key] || { emoji: '🎮', name: key };
      const tr = document.createElement('tr');
      tr.className = 'game';
      tr.innerHTML = `<td><span class="e">${info.emoji}</span> ${info.name}</td><td class="num">${g.plays}</td><td class="num">${Math.round(g.secs / 60)}</td><td class="num">${Math.round(weekSecs(st, key) / 60)}</td><td>${ago(g.last)}</td>`;
      const detail = document.createElement('tr');
      detail.className = 'detail';
      detail.hidden = true;
      detail.innerHTML = `<td colspan="5">${detailHTML(g)}</td>`;
      tr.addEventListener('click', () => { detail.hidden = !detail.hidden; });
      tbody.appendChild(tr);
      tbody.appendChild(detail);
    }
    $('#notes').innerHTML = insights(st).map(t => `<li>${escape(t)}</li>`).join('');
    $('#summary').textContent = summaryText(st);
  }
  const escape = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

  function detailHTML(g) {
    let h = '';
    const rounds = Object.entries(g.rounds || {});
    if (rounds.length) {
      h += '<table><thead><tr><th>Level / size</th><th class="num">Tries</th><th class="num">Won</th><th class="num">Failed</th><th class="num">Left</th><th class="num">Avg time to win</th></tr></thead><tbody>';
      rounds.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
      for (const [label, r] of rounds) {
        const stuck = r.tries >= 4 && r.won === 0;
        h += `<tr><td>${escape(label)}${stuck ? ' <span class="flag">stuck?</span>' : ''}</td><td class="num">${r.tries}</td><td class="num">${r.won}</td><td class="num">${r.failed}</td><td class="num">${r.quit}</td><td class="num">${r.won ? Math.round(r.secs / r.won) + 's' : '—'}</td></tr>`;
      }
      h += '</tbody></table>';
    }
    const best = Object.entries(g.best || {});
    if (best.length) h += `<p>${best.map(([k, v]) => `<b>${escape(k)}:</b> ${v}`).join(' · ')}</p>`;
    const counts = Object.entries(g.counts || {}).sort((a, b) => b[1] - a[1]);
    if (counts.length) h += `<p>${counts.map(([k, v]) => `${escape(k)} <b>×${v}</b>`).join(' · ')}</p>`;
    return h || '<span class="note">No details yet.</span>';
  }

  function summaryText(st) {
    const lines = [`Kevin's Games — stats on ${new Date().toLocaleString()}`, `Counting since ${new Date(st.since).toLocaleDateString()}`, ''];
    let week = 0;
    for (let n = 0; n < 7; n++) week += Object.values(st.days[dayKey(n)] || {}).reduce((a, b) => a + b, 0);
    lines.push(`Played in the last 7 days: ${fmtMins(week)}`, '');
    for (const [key, g] of Object.entries(st.games).sort((a, b) => b[1].secs - a[1].secs)) {
      const info = NAME[key] || { emoji: '', name: key };
      lines.push(`${info.emoji} ${info.name}: ${g.plays} plays, ${Math.round(g.secs / 60)} min (${Math.round(weekSecs(st, key) / 60)} this week), last ${ago(g.last)}`);
      const best = Object.entries(g.best || {});
      if (best.length) lines.push('   ' + best.map(([k, v]) => `${k}: ${v}`).join(', '));
    }
    lines.push('', 'Worth a look:', ...insights(st).map(t => ' - ' + t));
    return lines.join('\n');
  }

  // ---------- send / view
  const fileFor = st => new File([JSON.stringify({ kind: 'kevins-games-stats', version: 1, sent: Date.now(), stats: st })],
    `kevins-games-stats-${Guard.today()}.json`, { type: 'application/json' });

  $('#send').addEventListener('click', async () => {
    const st = Guard.stats;
    const file = fileFor(st);
    const text = summaryText(st);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Kevin's Games stats", text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    // no share menu (e.g. on a PC): download the file instead
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(summaryText(viewing ? viewing.stats : Guard.stats)); $('#copy').textContent = '✔️ Copied'; }
    catch (e) { $('#copy').textContent = '😕 Could not copy'; }
    setTimeout(() => { $('#copy').textContent = '📋 Copy summary'; }, 1800);
  });
  $('#open-file').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.kind !== 'kevins-games-stats') throw new Error();
      viewing = data;
      $('#viewing').hidden = false;
      $('#viewing-from').textContent = `(sent ${new Date(data.sent).toLocaleString()})`;
      ['#limits', '#locks'].forEach(s => { $(s).hidden = true; });
      renderStats(data.stats);
      window.scrollTo(0, 0);
    } catch (err) { alert("That isn't a Kevin's Games stats file."); }
  });
  $('#viewing-back').addEventListener('click', () => {
    viewing = null;
    $('#viewing').hidden = true;
    ['#limits', '#locks'].forEach(s => { $(s).hidden = false; });
    render();
  });
  $('#reset').addEventListener('click', () => {
    if (!confirm('Clear all the play stats on this device?')) return;
    Guard.resetStats();
    render();
  });
})();
