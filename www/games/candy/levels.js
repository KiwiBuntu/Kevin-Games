// Candy Pop levels. Each board is drawn as rows of letters:
//   o  plain cell        .  hole (no cell)
//   j  jelly             J  double jelly (pop twice)
//   c  crate             C  strong crate (two hits)
//   i  frozen candy      k  frozen candy on jelly
// goals: collect: { colour: how many }, jelly: true (all of it), crates: true, cherries: how many
// Colours: 0 red, 1 yellow, 2 blue, 3 green, 4 purple, 5 orange
const Levels = (() => {
  const box = (w, h, ch = 'o') => Array.from({ length: h }, () => ch.repeat(w));

  const LIST = [
    // 1–5: learning the ropes
    { colours: 4, moves: 12, layout: box(6, 6), goals: { collect: { 0: 12 } } },
    { colours: 4, moves: 12, layout: box(6, 7), goals: { collect: { 2: 15, 1: 15 } } },
    { colours: 4, moves: 12, layout: ['ooooooo', 'ooooooo', 'oojjjoo', 'oojjjoo', 'oojjjoo', 'ooooooo', 'ooooooo'], goals: { jelly: true } },
    { colours: 5, moves: 16, layout: box(7, 7), goals: { collect: { 3: 20 } } },
    { colours: 5, moves: 12, layout: ['ooooooo', 'ooooooo', 'ooooooo', 'ccccccc', 'ooooooo', 'ooooooo', 'ooooooo'], goals: { crates: true } },
    // 6–10: new things
    { colours: 5, moves: 32, layout: ['jjooojj', 'jjooojj', 'ooooooo', 'ooooooo', 'ooooooo', 'jjooojj', 'jjooojj'], goals: { jelly: true } },
    { colours: 5, moves: 32, layout: box(7, 8), goals: { cherries: 2 } },
    { colours: 5, moves: 16, layout: ['.ooooo.', 'ooooooo', 'ooooooo', 'ooooooo', 'ooooooo', 'ooooooo', '.ooooo.'], goals: { collect: { 0: 20, 4: 20 } } },
    { colours: 5, moves: 16, layout: ['ooooooo', 'ooooooo', 'okkokko', 'okkokko', 'ooooooo', 'ooooooo', 'ooooooo'], goals: { jelly: true } },
    { colours: 5, moves: 18, layout: ['oooOooo'.replace('O', 'o'), 'oooCooo', 'ooCCCoo', 'oCCoCCo', 'ooCCCoo', 'oooCooo', 'ooooooo', 'ooooooo'], goals: { crates: true } },
    // 11–15: shapes and double jelly
    { colours: 5, moves: 12, layout: ['.oo.oo.', 'ooooooo', 'ojjjjjo', 'ojjjjjo', '.ojjjo.', '..ooo..', '...o...'], goals: { jelly: true } },
    { colours: 5, moves: 30, layout: box(8, 8), goals: { cherries: 2, collect: { 1: 15 } } },
    { colours: 6, moves: 32, layout: box(7, 8), goals: { collect: { 1: 25, 2: 25 } } },
    { colours: 5, moves: 24, layout: ['ooooooo', 'oJJJJJo', 'oJoooJo', 'oJoooJo', 'oJoooJo', 'oJJJJJo', 'ooooooo'], goals: { jelly: true } },
    { colours: 5, moves: 18, layout: ['ccooocc', 'coooooc', 'ooooooo', 'ooooooo', 'ooooooo', 'coooooc', 'ccooocc'], goals: { crates: true, collect: { 3: 15 } } },
    // 16–20: mixing goals
    { colours: 5, moves: 30, layout: ['ooo.ooo', 'ooo.ooo', 'ooo.ooo', 'ooooooo', 'jjjjjjj', 'jjjjjjj', 'jjjjjjj'], goals: { jelly: true } },
    { colours: 6, moves: 36, layout: box(8, 8), goals: { cherries: 1, collect: { 5: 15 } } },
    { colours: 5, moves: 18, layout: ['iiooooo', 'iiooooo', 'ooooooo', 'ooocooo', 'ooooooo', 'oooooii', 'oooooii'], goals: { collect: { 0: 25, 2: 25 } } },
    { colours: 5, moves: 26, layout: ['oCoooCo', 'ooooooo', 'jjjjjjj', 'jjjjjjj', 'jjjjjjj', 'ooooooo', 'oCoooCo'], goals: { jelly: true, crates: true } },
    { colours: 6, moves: 24, layout: ['..ooo..', '.ooooo.', 'ooooooo', 'ooooooo', 'ooooooo', '.ooooo.', '..ooo..'], goals: { collect: { 0: 15, 1: 15, 2: 15 } } },
    // 21–25: getting tricky
    { colours: 6, moves: 20, layout: ['ooooooo', 'oojjjoo', 'ojjJjjo', 'ojJJJjo', 'ojjJjjo', 'oojjjoo', 'ooooooo'], goals: { jelly: true } },
    { colours: 6, moves: 42, layout: ['ooooooo', 'ooooooo', 'ooooooo', 'ccCcCcc', 'ooooooo', 'ooooooo', 'ooooooo', 'ooooooo'], goals: { crates: true, cherries: 1 } },
    { colours: 6, moves: 32, layout: ['ookkkoo', 'ooooooo', 'ooooooo', 'ojjjjjo', 'ooooooo', 'ooooooo', 'ookkkoo'], goals: { jelly: true } },
    { colours: 6, moves: 36, layout: ['oo.o.oo', 'ooooooo', '.ooooo.', 'ooooooo', '.ooooo.', 'ooooooo', 'oo.o.oo'], goals: { collect: { 3: 25, 4: 25 } } },
    { colours: 6, moves: 26, layout: ['oooooooo', 'oCooooCo', 'oojjjjoo', 'oojJJjoo', 'oojJJjoo', 'oojjjjoo', 'oCooooCo', 'oooooooo'], goals: { jelly: true, crates: true } },
    // 26–30: champions
    { colours: 6, moves: 56, layout: box(7, 8), goals: { cherries: 2, collect: { 2: 15 } } },
    { colours: 6, moves: 14, layout: ['iiiiiii', 'ioooooi', 'ioJJJoi', 'ioJJJoi', 'ioJJJoi', 'ioooooi', 'iiiiiii'], goals: { jelly: true } },
    { colours: 6, moves: 22, layout: ['ooooooo', 'oCoooCo', 'ooooooo', 'ooocooo', 'ooooooo', 'oCoooCo', 'ooooooo'], goals: { crates: true, collect: { 0: 15, 5: 15 } } },
    { colours: 6, moves: 42, layout: ['.jjojj.', 'jJJoJJj', 'jJJJJJj', 'ojJJJjo', '.ojJjo.', '..ojo..', '...o...'], goals: { jelly: true } },
    { colours: 6, moves: 44, layout: ['oooooooo', 'ojcoocjo', 'oojjjjoo', 'oojJJjoo', 'oojJJjoo', 'oojjjjoo', 'ojCooCjo', 'oooooooo'], goals: { jelly: true, crates: true, cherries: 1 } },
  ];

  return { LIST };
})();

if (typeof module !== 'undefined') module.exports = Levels;
