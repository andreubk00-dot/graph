import { positionKey, physicalCreases, physicalEdgeKey } from "./mesh-creases.js";

// Remove one interior planar fan, retaining canonical slots and affine attributes.
// Convex rings only: this is not arbitrary mesh decimation or polygon authoring.
export function dissolveVertex(g, command) {
  const fail = (message) => { throw new Error(`Dissolve: ${message}`); };
  if (g.smooth !== false && g.creases?.length)
    fail("clear crease tags before dissolving a smooth mesh; fan normals are topology-dependent");
  const s = command.selection;
  if (s?.mode !== "vertex" || !Array.isArray(s.ids) || s.ids.length !== 1)
    fail("select one interior vertex");
  const vertex = s.ids[0];
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= g.positions.length / 3)
    fail("vertex index is out of range");
  const p = (i) => g.positions.slice(i * 3, i * 3 + 3).map(Math.fround);
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const origin = p(vertex), faces = [], incident = [], next = new Map();
  for (let t = 0; t < g.indices.length; t += 3) {
    const f = g.indices.slice(t, t + 3);
    faces.push(f);
    const j = f.indexOf(vertex);
    if (j < 0) continue;
    const a = f[(j + 1) % 3], b = f[(j + 2) % 3];
    if (new Set(f).size !== 3 || next.has(a)) fail("requires one consistently wound manifold fan");
    next.set(a, b);
    incident.push(faces.length - 1);
  }
  if (incident.length < 3 || incident.length > 64)
    fail("requires 3–64 incident triangles around an interior vertex");
  const ring = [], start = next.keys().next().value;
  let current = start;
  do {
    if (!next.has(current) || ring.includes(current)) fail("open or disconnected vertex fan");
    ring.push(current);
    current = next.get(current);
  } while (current !== start);
  if (ring.length !== incident.length) fail("disconnected vertex fan");

  // A seam requires explicit chart processing; do not silently merge attributes.
  const patch = new Set([vertex, ...ring]);
  const slots = new Map();
  for (const i of new Set(g.indices)) {
    const key = positionKey(g, i);
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key).push(i);
  }
  for (const i of patch)
    if (slots.get(positionKey(g, i)).length !== 1)
      fail("attribute seams in the patch require explicit chart processing");
  const creases = physicalCreases(g);
  if (ring.some(i => creases.has(physicalEdgeKey(g, vertex, i))))
    fail("clear creases touching the dissolved vertex first");

  const offsets = ring.map(i => sub(p(i), origin));
  const scale = Math.max(...offsets.map(v => Math.hypot(...v)));
  const magnitude = Math.max(1, ...[origin, ...ring.map(p)].flat().map(Math.abs));
  const eps = Math.max(scale * 1e-6, magnitude * 2e-7);
  const raw = cross(offsets[0], offsets[1]), length = Math.hypot(...raw);
  if (length <= eps * scale) fail("degenerate fan");
  const normal = raw.map(v => v / length);
  if (offsets.some(v => Math.abs(dot(v, normal)) > eps)) fail("patch is not planar");
  const uLength = Math.hypot(...offsets[0]);
  const u = offsets[0].map(v => v / uLength), v = cross(normal, u);
  const xy = offsets.map(q => [dot(q, u), dot(q, v)]);
  const turn = (a, b, c) => (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
  for (let i = 0; i < ring.length; i++) {
    const a = xy[i], b = xy[(i + 1) % ring.length];
    if (a[0]*b[1]-a[1]*b[0] <= eps * scale)
      fail("requires outward winding and a strictly interior vertex");
    // Every other boundary vertex must lie strictly inside each oriented edge.
    // This also excludes self-crossing rings, not just local concavity.
    for (let j = 0; j < ring.length; j++) {
      if (j === i || j === (i + 1) % ring.length) continue;
      if (turn(a, b, xy[j]) <= eps * scale) fail("requires a strictly convex boundary");
    }
  }

  // One affine field across the entire patch guarantees interpolation survives
  // retriangulation. A center-only average check would miss changes elsewhere.
  for (const [name, size] of [["uv", 2], ["colors", 3], ["normals", 3]]) {
    if (!g[name]) continue;
    for (let k = 0; k < size; k++) {
      const value = i => g[name][i * size + k];
      const base = value(vertex);
      const dx = (value(ring[0]) - base) / xy[0][0];
      const dy = (value(ring[1]) - base - dx * xy[1][0]) / xy[1][1];
      const tolerance = 2e-6 * Math.max(1, ...[vertex, ...ring].map(i => Math.abs(value(i))));
      if (ring.some((id, j) => Math.abs(value(id) - base - dx*xy[j][0] - dy*xy[j][1]) > tolerance))
        fail(`${name} is not affine across the patch; dissolve would change shading`);
    }
  }
  const removed = new Set(incident), outside = faces.filter((_, i) => !removed.has(i));
  const outsideEdges = new Map();
  for (const f of outside) for (let j = 0; j < 3; j++) {
    const a = f[j], b = f[(j + 1) % 3], key = physicalEdgeKey(g, a, b);
    if (!outsideEdges.has(key)) outsideEdges.set(key, []);
    outsideEdges.get(key).push([a, b]);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const adjacent = outsideEdges.get(physicalEdgeKey(g, a, b)) ?? [];
    if (adjacent.length > 1 || adjacent.some(([x, y]) => x !== b || y !== a))
      fail("nonmanifold or inconsistently wound patch boundary");
  }
  const replacement = [];
  for (let i = 1; i < ring.length - 1; i++) {
    if (i > 1 && outsideEdges.has(physicalEdgeKey(g, ring[0], ring[i])))
      fail("replacement diagonal already exists outside the patch");
    replacement.push([ring[0], ring[i], ring[i + 1]]);
  }
  const seen = new Set();
  for (const f of [...outside, ...replacement]) {
    const key = [...f].sort((a, b) => a - b).join(":");
    if (seen.has(key)) fail("replacement would duplicate a face");
    seen.add(key);
  }
  // Boundary crease IDs remain intact; only untagged spokes disappear.
  const first = incident[0], indices = [];
  for (let i = 0; i < faces.length; i++) {
    if (i === first) indices.push(...replacement.flat());
    if (!removed.has(i)) indices.push(...faces[i]);
  }
  g.indices = indices;
  const target = [...ring].sort((a, b) => {
    const da = dot(sub(p(a), origin), sub(p(a), origin));
    const db = dot(sub(p(b), origin), sub(p(b), origin));
    return da - db || a - b;
  })[0];
  return new Map([[vertex, target]]);
}
