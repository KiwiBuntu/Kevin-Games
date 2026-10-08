// Cartoon pictures for the jigsaw, drawn in code: a background plus big emoji.
// Each scene draws into a square of size S. Positions and sizes are fractions of S.
const Scenes = (() => {
  const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

  function sky(ctx, S, top, bottom, upTo = 1) {
    const g = ctx.createLinearGradient(0, 0, 0, S * upTo);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S * upTo);
  }

  function hill(ctx, S, x, y, rx, ry, colour) {
    ctx.beginPath();
    ctx.ellipse(x * S, y * S, rx * S, ry * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }

  function ground(ctx, S, from, colour) {
    ctx.fillStyle = colour;
    ctx.fillRect(0, from * S, S, S * (1 - from));
  }

  function sun(ctx, S, x, y, r) {
    ctx.beginPath();
    ctx.arc(x * S, y * S, r * S * 1.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 214, 10, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x * S, y * S, r * S, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd60a';
    ctx.fill();
  }

  function dots(ctx, S, count, colour, rMax, seed) {
    // Same "random" dots every time so the picture never changes between pieces.
    let s = seed;
    const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    ctx.fillStyle = colour;
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(rand() * S, rand() * S, (0.3 + rand() * 0.7) * rMax * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function bubbles(ctx, S, list) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = S * 0.006;
    for (const [x, y, r] of list) {
      ctx.beginPath();
      ctx.arc(x * S, y * S, r * S, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function emoji(ctx, S, list) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [ch, x, y, size, flip] of list) {
      ctx.save();
      ctx.font = `${Math.round(size * S)}px ${EMOJI_FONT}`;
      ctx.translate(x * S, y * S);
      if (flip) ctx.scale(-1, 1);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
  }

  const LIST = [
    {
      name: 'A farm!',
      draw(ctx, S) {
        sky(ctx, S, '#7fd3ff', '#d6f3ff', 0.65);
        sun(ctx, S, 0.85, 0.15, 0.08);
        hill(ctx, S, 0.2, 0.7, 0.5, 0.18, '#7dd36b');
        hill(ctx, S, 0.85, 0.72, 0.45, 0.16, '#6cc65a');
        ground(ctx, S, 0.68, '#5cc85a');
        emoji(ctx, S, [
          ['☁️', 0.2, 0.14, 0.14], ['☁️', 0.55, 0.1, 0.1],
          ['🏡', 0.26, 0.48, 0.3], ['🌳', 0.82, 0.46, 0.24],
          ['🐮', 0.6, 0.72, 0.22], ['🐷', 0.87, 0.84, 0.15], ['🐔', 0.15, 0.82, 0.14],
          ['🌻', 0.4, 0.88, 0.11], ['🐑', 0.52, 0.5, 0.12],
        ]);
      },
    },
    {
      name: 'Space!',
      draw(ctx, S) {
        sky(ctx, S, '#1b1f4b', '#3d2a7a');
        dots(ctx, S, 70, '#ffffff', 0.006, 7);
        emoji(ctx, S, [
          ['🌙', 0.16, 0.17, 0.18], ['🪐', 0.76, 0.24, 0.28], ['🚀', 0.38, 0.55, 0.36],
          ['👽', 0.78, 0.76, 0.2], ['🌍', 0.15, 0.82, 0.2], ['⭐', 0.55, 0.15, 0.08],
          ['⭐', 0.92, 0.52, 0.07], ['🛸', 0.6, 0.88, 0.13],
        ]);
      },
    },
    {
      name: 'Under the sea!',
      draw(ctx, S) {
        sky(ctx, S, '#3ec7ff', '#0b5fa5');
        ctx.fillStyle = '#f5d98b';
        ctx.beginPath();
        ctx.moveTo(0, S * 0.86);
        ctx.quadraticCurveTo(S * 0.5, S * 0.78, S, S * 0.88);
        ctx.lineTo(S, S);
        ctx.lineTo(0, S);
        ctx.fill();
        bubbles(ctx, S, [[0.55, 0.2, 0.02], [0.58, 0.12, 0.014], [0.9, 0.3, 0.018], [0.12, 0.55, 0.016], [0.48, 0.5, 0.012]]);
        emoji(ctx, S, [
          ['🐬', 0.3, 0.26, 0.26], ['🐠', 0.75, 0.38, 0.2], ['🐙', 0.28, 0.72, 0.26],
          ['🐢', 0.74, 0.7, 0.22], ['🦀', 0.55, 0.9, 0.12], ['🐚', 0.9, 0.92, 0.09],
          ['🌿', 0.07, 0.86, 0.15], ['🐡', 0.85, 0.12, 0.12],
        ]);
      },
    },
    {
      name: 'A choo choo train!',
      draw(ctx, S) {
        sky(ctx, S, '#8fdcff', '#e3f7ff', 0.6);
        sun(ctx, S, 0.14, 0.15, 0.08);
        hill(ctx, S, 0.3, 0.62, 0.55, 0.2, '#8ad97a');
        hill(ctx, S, 0.95, 0.6, 0.4, 0.18, '#78cf66');
        ground(ctx, S, 0.6, '#5cc85a');
        // railway track
        ctx.fillStyle = '#9c6b3c';
        for (let x = 0; x < 1; x += 0.06) ctx.fillRect(x * S, S * 0.79, S * 0.03, S * 0.06);
        ctx.fillStyle = '#5b5f73';
        ctx.fillRect(0, S * 0.8, S, S * 0.012);
        ctx.fillRect(0, S * 0.83, S, S * 0.012);
        emoji(ctx, S, [
          ['☁️', 0.5, 0.14, 0.13], ['☁️', 0.82, 0.22, 0.11], ['🌈', 0.62, 0.42, 0.26],
          ['🚂', 0.24, 0.7, 0.3], ['🚃', 0.52, 0.71, 0.24], ['🚃', 0.77, 0.71, 0.24],
          ['🌲', 0.9, 0.5, 0.13], ['🌼', 0.12, 0.93, 0.08], ['🌼', 0.62, 0.93, 0.08],
        ]);
      },
    },
    {
      name: 'Dinosaurs!',
      draw(ctx, S) {
        sky(ctx, S, '#ffb36b', '#ffe7a8', 0.65);
        hill(ctx, S, 0.75, 0.66, 0.5, 0.14, '#b98a52');
        ground(ctx, S, 0.65, '#8ac926');
        emoji(ctx, S, [
          ['🌋', 0.72, 0.42, 0.36], ['🌴', 0.1, 0.5, 0.26], ['🦖', 0.32, 0.64, 0.36],
          ['🦕', 0.74, 0.77, 0.3], ['🥚', 0.5, 0.9, 0.09], ['🥚', 0.57, 0.92, 0.07],
          ['🦴', 0.15, 0.9, 0.1], ['☁️', 0.35, 0.12, 0.12],
        ]);
      },
    },
    {
      name: 'The jungle!',
      draw(ctx, S) {
        sky(ctx, S, '#a8f0c6', '#e9ffd8', 0.6);
        sun(ctx, S, 0.5, 0.12, 0.07);
        ground(ctx, S, 0.62, '#4fae4a');
        emoji(ctx, S, [
          ['🌴', 0.1, 0.38, 0.32], ['🌴', 0.9, 0.36, 0.3], ['🦒', 0.72, 0.5, 0.36],
          ['🐘', 0.32, 0.66, 0.32], ['🦁', 0.66, 0.82, 0.2], ['🐒', 0.13, 0.15, 0.14],
          ['🦜', 0.86, 0.12, 0.12], ['🐍', 0.18, 0.9, 0.12],
        ]);
      },
    },
  ];

  return { LIST };
})();
