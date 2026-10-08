import { HL, hairline } from './kernel.js';
/**
 * Ticker: a floating LED tape, a 7-row dot matrix behind a bezel in a slim
 * housing, running stock symbols right to left in a 5 × 7 dot font. The
 * letters near the pointer jumble, each flickering through other letters on
 * its own clock, and settle back once the pointer moves off, staggered by
 * distance. The slider is the jumble's reach, in columns.
 *
 * The pattern: ambient motion. The tape steps one column at a time and runs
 * only while the figure is visible; under reduced motion it holds still with
 * a symbol in the middle. The reach is tested against the pointer's column on
 * the display's face plane, which never moves.
 *
 * Rule 10 is set aside here on purpose, at the product owner's request: the
 * symbols are the subject. They are lit dots, never text.
 */
const {
  Cam, facing, fit, poly, prism, proj, rings, rrect, reducedMotion,
  disposer, mk, place, pointer, put, register, solid,
} = HL;

const NC = 46, NR = 7, PITCH = 4.6, MX = 6, MZ = 3.6, D = 8, DOT = 1.65;
const W = NC * PITCH + 2 * MX, H = NR * PITCH + 2 * MZ;
// one column of the tape, and the stagger per letter of distance, in ms
const STEP = 120, STAG = 50, CW = 6, GAPW = 5;
const SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "JPM"];
const HOME = 2; // under reduced motion, and at first, NVDA sits mid-tape

// 5 × 7 glyphs, a row to a number, the leftmost dot the highest bit
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], P: [30, 17, 17, 30, 16, 16, 16], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], S: [15, 16, 16, 14, 1, 1, 30], F: [31, 16, 16, 30, 16, 16, 16],
  T: [31, 4, 4, 4, 4, 4, 4], N: [17, 25, 21, 19, 17, 17, 17], V: [17, 17, 17, 17, 17, 10, 4],
  D: [30, 17, 17, 17, 17, 17, 30], Z: [31, 1, 2, 4, 8, 16, 31], G: [15, 16, 16, 23, 17, 17, 15],
  O: [14, 17, 17, 17, 17, 17, 14], E: [31, 16, 16, 30, 16, 16, 31], J: [7, 2, 2, 2, 2, 18, 12],
};
const KEYS = Object.keys(FONT);

/** The tape: each column's letter (or -1 in a space) and its column in the glyph; each letter; where each symbol starts. */
function lay() {
  const cols = [], letters = [], starts = [];
  SYMBOLS.forEach((sym, s) => {
    starts.push(cols.length);
    for (const ch of sym) {
      const k = letters.length, start = cols.length;
      letters.push({ ch, s, start, shown: ch, want: false, at: 0, next: 0 });
      for (let x = 0; x < CW; x++) cols.push({ k: x < 5 ? k : -1, x, s });
    }
    for (let x = 0; x < GAPW; x++) cols.push({ k: -1, x: 0, s });
  });
  return { cols, letters, starts };
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let reach = value;
  const { cols, letters, starts } = lay(), L = cols.length;
  const home = NC / 2 - (starts[HOME] + (SYMBOLS[HOME].length * CW - 1) / 2);
  let off = Math.round(home), acc = 0;

  const C = Cam(45, 0.5, 1.68);
  fit(C, [[0, -D, 0], [W, 0, 0], [0, -D, H], [W, 0, H]], 200, 160);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [hr, hin] = rings(0, -D, W, 0, 3.5, 1.2);
  put(solid(g), prism(P, front, hr, hin, 0, H));
  // the bezel: the display's window, and the dim lip of its recess just inside it
  const onFace = (ring) => poly(ring.map((q) => P(q.u, 0, q.v)));
  mk("path", { d: onFace(rrect(MX - 2.6, MZ - 2, W - MX + 2.6, H - MZ + 2, 2.2, 4)), class: "nf" }, g);
  mk("path", { d: onFace(rrect(MX - 1.5, MZ - 0.9, W - MX + 1.5, H - MZ + 0.9, 1.4, 4)), class: "nf lo" }, g);

  // Each LED is a dim dot with a lit one over it. The lit one is shown by its radius, which
  // changes at once, so the tape steps crisply; a class change would fade over 260ms.
  const dots = [];
  for (let c = 0; c < NC; c++) for (let r = 0; r < NR; r++) {
    const at = P(MX + (c + 0.5) * PITCH, 0, H - MZ - (r + 0.5) * PITCH);
    place(mk("circle", { r: DOT, class: "dot off" }, g), at);
    const el = mk("circle", { r: 0, class: "dot" }, g);
    place(el, at);
    dots.push({ c, r, el, lit: false, cls: "dot" });
  }

  // The hit test reads the face plane y = 0, which never moves: screen = O + x·ex + z·ez.
  const O = P(0, 0, 0), X = P(1, 0, 0), Z = P(0, 0, 1);
  const ex = [X[0] - O[0], X[1] - O[1]], ez = [Z[0] - O[0], Z[1] - O[1]], det = ex[0] * ez[1] - ex[1] * ez[0];
  /** The pointer's fractional display column, or null off the strip. */
  function hit([sx, sy]) {
    const qx = sx - O[0], qy = sy - O[1];
    const x = (qx * ez[1] - qy * ez[0]) / det, z = (ex[0] * qy - ex[1] * qx) / det;
    const cf = (x - MX) / PITCH - 0.5;
    return cf < -1 || cf > NC || z < -2 || z > H + 2 ? null : cf;
  }

  // the tape runs right to left: display column c shows tape column c − off, and off falls a step at a time
  const tapeAt = (c) => cols[(((c - off) % L) + L) % L];
  /** Letter k's middle as a display column, the copy nearest the pointer. */
  function centre(k, near) {
    const c = letters[k].start + 2 + off;
    return c + Math.round((near - c) / L) * L;
  }

  let over = null, last = NC / 2;
  /** Which letters jumble: each turns when the reach changes for it, later the farther it is from the pointer. */
  function jumble(now) {
    const still = reducedMotion();
    letters.forEach((lt, k) => {
      const d = Math.abs(centre(k, last) - last), want = over !== null && d <= reach;
      if (want !== lt.want) { lt.want = want; lt.at = now + (d / CW) * STAG; }
      const on = now >= lt.at ? lt.want : !lt.want;
      lt.on = on;
      if (!on) { lt.shown = lt.ch; return; }
      if (still || now < lt.next) return;
      lt.shown = KEYS[Math.floor(Math.random() * KEYS.length)];
      lt.next = now + 70 + Math.random() * 90;
    });
  }

  function paint() {
    for (const d of dots) {
      const t = tapeAt(d.c), lt = t.k < 0 ? null : letters[t.k];
      const lit = Boolean(lt && (FONT[lt.shown][d.r] >> (4 - t.x)) & 1);
      if (lit !== d.lit) { d.lit = lit; d.el.setAttribute("r", lit ? DOT : 0); }
      const cls = lit && lt.on ? "dot m" : "dot";
      if (lit && cls !== d.cls) { d.cls = cls; d.el.setAttribute("class", cls); }
    }
    let text = "rest";
    if (over !== null) {
      const s = tapeAt(Math.round(Math.min(NC - 1, Math.max(0, over)))).s;
      text = SYMBOLS[s] + (letters.some((lt) => lt.s === s && lt.on) ? " · ?" : "");
    }
    if (read.textContent !== text) read.textContent = text;
  }

  const B = register(stage, (dt, now) => {
    const still = reducedMotion();
    if (still) { off = Math.round(home); acc = 0; }
    else acc += Math.min(dt, 0.1) * 1000;
    while (acc >= STEP) { acc -= STEP; off = (off - 1 + L) % L; }
    jumble(now);
    paint();
    // the tape is ambient: it runs while visible, and holds still under reduced motion
    return !still || letters.some((lt) => lt.on !== lt.want);
  });
  bag.add(B.unregister);

  function move(p) {
    over = hit(p);
    if (over !== null) last = over;
    B.wake();
  }
  read.textContent = "rest";
  jumble(performance.now());
  paint();
  bag.add(pointer(stage, { move, leave: () => { over = null; B.wake(); } }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { reach = v; B.wake(); },
    destroy: bag.dispose,
  };
}

export default hairline({
  name: "ticker",
  means: "An LED ticker tape running symbols right to left: the letters near the pointer jumble, and settle back as it moves away.",
  rules: [1, 2, 7],
  range: [4, 8, 14],
  mount,
});
