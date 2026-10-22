export const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const positionKey = (g, i) =>
  g.positions
    .slice(i * 3, i * 3 + 3)
    .map(Math.fround)
    .join(",");
export const physicalEdgeKey = (g, a, b) =>
  [positionKey(g, a), positionKey(g, b)].sort().join("|");
export function creaseEdges(g) {
  const ix =
      g.indices ?? Array.from({ length: g.positions.length / 3 }, (_, i) => i),
    edges = new Map();
  for (let t = 0; t < ix.length; t += 3)
    for (let j = 0; j < 3; j++) {
      const a = ix[t + j],
        b = ix[t + ((j + 1) % 3)];
      edges.set(edgeKey(a, b), a < b ? [a, b] : [b, a]);
    }
  return edges;
}
export function validateCreases(g) {
  if (g.creases === undefined) return;
  if (!Array.isArray(g.creases) || g.creases.length > 100000)
    throw new Error("Creases require an array of at most 100000 edge pairs");
  if (!g.creases.length) return;
  const edges = creaseEdges(g),
    seen = new Set();
  for (const pair of g.creases) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      pair.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= g.positions.length / 3,
      ) ||
      pair[0] === pair[1]
    )
      throw new Error("Invalid crease vertex pair");
    const k = edgeKey(...pair);
    if (!edges.has(k) || seen.has(k))
      throw new Error("Creases must reference unique existing mesh edges");
    seen.add(k);
  }
}
export const physicalCreases = (g) =>
  new Set((g.creases ?? []).map(([a, b]) => physicalEdgeKey(g, a, b)));
export function expandedCreases(g) {
  const sharp = physicalCreases(g);
  return [...creaseEdges(g).values()].filter(([a, b]) =>
    sharp.has(physicalEdgeKey(g, a, b)),
  );
}
export function retainCreases(g, pairs = g.creases ?? []) {
  const edges = creaseEdges(g),
    seen = new Set();
  const keep = pairs
    .filter(([a, b]) => {
      const k = edgeKey(a, b);
      if (a === b || !edges.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(([a, b]) => (a < b ? [a, b] : [b, a]));
  if (keep.length) g.creases = keep;
  else delete g.creases;
}

// Render-only face-fan splitting. Keep every canonical vertex in the prefix;
// append attribute/weight copies only when a hard normal needs another slot.
export function creaseNormalGeometry(input) {
  if (!input.creases?.length) return { geometry: input, sources: null };
  const ix =
    input.indices ??
    Array.from({ length: input.positions.length / 3 }, (_, i) => i);
  const sharp = physicalCreases(input),
    edges = new Map();
  const parents = Array.from({ length: ix.length }, (_, i) => i);
  function root(i) {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  }
  const join = (a, b) => {
    parents[root(a)] = root(b);
  };
  const cross = [];
  for (let t = 0; t < ix.length; t += 3) {
    const p = ix
      .slice(t, t + 3)
      .map((i) => input.positions.slice(i * 3, i * 3 + 3).map(Math.fround));
    const u = p[1].map((x, a) => x - p[0][a]),
      v = p[2].map((x, a) => x - p[0][a]);
    cross.push([
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]);
    for (let j = 0; j < 3; j++) {
      const ca = t + j,
        cb = t + ((j + 1) % 3),
        a = positionKey(input, ix[ca]),
        b = positionKey(input, ix[cb]);
      const k = physicalEdgeKey(input, ix[ca], ix[cb]),
        e = edges.get(k);
      if (!e) edges.set(k, { a, b, ca, cb, count: 1 });
      else {
        if (++e.count > 2 || e.a !== b || e.b !== a)
          throw new Error(
            "Crease normals require consistently wound manifold edges",
          );
        if (!sharp.has(k)) {
          join(e.ca, cb);
          join(e.cb, ca);
        }
      }
    }
  }
  const sums = new Map();
  for (let i = 0; i < ix.length; i++) {
    const r = root(i);
    if (!sums.has(r)) sums.set(r, [0, 0, 0]);
    const sum = sums.get(r),
      n = cross[Math.floor(i / 3)];
    for (let a = 0; a < 3; a++) sum[a] += n[a];
  }
  for (const [r, n] of sums) {
    const length = Math.hypot(...n);
    if (length < 1e-10)
      throw new Error("Crease normals cancel; repair winding or geometry");
    sums.set(
      r,
      n.map((x) => x / length),
    );
  }
  const g = structuredClone(input),
    count = input.positions.length / 3;
  delete g.creases;
  g.indices = [];
  g.normals = Array.from({ length: count }, () => [0, 1, 0]).flat();
  const sources = Array.from({ length: count }, (_, i) => i),
    assignments = new Map();
  for (let i = 0; i < ix.length; i++) {
    const original = ix[i],
      r = root(i);
    if (!assignments.has(original)) assignments.set(original, new Map());
    const groups = assignments.get(original);
    if (!groups.has(r)) {
      const id = groups.size ? sources.length : original;
      if (groups.size) {
        sources.push(original);
        for (const [name, size] of [
          ["positions", 3],
          ["uv", 2],
          ["colors", 3],
        ])
          if (g[name])
            g[name].push(
              ...input[name].slice(original * size, original * size + size),
            );
        g.normals.push(...sums.get(r));
      } else g.normals.splice(id * 3, 3, ...sums.get(r));
      groups.set(r, id);
    }
    g.indices.push(groups.get(r));
  }
  return { geometry: g, sources };
}
