// Confetti burst over the whole screen.
const Celebrate = (() => {
  const COLORS = ['#ff4d4d', '#ff9f1c', '#ffd60a', '#06d6a0', '#3a86ff', '#8338ec', '#ff5fa2'];
  let canvas = null;
  let ctx = null;
  let bits = [];
  let running = false;

  function setup() {
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  function frame() {
    const dpr = window.devicePixelRatio || 1;
    const w = innerWidth, h = innerHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 0.25;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.spin;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      if (b.star) drawStar(ctx, b.size);
      else ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      ctx.restore();
    }
    bits = bits.filter(b => b.y < h + 40);
    if (bits.length) requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, w, h); }
  }

  function drawStar(c, s) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.4 : s;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  }

  return {
    burst(count = 160) {
      if (!canvas) setup();
      const w = innerWidth, h = innerHeight;
      for (let i = 0; i < count; i++) {
        const fromLeft = i % 2 === 0;
        bits.push({
          x: fromLeft ? -10 : w + 10,
          y: h * (0.4 + Math.random() * 0.4),
          vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 9),
          vy: -(8 + Math.random() * 10),
          rot: Math.random() * 6,
          spin: (Math.random() - 0.5) * 0.4,
          size: 8 + Math.random() * 10,
          color: COLORS[i % COLORS.length],
          star: Math.random() < 0.3,
        });
      }
      if (!running) { running = true; requestAnimationFrame(frame); }
    },
  };
})();
