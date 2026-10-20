import { HL, hairline } from './kernel.js';
/**
 * Level: a spirit level balanced on a block over a bench plate, measuring how
 * far a fund leans off its index. At rest it sits a touch off true, the bubble
 * just past its marks. The pointer's place along the level tilts it, on a
 * spring; the bubble runs to the higher end on a softer one, lagging as a
 * liquid does. The read-out gives the tilt. The slider is the furthest tilt,
 * in degrees.
 *
 * The pattern: a continuous input, as Exploded's scrub. Springs, a pointer
 * read against the level's fixed centre on screen, and a rest that is off true.
 */
const {
  Cam, clamp, facing, fit, hull, open, poly, prism, proj, rad, rings, rrect, run, seg,
  disposer, mk, pointer, put, register, solid, spring, stepS,
} = HL;

const L = 156, W = 22, H = 13, XC = L / 2, ZF = 11, REST = 1.1, TRAVEL = 11;
const PX0 = XC - 30, PX1 = XC + 30;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let most = value, over = false, said = "";

  const lift = (L / 2) * Math.sin(rad(9)) + H;
  const C = Cam(45, 0.5, 2.2);
  fit(C, [[0, -W, ZF - lift], [L, W, ZF - lift], [L, -W, ZF + lift], [0, W, ZF + lift], [PX0, -16, -4], [PX1, 16, -4]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // The bench plate and the block the level balances on.
  const [br, bi] = rings(PX0, -16, PX1, 16, 6, 1.8);
  put(solid(g), prism(P, front, br, bi, -4, 0));
  const [fr, fi] = rings(XC - 7, -7, XC + 7, 7, 3, 1);
  put(solid(g), prism(P, front, fr, fi, 0, ZF));

  // The level, drawn in its own frame (u along it, v across, w up) and turned about the block.
  const body = solid(g), top = mk("path", { class: "nf lo" }, g), vial = mk("path", { class: "nf" }, g), bubble = mk("path", { class: "nf hi" }, g);
  const ring = rrect(-L / 2, -W / 2, L / 2, W / 2, 4, 6), inner = rrect(-L / 2 + 1.6, -W / 2 + 1.6, L / 2 - 1.6, W / 2 - 1.6, 2.4, 6);
  const shell = rrect(-18, -5, 18, 5, 4.5, 6), tube = rrect(-15, -3, 15, 3, 3, 6), hole = rrect(L / 2 - 23, -3, L / 2 - 17, 3, 3, 4);

  let drawn = "";
  function draw(th, b) {
    const key = th.toFixed(3) + b.toFixed(2);
    if (key === drawn) return;
    drawn = key;
    const c = Math.cos(rad(th)), s = Math.sin(rad(th));
    const at = (u, v, w) => P(XC + u * c - w * s, v, ZF + u * s + w * c);
    const face = (r, w) => r.map((q) => at(q.u, q.v, w));
    put(body, {
      sil: poly(hull(face(ring, 0).concat(face(ring, H)))),
      crease: open(face(run(inner, front), H)),
    });
    // The end caps and the hanging hole: what makes it a level and not a bar.
    const cap = (u) => seg(at(u, -W / 2 + 1, H), at(u, W / 2 - 1, H));
    top.setAttribute("d", cap(-L / 2 + 10) + cap(L / 2 - 10) + poly(face(hole, H)) + poly(face(tube, H)) + seg(at(-5, -3, H), at(-5, 3, H)) + seg(at(5, -3, H), at(5, 3, H)));
    vial.setAttribute("d", poly(face(shell, H)));
    bubble.setAttribute("d", poly(face(rrect(b - 5, -2.2, b + 5, 2.2, 2.2, 5), H + 0.3)));
  }

  const tilt = spring(REST);
  // The bubble is a liquid, so it follows the tilt on a softer spring than the hand.
  const bub = spring(REST * 2.2, { k: 40, c: 9 });
  const B = register(stage, (dt) => {
    const m = stepS(tilt, dt);
    bub.t = clamp(tilt.x * 2.2, -TRAVEL, TRAVEL);
    const n = stepS(bub, dt);
    draw(tilt.x, bub.x);
    const text = over ? `tilt ${Math.abs(tilt.t).toFixed(1)}°` : "rest";
    if (text !== said) { said = text; read.textContent = text; }
    return m || n;
  });
  bag.add(B.unregister);
  draw(REST, REST * 2.2);
  read.textContent = said = "rest";

  // The pointer is read against the level's centre and half its length on screen, which never move.
  const cx = P(XC, 0, ZF)[0], span = Math.abs(P(L, 0, ZF)[0] - cx);
  bag.add(pointer(stage, {
    move: (p) => { over = true; tilt.t = -clamp((p[0] - cx) / span, -1, 1) * most; B.wake(); },
    leave: () => { over = false; tilt.t = REST; B.wake(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { most = v; B.wake(); },
    destroy: bag.dispose,
  };
}

export default hairline({
  name: "level",
  means: "A spirit level measuring how far a fund leans off its index: the pointer tilts it and the bubble runs to the high end.",
  rules: [1, 3, 5, 9],
  range: [3, 5, 8],
  mount,
});
