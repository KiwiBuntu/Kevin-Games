// Memory Match: flip two cards — find all the pairs!
(() => {
  const board = document.getElementById('board');
  const themeBtn = document.getElementById('theme');
  const muteBtn = document.getElementById('mute');

  const SIZES = { small: 3, medium: 6, big: 10 }; // number of pairs

  const THEMES = [
    {
      icon: '🐶', back: '#3a86ff', cards: [
        ['🐶', 'Puppy'], ['🐱', 'Kitty'], ['🐭', 'Mouse'], ['🐰', 'Bunny'], ['🦊', 'Fox'], ['🐻', 'Bear'],
        ['🐼', 'Panda'], ['🐨', 'Koala'], ['🐯', 'Tiger'], ['🦁', 'Lion'], ['🐮', 'Cow'], ['🐷', 'Pig'],
        ['🐸', 'Frog'], ['🐵', 'Monkey'], ['🐔', 'Chicken'], ['🐧', 'Penguin'], ['🐘', 'Elephant'], ['🦒', 'Giraffe'],
      ],
    },
    {
      icon: '🚗', back: '#ff4d4d', cards: [
        ['🚗', 'Car'], ['🚕', 'Taxi'], ['🚌', 'Bus'], ['🚓', 'Police car'], ['🚑', 'Ambulance'], ['🚒', 'Fire engine'],
        ['🚜', 'Tractor'], ['🏎️', 'Race car'], ['🚲', 'Bike'], ['🛵', 'Scooter'], ['🚂', 'Train'], ['🚁', 'Helicopter'],
        ['✈️', 'Aeroplane'], ['🚀', 'Rocket'], ['⛵', 'Sailboat'], ['🚚', 'Truck'], ['🛻', 'Ute'], ['🚤', 'Speedboat'],
      ],
    },
    {
      icon: '🍎', back: '#8ac926', cards: [
        ['🍎', 'Apple'], ['🍌', 'Banana'], ['🍇', 'Grapes'], ['🍓', 'Strawberry'], ['🍉', 'Watermelon'], ['🍒', 'Cherries'],
        ['🍍', 'Pineapple'], ['🥕', 'Carrot'], ['🍕', 'Pizza'], ['🍦', 'Ice cream'], ['🍩', 'Doughnut'], ['🍪', 'Cookie'],
        ['🧁', 'Cupcake'], ['🥦', 'Broccoli'], ['🌽', 'Corn'], ['🍋', 'Lemon'], ['🥝', 'Kiwifruit'], ['🍑', 'Peach'],
      ],
    },
    {
      icon: '🐙', back: '#8338ec', cards: [
        ['🐙', 'Octopus'], ['🦀', 'Crab'], ['🐠', 'Fish'], ['🐬', 'Dolphin'], ['🐳', 'Whale'], ['🦈', 'Shark'],
        ['🐢', 'Turtle'], ['🦑', 'Squid'], ['🐡', 'Pufferfish'], ['🦞', 'Lobster'], ['🦭', 'Seal'], ['🐚', 'Shell'],
        ['🦖', 'T-Rex'], ['🦕', 'Dinosaur'], ['🦋', 'Butterfly'], ['🐞', 'Ladybug'], ['🐝', 'Bee'], ['🦄', 'Unicorn'],
      ],
    },
  ];

  let size = 'small';
  let themeIdx = 0;
  try {
    size = localStorage.getItem('kg-memory-size') || 'small';
    themeIdx = Number(localStorage.getItem('kg-memory-theme')) || 0;
  } catch (e) {}
  if (!SIZES[size]) size = 'small';
  if (!THEMES[themeIdx]) themeIdx = 0;

  let cards = [];
  let first = null, second = null, flipBackTimer = null;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function newGame() {
    Win.hide();
    clearTimeout(flipBackTimer);
    first = second = null;
    const theme = THEMES[themeIdx];
    const picks = shuffle(theme.cards.slice()).slice(0, SIZES[size]);
    const deck = shuffle(picks.concat(picks));
    board.innerHTML = '';
    board.style.setProperty('--back', theme.back);
    cards = deck.map(([pic, name], i) => {
      const el = document.createElement('button');
      el.className = 'card';
      el.setAttribute('aria-label', 'Card');
      el.style.animationDelay = `${i * 0.04}s`;
      el.innerHTML = `<div class="inner"><div class="face back">⭐</div><div class="face front">${pic}</div></div>`;
      const card = { el, pic, name, up: false, matched: false };
      el.addEventListener('pointerdown', () => flip(card));
      board.appendChild(el);
      return card;
    });
    themeBtn.textContent = theme.icon;
    document.querySelectorAll('#sizes .btn').forEach(b => b.classList.toggle('selected', b.dataset.size === size));
    layout();
  }

  // Pick the number of columns that makes the cards as big as possible.
  function layout() {
    const style = getComputedStyle(board);
    const w = board.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const h = board.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const n = cards.length;
    const gap = Math.max(6, Math.min(14, Math.min(w, h) * 0.02));
    let best = { cw: 0, cols: 1 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows / 1.25 - 1);
      if (cw > best.cw) best = { cw, cols };
    }
    const cw = Math.floor(Math.min(best.cw, 220));
    board.style.setProperty('--cw', `${cw}px`);
    board.style.setProperty('--gap', `${gap}px`);
    board.style.gridTemplateColumns = `repeat(${best.cols}, ${cw}px)`;
  }

  function show(card, up) {
    card.up = up;
    card.el.classList.toggle('up', up);
  }

  function flipBack() {
    clearTimeout(flipBackTimer);
    for (const c of [first, second]) {
      if (!c) continue;
      c.el.classList.remove('wrong');
      show(c, false);
    }
    first = second = null;
  }

  function flip(card) {
    Sound.unlock();
    if (card.up || card.matched) return;
    // Two wrong cards still showing? Turn them back straight away so he can keep going.
    if (second) flipBack();
    show(card, true);
    Sound.flip();
    if (!first) { first = card; return; }
    second = card;
    if (first.pic === second.pic) {
      for (const c of [first, second]) {
        c.matched = true;
        c.el.classList.add('matched');
      }
      first = second = null;
      setTimeout(() => { Sound.sparkle(); Sound.say(card.name); }, 250);
      if (cards.every(c => c.matched)) {
        setTimeout(() => Win.show({ picture: THEMES[themeIdx].icon + '⭐', again: newGame }), 1200);
      }
    } else {
      setTimeout(() => {
        if (second !== card) return;
        first.el.classList.add('wrong');
        second.el.classList.add('wrong');
        Sound.nope();
      }, 350);
      flipBackTimer = setTimeout(flipBack, 1400);
    }
  }

  // ---------- buttons
  document.querySelectorAll('#sizes .btn').forEach(b => b.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    size = b.dataset.size;
    try { localStorage.setItem('kg-memory-size', size); } catch (e) {}
    newGame();
  }));
  themeBtn.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    themeIdx = (themeIdx + 1) % THEMES.length;
    try { localStorage.setItem('kg-memory-theme', String(themeIdx)); } catch (e) {}
    newGame();
  });
  document.getElementById('new').addEventListener('click', () => { Sound.unlock(); Sound.pop(); newGame(); });
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  window.addEventListener('resize', layout);

  newGame();
})();
