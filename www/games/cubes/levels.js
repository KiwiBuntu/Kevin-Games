// Cube Pop models. No DOM code, so it can be tested with node.
//
// A model is a set of blocks: key "x,y,z" → colour letter (y is up).
// Two easy ways to make one:
//   1) layers: bottom layer first; each layer is rows of letters from back to front, '.' = empty
//        layers: [['RR', 'RR'], ['YY', 'YY']]   ← a 2×2×2 cube, red on the bottom, yellow on top
//   2) build(m): draw with m.box(), m.ball(), m.set()
const Levels = (() => {
  const COLOURS = {
    R: ['#ff4d4d', 'red'], O: ['#ff9f1c', 'orange'], Y: ['#ffd60a', 'yellow'], G: ['#8ac926', 'green'],
    B: ['#3a86ff', 'blue'], P: ['#8338ec', 'purple'], K: ['#ff5fa2', 'pink'], C: ['#2ec4b6', 'turquoise'],
    N: ['#9c6b3c', 'brown'], W: ['#f4f1de', 'white'], D: ['#4a4e69', 'grey'],
  };

  function maker() {
    const blocks = new Map();
    const m = {
      set(x, y, z, c) { if (c && c !== '.') blocks.set(`${x},${y},${z}`, c); else blocks.delete(`${x},${y},${z}`); return m; },
      box(x0, y0, z0, x1, y1, z1, c) {
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) m.set(x, y, z, c);
        return m;
      },
      ball(cx, cy, cz, r, c) {
        const R = Math.ceil(r);
        for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
          if (x * x + y * y + z * z <= r * r + 0.25) m.set(cx + x, cy + y, cz + z, c);
        }
        return m;
      },
      layers(list) {
        list.forEach((rows, y) => rows.forEach((row, z) => [...row].forEach((c, x) => m.set(x, y, z, c))));
        return m;
      },
      blocks,
    };
    return m;
  }

  const LIST = [
    { name: 'Cube', emoji: '🧊', layers: [['RRR', 'RRR', 'RRR'], ['YYY', 'YYY', 'YYY'], ['BBB', 'BBB', 'BBB']] },
    {
      name: 'Tower', emoji: '🗼',
      build: m => { ['R', 'Y', 'G', 'B', 'R', 'Y'].forEach((c, y) => m.box(0, y, 0, 1, y, 1, c)); },
    },
    {
      name: 'Pyramid', emoji: '🔺',
      build: m => { m.box(0, 0, 0, 4, 0, 4, 'G').box(1, 1, 1, 3, 1, 3, 'Y').box(2, 2, 2, 2, 2, 2, 'R'); },
    },
    {
      name: 'Heart', emoji: '❤️',
      layers: (() => {
        const rows = ['.RR.RR.', 'RKKRKKR', 'RKKKKKR', 'RKKKKKR', '.RKKKR.', '..RKR..', '...R...'].reverse();
        // stand it up: each row is a layer, two blocks deep
        return rows.map(r => [r, r]);
      })(),
    },
    {
      name: 'House', emoji: '🏠',
      build: m => {
        m.box(0, 0, 0, 4, 2, 4, 'Y');
        m.box(2, 0, 4, 2, 1, 4, 'N');                       // door
        m.set(0, 1, 2, 'C').set(4, 1, 2, 'C').set(1, 1, 4, 'C').set(3, 1, 4, 'C'); // windows
        m.box(0, 3, 0, 4, 3, 4, 'R').box(1, 4, 1, 3, 4, 3, 'R').set(2, 5, 2, 'R'); // roof
        m.box(3, 4, 0, 3, 5, 0, 'D');                       // chimney
      },
    },
    {
      name: 'Tree', emoji: '🌳',
      build: m => {
        m.box(2, 0, 2, 2, 2, 2, 'N');
        m.ball(2, 4, 2, 2.2, 'G');
        m.set(0, 4, 2, 'R').set(4, 4, 2, 'R').set(2, 4, 0, 'R').set(2, 5, 4, 'R').set(2, 6, 2, 'R'); // apples
      },
    },
    {
      name: 'Snowman', emoji: '⛄',
      build: m => {
        m.box(0, 0, 0, 4, 2, 4, 'W');                       // big bottom snowball…
        for (const [x, z] of [[0, 0], [0, 4], [4, 0], [4, 4]]) m.box(x, 0, z, x, 2, z, '.'); // …with rounded corners
        m.box(1, 3, 1, 3, 4, 3, 'W');                       // middle
        m.box(1, 5, 1, 3, 5, 3, 'R');                       // scarf
        m.box(1, 6, 1, 3, 8, 3, 'W');                       // head
        m.set(1, 7, 3, 'D').set(3, 7, 3, 'D');              // eyes
        m.set(2, 7, 4, 'O');                                // carrot nose
        m.box(1, 9, 1, 3, 9, 3, 'D').set(2, 10, 2, 'D');    // hat
        m.set(2, 1, 4, 'D').set(2, 4, 3, 'D');              // buttons
      },
    },
    {
      name: 'Duck', emoji: '🦆',
      build: m => {
        m.box(0, 0, 1, 4, 1, 3, 'Y');                       // body
        m.box(3, 2, 1, 4, 3, 3, 'Y');                       // head
        m.box(5, 2, 2, 6, 2, 2, 'O');                       // beak
        m.set(4, 3, 1, 'D').set(4, 3, 3, 'D');              // eyes
        m.box(0, 2, 2, 0, 2, 2, 'Y');                       // tail
        m.box(1, 1, 0, 2, 1, 0, 'W').box(1, 1, 4, 2, 1, 4, 'W'); // wings
      },
    },
    {
      name: 'Car', emoji: '🚗',
      build: m => {
        m.box(0, 1, 0, 5, 1, 2, 'R');                       // body
        m.box(1, 2, 0, 4, 2, 2, 'C');                       // windows
        m.box(1, 3, 0, 4, 3, 2, 'R');                       // roof
        for (const x of [1, 4]) for (const z of [-1, 3]) m.box(x, 0, z, x, 1, z, 'D'); // wheels
        m.set(5, 1, 0, 'Y').set(5, 1, 2, 'Y');              // lights
      },
    },
    {
      name: 'Rocket', emoji: '🚀',
      build: m => {
        m.box(1, 1, 1, 3, 6, 3, 'W');
        m.set(2, 4, 4, 'B').set(2, 5, 4, 'B');              // window
        m.box(2, 7, 2, 2, 8, 2, 'R').box(1, 7, 1, 3, 7, 3, 'R'); // nose
        m.box(0, 1, 2, 0, 2, 2, 'R').box(4, 1, 2, 4, 2, 2, 'R').box(2, 1, 0, 2, 2, 0, 'R').box(2, 1, 4, 2, 2, 4, 'R'); // fins
        m.box(1, 0, 1, 3, 0, 3, 'O').set(2, 0, 2, 'Y');     // flames
      },
    },
    {
      name: 'Cat', emoji: '🐱',
      build: m => {
        m.box(0, 0, 1, 4, 2, 3, 'O');                       // body
        m.box(3, 3, 1, 5, 5, 3, 'O');                       // head
        m.set(3, 6, 1, 'O').set(3, 6, 3, 'O');              // ears
        m.set(5, 5, 1, 'G').set(5, 5, 3, 'G');              // eyes
        m.set(5, 4, 2, 'K');                                // nose
        m.box(0, 3, 2, 0, 5, 2, 'O').set(0, 5, 2, 'W');     // tail
        for (const x of [0, 4]) for (const z of [1, 3]) m.set(x, 0, z, 'W'); // paws
      },
    },
    {
      name: 'Dinosaur', emoji: '🦕',
      build: m => {
        m.box(1, 1, 1, 5, 3, 3, 'G');                       // body
        m.box(5, 3, 2, 6, 6, 2, 'G');                       // neck
        m.box(6, 6, 1, 8, 7, 3, 'G');                       // head
        m.set(8, 7, 1, 'D').set(8, 7, 3, 'D');              // eyes
        m.box(0, 2, 2, 0, 2, 2, 'G').box(-1, 1, 2, -1, 1, 2, 'G'); // tail
        for (const x of [1, 3, 5]) m.set(x, 4, 2, 'Y');      // spikes
        m.box(2, 1, 1, 4, 1, 3, 'Y');                       // tummy
        for (const x of [1, 5]) for (const z of [1, 3]) m.set(x, 0, z, 'G'); // legs
      },
    },
  ];

  // Blocks for level i. Each block of the design is split into 2×2×2 smaller blocks.
  // The outside keeps the picture; underneath, every layer of the "onion" has its own
  // mix of colours (in clumps), so peeling it uncovers new colours layer by layer.
  const SPLIT = 2;
  function blocksFor(i) {
    const L = LIST[i];
    const m = maker();
    if (L.layers) m.layers(L.layers);
    if (L.build) L.build(m);
    let mx = Infinity, my = Infinity, mz = Infinity;
    for (const k of m.blocks.keys()) { const [x, y, z] = k.split(',').map(Number); mx = Math.min(mx, x); my = Math.min(my, y); mz = Math.min(mz, z); }
    const out = new Map();
    for (const [k, c] of m.blocks) {
      const [x, y, z] = k.split(',').map(Number);
      for (let a = 0; a < SPLIT; a++) for (let b = 0; b < SPLIT; b++) for (let d = 0; d < SPLIT; d++) {
        out.set(`${(x - mx) * SPLIT + a},${(y - my) * SPLIT + b},${(z - mz) * SPLIT + d}`, c);
      }
    }
    return onion(out, i);
  }

  // How deep each block is: 1 = on the outside, 2 = just under that, and so on.
  function depths(blocks) {
    const depth = new Map();
    const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let frontier = [];
    for (const k of blocks.keys()) {
      const [x, y, z] = k.split(',').map(Number);
      if (N.some(([dx, dy, dz]) => !blocks.has(`${x + dx},${y + dy},${z + dz}`))) { depth.set(k, 1); frontier.push([x, y, z]); }
    }
    for (let d = 2; frontier.length; d++) {
      const next = [];
      for (const [x, y, z] of frontier) for (const [dx, dy, dz] of N) {
        const k = `${x + dx},${y + dy},${z + dz}`;
        if (blocks.has(k) && !depth.has(k)) { depth.set(k, d); next.push([x + dx, y + dy, z + dz]); }
      }
      frontier = next;
    }
    return depth;
  }

  function onion(blocks, seed) {
    let s = (seed + 1) * 9973;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const depth = depths(blocks);
    // colours for the inside: the model's own colours plus a couple of surprises
    const own = [...new Set(blocks.values())];
    const extras = Object.keys(COLOURS).filter(c => !own.includes(c) && c !== 'W' && c !== 'D');
    const pool = own.concat(extras.sort(() => rand() - 0.5).slice(0, 2));
    // each layer gets its own 2–3 colours, painted in clumps
    const byLayer = new Map();
    const sorted = [...depth.entries()].filter(([, d]) => d > 1).sort((a, b) => a[1] - b[1]);
    for (const [k, d] of sorted) {
      if (!byLayer.has(d)) byLayer.set(d, pool.slice().sort(() => rand() - 0.5).slice(0, 3));
      const pal = byLayer.get(d);
      const [x, y, z] = k.split(',').map(Number);
      // copy an already-painted neighbour in the same layer most of the time → clumps
      const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
        .map(([dx, dy, dz]) => `${x + dx},${y + dy},${z + dz}`)
        .filter(n => depth.get(n) === d && painted.has(n));
      blocks.set(k, nb.length && rand() < 0.6 ? blocks.get(nb[Math.floor(rand() * nb.length)]) : pal[Math.floor(rand() * pal.length)]);
      painted.add(k);
    }
    painted.clear();
    return blocks;
  }
  const painted = new Set();

  return { COLOURS, LIST, blocksFor, SPLIT };
})();

if (typeof module !== 'undefined') module.exports = Levels;
