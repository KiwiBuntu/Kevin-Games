// Read Along: turns story text into pages → sentences → words.
// Understands a little Markdown:  # Heading,  **strong**,  *soft* or _soft_,
// a blank line between paragraphs, and --- on its own line for a new page.
// No DOM code, so it can be tested with node.
const Story = (() => {
  const PAGE_WORDS = 45; // roughly how many words fit nicely on a tablet page

  // "Some **big** words" → [{ text, style }] with style '' | 'em' | 'strong'
  function inline(text) {
    const out = [];
    const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ text: text.slice(last, m.index), style: '' });
      const strong = m[0].startsWith('**');
      out.push({ text: m[0].slice(strong ? 2 : 1, strong ? -2 : -1), style: strong ? 'strong' : 'em' });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), style: '' });
    return out;
  }

  // Words with their style; punctuation stays stuck to its word.
  function words(text) {
    const out = [];
    for (const part of inline(text)) {
      for (const w of part.text.split(/[ \t]+/)) {
        if (w === '\n') { if (out.length) out[out.length - 1].br = true; } // end of a line of verse
        else if (w.trim()) out.push({ w: w.trim(), style: part.style });
      }
    }
    // "**Splash**!" leaves "!" on its own: glue it back onto the word before
    for (let i = out.length - 1; i > 0; i--) {
      if (/^[.,!?;:…"'”’)\]]+$/u.test(out[i].w)) { out[i - 1].w += out[i].w; out.splice(i, 1); }
    }
    return out;
  }

  const endsSentence = w => /[.!?…]["'”’)]*$/.test(w);

  // A sentence ends at . ! ? — unless the next word carries on in lower case ("Moo!" said the cow).
  const startsNew = w => !w || /^["'“‘(]*[\p{Lu}\p{N}]/u.test(w.w);
  function sentences(ws) {
    const out = [];
    let cur = [];
    ws.forEach((w, i) => {
      cur.push(w);
      if (endsSentence(w.w) && startsNew(ws[i + 1])) { out.push(cur); cur = []; }
    });
    if (cur.length) out.push(cur);
    return out;
  }

  // Returns { title, pages: [{ paras: [{ heading, sentences: [[word...]] }] }] }
  function parse(text, fallbackTitle = '') {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const blocks = []; // { heading, text, verse } | { pageBreak }
    let para = [];
    const flush = () => {
      if (!para.length) return;
      // Several short lines = a poem: keep its line breaks. Long wrapped lines = prose.
      const verse = para.length > 1 && para.reduce((n, l) => n + l.length, 0) / para.length < 60;
      blocks.push({ heading: false, text: para.join(verse ? ' \n ' : ' '), verse });
      para = [];
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      if (/^(-{3,}|={3,}|\*{3,})$/.test(line)) { flush(); blocks.push({ pageBreak: true }); continue; }
      const h = line.match(/^#{1,6}\s+(.*)$/);
      if (h) { flush(); blocks.push({ heading: true, text: h[1] }); continue; }
      para.push(line);
    }
    flush();

    let title = fallbackTitle;
    if (!title && blocks[0] && blocks[0].heading) title = blocks[0].text.replace(/[*_]/g, '');

    const pages = [];
    let page = { paras: [] }, count = 0;
    const newPage = () => { if (page.paras.length) pages.push(page); page = { paras: [] }; count = 0; };
    for (const b of blocks) {
      if (b.pageBreak) { newPage(); continue; }
      if (b.heading) {
        if (count) newPage();
        const ws = words(b.text);
        page.paras.push({ heading: true, sentences: [ws] });
        count += ws.length + 3; // headings take up a little more room
        continue;
      }
      const ss = sentences(words(b.text));
      const size = ss.reduce((n, s) => n + s.length, 0);
      // start a fresh page rather than split a paragraph (or verse) that would fit on one
      if (count > 0 && count + size > PAGE_WORDS && size <= PAGE_WORDS) newPage();
      // a paragraph longer than a page flows over pages at sentence ends
      let cur = { heading: false, sentences: [] };
      for (const s of ss) {
        if (count + s.length > PAGE_WORDS && count > 0) {
          if (cur.sentences.length) page.paras.push(cur);
          newPage();
          cur = { heading: false, sentences: [] };
        }
        cur.sentences.push(s);
        count += s.length;
      }
      if (cur.sentences.length) page.paras.push(cur);
    }
    newPage();
    return { title: title || 'My story', pages };
  }

  // Everything to say on a page, in order: [{ words: [...], para, sentence }]
  function sentencesOf(page) {
    const out = [];
    page.paras.forEach((p, pi) => p.sentences.forEach((s, si) => out.push({ words: s, para: pi, sentence: si, heading: p.heading })));
    return out;
  }

  // Split a sentence into runs of the same style, so emphasised words can be spoken differently.
  function chunks(sentenceWords) {
    const out = [];
    sentenceWords.forEach((w, i) => {
      const last = out[out.length - 1];
      if (last && last.style === w.style) last.idx.push(i);
      else out.push({ style: w.style, idx: [i] });
    });
    return out;
  }

  // What the voice should actually say for a word (no markdown leftovers).
  const spoken = w => w.replace(/[*_#]/g, '');

  return { parse, sentencesOf, chunks, spoken, words };
})();

if (typeof module !== 'undefined') module.exports = Story;
