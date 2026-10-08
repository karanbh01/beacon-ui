import { HL, hairline } from './kernel.js';
/**
 * Calendar: a flip desk calendar on an easel stand, its pages hung from a
 * spiral binding along the stand's ridge. Every page carries a blank month:
 * a header rule over a 7 × 5 grid of day cells, none marked. At rest the top
 * page stands caught over the binding and the next is lifting off the stack.
 * The pointer's height leafs through the pad: the page at that depth lifts
 * over the binding, the pages in front of it go over with it, fanned, and the
 * one behind curls after it, staggered outwards. The slider is the lift, in
 * degrees from hanging straight down.
 *
 * The pattern: discrete items, as Riffle. Tweens per page, a stagger by
 * distance, and a hit test on the resting plane of the stack, which never
 * moves. Pages turn about one axis, so paint order is their angular distance
 * from the angle at which a page is seen edge-on, re-sorted only when it changes.
 */
const {
  Cam, clamp, fillet, fit, hull, open, poly, proj, rad,
  tdone, tset, tval, tween, disposer, mk, pointer, put, register, solid,
} = HL;

const N = 8, W = 84, H = 62, ZB = 66, LEAN = 24, R = 3.4, LOOPS = 13, STAG = 40;
const X0 = -4, X1 = W + 4, FOOT = ZB * Math.tan(rad(LEAN));
/** The stack's own lean, page 0 (the last of the month) nearest the stand. */
const BASE = (i) => LEAN + 1.5 + 1.6 * i;
/** At rest the top page is caught over the binding and the next is lifting after it. */
const REST = (i) => (i === N - 1 ? 162 : i === N - 2 ? 58 : BASE(i));
/** At Cam(45, .5) a page turned this far is seen edge-on: nearer to it is nearer the viewer. */
const EDGE = 129.3;
const COLS = 7, ROWS = 5, PU = (W - 12) / COLS, PV = (H - 23) / ROWS;

/** A page's outline in its own (u along the binding, v down from it), and its day cells. */
const OUTLINE = fillet([[0, -1.5], [W, -1.5], [W, H], [0, H]], [1, 1, 3, 3]);
const CELLS = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const u0 = 6 + c * PU + 1.4, v0 = 18 + r * PV + 1.2, u1 = u0 + PU - 2.8, v1 = v0 + PV - 2.4;
  CELLS.push(fillet([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [1.5, 1.5, 1.5, 1.5]));
}

/** The easel's end profile in (y, z): an A-frame whose apex is the binding, and its crease inset by b. */
function stand(P) {
  const tri = [[-FOOT, 0], [FOOT, 0], [0, ZB]];
  const side = Math.hypot(FOOT, ZB), rIn = (FOOT * ZB) / (FOOT + side), k = (rIn - 1.8) / rIn;
  const outer = fillet(tri, [3, 3, 5]), inner = fillet(tri.map(([y, z]) => [y * k, rIn + (z - rIn) * k]), [2, 2, 4]);
  const cap = (x) => outer.map(([y, z]) => P(x, y, z));
  // the crease runs up the front slope, over the apex and down the back; the foot is the silhouette's
  const near = inner.slice(5).concat(inner.slice(0, 5)).map(([y, z]) => P(X1, y, z));
  return { sil: poly(hull(cap(X0).concat(cap(X1)))), crease: open(near) };
}

/** The spiral: each loop's arc nearer the viewer, and the arc behind, as one path each. */
function coil(P) {
  const arc = (x, t0, t1) => {
    const pts = [];
    for (let s = 0; s <= 12; s++) {
      const t = t0 + ((t1 - t0) * s) / 12;
      pts.push(P(x + (1.8 * (t + 51)) / 360, R * Math.cos(rad(t)), ZB + R * Math.sin(rad(t))));
    }
    return open(pts);
  };
  let front = "", back = "";
  for (let k = 0; k < LOOPS; k++) {
    const x = 3 + (k * (W - 8)) / (LOOPS - 1);
    front += arc(x, -51, 129);
    back += arc(x, 129, 309);
  }
  return { front, back };
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lift = value;

  // Fitted to the stand, the stack, and the pages at their highest and furthest over.
  const C = Cam(45, 0.5, 1.75);
  const tip = (u, th) => [u, H * Math.sin(rad(th)), ZB - H * Math.cos(rad(th))];
  fit(C, [
    [X0, -FOOT, 0], [X1, FOOT, 0], [X0, FOOT, 0], [X1, -FOOT, 0], [W / 2, 0, ZB + R],
    tip(0, BASE(N - 1) + 9), tip(W, BASE(N - 1) + 9), tip(0, 58), tip(W, 58),
    tip(0, 180), tip(W, 180), tip(0, 232), tip(W, 232),
  ], 200, 166);
  const P = proj(C);
  const at = (u, v, th) => P(u, v * Math.sin(rad(th)), ZB - v * Math.cos(rad(th)));
  /** Which way round a page's u and v run on screen: its sign at the stack's lean is the printed face. */
  const turn = (th) => {
    const o = at(0, 0, th), a = at(1, 0, th), b = at(0, 1, th);
    return Math.sign((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]));
  };
  const FACE = turn(BASE(0));

  const g = mk("g", {}, svg), wire = coil(P);
  mk("path", { d: wire.back, class: "nf lo" }, g);
  put(solid(g), stand(P));
  const layer = mk("g", {}, g);
  const pages = [];
  for (let i = 0; i < N; i++) {
    const grp = mk("g", {}, layer);
    const plate = mk("path", { class: "sil" }, grp);
    const head = mk("path", { class: "nf lo" }, grp), cells = mk("path", { class: "nf lo" }, grp);
    pages.push({ i, grp, plate, head, cells, tw: tween(REST(i)), drawn: NaN });
  }
  // the binding is the rest mark: where a date would be turned to
  const loops = mk("path", { d: wire.front, class: "nf hi" }, g);

  /** Page pg turned to th. Its back is blank, so the month shows only while its printed face is toward us. */
  function drawPage(pg, th) {
    pg.drawn = th;
    const w = (q) => at(q[0], q[1], th), face = turn(th) === FACE;
    pg.plate.setAttribute("d", poly(OUTLINE.map(w)));
    pg.head.setAttribute("d", face ? open([w([5, 13]), w([W - 5, 13])]) : "");
    pg.cells.setAttribute("d", face ? CELLS.map((c) => poly(c.map(w))).join("") : "");
  }

  let order = "";
  /** Farthest from edge-on first; moves the groups only when the order changes. */
  function sortPages() {
    const sorted = pages.slice().sort((p, q) => Math.abs(q.drawn - EDGE) - Math.abs(p.drawn - EDGE));
    const key = sorted.map((p) => p.i).join();
    if (key === order) return;
    order = key;
    sorted.forEach((p) => layer.append(p.grp));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const pg of pages) {
      const th = tval(pg.tw, now);
      if (th !== pg.drawn) drawPage(pg, th);
      if (!tdone(pg.tw, now)) moving = true;
    }
    sortPages();
    return moving;
  });
  bag.add(B.unregister);

  // hit bands: the stack's RESTING plane, cut into N bands down the page; the top band is the top page
  const o = at(0, 0, BASE(0)), eu = at(1, 0, BASE(0)), ev = at(0, 1, BASE(0));
  const du = [eu[0] - o[0], eu[1] - o[1]], dv = [ev[0] - o[0], ev[1] - o[1]], det = du[0] * dv[1] - du[1] * dv[0];
  function hit([x, y]) {
    const qx = x - o[0], qy = y - o[1];
    const u = (qx * dv[1] - qy * dv[0]) / det, v = (du[0] * qy - du[1] * qx) / det;
    if (u < -8 || u > W + 8 || v < -30 || v > H + 6) return -1;
    return N - 1 - clamp(Math.floor((v / H) * N), 0, N - 1);
  }

  /** Where page i goes when page a is chosen: over with it if in front, curling after it if just behind. */
  function target(i, a) {
    if (a < 0) return REST(i);
    if (i === a) return lift;
    if (i > a) return lift + Math.min(i - a, 4) * 8;
    const d = a - i;
    return BASE(i) + (d === 1 ? 9 : d === 2 ? 3 : 0);
  }

  let act = -1;
  /** Turns the pad to page a (-1 lets it fall back to rest), staggered out from the page turned or let go. */
  function turnTo(a, from) {
    const now = performance.now();
    act = a;
    pages.forEach((pg, i) => {
      tset(pg.tw, target(i, a), now, Math.abs(i - from) * STAG);
      pg.plate.classList.toggle("hi", i === a);
    });
    loops.classList.toggle("hi", a < 0);
    read.textContent = a < 0 ? "rest" : "page " + (N - a) + " · —";
    B.wake();
  }
  const choose = (a) => { if (a !== act) turnTo(a, a >= 0 ? a : act); };

  bag.add(pointer(stage, { move: (p) => choose(hit(p)), leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lift = v; if (act >= 0) turnTo(act, act); },
    destroy: bag.dispose,
  };
}

export default hairline({
  name: "calendar",
  means: "A desk calendar with no date marked: the pointer's height leafs through it, and the page at that depth lifts over the binding.",
  rules: [1, 2, 5, 6],
  range: [150, 172, 200],
  mount,
});
