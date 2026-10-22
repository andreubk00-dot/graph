import { expandedCreases, edgeKey } from "./mesh-creases.js";
// Pure topology operations; integrate through Graph Forge's atomic meshEdit path.
export function editTopology(g, command, maxVertices = 100000) {
  const fail = (m) => {
      throw new Error(m);
    },
    p = (i) => g.positions.slice(i * 3, i * 3 + 3),
    key = (p) => p.map(Math.fround).join(",");
  const count = g.positions.length / 3,
    faces = Array.from({ length: g.indices.length / 3 }, (_, i) =>
      g.indices.slice(i * 3, i * 3 + 3),
    ),
    edges = [],
    edgeMap = new Map();
  for (const f of faces)
    for (let j = 0; j < 3; j++) {
      const a = f[j],
        b = f[(j + 1) % 3],
        k = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeMap.has(k)) {
        edgeMap.set(k, edges.length);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    }
  const selected = (mode, limit) => {
    const s = command.selection;
    if (s?.mode !== mode || !Array.isArray(s.ids) || !s.ids.length)
      fail(`Select ${mode} components first`);
    const ids = [...new Set(s.ids)];
    if (ids.some((i) => !Number.isInteger(i) || i < 0 || i >= limit))
      fail("Component index is out of range");
    return ids;
  };
  const spatial = () => {
    const map = new Map(),
      ids = [];
    for (let i = 0; i < g.positions.length / 3; i++) {
      const k = key(p(i));
      if (!map.has(k)) map.set(k, map.size);
      ids.push(map.get(k));
    }
    return ids;
  };
  const interpolate = (a, b, t, position) => {
    if (g.positions.length / 3 >= maxVertices)
      fail("Mesh vertex budget exceeded");
    const id = g.positions.length / 3;
    g.positions.push(...position);
    for (const [name, size] of [
      ["uv", 2],
      ["colors", 3],
    ])
      if (g[name])
        g[name].push(
          ...Array.from(
            { length: size },
            (_, k) =>
              g[name][a * size + k] * (1 - t) + g[name][b * size + k] * t,
          ),
        );
    return id;
  };
  const assertManifold = () => {
    if (!g.indices.length) fail("Operation would remove every face");
    const ids = spatial(),
      seen = new Set(),
      adj = new Map(),
      vertexFaces = new Map(),
      fs = [];
    for (let i = 0; i < g.indices.length; i += 3) {
      const f = g.indices.slice(i, i + 3).map((v) => ids[v]),
        fi = fs.length;
      fs.push(f);
      if (new Set(f).size !== 3)
        fail("Operation would create a collapsed face");
      const fk = [...f].sort((a, b) => a - b).join(":");
      if (seen.has(fk))
        fail("Operation would create overlapping duplicate faces");
      seen.add(fk);
      for (let j = 0; j < 3; j++) {
        const a = f[j],
          b = f[(j + 1) % 3],
          k = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (!adj.has(k)) adj.set(k, { faces: [], direction: 0 });
        const e = adj.get(k);
        e.faces.push(fi);
        e.direction += a < b ? 1 : -1;
        if (e.faces.length > 2)
          fail("Operation would create a nonmanifold edge");
        if (!vertexFaces.has(a)) vertexFaces.set(a, []);
        vertexFaces.get(a).push(fi);
      }
    }
    for (const e of adj.values())
      if (e.faces.length === 2 && e.direction !== 0)
        fail("Operation would create inconsistent face winding");
    for (const [v, incident] of vertexFaces) {
      const visited = new Set(),
        pending = [incident[0]],
        boundaries = new Set();
      while (pending.length) {
        const i = pending.pop();
        if (visited.has(i)) continue;
        visited.add(i);
        for (const w of fs[i])
          if (w !== v) {
            const k = v < w ? `${v}:${w}` : `${w}:${v}`,
              e = adj.get(k);
            if (e.faces.length === 1) boundaries.add(k);
            for (const n of e.faces) if (!visited.has(n)) pending.push(n);
          }
      }
      if (visited.size !== incident.length || ![0, 2].includes(boundaries.size))
        fail("Operation would pinch disconnected surface fans into one vertex");
    }
  };
  if (command.action === "splitEdges") {
    const oldCreases = g.creases?.length ? expandedCreases(g) : [];
    const selectedIds = selected("edge", edges.length),
      fraction = command.fraction ?? 0.5;
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1)
      fail("Split fraction must lie strictly between 0 and 1");
    const ids = spatial(),
      requests = new Map(),
      physical = (a, b) =>
        ids[a] < ids[b] ? `${ids[a]}:${ids[b]}` : `${ids[b]}:${ids[a]}`;
    for (const id of selectedIds) {
      const [a, b] = edges[id],
        position = p(a).map((v, k) => v + (p(b)[k] - v) * fraction),
        k = physical(a, b);
      if (requests.has(k) && key(requests.get(k).position) !== key(position))
        fail("Coincident seam edges request conflicting split positions");
      requests.set(k, { position, from: ids[a], fraction });
    }
    const incidence = new Map();
    for (const f of faces)
      for (let j = 0; j < 3; j++) {
        const a = f[j],
          b = f[(j + 1) % 3],
          k = physical(a, b);
        if (!requests.has(k)) continue;
        const e = incidence.get(k) ?? { count: 0, direction: 0 };
        e.count++;
        e.direction += ids[a] < ids[b] ? 1 : -1;
        incidence.set(k, e);
      }
    for (const e of incidence.values())
      if (e.count > 2 || (e.count === 2 && e.direction !== 0))
        fail("Cannot split a nonmanifold or inconsistently wound seam edge");
    const mids = new Map(),
      mid = (a, b) => {
        const r = requests.get(physical(a, b));
        if (!r) return null;
        const k = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (!mids.has(k))
          mids.set(
            k,
            interpolate(
              a,
              b,
              ids[a] === r.from ? r.fraction : 1 - r.fraction,
              r.position,
            ),
          );
        return mids.get(k);
      },
      out = [];
    for (const f of faces) {
      const ms = f.map((a, j) => mid(a, f[(j + 1) % 3])),
        n = ms.filter((m) => m !== null).length;
      if (!n) {
        out.push(...f);
        continue;
      }
      if (n === 1) {
        const j = ms.findIndex((m) => m !== null),
          a = f[j],
          b = f[(j + 1) % 3],
          c = f[(j + 2) % 3],
          m = ms[j];
        out.push(a, m, c, m, b, c);
      } else if (n === 2) {
        const j = ms.findIndex(
            (m, i) => m !== null && ms[(i + 1) % 3] !== null,
          ),
          a = f[j],
          b = f[(j + 1) % 3],
          c = f[(j + 2) % 3],
          ab = ms[j],
          bc = ms[(j + 1) % 3];
        out.push(b, bc, ab, a, ab, c, ab, bc, c);
      } else {
        const [a, b, c] = f,
          [ab, bc, ca] = ms;
        out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      }
    }
    g.indices = out;
    if (oldCreases.length)
      g.creases = oldCreases.flatMap(([a, b]) => {
        const m = mids.get(edgeKey(a, b));
        return m === undefined
          ? [[a, b]]
          : [
              [a, m],
              [m, b],
            ];
      });
    return new Map();
  }
  if (command.action === "mergeVertices") {
    const ids = selected("vertex", count);
    if (ids.length < 2) fail("Select at least two vertices to merge");
    const target = command.target ?? ids[0],
      placement = command.placement ?? "target",
      policy = command.attributePolicy ?? "reject";
    if (!ids.includes(target)) fail("Merge target must be a selected vertex");
    if (
      !["target", "center"].includes(placement) ||
      !["reject", "target"].includes(policy)
    )
      fail("Invalid merge placement or attribute policy");
    if (policy === "reject")
      for (const [name, size] of [
        ["uv", 2],
        ["colors", 3],
      ])
        if (g[name])
          for (const id of ids)
            for (let k = 0; k < size; k++)
              if (
                Math.abs(g[name][id * size + k] - g[name][target * size + k]) >
                1e-8
              )
                fail(
                  `Merge would discard ${name}; explicitly choose target attributes`,
                );
    let position = p(target);
    if (placement === "center") {
      const unique = new Map(ids.map((i) => [key(p(i)), p(i)]));
      position = [0, 1, 2].map(
        (a) =>
          [...unique.values()].reduce((sum, p) => sum + p[a], 0) / unique.size,
      );
    }
    const merged = new Set(ids),
      remap = new Map(ids.filter((i) => i !== target).map((i) => [i, target]));
    for (const id of ids) g.positions.splice(id * 3, 3, ...position);
    g.indices = faces.flatMap((f) => {
      const next = f.map((i) => (merged.has(i) ? target : i));
      return new Set(next).size < 3 ? [] : next;
    });
    if (!g.indices.includes(target))
      fail("Merge target would have no surviving surface face");
    assertManifold();
    return remap;
  }
  fail(`Unsupported topology operation: ${command.action}`);
}

export function bevelCorner(g, command, maxVertices = 100000) {
  const fail = (m) => {
      throw new Error(m);
    },
    point = (i) => g.positions.slice(i * 3, i * 3 + 3),
    key = (p) => p.map(Math.fround).join(",");
  const add = (a, b) => a.map((v, i) => v + b[i]),
    sub = (a, b) => a.map((v, i) => v - b[i]),
    mul = (a, s) => a.map((v) => v * s),
    dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0),
    cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ],
    length = (a) => Math.hypot(...a),
    unit = (a) => {
      const l = length(a);
      if (l < 1e-12) fail("Undefined bevel direction");
      return mul(a, 1 / l);
    };
  const count = g.positions.length / 3,
    vertex = command.vertex,
    width = command.width;
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= count)
    fail("Bevel vertex index is out of range");
  if (!Number.isFinite(width) || width <= 1e-8 || width > 100000)
    fail("Bevel width must be a finite positive distance");
  const wids = [],
    wpoints = [],
    wmap = new Map();
  for (let i = 0; i < count; i++) {
    const p = point(i),
      k = key(p);
    if (!wmap.has(k)) {
      wmap.set(k, wpoints.length);
      wpoints.push(p);
    }
    wids.push(wmap.get(k));
  }
  const target = wids[vertex],
    origin = wpoints[target],
    faces = Array.from({ length: g.indices.length / 3 }, (_, i) =>
      g.indices.slice(i * 3, i * 3 + 3),
    );
  const incident = [],
    normals = new Map(),
    links = new Map(),
    radial = new Map();
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i],
      hits = f.filter((v) => wids[v] === target);
    if (!hits.length) continue;
    if (hits.length !== 1) fail("Bevel corner has a collapsed incident face");
    const j = f.findIndex((v) => wids[v] === target),
      a = f[(j + 1) % 3],
      b = f[(j + 2) % 3],
      wa = wids[a],
      wb = wids[b],
      normal = unit(cross(sub(wpoints[wa], origin), sub(wpoints[wb], origin)));
    normals.set(normal.map((v) => Math.round(v * 1e8)).join(","), normal);
    incident.push({ index: i, p: f[j], a, b });
    for (const [u, v] of [
      [wa, wb],
      [wb, wa],
    ]) {
      if (!links.has(u)) links.set(u, new Set());
      if (links.get(u).has(v))
        fail("Bevel corner has duplicate incident faces");
      links.get(u).add(v);
    }
    for (const [u, v] of [
      [target, wa],
      [wb, target],
    ]) {
      const k = u < v ? `${u}:${v}` : `${v}:${u}`,
        entry = radial.get(k) ?? { count: 0, winding: 0 };
      entry.count++;
      entry.winding += u < v ? 1 : -1;
      radial.set(k, entry);
    }
  }
  if (incident.length < 3)
    fail("Select a referenced corner with a closed surface fan");
  for (const e of radial.values())
    if (e.count !== 2 || e.winding !== 0)
      fail("Bevel needs a closed consistently wound corner");
  for (const ns of links.values())
    if (ns.size !== 2) fail("Bevel corner has a nonmanifold surface fan");
  const visited = new Set(),
    pending = [links.keys().next().value];
  while (pending.length) {
    const v = pending.pop();
    if (visited.has(v)) continue;
    visited.add(v);
    for (const n of links.get(v)) pending.push(n);
  }
  if (visited.size !== links.size)
    fail("Bevel corner contains disconnected surface fans");
  const normal = unit([...normals.values()].reduce(add, [0, 0, 0]));
  if ([...normals.values()].some((n) => dot(n, normal) <= 1e-8))
    fail("Select a convex corner for bevel");
  const distances = new Map();
  for (const v of links.keys()) {
    const d = -dot(sub(wpoints[v], origin), normal);
    if (d <= 1e-10)
      fail("Select a strictly convex corner, not a flat or concave vertex");
    distances.set(v, d);
  }
  const maximum = Math.min(...distances.values());
  if (width >= maximum * (1 - 1e-6))
    fail("Bevel width reaches a neighboring vertex; reduce the width");
  const attrs = (i) =>
    Object.fromEntries(
      [
        ["uv", 2],
        ["colors", 3],
      ]
        .filter(([n]) => g[n])
        .map(([n, size]) => [n, g[n].slice(i * size, i * size + size)]),
    );
  const append = (p, at) => {
    if (g.positions.length / 3 >= maxVertices)
      fail("Mesh vertex budget exceeded");
    const i = g.positions.length / 3;
    g.positions.push(...p);
    for (const [n, size] of [
      ["uv", 2],
      ["colors", 3],
    ])
      if (g[n]) {
        if (at[n]?.length !== size) fail(`Missing ${n} for bevel vertex`);
        g[n].push(...at[n]);
      }
    return i;
  };
  const cutIds = new Map(),
    ring = new Map(),
    ringEdges = new Set(),
    ringVertex = new Map();
  const cut = (p, a) => {
    const k = p < a ? `${p}:${a}` : `${a}:${p}`;
    if (cutIds.has(k)) return cutIds.get(k);
    const t = width / distances.get(wids[a]),
      at = {},
      P = add(origin, mul(sub(wpoints[wids[a]], origin), t));
    for (const [n, size] of [
      ["uv", 2],
      ["colors", 3],
    ])
      if (g[n])
        at[n] = Array.from(
          { length: size },
          (_, i) => g[n][p * size + i] * (1 - t) + g[n][a * size + i] * t,
        );
    const id = append(P, at);
    cutIds.set(k, id);
    const physical = key(P);
    if (!ringVertex.has(physical)) ringVertex.set(physical, id);
    return id;
  };
  const replacement = new Map();
  for (const { index, p, a, b } of incident) {
    const ia = cut(p, a),
      ib = cut(p, b),
      ka = key(point(ia)),
      kb = key(point(ib));
    if (ka === kb) fail("Bevel width collapses after Float32 conversion");
    const ek = [ka, kb].sort().join("|");
    if (ringEdges.has(ek)) fail("Bevel creates duplicate cut edges");
    ringEdges.add(ek);
    for (const [u, v] of [
      [ka, kb],
      [kb, ka],
    ]) {
      if (!ring.has(u)) ring.set(u, new Set());
      ring.get(u).add(v);
    }
    replacement.set(index, [ia, a, b, ia, b, ib]);
  }
  for (const ns of ring.values())
    if (ns.size !== 2) fail("Bevel cut does not form a closed loop");
  const ordered = new Set();
  const order = [],
    start = ring.keys().next().value;
  let current = start,
    previous = null;
  do {
    if (ordered.has(current)) fail("Bevel cut loop intersects itself");
    order.push(current);
    ordered.add(current);
    const next = [...ring.get(current)].find((v) => v !== previous);
    previous = current;
    current = next;
  } while (current !== start);
  if (order.length !== ring.size) fail("Bevel cut produces disconnected loops");
  const ringPoints = order.map((k) => point(ringVertex.get(k)));
  let center = mul(ringPoints.reduce(add, [0, 0, 0]), 1 / ringPoints.length);
  center = add(center, mul(normal, dot(sub(origin, center), normal) - width));
  let signedArea = 0;
  for (let i = 0; i < ringPoints.length; i++)
    signedArea += dot(
      cross(
        sub(ringPoints[i], center),
        sub(ringPoints[(i + 1) % ringPoints.length], center),
      ),
      normal,
    );
  if (Math.abs(signedArea) < 1e-16) fail("Bevel cap has zero area");
  if (signedArea < 0) order.reverse();
  const ps = order.map((k) => point(ringVertex.get(k))),
    scale = Math.max(1, ...ps.map((p) => length(sub(p, center))));
  for (let i = 0; i < ps.length; i++) {
    const turn = dot(
      cross(
        sub(ps[(i + 1) % ps.length], ps[i]),
        sub(ps[(i + 2) % ps.length], ps[(i + 1) % ps.length]),
      ),
      normal,
    );
    if (turn < -1e-10 * scale * scale) fail("Bevel cap is not convex");
  }
  const tangent = unit(sub(ps[1], ps[0])),
    bitangent = unit(cross(normal, tangent)),
    uvs = ps.map((p) => [
      dot(sub(p, center), tangent),
      dot(sub(p, center), bitangent),
    ]),
    lo = [0, 1].map((a) => Math.min(...uvs.map((p) => p[a]))),
    hi = [0, 1].map((a) => Math.max(...uvs.map((p) => p[a])));
  if (hi.some((v, a) => v - lo[a] < 1e-12))
    fail("Bevel cap UV frame is degenerate");
  const uv = (p) =>
    [dot(sub(p, center), tangent), dot(sub(p, center), bitangent)].map(
      (v, a) => (v - lo[a]) / (hi[a] - lo[a]),
    );
  const capIds = order.map((k) => {
    const id = ringVertex.get(k),
      at = attrs(id);
    if (g.uv) at.uv = uv(point(id));
    return append(point(id), at);
  });
  const centerAttrs = {};
  if (g.uv) centerAttrs.uv = uv(center);
  if (g.colors)
    centerAttrs.colors = [0, 1, 2].map(
      (a) =>
        capIds.reduce((s, id) => s + g.colors[id * 3 + a], 0) / capIds.length,
    );
  const centerId = append(center, centerAttrs),
    out = faces.flatMap((f, i) => replacement.get(i) ?? f);
  for (let i = 0; i < capIds.length; i++)
    out.push(centerId, capIds[i], capIds[(i + 1) % capIds.length]);
  g.indices = out;
  const remap = new Map();
  for (let i = 0; i < count; i++)
    if (wids[i] === target) {
      remap.set(i, centerId);
      g.positions.splice(i * 3, 3, ...center);
    }
  return remap;
}
