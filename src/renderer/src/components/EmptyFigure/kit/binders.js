import { HL, hairline } from './kernel.js';
/**
 * Binders: a short open bookcase holding six ring binders and one gap, the
 * fourth slot, where a binder should stand. The fifth leans into it, as books
 * do, and a bright dashed outline and footprint keep the missing one's place.
 * The binder under the pointer slides out by its finger hole and its
 * neighbours lean away from it, staggered outwards; over the gap nothing comes
 * out, the neighbours lean back from it and the gap stays lit. The slider is
 * the lean, in degrees.
 *
 * The pattern: discrete items, as in Riffle. Tweens, a stagger by distance,
 * and a hit test on each slot's rest silhouette, nearest first.
 */
const {
  Cam, circ, fit, hull, open, poly, proj, rad, rings, ringAt, rrect, run, prism, put,
  tdone, tset, tval, tween, disposer, facing, mk, pointer, register, solid,
} = HL;

const N = 7, GAP = 3, G = 2, D0 = 0, D1 = 44, PT = 5, SW = 3, SH = 64, ROOM = 14, PULL = 13, STAG = 45;
const T = [10, 9.5, 10.5, 13, 10, 8.5, 10]; // each slot's thickness, along the shelf; the gap is a little wider than a binder
const H = [58, 54, 58, 58, 58, 51, 58]; // and height; two are a smaller size
// The fifth leans into the gap until its top corner rests on the third's side, as books do; the last leans out.
const SLUMP = -Math.asin((T[GAP] + 2 * G) / H[GAP + 1]) * 180 / Math.PI + 0.2;
const REST = [0, 0, 0, 0, SLUMP, 0, 3];
const X0 = T.reduce((xs, t, i) => xs.concat(xs[i] + t + G), [ROOM]).slice(0, N);
const XR = X0[N - 1] + T[N - 1] + ROOM;
const RINGS = T.map((t) => rings(0, D0, t, D1, 2.6, 1.1));

/** A world point on slot i's binder, from its own (u across, v deep, w up), leaning th degrees about the bottom edge it leans over and pulled out by p. */
function place3(P, i, th, p) {
  const s = Math.sin(rad(th)), c = Math.cos(rad(th)), pu = th > 0 ? T[i] : 0;
  return (u, v, w) => P(X0[i] + pu + (u - pu) * c + w * s, v + p, PT - (u - pu) * s + w * c);
}

/** Binder i's outline, as screen points: the hull of its foot and its top. */
function outline(P, i, th, p) {
  const W = place3(P, i, th, p), [ring] = RINGS[i];
  return hull(ring.map((q) => W(q.u, q.v, 0)).concat(ring.map((q) => W(q.u, q.v, H[i]))));
}

/** Binder i's paths: silhouette, top crease, the label pocket and the finger hole on its spine. */
function pose(P, front, i, th, p) {
  const W = place3(P, i, th, p), [, inner] = RINGS[i], t = T[i], h = H[i];
  const spine = (ring, du, dw) => poly(ring.map((q) => W(du + q.u, D1, dw + q.v)));
  return {
    sil: poly(outline(P, i, th, p)),
    crease: open(run(inner, front).map((q) => W(q.u, q.v, h))),
    pocket: spine(rrect(1.9, h * 0.52, t - 1.9, h * 0.84, 1.2, 3), 0, 0),
    hole: spine(circ(2.4, 12), t / 2, 9.5),
  };
}

/** Whether screen point q lies inside a convex polygon, whichever way round it winds. */
function inside(poly, [x, y]) {
  let sign = 0;
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length];
    const c = Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    if (c && sign && c !== sign) return false;
    sign = sign || c;
  }
  return true;
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lean = value;

  // Fitted with the end binders at the steepest lean and one pulled out, so no pose leaves the frame.
  const C = Cam(45, 0.5, 2.05);
  fit(C, [[-SW, D0 - 4, 0], [XR + SW, D1 + 3, 0], [XR + SW, D0 - 4, 0], [-SW, D1 + PULL, 0], [-SW, D0 - 4, PT + SH], [XR + SW, D0 - 4, PT + SH]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  const board = (x0, y0, x1, y1, z0, z1, r, b) => {
    const [ring, inner] = rings(x0, y0, x1, y1, r, b);
    put(solid(g), prism(P, front, ring, inner, z0, z1));
  };
  board(-SW, D0 - 4, XR + SW, D1 + 3, 0, PT, 2, 1.2); // the shelf
  board(-SW, D0 - 4, 0, D1 + 3, PT, PT + SH, 1.2, 0.6); // its side
  board(0, D0 - 4, XR + SW, D0 - 1, PT, PT + SH, 1.2, 0.6); // its back, which shows through the gap

  // Where the missing binder stood: its footprint on the shelf, painted before
  // the binders so one leaning over it covers what it should.
  const [gr] = rings(X0[GAP], D0, X0[GAP] + T[GAP], D1, 2.6, 1.1);
  const print = mk("path", { d: poly(ringAt(P, gr, PT)), class: "nf hi" }, g);

  const books = [];
  for (let i = 0; i < N; i++) {
    if (i === GAP) { books.push(null); continue; }
    const el = solid(g);
    const pocket = mk("path", { class: "nf lo" }, el.g), hole = mk("path", { class: "nf" }, el.g);
    books.push({ el, pocket, hole, a: tween(REST[i]), p: tween(0), drawn: "" });
  }
  // A dashed guide of the binder itself. It stands in front of the third
  // binder's side, so it is painted after it, unless that binder leans into it.
  const ghost = mk("path", { d: poly(hull(ringAt(P, gr, PT).concat(ringAt(P, gr, PT + H[GAP])))), class: "nf dash hi" }, g);
  const behind = books[GAP - 1].el.g;

  // Hit areas: each slot's rest silhouette (the gap's is the upright binder it
  // lacks), tried nearest first. They never move, and nothing draws them.
  const hits = X0.map((_, i) => outline(P, i, REST[i], 0));
  const hit = (q) => {
    for (let i = N - 1; i >= 0; i--) if (inside(hits[i], q)) return i;
    return -1;
  };

  function draw(i, th, p) {
    const b = books[i], key = th.toFixed(3) + "," + p.toFixed(3);
    if (key === b.drawn) return;
    b.drawn = key;
    const q = pose(P, front, i, th, p);
    put(b.el, { sil: q.sil, crease: q.crease });
    b.pocket.setAttribute("d", q.pocket);
    b.hole.setAttribute("d", q.hole);
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    books.forEach((b, i) => {
      if (!b) return;
      draw(i, tval(b.a, now), tval(b.p, now));
      if (!tdone(b.a, now) || !tdone(b.p, now)) moving = true;
    });
    return moving;
  });
  bag.add(B.unregister);

  let act = -1;
  const caption = (a) => (a < 0 ? "rest" : a === GAP ? `slot ${a + 1} · none` : `binder ${a + 1}`);
  /** Chooses slot a (-1 lets go). Those before it lean back, those after lean on; the stagger spreads out from it. */
  function aim(a, force) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    books.forEach((b, i) => {
      if (!b) return;
      const delay = Math.abs(i - from) * STAG;
      const th = a < 0 ? REST[i] : i < a ? -lean : i > a ? lean : 0;
      tset(b.a, th, now, delay);
      tset(b.p, i === a ? PULL : 0, now, delay);
      b.el.sil.classList.toggle("hi", i === a);
    });
    const lit = a < 0 || a === GAP;
    print.classList.toggle("hi", lit);
    print.classList.toggle("lo", !lit);
    ghost.classList.toggle("hi", lit);
    if (a >= 0 && a < GAP - 1) behind.before(ghost);
    else behind.after(ghost);
    read.textContent = caption(a);
    B.wake();
  }

  aim(-1, true);
  bag.add(pointer(stage, { move: (q) => aim(hit(q)), leave: () => aim(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lean = v; aim(act, true); },
    destroy: bag.dispose,
  };
}

export default hairline({
  name: "binders",
  means: "A shelf of ring binders with one missing: the one under the pointer slides out and its neighbours lean away.",
  rules: [1, 2, 5, 10],
  range: [4, 8, 12],
  mount,
});
