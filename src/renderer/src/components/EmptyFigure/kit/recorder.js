import { HL, hairline } from './kernel.js';
/**
 * Recorder: a strip-chart recorder replaying a fund's history. Paper feeds
 * off a roll at the back, across ruled chart paper on the deck and over the
 * front edge, while a pen on a pivoting arm draws the line. At rest it stands
 * mid-run, the line part drawn; hovering sets the paper running, and the
 * read-out counts the days. Leaving lets it run down and stop (Karan,
 * 2026-10-20: on Home it moves only when asked). The slider is the speed.
 *
 * The pattern: dilate time, as Slow, with rest at a standstill. One spring on
 * the rate; everything else is drawn from the clock it drives.
 */
const {
  Cam, clamp, facing, fit, hull, open, poly, prism, proj, rings, seg,
  disposer, mk, pointer, put, register, solid, spring, stepS,
} = HL;

const BX = 116, BY = 84, BH = 20, PX0 = 12, PX1 = 104, YP0 = 17, YPEN = 33, ZP = BH + 0.5;
const RY = 9, RR = 6, RX0 = 8, RX1 = 108, FEED = 7, RULE = 9, DY = 2;
/** The fund's line, by time: three swells, so it never repeats on the page. */
const level = (t) => 60 + 15 * Math.sin(0.55 * t) + 8 * Math.sin(1.7 * t + 1.3) + 3 * Math.sin(2.8 * t + 0.4);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let speed = value, over = false, clock = 6, day = -1;

  const C = Cam(45, 0.5, 1.95);
  fit(C, [[0, 0, 0], [BX, BY, 0], [BX, 0, 0], [0, BY, 0], [(RX0 + RX1) / 2, RY - RR, BH + 2 * RR], [BX / 2, BY + 4, BH - 12]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // The deck: the body, and the paper's apron curling over its front edge.
  const [br, bi] = rings(0, 0, BX, BY, 8, 2.2);
  put(solid(g), prism(P, front, br, bi, 0, BH));
  mk("path", { d: poly([P(PX0, 13, ZP), P(PX1, 13, ZP), P(PX1, BY, ZP), P(PX1, BY + 3, BH - 9), P(PX0, BY + 3, BH - 9), P(PX0, BY, ZP)]) }, g);
  mk("path", { d: seg(P(PX0, BY, ZP), P(PX1, BY, ZP)), class: "nf lo" }, g);

  // The roll: a cylinder lying along x, its near end showing the spindle.
  const end = (x, r) => Array.from({ length: 20 }, (_, k) => P(x, RY + r * Math.cos((k / 20) * 2 * Math.PI), BH + RR + r * Math.sin((k / 20) * 2 * Math.PI)));
  mk("path", { d: poly(hull(end(RX0, RR).concat(end(RX1, RR)))), class: "sil" }, g);
  mk("path", { d: poly(end(RX1, RR)) }, g);
  mk("path", { d: poly(end(RX1, 1.6)), class: "nf lo" }, g);

  // The chart: fixed columns, rules that ride the paper, and the line.
  mk("path", { d: [35, 58, 81].map((x) => seg(P(x, YP0, ZP), P(x, BY, ZP))).join(""), class: "nf lo" }, g);
  const rules = mk("path", { class: "nf lo" }, g), line = mk("path", { class: "nf" }, g);

  // The pen: its tip, the arm, and the post it pivots on, back to front.
  const tip = solid(g), arm = solid(g), post = solid(g);
  const [pr, pi] = rings(BX - 9, YPEN - 3.4, BX - 2, YPEN + 3.4, 3.4, 0.9);
  put(post, prism(P, front, pr, pi, BH, BH + 11));

  let drawnX = NaN;
  function draw() {
    const feed = clock * FEED;
    let r = "";
    for (let y = YP0 + (feed % RULE); y < BY; y += RULE) r += seg(P(PX0, y, ZP), P(PX1, y, ZP));
    rules.setAttribute("d", r);
    const pts = [];
    for (let y = YPEN; y <= BY; y += DY) pts.push(P(clamp(level(clock - (y - YPEN) / FEED), PX0 + 6, PX1 - 6), y, ZP));
    line.setAttribute("d", open(pts));
    const x = clamp(level(clock), PX0 + 6, PX1 - 6);
    if (Math.abs(x - drawnX) < 0.02) return;
    drawnX = x;
    const [tr, ti] = rings(x - 2.4, YPEN - 2.4, x + 2.4, YPEN + 2.4, 2.4, 0.7);
    put(tip, prism(P, front, tr, ti, ZP, BH + 12));
    const [ar, ai] = rings(x, YPEN - 1.5, BX - 5, YPEN + 1.5, 1.5, 0.5);
    put(arm, prism(P, front, ar, ai, BH + 9, BH + 10.5));
  }
  tip.sil.classList.add("hi");

  const rate = spring(0);
  const B = register(stage, (dt) => {
    const easing = stepS(rate, dt);
    if (rate.x <= 0.001 && !easing) return false;
    clock += dt * Math.max(0, rate.x);
    draw();
    const d = Math.floor(clock * 9);
    if (over && d !== day) { day = d; read.textContent = `day ${d}`; }
    return true;
  });
  bag.add(B.unregister);
  draw();

  function hover(on) {
    over = on;
    rate.t = on ? speed : 0;
    if (!on) { day = -1; read.textContent = "rest"; }
    B.wake();
  }
  hover(false);

  bag.add(pointer(stage, { move: () => hover(true), leave: () => hover(false) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { speed = v; if (over) rate.t = v; },
    destroy: bag.dispose,
  };
}

export default hairline({
  name: "recorder",
  means: "A chart recorder replaying a fund's history: hovering runs the paper, and the pen draws the line.",
  rules: [4, 5, 6, 7],
  range: [0.4, 0.7, 1],
  mount,
});
