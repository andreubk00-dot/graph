import { validateMeshGeometry, MAX_MESH_VERTICES } from "./mesh-geometry.js";
import { edgeKey, positionKey } from "./mesh-creases.js";

const add = (a, b) => a.map((v, i) => v + b[i]),
  sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s),
  dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const fail = (m) => {
  throw new Error(`Edge bevel: ${m}`);
};
const unit = (a) => {
  const l = Math.hypot(...a);
  if (l < 1e-12) fail("undefined direction");
  return mul(a, 1 / l);
};
const point = (g, i) => g.positions.slice(i * 3, i * 3 + 3).map(Math.fround);

function closedSurface(g) {
  const physical = new Map(),
    ids = new Map(),
    points = [],
    faces = [],
    normals = [],
    edges = new Map(),
    seen = new Set();
  for (const i of new Set(g.indices)) {
    const k = positionKey(g, i);
    if (!physical.has(k)) {
      physical.set(k, points.length);
      points.push(point(g, i));
    }
    ids.set(i, physical.get(k));
  }
  for (let t = 0; t < g.indices.length; t += 3) {
    const f = g.indices.slice(t, t + 3).map((i) => ids.get(i)),
      fi = faces.length;
    const k = [...f].sort((a, b) => a - b).join(":");
    if (seen.has(k)) fail("duplicate coincident triangles");
    seen.add(k);
    faces.push(f);
    normals.push(
      unit(
        cross(sub(points[f[1]], points[f[0]]), sub(points[f[2]], points[f[0]])),
      ),
    );
    for (let j = 0; j < 3; j++) {
      const a = f[j],
        b = f[(j + 1) % 3],
        ek = edgeKey(a, b),
        e = edges.get(ek);
      if (!e) edges.set(ek, { a, b, faces: [fi] });
      else {
        if (e.faces.length !== 1 || e.a !== b || e.b !== a)
          fail("requires consistently wound manifold edges");
        e.faces.push(fi);
      }
    }
  }
  const adjacent = faces.map(() => []);
  for (const e of edges.values()) {
    if (e.faces.length !== 2)
      fail(
        "requires a closed mesh; bake the mirror or close open boundaries first",
      );
    const [a, b] = e.faces;
    adjacent[a].push(b);
    adjacent[b].push(a);
  }
  const visited = new Set(),
    pending = [0];
  while (pending.length) {
    const f = pending.pop();
    if (visited.has(f)) continue;
    visited.add(f);
    pending.push(...adjacent[f].filter((i) => !visited.has(i)));
  }
  if (visited.size !== faces.length)
    fail("requires one connected closed surface");
  return { ids, points, faces, normals, edges };
}

// First rounded-edge tool: one convex physical edge on a bounded convex solid.
// Intersect the solid with chord planes of a circular fillet. Existing end faces
// close the strip naturally, without guessed end-cap patches or intersecting miters.
export function bevelEdge(g, command, maxVertices = MAX_MESH_VERTICES) {
  const count = g.positions.length / 3,
    width = command.width,
    segments = command.segments ?? 4;
  if (!Number.isFinite(width) || width <= 0 || width > 100000)
    fail("width must be a finite positive face offset");
  if (!Number.isInteger(segments) || segments < 1 || segments > 16)
    fail("segments must be an integer from 1 to 16");
  if (g.creases?.length)
    fail(
      "clear crease tags before rounded beveling; routing them is not supported yet",
    );
  const selected = command.selection;
  if (
    selected?.mode !== "edge" ||
    !Array.isArray(selected.ids) ||
    !selected.ids.length
  )
    fail("select one edge");
  const canonicalEdges = new Map();
  for (let t = 0; t < g.indices.length; t += 3)
    for (let j = 0; j < 3; j++) {
      const a = g.indices[t + j],
        b = g.indices[t + ((j + 1) % 3)];
      canonicalEdges.set(edgeKey(a, b), a < b ? [a, b] : [b, a]);
    }
  const list = [...canonicalEdges.values()];
  if (
    selected.ids.some((i) => !Number.isInteger(i) || i < 0 || i >= list.length)
  )
    fail("edge selection is out of range");
  if (g.indices.length / 3 > 2048)
    fail("initial tool supports at most 2048 source triangles");
  const topology = closedSurface(g),
    { ids, points, faces, normals, edges } = topology;
  if (points.length > 512)
    fail("initial tool supports at most 512 physical source vertices");
  const selectedKeys = new Set(
    selected.ids.map((i) => edgeKey(...list[i].map((v) => ids.get(v)))),
  );
  if (selectedKeys.size !== 1)
    fail(
      "select one physical edge; adjacent-edge miters are not supported yet",
    );
  const target = edges.get([...selectedKeys][0]),
    [a, b] = [target.a, target.b],
    origin = points[a],
    axis = unit(sub(points[b], origin));
  const edgeLength = Math.hypot(...sub(points[b], origin)),
    n1 = normals[target.faces[0]],
    n2 = normals[target.faces[1]];
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(n1, n2))));
  if (theta < 1e-4 || theta > Math.PI - 1e-4)
    fail("select a convex geometric edge, not a coplanar triangle diagonal");
  const scale = Math.max(
    1,
    ...points.map((p) => Math.hypot(...sub(p, origin))),
  );
  const magnitude = Math.max(1, ...points.flatMap((p) => p.map(Math.abs))),
    eps = Math.max(scale * 2e-7, magnitude * 1e-7);
  if (width < eps * 8)
    fail("width is too small for Float32 precision at these coordinates");
  for (let i = 0; i < faces.length; i++)
    for (const p of points)
      if (dot(sub(p, points[faces[i][0]]), normals[i]) > eps * 4)
        fail(
          "requires an outward-wound convex solid; concave meshes need a broader bevel tool",
        );
  const radius = width / Math.tan(theta / 2),
    bisector = unit(add(n1, n2)),
    center = mul(bisector, -radius / Math.cos(theta / 2));
  const arcTangent = unit(sub(n2, mul(n1, dot(n1, n2)))),
    uvDirection = unit(sub(n2, n1));
  const arcNormal = (t) =>
    add(mul(n1, Math.cos(t)), mul(arcTangent, Math.sin(t)));
  const planes = Array.from({ length: segments }, (_, i) => {
    const n = arcNormal((theta * (i + 0.5)) / segments);
    return { n, h: dot(center, n) + radius * Math.cos(theta / segments / 2) };
  });
  for (let i = 0; i < points.length; i++)
    if (i !== a && i !== b)
      for (const plane of planes)
        if (dot(sub(points[i], origin), plane.n) > plane.h - eps * 4)
          fail("width reaches another source vertex; reduce the width");

  const sourceNormals =
    g.smooth !== false && g.normals
      ? Array.from({ length: count }, (_, i) =>
          g.normals.slice(i * 3, i * 3 + 3),
        )
      : null;
  const append = (P, attrs) => {
    if (g.positions.length / 3 >= maxVertices)
      fail("mesh vertex budget exceeded");
    const i = g.positions.length / 3;
    g.positions.push(...P.map(Math.fround));
    for (const [name, size] of [
      ["uv", 2],
      ["colors", 3],
    ])
      if (g[name]) {
        if (attrs[name]?.length !== size) fail(`missing ${name} attribute`);
        g[name].push(...attrs[name]);
      }
    if (sourceNormals) sourceNormals.push(attrs.normal ?? [0, 1, 0]);
    return i;
  };
  const attrs = (i) => ({
    ...Object.fromEntries(
      [
        ["uv", 2],
        ["colors", 3],
      ]
        .filter(([k]) => g[k])
        .map(([k, s]) => [k, g[k].slice(i * s, i * s + s)]),
    ),
    ...(sourceNormals ? { normal: sourceNormals[i] } : {}),
  });
  const average = (vs) => {
    const at = Object.fromEntries(
      [
        ["uv", 2],
        ["colors", 3],
      ]
        .filter(([k]) => g[k])
        .map(([k, s]) => [
          k,
          Array.from(
            { length: s },
            (_, c) =>
              vs.reduce((sum, i) => sum + g[k][i * s + c], 0) / vs.length,
          ),
        ]),
    );
    if (sourceNormals)
      at.normal = unit(vs.map((i) => sourceNormals[i]).reduce(add, [0, 0, 0]));
    return at;
  };
  let polygons = faces.map((_, i) => ({
    vertices: g.indices.slice(i * 3, i * 3 + 3),
    normal: normals[i],
    band: false,
  }));
  for (const plane of planes) {
    const distance = (i) => dot(sub(point(g, i), origin), plane.n) - plane.h;
    const cuts = new Map(),
      physicalCuts = new Map(),
      ring = new Map(),
      next = [];
    let clipped = false;
    function cut(a, b, da, db) {
      if (Math.abs(da) <= eps) return a;
      if (Math.abs(db) <= eps) return b;
      const k = edgeKey(a, b);
      if (cuts.has(k)) return cuts.get(k);
      const t = da / (da - db),
        physical = [positionKey(g, a), positionKey(g, b)].sort().join("|");
      if (!physicalCuts.has(physical))
        physicalCuts.set(
          physical,
          add(point(g, a), mul(sub(point(g, b), point(g, a)), t)),
        );
      const at = {};
      for (const [name, size] of [
        ["uv", 2],
        ["colors", 3],
      ])
        if (g[name])
          at[name] = Array.from(
            { length: size },
            (_, j) =>
              g[name][a * size + j] * (1 - t) + g[name][b * size + j] * t,
          );
      if (sourceNormals)
        at.normal = unit(
          add(mul(sourceNormals[a], 1 - t), mul(sourceNormals[b], t)),
        );
      const id = append(physicalCuts.get(physical), at);
      cuts.set(k, id);
      return id;
    }
    for (const polygon of polygons) {
      const vs = polygon.vertices,
        out = [];
      for (let j = 0; j < vs.length; j++) {
        const a = vs[j],
          b = vs[(j + 1) % vs.length],
          da = distance(a),
          db = distance(b),
          inside = da <= eps,
          other = db <= eps;
        if (inside) out.push(a);
        else clipped = true;
        if (inside !== other) out.push(cut(a, b, da, db));
      }
      const clean = out.filter(
        (v, j) =>
          positionKey(g, v) !==
          positionKey(g, out[(j + out.length - 1) % out.length]),
      );
      if (clean.length < 3) continue;
      for (const i of clean)
        if (Math.abs(distance(i)) <= eps * 4) {
          const k = positionKey(g, i);
          if (!ring.has(k)) ring.set(k, []);
          ring.get(k).push(i);
        }
      next.push({ ...polygon, vertices: clean });
    }
    if (!clipped || ring.size < 3)
      fail("cut collapsed at this width or precision");
    const samples = [...ring.values()].map((vs) => vs[0]),
      c = mul(
        samples.map((i) => point(g, i)).reduce(add, [0, 0, 0]),
        1 / samples.length,
      );
    const helper = Math.abs(plane.n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0],
      u = unit(cross(helper, plane.n)),
      v = cross(plane.n, u);
    const ordered = [...ring.keys()].sort((ka, kb) => {
      const pa = sub(point(g, ring.get(ka)[0]), c),
        pb = sub(point(g, ring.get(kb)[0]), c);
      return (
        Math.atan2(dot(pa, v), dot(pa, u)) - Math.atan2(dot(pb, v), dot(pb, u))
      );
    });
    const cap = ordered.map((k) => {
      const vs = ring.get(k),
        P = point(g, vs[0]),
        at = average(vs);
      if (g.uv)
        at.uv = [
          dot(sub(P, origin), axis) / edgeLength,
          0.5 +
            dot(sub(sub(P, origin), center), uvDirection) /
              (2 * radius * Math.sin(theta / 2)),
        ];
      return append(P, at);
    });
    next.push({ vertices: cap, normal: plane.n, band: true });
    polygons = next;
  }
  const triangles = [];
  for (const polygon of polygons) {
    const vs = polygon.vertices;
    if (vs.length === 3) triangles.push({ ...polygon, vertices: vs });
    else {
      const center = mul(
          vs.map((i) => point(g, i)).reduce(add, [0, 0, 0]),
          1 / vs.length,
        ),
        id = append(center, average(vs));
      for (let i = 0; i < vs.length; i++)
        triangles.push({
          ...polygon,
          vertices: [id, vs[i], vs[(i + 1) % vs.length]],
        });
    }
    if (triangles.length > 100000) fail("mesh triangle budget exceeded");
  }
  // Bake planar source normals and analytic cylindrical band normals into
  // separate canonical attribute slots. No global smooth/flat shading compromise.
  const beforeShading = g.positions.length / 3,
    assignments = new Map();
  g.normals = Array.from({ length: beforeShading }, () => [0, 1, 0]).flat();
  g.indices = [];
  g.smooth = true;
  delete g.creases;
  for (const triangle of triangles)
    for (const old of triangle.vertices) {
      const region = triangle.band
        ? "band"
        : sourceNormals
          ? "source"
          : triangle.normal.map((x) => Math.round(x * 1e8)).join(":");
      if (!assignments.has(old)) assignments.set(old, new Map());
      const groups = assignments.get(old);
      if (!groups.has(region)) {
        const P = point(g, old),
          delta = sub(sub(P, origin), center);
        const normal = triangle.band
          ? segments > 1
            ? unit(sub(delta, mul(axis, dot(delta, axis))))
            : triangle.normal
          : sourceNormals
            ? unit(sourceNormals[old])
            : triangle.normal;
        const id = groups.size ? append(P, attrs(old)) : old;
        if (id >= beforeShading) g.normals.push(...normal);
        else g.normals.splice(id * 3, 3, ...normal);
        groups.set(region, id);
      }
      g.indices.push(groups.get(region));
    }
  // Intermediate clipping slots have never been published. Compact those only;
  // retain every original slot so external source vertex IDs remain stable.
  const referenced = new Set(g.indices),
    keep = Array.from({ length: g.positions.length / 3 }, (_, i) => i).filter(
      (i) => i < count || referenced.has(i),
    );
  const compact = new Map(keep.map((id, i) => [id, i]));
  for (const [name, size] of [
    ["positions", 3],
    ["normals", 3],
    ["uv", 2],
    ["colors", 3],
  ])
    if (g[name]) {
      const old = g[name];
      g[name] = keep.flatMap((i) => old.slice(i * size, i * size + size));
    }
  g.indices = g.indices.map((i) => compact.get(i));
  validateMeshGeometry(g);
  closedSurface(g);
  const used = [...new Set(g.indices)],
    remap = new Map();
  for (let i = 0; i < count; i++)
    if (ids.get(i) === a || ids.get(i) === b) {
      const P = point(g, i);
      let best = null,
        distance = Infinity;
      for (const j of used) {
        const d = dot(sub(point(g, j), P), sub(point(g, j), P));
        if (d < distance) {
          best = j;
          distance = d;
        }
      }
      remap.set(i, best);
      g.positions.splice(i * 3, 3, ...point(g, best));
    }
  validateMeshGeometry(g);
  return remap;
}
