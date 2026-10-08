// Paint & Colour: tap to colour in a picture, or draw freely with your finger.
(() => {
  const canvas = document.getElementById('page');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const palette = document.getElementById('palette');
  const modeBtn = document.getElementById('mode');
  const brushBtn = document.getElementById('brush');
  const muteBtn = document.getElementById('mute');
  const INK = '#2b2d42';

  const COLOURS = ['#ff4d4d', '#ff9f1c', '#ffd60a', '#8ac926', '#2ec4b6', '#3a86ff', '#8338ec', '#ff5fa2', '#9c6b3c', '#2b2d42', 'rainbow', '#ffffff'];
  const RAINBOW = ['#ff4d4d', '#ff9f1c', '#ffd60a', '#8ac926', '#3a86ff', '#8338ec', '#ff5fa2'];

  let drawing = false;      // false = colouring-in, true = free drawing
  let picIdx = 0;
  let colour = '#ff4d4d';
  let thick = true;
  let R = 800;              // size of the drawing in real pixels
  let paintLayer, paintCtx; // the colours
  let lineLayer;            // the black outlines (colouring mode)
  let labels = null;        // which area each pixel belongs to
  let areaSize = [];
  let filled = new Set();
  let background = -1;
  let cheered = false;
  let hue = 0;
  const strokes = new Map(); // finger id -> last point

  // ---------- palette
  COLOURS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === 'rainbow' ? ' rainbow' : '');
    if (c !== 'rainbow') b.style.setProperty('--c', c);
    if (c === '#ffffff') b.textContent = '🧽';
    b.setAttribute('aria-label', c === 'rainbow' ? 'Rainbow' : c === '#ffffff' ? 'Rubber' : 'Colour');
    b.addEventListener('click', () => {
      Sound.unlock();
      Sound.pop();
      colour = c;
      palette.querySelectorAll('.swatch').forEach(s => s.classList.toggle('selected', s === b));
    });
    if (c === colour) b.classList.add('selected');
    palette.appendChild(b);
  });

  // ---------- page setup
  function sizeCanvas() {
    const r = stage.getBoundingClientRect();
    const css = Math.floor(Math.min(r.width, r.height) - 16);
    canvas.style.width = canvas.style.height = `${css}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return Math.max(200, Math.round(css * dpr));
  }

  function newPage() {
    R = sizeCanvas();
    canvas.width = canvas.height = R;
    paintLayer = document.createElement('canvas');
    paintLayer.width = paintLayer.height = R;
    paintCtx = paintLayer.getContext('2d', { willReadFrequently: true });
    paintCtx.fillStyle = '#fff';
    paintCtx.fillRect(0, 0, R, R);
    filled = new Set();
    cheered = false;
    labels = null;
    lineLayer = null;
    if (!drawing) {
      lineLayer = document.createElement('canvas');
      lineLayer.width = lineLayer.height = R;
      const lc = lineLayer.getContext('2d', { willReadFrequently: true });
      lc.scale(R, R);
      lc.lineWidth = 0.012;
      lc.lineJoin = 'round';
      lc.lineCap = 'round';
      lc.strokeStyle = INK;
      Pictures.LIST[picIdx].draw(lc);
      findAreas(lc.getImageData(0, 0, R, R).data);
    }
    modeBtn.textContent = drawing ? '✏️' : '🖍️';
    brushBtn.hidden = !drawing;
    brushBtn.textContent = thick ? '●' : '•';
    render();
  }

  // Number every separate area between the lines (a flood fill for each one).
  function findAreas(px) {
    const n = R * R;
    const wall = new Uint8Array(n);
    for (let i = 0; i < n; i++) wall[i] = px[i * 4 + 3] > 100 ? 1 : 0;
    labels = new Int32Array(n).fill(-1);
    areaSize = [];
    const stack = new Int32Array(n);
    for (let start = 0; start < n; start++) {
      if (wall[start] || labels[start] !== -1) continue;
      const id = areaSize.length;
      let top = 0, count = 0;
      stack[top++] = start;
      labels[start] = id;
      const visit = j => {
        if (wall[j] || labels[j] !== -1) return;
        labels[j] = id;
        stack[top++] = j;
      };
      while (top) {
        const i = stack[--top];
        count++;
        const x = i % R;
        if (x > 0) visit(i - 1);
        if (x < R - 1) visit(i + 1);
        if (i >= R) visit(i - R);
        if (i < n - R) visit(i + R);
      }
      areaSize.push(count);
    }
    background = labels[2 * R + 2];
  }

  function render() {
    ctx.clearRect(0, 0, R, R);
    ctx.drawImage(paintLayer, 0, 0);
    if (lineLayer) ctx.drawImage(lineLayer, 0, 0);
  }

  const pick = () => (colour === 'rainbow' ? RAINBOW[Math.floor(Math.random() * RAINBOW.length)] : colour);

  // ---------- colouring in
  function fillAt(x, y) {
    let i = y * R + x;
    let id = labels[i];
    if (id === -1) {
      // Tapped right on a line: use the nearest area instead.
      for (let r = 1; r < 8 && id === -1; r++) {
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          const j = (y + dy) * R + (x + dx);
          if (j >= 0 && j < R * R && labels[j] !== -1) { id = labels[j]; break; }
        }
      }
    }
    if (id === -1 || areaSize[id] < 30) return;
    const hex = pick();
    const cr = parseInt(hex.slice(1, 3), 16), cg = parseInt(hex.slice(3, 5), 16), cb = parseInt(hex.slice(5, 7), 16);
    const img = paintCtx.getImageData(0, 0, R, R);
    const d = img.data;
    const n = R * R;
    for (let p = 0; p < n; p++) {
      let hit = labels[p] === id;
      // also tint the line pixels next to the area so no white edges show
      if (!hit && labels[p] === -1) {
        const x0 = p % R;
        hit = (x0 > 1 && labels[p - 2] === id) || (x0 < R - 2 && labels[p + 2] === id) ||
          (p >= 2 * R && labels[p - 2 * R] === id) || (p < n - 2 * R && labels[p + 2 * R] === id) ||
          (x0 > 0 && labels[p - 1] === id) || (x0 < R - 1 && labels[p + 1] === id) ||
          (p >= R && labels[p - R] === id) || (p < n - R && labels[p + R] === id);
      }
      if (hit) { d[p * 4] = cr; d[p * 4 + 1] = cg; d[p * 4 + 2] = cb; d[p * 4 + 3] = 255; }
    }
    paintCtx.putImageData(img, 0, 0);
    render();
    Sound.flip();
    if (hex === '#ffffff') filled.delete(id); else filled.add(id);
    checkDone();
  }

  // Cheer once every part of the picture (not the background) has a colour.
  function checkDone() {
    if (cheered) return;
    const big = R * R * 0.0008;
    for (let id = 0; id < areaSize.length; id++) {
      if (id === background || areaSize[id] < big) continue;
      if (!filled.has(id)) return;
    }
    cheered = true;
    Sound.cheer();
    Celebrate.burst();
    setTimeout(() => Sound.say(`Beautiful! ${Sound.praise()}`), 900);
  }

  // ---------- free drawing
  function strokeTo(id, x, y) {
    const lastPt = strokes.get(id);
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';
    paintCtx.lineWidth = R * (colour === '#ffffff' ? 0.06 : thick ? 0.035 : 0.014);
    if (colour === 'rainbow') { hue = (hue + 6) % 360; paintCtx.strokeStyle = `hsl(${hue}, 90%, 55%)`; }
    else paintCtx.strokeStyle = colour;
    paintCtx.beginPath();
    paintCtx.moveTo(lastPt ? lastPt.x : x, lastPt ? lastPt.y : y);
    paintCtx.lineTo(x, y);
    paintCtx.stroke();
    strokes.set(id, { x, y });
    render();
  }

  function toPage(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * R),
      y: Math.round(((e.clientY - r.top) / r.height) * R),
    };
  }

  canvas.addEventListener('pointerdown', e => {
    Sound.unlock();
    const { x, y } = toPage(e);
    if (x < 0 || y < 0 || x >= R || y >= R) return;
    if (drawing) {
      canvas.setPointerCapture(e.pointerId);
      strokes.delete(e.pointerId);
      strokeTo(e.pointerId, x, y);
    } else {
      fillAt(x, y);
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing || !strokes.has(e.pointerId)) return;
    const { x, y } = toPage(e);
    strokeTo(e.pointerId, x, y);
  });
  const lift = e => strokes.delete(e.pointerId);
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);

  // ---------- buttons
  modeBtn.addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    drawing = !drawing;
    newPage();
    Sound.say(drawing ? 'Draw with your finger!' : 'Tap to colour in!');
  });
  brushBtn.addEventListener('click', () => { Sound.unlock(); Sound.pop(); thick = !thick; brushBtn.textContent = thick ? '●' : '•'; });
  document.getElementById('new').addEventListener('click', () => {
    Sound.unlock();
    Sound.pop();
    if (!drawing) picIdx = (picIdx + 1) % Pictures.LIST.length;
    newPage();
  });
  const showMute = () => { muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.isMuted()); showMute(); Sound.unlock(); Sound.pop(); });
  showMute();
  // Resizing would blur or crop the drawing, so only re-fit the display size.
  window.addEventListener('resize', () => {
    const r = stage.getBoundingClientRect();
    const css = Math.floor(Math.min(r.width, r.height) - 16);
    canvas.style.width = canvas.style.height = `${css}px`;
  });
  // Handy for poking at the game from the browser console.
  window.paintGame = { get areas() { return areaSize; }, get background() { return background; }, get labels() { return labels; }, get R() { return R; } };

  newPage();
  Sound.intro('Pick a colour, then tap the picture to colour it in!');
})();
