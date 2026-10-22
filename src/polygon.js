export const DEFAULT_OUTLINE = [
  [-0.35, -0.5],
  [0.35, -0.5],
  [0.45, 0.15],
  [0, 0.65],
  [-0.45, 0.15],
];
const EPS = 1e-8;
const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a, b, p) =>
  Math.abs(cross(a, b, p)) < EPS &&
  p[0] >= Math.min(a[0], b[0]) - EPS &&
  p[0] <= Math.max(a[0], b[0]) + EPS &&
  p[1] >= Math.min(a[1], b[1]) - EPS &&
  p[1] <= Math.max(a[1], b[1]) + EPS;
function intersects(a, b, c, d) {
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  return (
    (((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) &&
      ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
export function validateOutline(points) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 128)
    throw new Error("Outline needs 3–128 points");
  for (const p of points)
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      p.some(
        (v) =>
          typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 100,
      ) ||
      p[0] === undefined ||
      p[1] === undefined
    )
      throw new Error(
        "Outline coordinates must be finite numbers between −100 and 100",
      );
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS)
      throw new Error("Outline has repeated adjacent points");
    const previous = points[(i + points.length - 1) % points.length];
    if (
      Math.abs(cross(previous, a, b)) < EPS &&
      (previous[0] - a[0]) * (b[0] - a[0]) +
        (previous[1] - a[1]) * (b[1] - a[1]) >
        EPS
    )
      throw new Error("Outline edges overlap");
    area += a[0] * b[1] - a[1] * b[0];
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length]))
        throw new Error("Outline edges intersect");
    }
  }
  if (Math.abs(area) < EPS)
    throw new Error("Outline must have a non-zero area");
  return points;
}
