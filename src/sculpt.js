import { Euler, Quaternion, Vector3, Color } from "three";
import { validateMeshGeometry } from "./mesh-geometry.js";
const finite = (x, min, max) =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
const vec = (v, lo = -100, hi = 100) =>
  Array.isArray(v) && v.length === 3 && v.every((x) => finite(x, lo, hi));
export function validateSculptRecipe(input) {
  const r = structuredClone(input);
  if (
    !r ||
    r.version !== 1 ||
    !Number.isInteger(r.resolution) ||
    r.resolution < 12 ||
    r.resolution > 96
  )
    throw new Error("Sculpt resolution must be 12–96");
  if (
    !Array.isArray(r.bounds) ||
    r.bounds.length !== 2 ||
    !r.bounds.every((v) => vec(v)) ||
    r.bounds[0].some((v, i) => r.bounds[1][i] - v < 0.01)
  )
    throw new Error("Invalid sculpt bounds");
  if (
    r.keepLargestSurface !== undefined &&
    typeof r.keepLargestSurface !== "boolean"
  )
    throw new Error("Invalid sculpt surface cleanup flag");
  if (!Array.isArray(r.parts) || !r.parts.length || r.parts.length > 64)
    throw new Error("Sculpt needs 1–64 fields");
  for (const [i, p] of r.parts.entries()) {
    if (
      !p ||
      !["ellipsoid", "capsule"].includes(p.shape) ||
      !["union", "subtract"].includes(p.op ?? "union") ||
      (i === 0 && p.op === "subtract")
    )
      throw new Error("Invalid sculpt field operation");
    p.op ??= "union";
    p.smooth ??= 0.12;
    p.color ??= "#88998d";
    if (
      !finite(p.smooth, 0, 5) ||
      typeof p.color !== "string" ||
      !/^#[a-f\d]{6}$/i.test(p.color)
    )
      throw new Error("Invalid sculpt blend or color");
    if (
      p.shape === "ellipsoid" &&
      (!vec(p.center) ||
        !vec(p.radius, 0.015, 50) ||
        (p.rotation !== undefined &&
          !vec(p.rotation, -Math.PI * 2, Math.PI * 2)))
    )
      throw new Error("Invalid sculpt ellipsoid");
    if (
      p.shape === "capsule" &&
      (!vec(p.a) ||
        !vec(p.b) ||
        !finite(p.radius, 0.015, 50) ||
        (p.endRadius !== undefined && !finite(p.endRadius, 0.005, 50)))
    )
      throw new Error("Invalid sculpt capsule");
  }
  return r;
}
export function compileField(input) {
  const recipe = validateSculptRecipe(input);
  const fields = recipe.parts.map((p) => {
    const c = new Color(p.color).toArray();
    if (p.shape === "capsule") {
      const ab = p.b.map((x, i) => x - p.a[i]),
        l2 = ab.reduce((s, x) => s + x * x, 0);
      return {
        ...p,
        c,
        distance(x, y, z) {
          const ap = [x - p.a[0], y - p.a[1], z - p.a[2]],
            h = l2
              ? Math.max(
                  0,
                  Math.min(1, ap.reduce((s, v, i) => s + v * ab[i], 0) / l2),
                )
              : 0;
          return (
            Math.hypot(...ap.map((v, i) => v - h * ab[i])) -
            (p.radius + ((p.endRadius ?? p.radius) - p.radius) * h)
          );
        },
      };
    }
    const q = new Quaternion()
        .setFromEuler(new Euler(...(p.rotation ?? [0, 0, 0])))
        .invert(),
      v = new Vector3();
    return {
      ...p,
      c,
      distance(x, y, z) {
        v.set(
          x - p.center[0],
          y - p.center[1],
          z - p.center[2],
        ).applyQuaternion(q);
        const a = v.toArray().map((v, i) => v / p.radius[i]),
          k0 = Math.hypot(...a),
          k1 = Math.hypot(...a.map((v, i) => v / p.radius[i]));
        return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(...p.radius);
      },
    };
  });
  function sample(x, y, z) {
    let d = Infinity,
      c = [0, 0, 0];
    for (const p of fields) {
      let b = p.distance(x, y, z),
        k = p.smooth;
      if (p.op === "subtract") {
        b = -b;
        if (!k) {
          if (b > d) {
            d = b;
            c = p.c;
          }
          continue;
        }
        const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (d - b)) / k));
        d = b * (1 - h) + d * h + k * h * (1 - h);
        c = c.map((v, i) => p.c[i] * (1 - h) + v * h);
      } else {
        if (!Number.isFinite(d)) {
          d = b;
          c = p.c;
          continue;
        }
        if (!k) {
          if (b < d) {
            d = b;
            c = p.c;
          }
          continue;
        }
        const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - d)) / k));
        d = b * (1 - h) + d * h - k * h * (1 - h);
        c = c.map((v, i) => p.c[i] * (1 - h) + v * h);
      }
    }
    return { distance: d, color: c };
  }
  return { recipe, sample };
}
export function sculptGeometry(input) {
  const { recipe, sample } = compileField(input),
    [lo, hi] = recipe.bounds;
  const step = Math.max(...hi.map((v, i) => v - lo[i])) / recipe.resolution;
  const size = hi.map((v, i) => Math.ceil((v - lo[i]) / step)),
    nx = size[0] + 1,
    ny = size[1] + 1;
  const id = (x, y, z) => x + nx * (y + ny * z),
    points = [],
    distances = [];
  for (let z = 0; z <= size[2]; z++)
    for (let y = 0; y <= size[1]; y++)
      for (let x = 0; x <= size[0]; x++) {
        const p = [lo[0] + x * step, lo[1] + y * step, lo[2] + z * step],
          d = sample(...p).distance;
        if (
          (x === 0 ||
            y === 0 ||
            z === 0 ||
            x === size[0] ||
            y === size[1] ||
            z === size[2]) &&
          d <= 0
        )
          throw new Error(
            "Sculpt surface touches bounds: increase the padding",
          );
        points.push(p);
        distances.push(Math.abs(d) < 1e-12 ? 0 : d);
      }
  const positions = [],
    normals = [],
    colors = [],
    indices = [],
    edges = new Map(),
    epsilon = step * 0.01;
  function vertex(a, b) {
    const low = Math.min(a, b),
      high = Math.max(a, b),
      t = distances[a] / (distances[a] - distances[b]);
    const endpoint = t < 1e-3 ? a : t > 1 - 1e-3 ? b : null,
      key = endpoint === null ? low * points.length + high : -endpoint - 1;
    if (edges.has(key)) return edges.get(key);
    const p =
      endpoint === null
        ? points[a].map((v, i) => v + t * (points[b][i] - v))
        : [...points[endpoint]];
    const normal = [0, 1, 2].map((i) => {
      const a = [...p],
        b = [...p];
      a[i] += epsilon;
      b[i] -= epsilon;
      return sample(...a).distance - sample(...b).distance;
    });
    const length = Math.hypot(...normal);
    if (length < 1e-12)
      throw new Error("Sculpt has an undefined surface normal");
    const index = positions.length / 3;
    if (index >= 100000)
      throw new Error("Sculpt exceeds 100000 vertices: lower the resolution");
    positions.push(...p);
    normals.push(...normal.map((v) => v / length));
    colors.push(...sample(...p).color);
    edges.set(key, index);
    return index;
  }
  function triangle(a, b, c) {
    const u = [0, 1, 2].map((i) => positions[b * 3 + i] - positions[a * 3 + i]),
      v = [0, 1, 2].map((i) => positions[c * 3 + i] - positions[a * 3 + i]);
    const cross = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    if (a === b || b === c || a === c || Math.hypot(...cross) < 1e-12) return;
    if (cross.reduce((s, x, i) => s + x * normals[a * 3 + i], 0) < 0)
      [b, c] = [c, b];
    indices.push(a, b, c);
    if (indices.length > 300000)
      throw new Error("Sculpt exceeds 100000 triangles: lower the resolution");
  }
  const tets = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ];
  for (let z = 0; z < size[2]; z++)
    for (let y = 0; y < size[1]; y++)
      for (let x = 0; x < size[0]; x++) {
        const cube = [
          id(x, y, z),
          id(x + 1, y, z),
          id(x + 1, y + 1, z),
          id(x, y + 1, z),
          id(x, y, z + 1),
          id(x + 1, y, z + 1),
          id(x + 1, y + 1, z + 1),
          id(x, y + 1, z + 1),
        ];
        for (const t of tets) {
          const inside = t.map((i) => cube[i]).filter((i) => distances[i] < 0),
            outside = t.map((i) => cube[i]).filter((i) => distances[i] >= 0);
          if (inside.length === 1 || inside.length === 3) {
            const a = inside.length === 1 ? inside : outside,
              b = inside.length === 1 ? outside : inside;
            triangle(...b.map((i) => vertex(a[0], i)));
          } else if (inside.length === 2) {
            const [a, b] = inside,
              [c, d] = outside,
              q = [vertex(a, c), vertex(a, d), vertex(b, d), vertex(b, c)];
            triangle(q[0], q[1], q[2]);
            triangle(q[0], q[2], q[3]);
          }
        }
      }
  if (!indices.length) throw new Error("Sculpt contains no visible surface");
  let geometry = { positions, indices, normals, colors, smooth: true };
  if (recipe.keepLargestSurface) geometry = largestSurface(geometry);
  validateMeshGeometry(geometry);
  return geometry;
}
// Remove complete disconnected surfaces, never individual triangles or open borders.
function largestSurface(g) {
  const parent = Array.from({ length: g.positions.length / 3 }, (_, i) => i);
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== i) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = g.indices.slice(i, i + 3);
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  const counts = new Map();
  for (let i = 0; i < g.indices.length; i += 3) {
    const root = find(g.indices[i]);
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  const largest = [...counts].sort((a, b) => b[1] - a[1])[0][0],
    map = new Map(),
    out = { positions: [], indices: [], normals: [], colors: [], smooth: true };
  for (let i = 0; i < g.indices.length; i += 3)
    if (find(g.indices[i]) === largest)
      for (const old of g.indices.slice(i, i + 3)) {
        if (!map.has(old)) {
          map.set(old, out.positions.length / 3);
          for (const key of ["positions", "normals", "colors"])
            out[key].push(...g[key].slice(old * 3, old * 3 + 3));
        }
        out.indices.push(map.get(old));
      }
  return out;
}
export const DEFAULT_SCULPT = {
  version: 1,
  resolution: 32,
  bounds: [
    [-1.3, -1.3, -1.3],
    [1.3, 1.6, 1.3],
  ],
  parts: [
    {
      shape: "ellipsoid",
      center: [0, 0, 0],
      radius: [0.7, 0.8, 0.55],
      color: "#426e61",
      smooth: 0.2,
    },
    {
      shape: "ellipsoid",
      center: [0, 0.65, 0.12],
      radius: [0.47, 0.55, 0.45],
      color: "#639583",
      smooth: 0.22,
    },
    {
      shape: "ellipsoid",
      center: [-0.23, 0.77, 0.46],
      radius: [0.14, 0.12, 0.18],
      op: "subtract",
      smooth: 0.035,
      color: "#203d36",
    },
    {
      shape: "ellipsoid",
      center: [0.23, 0.77, 0.46],
      radius: [0.14, 0.12, 0.18],
      op: "subtract",
      smooth: 0.035,
      color: "#203d36",
    },
  ],
};
