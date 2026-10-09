// Number Tower questions. No DOM code, so it can be tested with node.
// make(mode, settings, floor) → { text, say, answer, options, help }
const Quiz = (() => {
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[randInt(0, a.length - 1)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const MODES = {
    count: { icon: '🔢', name: 'Counting' },
    howmany: { icon: '🍎', name: 'How many?' },
    add: { icon: '➕', name: 'Adding', sum: true },
    sub: { icon: '➖', name: 'Taking away', sum: true },
    mul: { icon: '✖️', name: 'Times', sum: true },
    div: { icon: '➗', name: 'Sharing', sum: true },
    mix: { icon: '🎲', name: 'Mixed' },
  };

  const THINGS = [
    ['🍎', 'apples'], ['⭐', 'stars'], ['🎈', 'balloons'], ['🐟', 'fish'], ['🚗', 'cars'],
    ['🐞', 'ladybugs'], ['🍪', 'cookies'], ['🦆', 'ducks'], ['⚽', 'balls'], ['🌸', 'flowers'],
  ];

  // Start easy and let the sums grow as he climbs, up to the grown-up's top number.
  const capFor = (top, floor) => Math.max(4, Math.min(top, 5 + floor));

  // Nearby wrong answers, so he has to think rather than guess.
  function options(answer, count, max) {
    const set = new Set([answer]);
    const near = shuffle([-1, 1, -2, 2, -3, 3, 4, -4, 5, -5]);
    if (answer >= 20) near.push(10, -10);
    for (const d of near) {
      if (set.size >= count) break;
      const v = answer + d;
      if (v >= 0 && v <= max) set.add(v);
    }
    for (let v = 0; set.size < count; v++) set.add(v); // tiny numbers: fill up
    return shuffle([...set]);
  }

  function make(mode, s, floor) {
    const top = s.top || 10, n = s.choices || 3;
    const cap = capFor(top, floor);
    if (mode === 'mix') {
      const sums = ['add', 'sub', 'mul', 'div'].filter(m => s.modes[m]);
      mode = pick(sums.length ? sums : ['add']);
    }
    let q;
    switch (mode) {
      case 'count': {
        // keeps going as far as he can climb: no top number here
        const k = floor + 1;
        const shown = [k - 2, k - 1, k].filter(x => x >= 1);
        q = { text: `${shown.join(', ')}, ?`, say: `What comes after ${k}?`, answer: k + 1, max: Infinity };
        break;
      }
      case 'howmany': {
        const k = randInt(1, Math.min(top, 20, cap + 2));
        const [emoji, name] = pick(THINGS);
        q = { text: 'How many?', say: `How many ${name}?`, answer: k, help: { type: 'things', n: k, emoji }, always: true };
        break;
      }
      case 'add': {
        const total = randInt(2, cap);
        const a = randInt(Math.random() < 0.1 ? 0 : 1, total), b = total - a;
        q = { text: `${a} + ${b} = ?`, say: `What is ${a} plus ${b}?`, answer: total, help: { type: 'add', a, b } };
        break;
      }
      case 'sub': {
        const a = randInt(2, cap), b = randInt(Math.random() < 0.1 ? 0 : 1, a);
        q = { text: `${a} − ${b} = ?`, say: `What is ${a} take away ${b}?`, answer: a - b, help: { type: 'sub', a, b } };
        break;
      }
      case 'mul': {
        const a = randInt(1, Math.min(10, cap)), b = randInt(1, Math.max(1, Math.min(10, Math.floor(cap / a))));
        q = { text: `${a} × ${b} = ?`, say: `What is ${a} times ${b}?`, answer: a * b, help: { type: 'mul', a, b } };
        break;
      }
      case 'div': {
        const d = randInt(cap >= 4 ? 2 : 1, Math.min(10, Math.max(2, Math.floor(cap / 2))));
        const answer = randInt(1, Math.max(1, Math.min(10, Math.floor(cap / d))));
        q = { text: `${answer * d} ÷ ${d} = ?`, say: `What is ${answer * d} shared between ${d}?`, answer, help: { type: 'div', a: answer * d, b: d } };
        break;
      }
    }
    q.mode = mode;
    q.options = options(q.answer, n, q.max === Infinity ? q.answer + 5 : Math.max(top, q.answer));
    // Picture help only makes sense for small numbers.
    const h = q.help;
    q.canHelp = !!h && (h.type === 'things' || (h.type === 'add' && h.a <= 10 && h.b <= 10) || (h.type === 'sub' && h.a <= 15) ||
      (h.type === 'mul' && h.a * h.b <= 30) || (h.type === 'div' && h.a <= 30));
    return q;
  }

  return { MODES, make, options };
})();

if (typeof module !== 'undefined') module.exports = Quiz;
