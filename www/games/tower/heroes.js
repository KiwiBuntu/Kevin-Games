// The heroes, drawn in code. Heroes.draw(ctx, key, x, y, s, { aim, t, cheer })
// (x, y) is between the feet, s is the hero's height, aim is the angle the web arm points.
const Heroes = (() => {
  const INK = '#2b2d42';
  const LIST = [
    { key: 'kevin', name: 'Super Kevin', web: '#ffffff' },
    { key: 'gecko', name: 'Gecko Kid', web: '#d4ff8a' },
    { key: 'robo', name: 'Robo', web: '#8ef3ff' },
  ];

  function limb(c, x1, y1, x2, y2, w, colour) {
    c.lineCap = 'round';
    c.strokeStyle = INK;
    c.lineWidth = w + 5;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = colour;
    c.lineWidth = w;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }

  function blob(c, x, y, r, fill) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.stroke();
  }

  function eyes(c, x, y, r, gap, lookX, lookY, blink) {
    for (const sx of [-1, 1]) {
      if (blink) {
        c.lineWidth = 3; c.strokeStyle = INK;
        c.beginPath(); c.moveTo(x + sx * gap - r, y); c.lineTo(x + sx * gap + r, y); c.stroke();
        continue;
      }
      blob(c, x + sx * gap, y, r, '#fff');
      c.beginPath();
      c.arc(x + sx * gap + lookX * r * 0.35, y + lookY * r * 0.35, r * 0.5, 0, Math.PI * 2);
      c.fillStyle = INK;
      c.fill();
    }
  }

  function smile(c, x, y, r, big) {
    c.beginPath();
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.lineCap = 'round';
    if (big) { c.arc(x, y - r * 0.3, r, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath(); c.fillStyle = '#ff6b6b'; c.fill(); }
    else c.arc(x, y - r * 0.4, r, 0.2 * Math.PI, 0.8 * Math.PI);
    c.stroke();
  }

  // Shared body plan; each hero adds its own look.
  function draw(c, key, x, y, s, o = {}) {
    const t = o.t || 0;
    const aim = o.aim ?? -Math.PI / 2;
    const look = { x: Math.cos(aim) * 0.6, y: Math.sin(aim) * 0.6 };
    const blink = (t % 4) > 3.85;
    const hipY = y - s * 0.3, shY = y - s * 0.6, headY = y - s * 0.8;
    const sway = Math.sin(t * 3) * s * 0.02;
    c.save();

    if (key === 'kevin') {
      // cape flapping behind
      const flap = Math.sin(t * 6) * s * 0.06;
      c.beginPath();
      c.moveTo(x - s * 0.16, shY);
      c.quadraticCurveTo(x - s * 0.34 + flap, y - s * 0.2, x - s * 0.26 + flap, y - s * 0.04);
      c.lineTo(x + s * 0.26 - flap, y - s * 0.04);
      c.quadraticCurveTo(x + s * 0.34 - flap, y - s * 0.2, x + s * 0.16, shY);
      c.closePath();
      c.fillStyle = '#ff4d4d'; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    }
    if (key === 'gecko') {
      // curly tail
      c.beginPath();
      c.moveTo(x + s * 0.08, hipY);
      c.bezierCurveTo(x + s * 0.4, hipY + s * 0.05, x + s * 0.42, y - s * 0.02 + sway, x + s * 0.28, y - s * 0.08);
      c.lineWidth = s * 0.08; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
      c.lineWidth = s * 0.08 - 5; c.strokeStyle = '#8ac926'; c.stroke();
    }

    const suit = key === 'kevin' ? '#3a86ff' : key === 'gecko' ? '#8ac926' : '#aab3c8';
    const skin = key === 'kevin' ? '#f2c29b' : suit;
    const legW = s * (key === 'robo' ? 0.12 : 0.1);
    // legs
    limb(c, x - s * 0.08, hipY, x - s * 0.1, y - s * 0.03, legW, key === 'kevin' ? '#1d4fa8' : suit);
    limb(c, x + s * 0.08, hipY, x + s * 0.1, y - s * 0.03, legW, key === 'kevin' ? '#1d4fa8' : suit);
    // boots / feet
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.ellipse(x + sx * s * 0.11, y - s * 0.025, s * 0.07, s * 0.035, 0, 0, Math.PI * 2);
      c.fillStyle = key === 'kevin' ? '#ff4d4d' : key === 'gecko' ? '#6aa31d' : '#6b7088';
      c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    }
    // body
    c.beginPath();
    c.roundRect(x - s * 0.16, shY - s * 0.02, s * 0.32, hipY - shY + s * 0.06, key === 'robo' ? s * 0.04 : s * 0.12);
    c.fillStyle = suit; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    if (key === 'kevin') {
      // star badge
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.035 : s * 0.075;
        c.lineTo(x + Math.cos(a) * r, (shY + hipY) / 2 + Math.sin(a) * r);
      }
      c.closePath(); c.fillStyle = '#ffd60a'; c.fill(); c.lineWidth = 2; c.stroke();
    } else if (key === 'robo') {
      c.beginPath(); c.roundRect(x - s * 0.09, shY + s * 0.06, s * 0.18, s * 0.1, s * 0.02);
      c.fillStyle = '#ffd60a'; c.fill(); c.lineWidth = 2; c.stroke();
      for (const sx of [-1, 1]) blob(c, x + sx * s * 0.04, shY + s * 0.11, s * 0.018, sx < 0 ? '#ff4d4d' : '#8ac926');
    } else {
      c.beginPath(); c.ellipse(x, (shY + hipY) / 2 + s * 0.02, s * 0.09, s * 0.11, 0, 0, Math.PI * 2);
      c.fillStyle = '#e6f7b0'; c.fill();
    }
    // arms: one aims the web, the other waves (or both up when cheering)
    const handLen = s * 0.3;
    const ax = x + Math.cos(aim) * handLen, ay = shY + Math.sin(aim) * handLen;
    const other = o.cheer ? -Math.PI / 2 - 0.5 : Math.PI / 2 + 0.6 + Math.sin(t * 2) * 0.15;
    const bx = x - s * 0.14 + Math.cos(other) * handLen * 0.8, by = shY + s * 0.04 + Math.sin(other) * handLen * 0.8;
    limb(c, x - s * 0.14, shY + s * 0.04, bx, by, s * 0.08, suit);
    limb(c, x + s * 0.12, shY + s * 0.02, ax, ay, s * 0.08, suit);
    for (const [hx, hy] of [[ax, ay], [bx, by]]) blob(c, hx, hy, s * 0.05, key === 'kevin' ? '#ff4d4d' : skin);
    if (key === 'kevin' || key === 'robo') blob(c, ax - Math.cos(aim) * s * 0.06, ay - Math.sin(aim) * s * 0.06, s * 0.03, '#ffd60a'); // web shooter

    // heads
    if (key === 'kevin') {
      blob(c, x, headY, s * 0.17, skin);
      // hair
      c.beginPath();
      c.arc(x, headY - s * 0.02, s * 0.17, Math.PI * 1.05, Math.PI * 1.95);
      c.quadraticCurveTo(x + s * 0.05, headY - s * 0.05, x - s * 0.16, headY - s * 0.04);
      c.fillStyle = '#6b4226'; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      // mask
      c.beginPath(); c.roundRect(x - s * 0.15, headY - s * 0.03, s * 0.3, s * 0.07, s * 0.03);
      c.fillStyle = '#ff4d4d'; c.fill(); c.stroke();
      eyes(c, x, headY + s * 0.005, s * 0.03, s * 0.06, look.x, look.y, blink);
      smile(c, x, headY + s * 0.1, s * 0.05, o.cheer);
    } else if (key === 'gecko') {
      c.beginPath(); c.ellipse(x, headY, s * 0.2, s * 0.15, 0, 0, Math.PI * 2);
      c.fillStyle = suit; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      c.beginPath(); c.roundRect(x - s * 0.19, headY - s * 0.07, s * 0.38, s * 0.07, s * 0.03);
      c.fillStyle = '#8338ec'; c.fill(); c.stroke();
      eyes(c, x, headY - s * 0.07, s * 0.055, s * 0.1, look.x, look.y, blink);
      smile(c, x, headY + s * 0.08, s * 0.07, o.cheer);
      for (const sx of [-1, 1]) blob(c, x + sx * s * 0.14, headY + s * 0.04, s * 0.018, '#ff9ec7');
    } else {
      // robot: antenna with a blinking light, screen face
      c.lineWidth = 3; c.strokeStyle = INK;
      c.beginPath(); c.moveTo(x, headY - s * 0.15); c.lineTo(x, headY - s * 0.24); c.stroke();
      blob(c, x, headY - s * 0.25, s * 0.035, Math.sin(t * 5) > 0 ? '#ff4d4d' : '#ffd60a');
      c.beginPath(); c.roundRect(x - s * 0.17, headY - s * 0.15, s * 0.34, s * 0.28, s * 0.06);
      c.fillStyle = suit; c.fill(); c.stroke();
      c.beginPath(); c.roundRect(x - s * 0.13, headY - s * 0.11, s * 0.26, s * 0.2, s * 0.04);
      c.fillStyle = '#20305a'; c.fill();
      c.fillStyle = '#8ef3ff';
      for (const sx of [-1, 1]) {
        c.beginPath();
        if (blink) c.fillRect(x + sx * s * 0.06 - s * 0.03, headY - s * 0.03, s * 0.06, s * 0.012);
        else c.arc(x + sx * s * 0.06 + look.x * s * 0.01, headY - s * 0.03 + look.y * s * 0.01, s * 0.03, 0, Math.PI * 2);
        c.fill();
      }
      c.beginPath(); c.lineWidth = 3; c.strokeStyle = '#8ef3ff';
      c.arc(x, headY + s * 0.0, s * 0.05, 0.2 * Math.PI, 0.8 * Math.PI);
      c.stroke();
      for (const sx of [-1, 1]) blob(c, x + sx * s * 0.19, headY - s * 0.01, s * 0.03, '#ffd60a'); // ear bolts
    }
    c.restore();
    return { handX: ax, handY: ay };
  }

  return { LIST, draw };
})();
