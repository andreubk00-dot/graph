// Topology is measured after positional welding, independently of UV and hard-normal seams.
export function auditMesh(g, { tolerance = 1e-5 } = {}) {
  if (!(tolerance > 0 && Number.isFinite(tolerance)))
    throw new Error("Invalid audit tolerance");
  const p = g.positions,
    n = g.normals,
    ids = g.indices ?? Array.from({ length: p.length / 3 }, (_, i) => i),
    referenced = new Set(ids),
    map = new Map(),
    weld = [],
    unique = [];
  for (let i = 0; i < p.length; i += 3) {
    if (!referenced.has(i / 3)) continue;
    const point = p.slice(i, i + 3),
      key = point.map((v) => Math.round(v / tolerance)).join(",");
    if (!map.has(key)) {
      map.set(key, unique.length);
      unique.push(point);
    }
    weld[i / 3] = map.get(key);
  }
  const edges = new Map(),
    parent = unique.map((_, i) => i),
    find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
  let degenerate = 0,
    normalErrors = 0,
    inwardNormals = 0;
  if (n)
    for (let i = 0; i < n.length; i += 3)
      if (referenced.has(i / 3) && Math.abs(Math.hypot(...n.slice(i, i + 3)) - 1) > 0.002)
        normalErrors++;
  for (let i = 0; i < ids.length; i += 3) {
    const a = ids.slice(i, i + 3),
      w = a.map((i) => weld[i]);
    const [v0, v1, v2] = a.map((i) => p.slice(i * 3, i * 3 + 3)),
      u = v1.map((v, k) => v - v0[k]),
      v = v2.map((v, k) => v - v0[k]),
      cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
    if (new Set(w).size < 3 || Math.hypot(...cross) < 1e-12) {
      degenerate++;
      continue;
    }
    parent[find(w[1])] = find(w[0]);
    parent[find(w[2])] = find(w[0]);
    if (
      n &&
      cross.reduce(
        (s, c, k) =>
          s + c * (n[a[0] * 3 + k] + n[a[1] * 3 + k] + n[a[2] * 3 + k]),
        0,
      ) < -1e-10
    )
      inwardNormals++;
    for (let j = 0; j < 3; j++) {
      const a = w[j],
        b = w[(j + 1) % 3],
        key = Math.min(a, b) * unique.length + Math.max(a, b),
        edge = edges.get(key) ?? { count: 0, balance: 0 };
      edge.count++;
      edge.balance += a < b ? 1 : -1;
      edges.set(key, edge);
    }
  }
  let unmatchedMirror = 0;
  for (const v of unique) {
    const key = [-v[0], v[1], v[2]]
      .map((x) => Math.round(x / tolerance))
      .join(",");
    if (!map.has(key)) unmatchedMirror++;
  }
  const bounds = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ];
  for (const v of unique)
    for (let axis = 0; axis < 3; axis++) {
      bounds[axis][0] = Math.min(bounds[axis][0], v[axis]);
      bounds[axis][1] = Math.max(bounds[axis][1], v[axis]);
    }
  return {
    vertices: p.length / 3,
    unusedVertices: p.length / 3 - referenced.size,
    weldedVertices: unique.length,
    triangles: ids.length / 3,
    components: new Set(unique.map((_, i) => find(i))).size,
    boundaryEdges: [...edges.values()].filter((e) => e.count === 1).length,
    nonManifoldEdges: [...edges.values()].filter((e) => e.count > 2).length,
    windingConflicts: [...edges.values()].filter(
      (e) => e.count === 2 && e.balance !== 0,
    ).length,
    degenerate,
    normalErrors,
    inwardNormals,
    mirrorMatch: unique.length ? 1 - unmatchedMirror / unique.length : 0,
    bounds,
  };
}
export function stripEmptyFaces(g) {
  const out = { positions: [], normals: [], smooth: true };
  if (g.uv) out.uv = [];
  if (g.colors) out.colors = [];
  const indices =
    g.indices ?? Array.from({ length: g.positions.length / 3 }, (_, i) => i);
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3),
      p = ids.map((id) =>
        g.positions.slice(id * 3, id * 3 + 3).map(Math.fround),
      ),
      u = p[1].map((v, j) => v - p[0][j]),
      v = p[2].map((v, j) => v - p[0][j]),
      cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
    if (
      cross.reduce((s, v) => s + v * v, 0) <=
      1e-20 *
        Math.max(
          1,
          u.reduce((s, v) => s + v * v, 0) * v.reduce((s, v) => s + v * v, 0),
        )
    )
      continue;
    for (const id of ids) {
      out.positions.push(...g.positions.slice(id * 3, id * 3 + 3));
      out.normals.push(...g.normals.slice(id * 3, id * 3 + 3));
      if (g.uv) out.uv.push(...g.uv.slice(id * 2, id * 2 + 2));
      if (g.colors) out.colors.push(...g.colors.slice(id * 3, id * 3 + 3));
    }
  }
  return out;
}
