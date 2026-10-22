import { physicalCreases, physicalEdgeKey } from "./mesh-creases.js";
import { MAX_MESH_VERTICES, validateMeshGeometry } from "./mesh-geometry.js";

const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const fail = (message) => {
  throw new Error(`Subdivision: ${message}`);
};

// Loop 1987 triangular subdivision. Geometry adjacency follows exact Float32
// positions; UV/color attribute slots remain independent and interpolate linearly.
function subdivideOnce(input) {
  const count = input.positions.length / 3;
  const indices = input.indices ?? Array.from({ length: count }, (_, i) => i);
  if (indices.length * 4 > 300000) fail("evaluated triangle budget exceeded");
  const sharp = physicalCreases(input);
  const used = new Set(indices),
    ids = Array(count).fill(-1),
    points = [],
    byPosition = new Map();
  for (const i of used) {
    const p = input.positions.slice(i * 3, i * 3 + 3).map(Math.fround),
      k = p.join(":");
    if (!byPosition.has(k)) {
      byPosition.set(k, points.length);
      points.push(p);
    }
    ids[i] = byPosition.get(k);
  }
  const edges = new Map(),
    canonicalEdges = new Map(),
    faces = new Set();
  const neighbors = points.map(() => new Set()),
    boundary = points.map(() => new Set());
  const links = points.map(() => new Map());
  for (let t = 0; t < indices.length; t += 3) {
    const f = indices.slice(t, t + 3).map((i) => ids[i]);
    const faceKey = [...f].sort((a, b) => a - b).join(":");
    if (faces.has(faceKey))
      fail("duplicate coincident faces; repair topology first");
    faces.add(faceKey);
    for (let j = 0; j < 3; j++) {
      const a = f[j],
        b = f[(j + 1) % 3],
        c = f[(j + 2) % 3];
      const k = key(a, b),
        e = edges.get(k);
      if (e) {
        if (e.opposites.length !== 1) fail("nonmanifold edge");
        if (e.a !== b || e.b !== a) fail("inconsistent face winding");
        e.opposites.push(c);
      } else
        edges.set(k, {
          a,
          b,
          opposites: [c],
          id: points.length + edges.size,
          sharp: sharp.has(
            physicalEdgeKey(input, indices[t + j], indices[t + ((j + 1) % 3)]),
          ),
        });
      neighbors[a].add(b);
      neighbors[b].add(a);
      for (const [u, v] of [
        [b, c],
        [c, b],
      ]) {
        if (!links[a].has(u)) links[a].set(u, new Set());
        links[a].get(u).add(v);
      }
      const ca = indices[t + j],
        cb = indices[t + ((j + 1) % 3)],
        ck = key(ca, cb);
      if (!canonicalEdges.has(ck))
        canonicalEdges.set(ck, { a: ca, b: cb, physical: k });
    }
  }
  if (count + canonicalEdges.size > MAX_MESH_VERTICES)
    fail("evaluated vertex budget exceeded");
  for (const e of edges.values())
    if (e.opposites.length === 1) {
      boundary[e.a].add(e.b);
      boundary[e.b].add(e.a);
    }
  for (let i = 0; i < points.length; i++) {
    if (boundary[i].size !== 0 && boundary[i].size !== 2)
      fail("nonmanifold boundary vertex");
    const graph = links[i],
      visited = new Set(),
      pending = [graph.keys().next().value];
    while (pending.length) {
      const v = pending.pop();
      if (visited.has(v)) continue;
      visited.add(v);
      for (const n of graph.get(v)) if (!visited.has(n)) pending.push(n);
    }
    if (visited.size !== graph.size)
      fail("pinched vertex has disconnected face fans");
    for (const [n, adjacent] of graph)
      if (adjacent.size !== (boundary[i].has(n) ? 1 : 2))
        fail("invalid vertex fan");
    if (!boundary[i].size && neighbors[i].size < 3)
      fail("invalid interior valence");
  }
  const creaseNeighbors = boundary.map((s) => new Set(s));
  for (const e of edges.values())
    if (e.sharp) {
      creaseNeighbors[e.a].add(e.b);
      creaseNeighbors[e.b].add(e.a);
    }
  const even = points.map((p, i) => {
    const rim = [...creaseNeighbors[i]];
    if (rim.length >= 3) return [...p];
    if (rim.length === 2)
      return p.map(
        (x, a) => 0.75 * x + 0.125 * (points[rim[0]][a] + points[rim[1]][a]),
      );
    const n = neighbors[i].size;
    const beta = (5 / 8 - (3 / 8 + Math.cos((2 * Math.PI) / n) / 4) ** 2) / n;
    return p.map(
      (x, a) =>
        (1 - n * beta) * x +
        beta * [...neighbors[i]].reduce((s, j) => s + points[j][a], 0),
    );
  });
  for (const e of edges.values()) {
    const { a, b, opposites: o } = e;
    e.position = points[a].map((x, axis) =>
      o.length === 1 || e.sharp
        ? (x + points[b][axis]) / 2
        : (3 / 8) * (x + points[b][axis]) +
          (1 / 8) * (points[o[0]][axis] + points[o[1]][axis]),
    );
  }
  const g = structuredClone(input);
  delete g.normals;
  for (const i of used) g.positions.splice(i * 3, 3, ...even[ids[i]]);
  const outputPhysical = [...ids];
  const childCreases = [];
  for (const e of canonicalEdges.values()) {
    e.id = g.positions.length / 3;
    const physical = edges.get(e.physical);
    g.positions.push(...physical.position);
    outputPhysical.push(physical.id);
    if (physical.sharp) childCreases.push([e.a, e.id], [e.id, e.b]);
    for (const [name, size] of [
      ["uv", 2],
      ["colors", 3],
    ])
      if (g[name])
        for (let a = 0; a < size; a++)
          g[name].push(
            (input[name][e.a * size + a] + input[name][e.b * size + a]) / 2,
          );
  }
  g.indices = [];
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = indices.slice(t, t + 3),
      ab = canonicalEdges.get(key(a, b)).id,
      bc = canonicalEdges.get(key(b, c)).id,
      ca = canonicalEdges.get(key(c, a)).id;
    g.indices.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }
  if (childCreases.length) g.creases = childCreases;
  else delete g.creases;
  validateMeshGeometry(g);
  // Area-weighted smooth normals across UV/color seams, without welding slots.
  const sums = Array.from({ length: points.length + edges.size }, () => [
    0, 0, 0,
  ]);
  for (let t = 0; t < g.indices.length; t += 3) {
    const f = g.indices.slice(t, t + 3),
      p = f.map((i) => g.positions.slice(i * 3, i * 3 + 3).map(Math.fround));
    const u = p[1].map((x, a) => x - p[0][a]),
      v = p[2].map((x, a) => x - p[0][a]);
    const cross = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    for (const i of f)
      for (let a = 0; a < 3; a++) sums[outputPhysical[i]][a] += cross[a];
  }
  const unit = sums.map((n) => {
    const length = Math.hypot(...n);
    if (length < 1e-10)
      fail("cancelling surface normals; repair winding or geometry");
    return n.map((x) => x / length);
  });
  g.normals = outputPhysical.flatMap((i) => (i < 0 ? [0, 1, 0] : unit[i]));
  validateMeshGeometry(g);
  return g;
}

export function subdivideMeshGeometry(input, levels = 1) {
  if (!Number.isInteger(levels) || levels < 1 || levels > 3)
    fail("levels must be an integer from 1 to 3");
  validateMeshGeometry(input);
  let g = input;
  for (let i = 0; i < levels; i++) g = subdivideOnce(g);
  return g;
}
