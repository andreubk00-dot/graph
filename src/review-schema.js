const rec = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v, min, max) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const id = (v) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
const label = (v) =>
  v === undefined || (typeof v === "string" && v.length <= 120);
const vec = (v) =>
  Array.isArray(v) && v.length === 3 && v.every((x) => num(x, -100000, 100000));
const fail = (s) => {
  throw new Error("Review: " + s);
};
export function validateReview(doc) {
  const r = doc.review;
  if (r === undefined) return;
  if (
    !rec(r) ||
    r.version !== 1 ||
    !rec(r.landmarks) ||
    Object.keys(r.landmarks).length > 128
  )
    fail("version 1 and up to 128 landmarks required");
  const nodes = new Map(doc.nodes.map((n) => [n.id, n])),
    landmarks = new Set(Object.keys(r.landmarks));
  for (const [key, l] of Object.entries(r.landmarks)) {
    if (!id(key) || !rec(l) || !nodes.has(l.node) || !label(l.label))
      fail("invalid landmark");
    const n = nodes.get(l.node);
    if (l.vertex !== undefined) {
      if (
        l.point !== undefined ||
        n.type !== "mesh" ||
        !Number.isInteger(l.vertex) ||
        l.vertex < 0 ||
        l.vertex >= n.geometry.positions.length / 3
      )
        fail("invalid surface vertex");
    } else if (!vec(l.point) || n.skin)
      fail(
        "use a vertex for a skinned surface or a local point on a bone/rigid node",
      );
  }
  const pair = (p) =>
    Array.isArray(p) && p.length === 2 && p.every((s) => landmarks.has(s));
  const unique = (arr, max) => {
    if (!Array.isArray(arr) || arr.length > max) fail("too many criteria");
    const ids = new Set();
    for (const a of arr) {
      if (!rec(a) || !id(a.id) || ids.has(a.id) || !label(a.label))
        fail("invalid criterion ID/label");
      ids.add(a.id);
    }
  };
  if (r.measurements !== undefined) {
    unique(r.measurements, 64);
    for (const m of r.measurements) {
      if (
        !pair(m.between) ||
        (m.reference !== undefined && !pair(m.reference)) ||
        (m.range !== undefined &&
          (!Array.isArray(m.range) ||
            m.range.length !== 2 ||
            !m.range.every((v) => num(v, 0, 1e6)) ||
            m.range[0] > m.range[1]))
      )
        fail("invalid distance or ratio");
    }
  }
  if (r.symmetry !== undefined) {
    unique(r.symmetry, 16);
    for (const s of r.symmetry) {
      if (
        !Array.isArray(s.pairs) ||
        !s.pairs.length ||
        s.pairs.length > 64 ||
        !s.pairs.every(pair) ||
        !rec(s.plane) ||
        !nodes.has(s.plane.node) ||
        !["x", "y", "z"].includes(s.plane.axis) ||
        !num(s.plane.offset, -100000, 100000) ||
        !num(s.tolerance, 0, 100)
      )
        fail("invalid symmetry plane or pairs");
    }
  }
  if (r.motion !== undefined) {
    const m = r.motion;
    if (
      !rec(m) ||
      !nodes.has(m.root) ||
      !vec(m.forward) ||
      Math.abs(m.forward[1]) > 1e-8 ||
      Math.hypot(...m.forward) < 1e-8 ||
      !vec(m.facingAxis) ||
      Math.hypot(...m.facingAxis) < 1e-8 ||
      !["root", "inPlace"].includes(m.mode) ||
      !num(m.groundY, -100000, 100000) ||
      typeof m.requireFlight !== "boolean" ||
      !num(m.flightHeight, 0, 10)
    )
      fail("invalid locomotion reference");
    if (
      m.clip !== null &&
      m.clip !== "default" &&
      !doc.clips?.some((c) => c.id === m.clip)
    )
      fail("motion clip not found");
    if (m.mode === "inPlace" && !num(m.distance, 0.001, 10000))
      fail("in-place motion needs distance per cycle");
    if (m.distance !== undefined && !num(m.distance, 0.001, 10000))
      fail("invalid cycle distance");
    if (
      !rec(m.tolerances) ||
      !["slip", "ground", "penetration", "travel", "facingAngle"].every((k) =>
        num(m.tolerances[k], 0, k === "facingAngle" ? 180 : 100),
      )
    )
      fail("invalid motion tolerances");
    if (
      m.tolerances.directionAngle !== undefined &&
      !num(m.tolerances.directionAngle, 0, 180)
    )
      fail("invalid travel direction tolerance");
    unique(m.feet, 8);
    if (m.feet.length < 2) fail("locomotion needs 2–8 feet");
    for (const f of m.feet) {
      if (
        !Array.isArray(f.sole) ||
        !f.sole.length ||
        f.sole.length > 8 ||
        !f.sole.every((s) => landmarks.has(s)) ||
        !Array.isArray(f.contacts) ||
        f.contacts.length > 16
      )
        fail("invalid sole landmarks");
      let end = 0;
      for (const c of f.contacts) {
        if (
          !rec(c) ||
          !landmarks.has(c.landmark) ||
          !f.sole.includes(c.landmark) ||
          !num(c.start, 0, 1) ||
          !num(c.end, 0, 1) ||
          c.end <= c.start ||
          c.start < end
        )
          fail(
            "contact intervals must be ordered nonoverlapping phases with a sole landmark",
          );
        end = c.end;
      }
    }
  }
}
