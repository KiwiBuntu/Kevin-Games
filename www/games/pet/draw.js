// My Pet: drawing the pets. PetArt.draw(ctx, opts) draws a pet standing with its feet at (x, y).
// opts: { species, stage, mood, x, y, s (size), t (time), face (-1 left / 1 right), squish, eggTaps }
const PetArt = (() => {
  const INK = '#2b2d42';
  const LOOK = {
    dino: { body: '#7bd36b', belly: '#e9f7b0', dark: '#4fa84a', cheek: '#ff9eb5' },
    kitty: { body: '#ffb35c', belly: '#ffe7c4', dark: '#e0852a', cheek: '#ff8fa8' },
    dragon: { body: '#a98cff', belly: '#ffe39a', dark: '#7a5ad6', cheek: '#ff9ec7' },
    bunny: { body: '#f4f1f8', belly: '#ffd6e6', dark: '#cfc7dd', cheek: '#ff9ec7' },
    doggie: { body: '#c98b56', belly: '#f6dcc0', dark: '#8b5a33', cheek: '#ff9eb5' },
  };

  function blob(c, x, y, rx, ry, fill, stroke = true, rot = 0) {
    c.beginPath();
    c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (stroke) { c.lineWidth = 3; c.strokeStyle = INK; c.stroke(); }
  }
  function tri(c, pts, fill) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = fill; c.fill();
    c.lineWidth = 3; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
  }

  function egg(c, o) {
    const { x, y, s, t } = o;
    const taps = o.eggTaps || 0;
    const wob = Math.sin(t * (6 + taps * 3)) * (0.04 + taps * 0.03);
    c.save();
    c.translate(x, y);
    c.rotate(wob);
    blob(c, 0, -s * 0.38, s * 0.3, s * 0.38, '#fff6e0');
    // spots
    c.fillStyle = '#ffb35c';
    for (const [sx, sy, r] of [[-0.12, -0.5, 0.06], [0.1, -0.3, 0.08], [-0.05, -0.18, 0.05], [0.14, -0.58, 0.04]]) {
      c.beginPath(); c.arc(sx * s, sy * s, r * s, 0, Math.PI * 2); c.fill();
    }
    // cracks appear as it's tapped
    if (taps > 0) {
      c.beginPath();
      c.moveTo(-s * 0.28, -s * 0.42);
      const pts = [[-0.18, -0.36], [-0.1, -0.46], [-0.02, -0.38], [0.06, -0.48], [0.14, -0.39], [0.22, -0.47], [0.29, -0.4]];
      pts.slice(0, Math.min(pts.length, taps * 2)).forEach(([px, py]) => c.lineTo(px * s, py * s));
      c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    }
    c.restore();
  }

  function eyes(c, o, hx, hy, r) {
    const { mood, t, s } = o;
    const look = o.face * r * 0.05;
    const blink = (t % 3.7) < 0.12;
    const gap = r * 0.42;
    for (const sx of [-1, 1]) {
      const ex = hx + sx * gap + look, ey = hy - r * 0.05;
      c.lineWidth = 3; c.strokeStyle = INK; c.lineCap = 'round';
      if (mood === 'asleep' || blink) {
        c.beginPath(); c.arc(ex, ey, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      } else if (mood === 'happy') {
        c.beginPath(); c.arc(ex, ey + r * 0.05, r * 0.13, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
      } else if (mood === 'sick') {
        // dizzy swirls
        c.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.3) c.lineTo(ex + Math.cos(a + t * 3) * a * r * 0.012, ey + Math.sin(a + t * 3) * a * r * 0.012);
        c.stroke();
      } else {
        const sleepy = mood === 'sleepy';
        blob(c, ex, ey, r * 0.15, r * (sleepy ? 0.09 : 0.18), '#fff', true);
        blob(c, ex + look, ey + r * (sleepy ? 0.02 : 0.03), r * 0.08, r * (sleepy ? 0.06 : 0.1), INK, false);
        blob(c, ex + look - r * 0.03, ey - r * 0.03, r * 0.03, r * 0.03, '#fff', false);
        if (sleepy) { c.beginPath(); c.moveTo(ex - r * 0.17, ey - r * 0.06); c.lineTo(ex + r * 0.17, ey - r * 0.06); c.stroke(); }
        if (mood === 'sad' || mood === 'ache') { c.beginPath(); c.moveTo(ex - sx * r * 0.18, ey - r * 0.3); c.lineTo(ex + sx * r * 0.05, ey - r * 0.22); c.stroke(); }
      }
    }
    // cheeks
    c.globalAlpha = 0.55;
    for (const sx of [-1, 1]) blob(c, hx + sx * r * 0.62, hy + r * 0.22, r * 0.13, r * 0.08, LOOK[o.species].cheek, false);
    c.globalAlpha = 1;
    // mouth
    const my = hy + r * 0.32;
    c.beginPath(); c.lineWidth = 3; c.strokeStyle = INK;
    if (mood === 'happy' || mood === 'ok') { c.arc(hx, my - r * 0.08, r * 0.16, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    else if (mood === 'hungry') { blob(c, hx, my, r * 0.12, r * 0.12, '#ff6b6b'); blob(c, hx + r * 0.1, my + r * 0.16 + Math.sin(t * 3) * r * 0.03, r * 0.04, r * 0.06, '#9fdcff', false); }
    else if (mood === 'sleepy') { blob(c, hx, my, r * 0.08, r * (0.06 + Math.abs(Math.sin(t)) * 0.08), '#ff6b6b'); }
    else if (mood === 'asleep') { c.arc(hx, my - r * 0.05, r * 0.06, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
    else { c.arc(hx, my + r * 0.1, r * 0.13, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke(); }
  }

  function pet(c, o) {
    if (o.stage === 'egg') return egg(c, o);
    const L = LOOK[o.species];
    const st = o.stage;
    const size = o.s * (st === 'baby' ? 0.66 : st === 'kid' ? 0.84 : 1);
    const big = st === 'baby' ? 1.18 : st === 'kid' ? 1.07 : 1; // babies have big heads
    const bounce = o.mood === 'asleep' ? 0 : Math.abs(Math.sin(o.t * (o.mood === 'happy' ? 5 : 2.5))) * size * 0.03;
    const breathe = 1 + Math.sin(o.t * (o.mood === 'asleep' ? 1.2 : 2)) * 0.02;
    const sq = o.squish || 0;
    c.save();
    c.translate(o.x, o.y - bounce);
    c.scale(o.face < 0 ? -1 : 1, 1);
    c.scale(1 + sq * 0.15, 1 - sq * 0.15);
    const s = size;
    const bx = 0, by = -s * 0.3, brx = s * 0.3, bry = s * 0.26 * breathe;
    const hr = s * 0.25 * big, hx = s * 0.05, hy = by - bry - hr * 0.55;

    // ---- behind the body: tails, wings, spikes
    const wag = Math.sin(o.t * (o.mood === 'happy' ? 12 : 4)) * 0.3;
    if (o.species === 'dino') {
      tri(c, [[-brx * 0.7, by], [-brx * 1.9, by + bry * 0.6 + wag * s * 0.1], [-brx * 0.6, by + bry * 0.7]], L.body);
      // spikes down the back
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * (0.62 + i * 0.13), px = Math.cos(a) * brx, py = by + Math.sin(-a) * bry;
        tri(c, [[px - s * 0.05, py + s * 0.02], [px - s * 0.06 + Math.cos(a) * s * 0.1, py - s * 0.1], [px + s * 0.04, py - s * 0.02]], L.dark);
      }
    } else if (o.species === 'dragon') {
      for (const sx of [1]) tri(c, [[-brx * 0.2, by - bry * 0.6], [-brx * 1.2, by - bry * (1.6 + Math.sin(o.t * 6) * 0.15)], [-brx * 1.25, by - bry * 0.5], [-brx * 0.5, by]], L.dark);
      c.beginPath(); c.moveTo(-brx * 0.8, by + bry * 0.4); c.quadraticCurveTo(-brx * 1.8, by + bry * (0.9 + wag), -brx * 1.6, by - bry * 0.2);
      c.lineWidth = s * 0.07; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = s * 0.07 - 5; c.strokeStyle = L.body; c.stroke();
      tri(c, [[-brx * 1.6, by - bry * 0.2], [-brx * 1.75, by - bry * 0.55], [-brx * 1.42, by - bry * 0.4]], L.dark);
    } else if (o.species === 'kitty') {
      c.beginPath(); c.moveTo(-brx * 0.8, by + bry * 0.3); c.bezierCurveTo(-brx * 1.6, by, -brx * 1.2, by - bry * (1.6 + wag), -brx * 0.7, by - bry * 1.3);
      c.lineWidth = s * 0.08; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = s * 0.08 - 5; c.strokeStyle = L.body; c.stroke();
    } else if (o.species === 'bunny') {
      blob(c, -brx * 0.95, by + bry * 0.2, s * 0.08, s * 0.08, '#fff');
    } else if (o.species === 'doggie') {
      c.save(); c.translate(-brx * 0.85, by - bry * 0.1); c.rotate(-0.9 + wag * 1.5);
      blob(c, 0, -s * 0.09, s * 0.05, s * 0.11, L.body); c.restore();
    }

    // ---- feet and body
    for (const fx of [-0.15, 0.17]) blob(c, fx * s, -s * 0.04, s * 0.09, s * 0.05, L.dark);
    blob(c, bx, by, brx, bry, L.body);
    blob(c, bx + s * 0.04, by + bry * 0.15, brx * 0.62, bry * 0.65, L.belly, false);
    // arms (holding the tummy when it aches)
    if (o.mood === 'ache') { blob(c, s * 0.04, by + bry * 0.1, s * 0.07, s * 0.05, L.dark); blob(c, s * 0.14, by + bry * 0.05, s * 0.07, s * 0.05, L.dark); }
    else { blob(c, brx * 0.85, by - bry * 0.05, s * 0.05, s * 0.09, L.dark, true, -0.5); }

    // ---- head
    if (o.species === 'kitty') for (const sx of [-1, 1]) tri(c, [[hx + sx * hr * 0.75, hy - hr * 0.45], [hx + sx * hr * 0.85, hy - hr * 1.25], [hx + sx * hr * 0.2, hy - hr * 0.9]], L.body);
    if (o.species === 'bunny') for (const sx of [-1, 1]) {
      c.save(); c.translate(hx + sx * hr * 0.4, hy - hr * 0.8); c.rotate(sx * 0.15 + (o.mood === 'sad' ? sx * 0.9 : 0));
      blob(c, 0, -hr * 0.6, hr * 0.2, hr * 0.7, L.body); blob(c, 0, -hr * 0.6, hr * 0.1, hr * 0.5, L.belly, false); c.restore();
    }
    if (o.species === 'dragon') for (const sx of [-1, 1]) tri(c, [[hx + sx * hr * 0.45, hy - hr * 0.7], [hx + sx * hr * 0.6, hy - hr * 1.3], [hx + sx * hr * 0.2, hy - hr * 0.85]], '#ffe39a');
    blob(c, hx, hy, hr, hr * 0.92, L.body);
    if (o.species === 'dino' || o.species === 'dragon') blob(c, hx + hr * 0.35, hy + hr * 0.3, hr * 0.5, hr * 0.38, L.belly, false);
    if (o.species === 'doggie') {
      for (const sx of [-1, 1]) { c.save(); c.translate(hx + sx * hr * 0.95, hy - hr * 0.45); c.rotate(sx * 0.45 + Math.sin(o.t * 2) * 0.05);
        blob(c, sx * hr * 0.08, hr * 0.38, hr * 0.2, hr * 0.42, L.dark); c.restore(); }
      blob(c, hx - hr * 0.42, hy - hr * 0.12, hr * 0.22, hr * 0.2, L.dark, false); // patch round one eye
      blob(c, hx, hy + hr * 0.18, hr * 0.13, hr * 0.09, INK, false); // nose
    }
    if (o.species === 'kitty' || o.species === 'bunny') blob(c, hx, hy + hr * 0.16, hr * 0.07, hr * 0.05, '#ff8fa8', false);
    if (o.species === 'kitty') {
      c.lineWidth = 2; c.strokeStyle = INK;
      for (const sx of [-1, 1]) for (const dy of [0.12, 0.25]) { c.beginPath(); c.moveTo(hx + sx * hr * 0.35, hy + hr * dy); c.lineTo(hx + sx * hr * 0.95, hy + hr * (dy - 0.05)); c.stroke(); }
    }
    eyes(c, o, hx, hy, hr);

    // ---- what they wear as they grow
    if (st === 'kid' || st === 'grown') {
      c.beginPath(); c.moveTo(hx - hr * 0.7, hy + hr * 0.82); c.quadraticCurveTo(hx, hy + hr * 1.2, hx + hr * 0.7, hy + hr * 0.82);
      c.lineWidth = s * 0.06; c.strokeStyle = INK; c.stroke(); c.lineWidth = s * 0.06 - 5; c.strokeStyle = '#ff4d4d'; c.stroke();
    }
    if (st === 'grown' && !o.noCrown) {
      tri(c, [[hx - hr * 0.35, hy - hr * 0.8], [hx - hr * 0.25, hy - hr * 1.25], [hx - hr * 0.05, hy - hr * 0.98], [hx + hr * 0.12, hy - hr * 1.3], [hx + hr * 0.25, hy - hr * 0.98], [hx + hr * 0.45, hy - hr * 1.25], [hx + hr * 0.4, hy - hr * 0.78]], '#ffd60a');
    }
    // ---- grubby when dirty
    if (o.dirt > 0) {
      c.globalAlpha = Math.min(0.75, o.dirt);
      c.fillStyle = '#8b5a33';
      for (const [dx, dy, r] of [[-0.12, -0.25, 0.04], [0.15, -0.35, 0.05], [0.02, -0.18, 0.03], [-0.05, -0.62, 0.03]]) { c.beginPath(); c.arc(dx * s, dy * s, r * s, 0, Math.PI * 2); c.fill(); }
      c.globalAlpha = 1;
    }
    c.restore();
    // sick: a thermometer (drawn the right way round)
    if (o.mood === 'sick') {
      c.save(); c.translate(o.x + s * 0.1, o.y - bounce + (hy + hr * 0.38)); c.rotate(0.6);
      c.fillStyle = '#fff'; c.fillRect(0, -3, s * 0.18, 6); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(0, -3, s * 0.18, 6);
      blob(c, s * 0.18, 0, 5, 5, '#ff4d4d'); c.restore();
    }
    return { headX: o.x + (o.face < 0 ? -hx : hx), headY: o.y - bounce + hy, size: s, hr };
  }

  return { draw: pet, LOOK };
})();
