// Colouring-in pictures: outlines only, drawn in a 0–1 square (the caller scales it up).
// Every closed shape becomes an area that can be tapped and filled.
const Pictures = (() => {
  const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); };
  const oval = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.stroke(); };
  const shape = (c, pts) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.stroke();
  };
  const line = (c, pts) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  };
  const box = (c, x0, y0, x1, y1) => shape(c, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const star = (c, x, y, r) => shape(c, Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.45 : r;
    return [x + Math.cos(a) * d, y + Math.sin(a) * d];
  }));

  const LIST = [
    {
      name: 'fish',
      draw(c) {
        oval(c, 0.44, 0.5, 0.3, 0.2);
        shape(c, [[0.73, 0.5], [0.93, 0.32], [0.93, 0.68]]);
        shape(c, [[0.36, 0.31], [0.5, 0.18], [0.56, 0.31]]);
        circle(c, 0.27, 0.45, 0.045);
        circle(c, 0.27, 0.45, 0.018);
        c.beginPath(); c.arc(0.3, 0.5, 0.2, -0.45 * Math.PI, 0.45 * Math.PI); c.stroke();
        c.beginPath(); c.arc(0.42, 0.5, 0.2, -0.42 * Math.PI, 0.42 * Math.PI); c.stroke();
        circle(c, 0.12, 0.25, 0.035);
        circle(c, 0.08, 0.14, 0.022);
        line(c, [[0, 0.88], [0.2, 0.84], [0.4, 0.89], [0.6, 0.84], [0.8, 0.89], [1, 0.85]]);
      },
    },
    {
      name: 'house',
      draw(c) {
        box(c, 0.2, 0.45, 0.8, 0.88);
        shape(c, [[0.12, 0.45], [0.5, 0.16], [0.88, 0.45]]);
        box(c, 0.43, 0.64, 0.57, 0.88);
        for (const x of [0.26, 0.62]) {
          box(c, x, 0.54, x + 0.12, 0.66);
          line(c, [[x + 0.06, 0.54], [x + 0.06, 0.66]]);
          line(c, [[x, 0.6], [x + 0.12, 0.6]]);
        }
        circle(c, 0.86, 0.13, 0.07);
        line(c, [[0, 0.88], [1, 0.88]]);
        shape(c, [[0.08, 0.2], [0.14, 0.16], [0.22, 0.17], [0.26, 0.22], [0.2, 0.26], [0.1, 0.25]]);
      },
    },
    {
      name: 'flower',
      draw(c) {
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          oval(c, 0.5 + Math.cos(a) * 0.18, 0.34 + Math.sin(a) * 0.18, 0.1, 0.065, a);
        }
        circle(c, 0.5, 0.34, 0.08);
        box(c, 0.48, 0.52, 0.52, 0.78);
        oval(c, 0.39, 0.64, 0.09, 0.04, -0.5);
        oval(c, 0.61, 0.6, 0.09, 0.04, 0.5);
        shape(c, [[0.34, 0.78], [0.66, 0.78], [0.61, 0.95], [0.39, 0.95]]);
      },
    },
    {
      name: 'car',
      draw(c) {
        c.beginPath(); c.roundRect(0.08, 0.5, 0.84, 0.22, 0.06); c.stroke();
        shape(c, [[0.25, 0.5], [0.35, 0.3], [0.65, 0.3], [0.76, 0.5]]);
        line(c, [[0.5, 0.3], [0.5, 0.5]]);
        for (const x of [0.28, 0.72]) { circle(c, x, 0.74, 0.1); circle(c, x, 0.74, 0.04); }
        circle(c, 0.86, 0.58, 0.03);
        line(c, [[0, 0.86], [1, 0.86]]);
        circle(c, 0.15, 0.15, 0.08);
      },
    },
    {
      name: 'cat',
      draw(c) {
        shape(c, [[0.24, 0.42], [0.26, 0.1], [0.44, 0.28]]);
        shape(c, [[0.76, 0.42], [0.74, 0.1], [0.56, 0.28]]);
        circle(c, 0.5, 0.55, 0.3);
        oval(c, 0.39, 0.5, 0.05, 0.07);
        oval(c, 0.61, 0.5, 0.05, 0.07);
        shape(c, [[0.46, 0.62], [0.54, 0.62], [0.5, 0.67]]);
        c.beginPath(); c.arc(0.45, 0.67, 0.05, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
        c.beginPath(); c.arc(0.55, 0.67, 0.05, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
        for (const s of [-1, 1]) {
          line(c, [[0.5 + s * 0.12, 0.64], [0.5 + s * 0.32, 0.6]]);
          line(c, [[0.5 + s * 0.12, 0.68], [0.5 + s * 0.32, 0.7]]);
        }
      },
    },
    {
      name: 'rocket',
      draw(c) {
        shape(c, [[0.5, 0.08], [0.62, 0.28], [0.62, 0.72], [0.38, 0.72], [0.38, 0.28]]);
        line(c, [[0.38, 0.28], [0.62, 0.28]]);
        circle(c, 0.5, 0.42, 0.065);
        shape(c, [[0.38, 0.52], [0.24, 0.76], [0.38, 0.72]]);
        shape(c, [[0.62, 0.52], [0.76, 0.76], [0.62, 0.72]]);
        shape(c, [[0.42, 0.72], [0.46, 0.84], [0.5, 0.78], [0.54, 0.84], [0.58, 0.72]]);
        star(c, 0.15, 0.2, 0.06);
        star(c, 0.85, 0.5, 0.05);
        star(c, 0.18, 0.85, 0.045);
        circle(c, 0.82, 0.18, 0.08);
        oval(c, 0.82, 0.18, 0.14, 0.035, -0.3);
      },
    },
    {
      name: 'butterfly',
      draw(c) {
        for (const s of [-1, 1]) {
          oval(c, 0.5 + s * 0.19, 0.36, 0.17, 0.13, s * -0.45);
          oval(c, 0.5 + s * 0.15, 0.64, 0.12, 0.1, s * 0.45);
          circle(c, 0.5 + s * 0.22, 0.34, 0.05);
          circle(c, 0.5 + s * 0.15, 0.65, 0.035);
          line(c, [[0.5 + s * 0.015, 0.3], [0.5 + s * 0.1, 0.13]]);
          circle(c, 0.5 + s * 0.11, 0.11, 0.02);
        }
        oval(c, 0.5, 0.5, 0.04, 0.22);
      },
    },
  ];

  return { LIST };
})();
