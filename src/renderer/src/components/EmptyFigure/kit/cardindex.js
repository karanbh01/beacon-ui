import { HL, hairline } from './kernel.js';
/**
 * Card index: a long, low catalogue drawer with seven divider guides standing
 * across it and nothing filed between them. Each guide has a raised tab, the
 * tabs staggered left, centre and right down the drawer, and a hole near its
 * foot for the rod along the floor. The guide under the pointer tips forward to
 * bare the empty space behind it; the ones in front are pushed after it and the
 * ones behind lean back, staggered outwards. The slider is the tip, in degrees.
 *
 * The pattern: discrete items. Tweens, a stagger by distance, a hit test on the
 * guides' resting lines, and a settle pass so no guide passes through another.
 */
const {
  Cam, clamp, fillet, fit, hull, open, poly, proj, rad, ringAt, rrect, run, unproj, facing,
  tdone, tset, tval, tween, disposer, mk, pointer, register,
} = HL;

const N = 7, W = 64, H = 40, TW = 18, TH = 8, HT = H + TH, G = 22, TK = 1.3, TABS = [5, 23, 41];
const X0 = -6, X1 = W + 6, Y0 = -14, Y1 = (N - 1) * G + 26, WH = 16, WR = 6, WT = 2.2, FH = 26, PT = 2.6;
const REST_C = 4, REST = [-10, -4, -8, -2, 3, 19, 25], ZH = 38, STAG = 45, FALL = 34;
const deg = (r) => (r * 180) / Math.PI;
// The steepest a guide may lean before it meets a wall: the front panel's top edge, or the back wall's.
const FRONT_MAX = deg(Math.atan((Y1 - (N - 1) * G) / FH)), BACK_MAX = deg(Math.atan((0 - Y0 - WT) / WH));

/** The least lean a guide needs so the guide behind it, tipped forward by t degrees, does not pass through it. */
const ahead = (t) => deg(Math.atan((HT * Math.sin(rad(t)) - G + 1.5) / (HT * Math.cos(rad(t)))));

/**
 * Guides lean on one another: one tipped forward pushes those in front, the front one rests on the panel and holds
 * those behind it up (a guide leans at most 12° past the one it rests on), and one leaning back pushes those behind.
 */
function settle(ts) {
  for (let i = 1; i < N; i++) if (ts[i - 1] > 0) ts[i] = Math.max(ts[i], ahead(ts[i - 1]));
  ts[N - 1] = Math.min(ts[N - 1], FRONT_MAX);
  for (let i = N - 2; i >= 0; i--) {
    if (ts[i + 1] > 0) ts[i] = Math.min(ts[i], ts[i + 1] + 12);
    else ts[i] = Math.min(ts[i], -ahead(-ts[i + 1]));
  }
  ts[0] = Math.max(ts[0], -BACK_MAX);
  return ts;
}

/**
 * Guide a tipped forward by `tip`: those in front fall a little further, as a thumb parts a box, and those behind
 * lean back. Nothing tips past FALL: the eye looks down at about 51° from upright, and a guide tipped toward it
 * that far is seen edge-on, a sliver instead of a card.
 */
const layout = (a, tip) => Array.from({ length: N }, (_, i) => {
  const d = Math.abs(i - a);
  return i < a ? -(5 + 9 * 0.6 ** (d - 1)) : Math.min(tip + 4 * d, FALL);
});

/** Guide i's outline in its own plane, its tab at one of three places, and the run of points that is the tab. */
function guide(i) {
  const t0 = TABS[(N - 1 - i) % 3];
  const shape = fillet(
    [[0, 0], [W, 0], [W, H], [t0 + TW, H], [t0 + TW, H + TH], [t0, H + TH], [t0, H], [0, H]],
    [1, 1, 3.2, 1.6, 2.4, 2.4, 1.6, 3.2],
  );
  const hole = Array.from({ length: 12 }, (_, k) => [W / 2 + 2.2 * Math.cos((k * Math.PI) / 6), 6 + 2.2 * Math.sin((k * Math.PI) / 6)]);
  return { shape, hole, tab: shape.filter(([, v]) => v > H + 0.2) };
}

/** A run of points ordered left to right on screen. */
const LR = (pts) => (pts[0][0] <= pts[pts.length - 1][0] ? pts : pts.slice().reverse());

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let tip = value;

  // Fitted to the drawer, the tallest guide, and the front guide tipped onto the panel.
  const C = Cam(45, 0.5, 1.42);
  fit(C, [[X0, Y0, 0], [X1, Y1 + PT, 0], [X1, Y0, 0], [X0, Y1 + PT, 0], [X0, Y0, HT], [X1, Y0, HT], [X0, Y1 + 12, HT]], 200, 166);
  const P = proj(C), front = facing(C);
  const outer = rrect(X0, Y0, X1, Y1, WR, 6), inner = rrect(X0 + WT, Y0 + WT, X1 - WT, Y1 - WT, WR - WT, 6);
  const g = mk("g", {}, svg);
  const path = (d, cls) => mk("path", { d, class: cls }, g);

  // The drawer's far half and its floor, then the rod along the floor, then the guides, back to front.
  path(poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, WH)))), "sil");
  path(poly(ringAt(P, inner, WH)), "nf");
  path(open(ringAt(P, run(inner, (q) => !front(q)), 2)), "nf lo");
  path(open([P(W / 2, Y0 + WT, 6), P(W / 2, Y1 - WT, 6)]), "nf lo");

  const guides = REST.map((_, i) => {
    const { shape, hole, tab } = guide(i);
    const grp = mk("g", {}, g);
    const els = ["lo", "sil", "nf lo", "nf"].map((cls) => mk("path", { class: cls }, grp));
    return { shape, hole, tab, els, a: tween(REST[i]), drawn: NaN };
  });

  // The near half: the walls nearest the eye cover the guides' feet; then the front panel, its label frame and pull.
  const iF = LR(ringAt(P, run(inner, front), WH)), oT = LR(ringAt(P, run(outer, front), WH)), oB = LR(ringAt(P, run(outer, front), 0));
  path(poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), "fo");
  path(open(oT), "nf lo");
  path(open(iF), "nf");
  path(open([oT[0], ...oB, oT[oT.length - 1]]), "nf sil");
  const onPanel = (y) => (ring) => ring.map((q) => P(q.u, y, q.v));
  const panel = rrect(X0 - 1.5, 0, X1 + 1.5, FH, 3, 5), hx = W / 2;
  path(poly(onPanel(Y1)(panel)), "lo");
  path(poly(onPanel(Y1 + PT)(panel)), "sil");
  path(poly(onPanel(Y1 + PT)(rrect(hx - 13, FH - 12, hx + 13, FH - 4, 1.4, 4))), "nf");
  path(poly(onPanel(Y1 + PT)(rrect(hx - 11.6, FH - 10.6, hx + 11.6, FH - 5.4, 0.8, 4))), "nf lo");
  path(poly(onPanel(Y1 + PT)(rrect(hx - 9, 4.5, hx + 9, 9, 2.2, 5))), "nf");

  /** Guide i leaning t degrees (forward is +), pivoting on its foot. */
  function draw(i, t) {
    const gd = guides[i], yb = i * G, s = Math.sin(rad(t)), c = Math.cos(rad(t));
    const w = ([u, v]) => P(u, yb + v * s, v * c);
    const wb = ([u, v]) => P(u, yb + v * s - TK * c, v * c + TK * s);
    const [back, face, hole, tab] = gd.els;
    back.setAttribute("d", poly(gd.shape.map(wb)));
    face.setAttribute("d", poly(gd.shape.map(w)));
    hole.setAttribute("d", poly(gd.hole.map(w)));
    tab.setAttribute("d", open(gd.tab.map(w)));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    const ts = settle(guides.map((gd) => { if (!tdone(gd.a, now)) moving = true; return tval(gd.a, now); }));
    ts.forEach((t, i) => { if (t !== guides[i].drawn) { guides[i].drawn = t; draw(i, t); } });
    return moving;
  });
  bag.add(B.unregister);

  // The hit test: the pointer, put on the plane through the guides' upper halves, against where each guide
  // crosses that plane at REST. The plane and the rest lines never move, so a guide tipping away cannot flip the choice.
  const restT = settle(REST.slice());
  const lines = restT.map((t, i) => i * G + ZH * Math.tan(rad(t)));
  function hit(p) {
    const [x, y] = unproj(C, p[0], p[1], ZH);
    if (x < X0 - 4 || x > X1 + 30 || y < Y0 - 6 || y > Y1 + 30) return -1;
    let best = 0;
    lines.forEach((ly, i) => { if (Math.abs(y - ly) < Math.abs(y - lines[best])) best = i; });
    return best;
  }

  let act = -1;
  /** Tips guide a forward (-1 lets them all settle back); the stagger spreads out from the guide tipped, or the one let go. */
  function setActive(a, force) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    const goal = a < 0 ? REST : layout(a, tip);
    guides.forEach((gd, i) => {
      tset(gd.a, goal[i], now, Math.abs(i - from) * STAG);
      gd.els[3].classList.toggle("hi", i === (a < 0 ? REST_C : a));
    });
    read.textContent = a < 0 ? "rest" : `tab ${N - a} · 0`;
    B.wake();
  }
  guides[REST_C].els[3].classList.add("hi");

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { tip = clamp(v, 0, 60); if (act >= 0) setActive(act, true); },
    destroy: bag.dispose,
  };
}

export default hairline({
  name: "cardindex",
  means: "A card index drawer of tabbed guides and nothing filed: the guide under the pointer tips forward to bare the space behind it.",
  rules: [1, 2, 4, 5],
  range: [16, 24, 32],
  mount,
});
