import { HL, hairline } from './kernel.js';
/**
 * Screen: a portable projection screen on a tripod. A long case sits on top of
 * a central pole, the pole stands on three splayed legs, and the screen hangs
 * from the case, pulled part of the way down, with a weighted bar along its
 * lower edge and a pull ring on a short cord under it. Nothing is shown on it.
 * The pointer's height pulls the bar to it on one spring, clamped between
 * nearly rolled up and the slider's reach; leaving lets it settle back to two
 * thirds down. At rest the pull ring is the bright mark; while the pointer
 * pulls, the bar takes the bright with it. The slider is the reach, in percent
 * of the screen's full drop.
 *
 * The pattern: a continuous field reduced to one number. One spring, a hit
 * test on the screen's own plane (which never moves), and a rest that is a
 * composition: the legs stand unevenly, as a real tripod's do.
 */
const {
  Cam, circ, clamp, facing, fillet, fit, hull, poly, prism, proj, rings, seg,
  spring, stepS, disposer, mk, pointer, put, register, solid,
} = HL;

// The screen hangs from TOP; its drop runs from MIN (nearly rolled up) to FULL.
const TOP = 119, FULL = 70, REST = 47, MIN = 6, SW = 62;
// The pull ring hangs CORD below the bar, and the pointer holds it by its middle.
const BAR = 3, CORD = 4, RING = 4.5, GRIP = BAR + CORD + RING;
const PY = -6, HUB = 24;
// Legs as [u, w, length]: u runs right across the picture, w toward the viewer.
// Uneven on purpose: a tripod stands where the floor let it.
const LEGS = [[-0.79, -0.62, 36], [0.906, -0.42, 33], [-0.34, 0.94, 31]];

/** Where a leg meets the floor, from its direction in the picture's own axes. */
function legEnd([u, w, L]) {
  const a = u * L, b = w * L;
  return [(a + b) / Math.SQRT2, PY + (b - a) / Math.SQRT2, 0];
}

/** Where a leg leaves the hub, on the collar's face, toward its foot. */
function legStart(e) {
  const dx = e[0], dy = e[1] - PY, n = Math.hypot(dx, dy);
  return [3.2 * dx / n, PY + 3.2 * dy / n, HUB];
}

/** A thin round rod between two world points: the hull of a circle at each end. */
function rod(P, a, b, r) {
  const pa = P(...a), pb = P(...b), pts = [];
  for (let k = 0; k < 16; k++) {
    const c = Math.cos((k * Math.PI) / 8) * r, s = Math.sin((k * Math.PI) / 8) * r;
    pts.push([pa[0] + c, pa[1] + s], [pb[0] + c, pb[1] + s]);
  }
  return poly(hull(pts));
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let reach = value, over = null;

  const C = Cam(45, 0.5, 1.7);
  const feet = LEGS.map(legEnd);
  // Fitted with the screen fully down, so nothing leaves the frame at the far end.
  fit(C, [[-70, -5.5, 129], [70, 5.5, 118], [-70, 5.5, 118], [70, -5.5, 129],
    [-SW, 0, TOP - FULL], [SW, 0, TOP - FULL], [0, 0.6, TOP - FULL - GRIP - RING], ...feet], 200, 166);
  const P = proj(C), front = facing(C);
  const at = (y) => ([u, v]) => P(u, y, v);

  const g = mk("g", {}, svg);
  // Back to front: the two back legs, the pole and its collar, the screen and
  // its bar, the case over the screen's top, and the front leg last.
  for (const f of feet.slice(0, 2)) mk("path", { d: rod(P, legStart(f), f, 1.5), class: "sil" }, g);
  const [pr, pi] = rings(-2, PY - 2, 2, PY + 2, 2, 0.7);
  put(solid(g), prism(P, front, pr, pi, HUB - 8, 121));
  const [kr, ki] = rings(-3, PY - 3, 3, PY + 3, 3, 0.9);
  put(solid(g), prism(P, front, kr, ki, HUB - 2, HUB + 6));

  const sheet = mk("path", { class: "sil" }, g);
  const border = mk("path", { class: "nf lo" }, g);
  const bar = solid(g);
  // The pull: a cord, then a solid ring with its hole, so the pole behind does not cross it.
  const cord = mk("path", { class: "nf hi" }, g), grip = mk("path", { class: "hi" }, g), hole = mk("path", { class: "nf lo" }, g);
  const [br, bi] = rings(-SW - 1.5, -1.8, SW + 1.5, 1.8, 1.8, 0.5);
  const ring = circ(RING, 16), eye = circ(RING - 2, 12);

  // The case: a long rounded body between two slightly larger end caps.
  for (const [x0, x1, y, z0, z1, r, b] of [[-70, -62, 5.5, 118, 129, 3, 1], [-66, 66, 4.5, 119, 128, 4.5, 1.2], [62, 70, 5.5, 118, 129, 3, 1]]) {
    const [o, i] = rings(x0, -y, x1, y, r, b);
    put(solid(g), prism(P, front, o, i, z0, z1));
  }
  mk("path", { d: rod(P, legStart(feet[2]), feet[2], 1.5), class: "sil" }, g);

  /** A flat rectangle on the screen's plane, its corners rounded. */
  const panel = (x0, x1, z0, z1, r) =>
    poly(fillet([[x0, z1], [x1, z1], [x1, z0], [x0, z0]], [r, r, r, r]).map(at(0)));

  const sp = spring(REST, { eps: 0.04 });
  let drawn = NaN;
  function draw() {
    const d = sp.x;
    if (d === drawn) return;
    drawn = d;
    const zb = TOP - d, zc = zb - BAR - CORD - RING;
    sheet.setAttribute("d", panel(-SW, SW, zb, TOP, 1.5));
    // the dark masking border a real screen has, there once enough of it is down
    border.setAttribute("d", TOP - 8 - (zb + 5) > 2 ? panel(-SW + 6, SW - 6, zb + 5, TOP - 8, 1) : "");
    put(bar, prism(P, front, br, bi, zb - BAR, zb + 0.5));
    const loop = (r) => poly(r.map((q) => P(q.u, 0.6, zc + q.v)));
    cord.setAttribute("d", seg(P(0, 0.6, zb - BAR), P(0, 0.6, zb - BAR - CORD)));
    grip.setAttribute("d", loop(ring));
    hole.setAttribute("d", loop(eye));
  }

  const B = register(stage, (dt) => {
    const m = stepS(sp, dt);
    draw();
    return m;
  });
  bag.add(B.unregister);

  // The pointer is read on the screen's own plane, y = 0, which never moves.
  const o = P(0, 0, 0), ex = P(1, 0, 0), ez = P(0, 0, 1);
  const a = [ex[0] - o[0], ex[1] - o[1]], c = [ez[0] - o[0], ez[1] - o[1]], det = a[0] * c[1] - a[1] * c[0];
  function onPlane([sx, sy]) {
    const qx = sx - o[0], qy = sy - o[1];
    return [(qx * c[1] - qy * c[0]) / det, (a[0] * qy - a[1] * qx) / det];
  }

  function retarget() {
    bar.sil.classList.toggle("hi", over !== null);
    if (!over) { sp.t = REST; read.textContent = "rest"; B.wake(); return; }
    sp.t = clamp(TOP - (over[1] + GRIP), MIN, (FULL * reach) / 100);
    read.textContent = `screen ${Math.round((sp.t / FULL) * 100)}% · 0`;
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => {
      const [x, z] = onPlane(p);
      over = Math.abs(x) <= 76 && z >= -8 && z <= 136 ? [x, z] : null;
      retarget();
    },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { reach = v; if (over) retarget(); },
    destroy: bag.dispose,
  };
}

export default hairline({
  name: "screen",
  means: "A blank projection screen on a tripod: the pointer pulls it up or down, and it settles back two thirds down.",
  rules: [1, 3, 5, 8],
  range: [75, 100, 100],
  mount,
});
