import { HL, hairline } from './kernel.js';
/**
 * Blocks: an index's weights as stacks of counters on a counting tray, one
 * stack a name. At rest they stand at uneven heights, the largest bright. The
 * pointer picks a stack: it grows and the others give up height in proportion,
 * so the tray always holds the same total, staggered outwards from the one
 * picked. The read-out names the stack and its share. The slider is how much
 * the picked stack takes, in counters.
 *
 * The pattern: discrete items, as Riffle. Tweens per stack, a stagger by
 * distance, and a hit test on the stacks' resting centres, which never move.
 */
const {
  Cam, clamp, facing, fit, open, prism, proj, ringAt, rings, run,
  tdone, tset, tval, tween, disposer, mk, pointer, put, register, solid,
} = HL;

const N = 7, PITCH = 23, RS = 8.6, COIN = 3.2, TB = 4, FLOOR = 4;
/** Counters per stack at rest: uneven, as an index's weights are. */
const REST = [15, 11, 13, 7, 9, 5, 4];
const TOTAL = REST.reduce((a, b) => a + b, 0);
const X0 = -RS - 7, X1 = (N - 1) * PITCH + RS + 7, Y0 = -RS - 7, Y1 = RS + 7;
const LARGEST = REST.indexOf(Math.max(...REST));

/** The stack heights, in counters, with stack a holding `take` more and the rest giving it up in proportion. */
function rebalanced(a, take) {
  if (a < 0) return REST.slice();
  const want = Math.min(REST[a] + take, TOTAL - (N - 1) * FLOOR / COIN);
  const left = TOTAL - want, others = TOTAL - REST[a];
  return REST.map((n, i) => (i === a ? want : Math.max(FLOOR / COIN, (n * left) / others)));
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let take = value;

  const tallest = (Math.max(...REST) + 12) * COIN;
  const C = Cam(45, 0.5, 1.78);
  fit(C, [[X0, Y0, -TB], [X1, Y1, -TB], [X1, Y0, -TB], [X0, Y1, -TB], [0, 0, tallest], [X1 - 7, 0, REST[N - 1] * COIN]], 200, 128);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  // The tray: a low board with a raised rim, its floor seam along the far side.
  const [tr, ti] = rings(X0, Y0, X1, Y1, 7, 2);
  put(solid(g), prism(P, front, tr, ti, -TB, 0));
  mk("path", { d: open(ringAt(P, run(rings(X0 + 4, Y0 + 4, X1 - 4, Y1 - 4, 4, 1)[0], (q) => !front(q)), 0)), class: "nf lo" }, g);

  // Left to right along x, which at this camera is back to front.
  const stacks = REST.map((n, i) => {
    const x = i * PITCH;
    const [ring, inner] = rings(x - RS, -RS, x + RS, RS, RS, 1.2);
    const el = solid(g), edges = mk("path", { class: "nf lo" }, el.g);
    return { i, x, ring, inner, el, edges, h: tween(n), drawn: NaN };
  });

  function draw(s, n) {
    const h = n * COIN;
    if (h === s.drawn) return;
    s.drawn = h;
    put(s.el, prism(P, front, s.ring, s.inner, 0, h));
    // A counter's edge every COIN up the front of the stack.
    const nearSide = run(s.ring, front);
    let d = "";
    for (let z = COIN; z < h - COIN * 0.5; z += COIN) d += open(ringAt(P, nearSide, z));
    s.edges.setAttribute("d", d);
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const s of stacks) { draw(s, tval(s.h, now)); if (!tdone(s.h, now)) moving = true; }
    return moving;
  });
  bag.add(B.unregister);

  // Hit test: the stack whose resting centre is nearest the pointer on screen.
  const centres = stacks.map((s) => P(s.x, 0, REST[s.i] * COIN * 0.5));
  function hit([x, y]) {
    const top = P(X0, Y0, tallest)[1] - 10, bottom = P(X1, Y1, -TB)[1] + 10;
    if (y < top || y > bottom) return -1;
    let best = -1, far = Infinity;
    centres.forEach((c, i) => { const d = Math.abs(c[0] - x); if (d < far) { far = d; best = i; } });
    return far < PITCH * 1.2 ? best : -1;
  }

  let act = -2;
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, 0);
    act = a;
    const goal = rebalanced(a, take);
    stacks.forEach((s, i) => {
      tset(s.h, goal[i], now, Math.abs(i - from) * 40);
      s.el.sil.classList.toggle("hi", a < 0 ? i === LARGEST : i === a);
    });
    read.textContent = a < 0 ? "rest" : `stack ${a + 1} · ${Math.round((goal[a] / TOTAL) * 100)}%`;
    B.wake();
  }
  setActive(-1);

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { take = clamp(v, 0, 30); if (act >= 0) { const a = act; act = -2; setActive(a); } },
    destroy: bag.dispose,
  };
}

export default hairline({
  name: "blocks",
  means: "An index's weights as stacks of counters: the one picked grows, and the rest give it up to keep the total.",
  rules: [1, 2, 5, 8],
  range: [4, 8, 12],
  mount,
});
