import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { editMeshGeometry, meshTopology } from "../src/mesh-edit.js";
import { bevelEdge } from "../src/mesh-bevel.js";
import { auditMesh } from "../src/mesh-audit.js";
import { validateMeshGeometry } from "../src/mesh-geometry.js";
import { emptyDocument, makeNode, applyCommands } from "../src/document.js";
import { auditMeasurements } from "../src/model-review.js";
import { halfBox, closedBox } from "./fixtures/mesh-study.js";

const edgeOf = (g, a = 1, b = 2) =>
  meshTopology(g).edges.findIndex((e) => e.includes(a) && e.includes(b));
const command = (g, extra = {}) => ({
  action: "bevelEdge",
  selection: { mode: "edge", ids: [edgeOf(g)] },
  width: 0.2,
  segments: 4,
  ...extra,
});
const p = (g, i) => g.positions.slice(i * 3, i * 3 + 3);
function clean(g) {
  validateMeshGeometry(g);
  const report = auditMesh(g);
  for (const k of [
    "boundaryEdges",
    "nonManifoldEdges",
    "windingConflicts",
    "degenerate",
    "normalErrors",
    "inwardNormals",
  ])
    assert.equal(report[k], 0, k);
  assert.equal(report.components, 1);
}

test("rounded edge matches a known circular profile and face-offset width, with closed end faces at every segment count", () => {
  const g = closedBox(),
    before = structuredClone(g);
  let triangles = 0;
  for (const segments of [1, 2, 4, 8, 16]) {
    const result = editMeshGeometry(g, command(g, { segments }));
    clean(result);
    assert.ok(result.indices.length > triangles);
    triangles = result.indices.length;
    assert.equal(result.smooth, true);
    for (const i of [0, 3, 4, 5, 6, 7]) assert.deepEqual(p(result, i), p(g, i));
    const used = [...new Set(result.indices)];
    for (let j = 0; j <= segments; j++) {
      const angle = ((Math.PI / 2) * j) / segments,
        expected = [
          0.8 + 0.2 * Math.cos(angle),
          0,
          0.2 - 0.2 * Math.sin(angle),
        ];
      for (const y of [0, 1])
        assert.ok(
          used.some(
            (i) =>
              Math.hypot(
                ...p(result, i).map((v, k) => v - (k === 1 ? y : expected[k])),
              ) < 2e-6,
          ),
          `arc point ${j}/${segments}, y=${y}`,
        );
    }
    for (const v of result.indices) assert.ok(![1, 2].includes(v));
  }
  assert.deepEqual(g, before);
});

test("all twelve box edges remain closed across narrow/wide and flat/rounded bevels", () => {
  const source = closedBox();
  const edges = meshTopology(source).edges;
  let checks = 0;
  for (const [id, [a, b]] of edges.entries()) {
    // Exclude the coplanar diagonals introduced by triangulating each face.
    if ([0, 1, 2].filter(k => p(source, a)[k] !== p(source, b)[k]).length !== 1)
      continue;
    for (const width of [0.02, 0.15, 0.4]) {
      for (const segments of [1, 4, 16]) {
        clean(editMeshGeometry(source, {
          action: "bevelEdge", selection: { mode: "edge", ids: [id] },
          width, segments,
        }));
        checks++;
      }
    }
  }
  assert.equal(checks, 108);
});

test("multi-segment band has analytic radial normals, while one segment is a flat chamfer", () => {
  const g = closedBox(),
    rounded = editMeshGeometry(g, command(g, { segments: 8 }));
  const expected = [Math.SQRT1_2, 0, -Math.SQRT1_2],
    q = [0.8 + 0.2 * Math.SQRT1_2, 0, 0.2 - 0.2 * Math.SQRT1_2];
  const hits = rounded.indices.filter(
    (i) => Math.hypot(...p(rounded, i).map((x, a) => x - q[a])) < 2e-6,
  );
  assert.ok(
    hits.some(
      (i) =>
        rounded.normals
          .slice(i * 3, i * 3 + 3)
          .reduce((s, x, a) => s + x * expected[a], 0) >
        1 - 1e-6,
    ),
  );
  const flat = editMeshGeometry(g, command(g, { segments: 1 }));
  let bandTriangles = 0;
  for (let t = 0; t < flat.indices.length; t += 3) {
    const f = flat.indices.slice(t, t + 3),
      [a, b, c] = f.map((i) => new Vector3(...p(flat, i))),
      n = b.sub(a).cross(c.sub(a)).normalize();
    if (n.dot(new Vector3(...expected)) < 1 - 1e-5) continue;
    bandTriangles++;
    for (const i of f)
      assert.ok(
        new Vector3(...flat.normals.slice(i * 3, i * 3 + 3)).dot(n) > 1 - 1e-6,
      );
  }
  assert.ok(bandTriangles > 0);
});

test("non-right dihedral edge uses the same face-offset metric and remains outward and closed", () => {
  const g = {
    positions: [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1],
    indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
  };
  const c = {
    ...command(g),
    selection: { mode: "edge", ids: [edgeOf(g, 0, 2)] },
    width: 0.1,
  };
  const result = editMeshGeometry(g, c);
  clean(result);
  const n1 = new Vector3(-1, 1, 1).normalize(),
    n2 = new Vector3(1, 1, -1).normalize(),
    theta = Math.acos(n1.dot(n2)),
    radius = 0.1 / Math.tan(theta / 2);
  assert.ok(Math.abs(radius - 0.1 / Math.SQRT2) < 1e-12);
  const origin = new Vector3(...p(g, 0)),
    axis = new Vector3(...p(g, 2)).sub(origin).normalize(),
    center = n1
      .clone()
      .add(n2)
      .normalize()
      .multiplyScalar(-radius / Math.cos(theta / 2));
  const tangent = n2.clone().addScaledVector(n1, -n1.dot(n2)).normalize();
  for (let j = 0; j <= 4; j++) {
    const alpha = (theta * j) / 4,
      expected = center
        .clone()
        .addScaledVector(n1, radius * Math.cos(alpha))
        .addScaledVector(tangent, radius * Math.sin(alpha));
    assert.ok(
      result.indices.some((i) => {
        const q = new Vector3(...p(result, i)).sub(origin);
        q.addScaledVector(axis, -q.dot(axis));
        return q.distanceTo(expected) < 3e-6;
      }),
    );
  }
});

test("UV and color seams remain separate and smooth source normals survive outside the new band", () => {
  const box = closedBox(),
    g = {
      positions: box.indices.flatMap((i) => p(box, i)),
      uv: [],
      colors: [],
      smooth: true,
      normals: [],
    };
  for (let i = 0; i < g.positions.length / 3; i++) {
    g.uv.push(Math.floor(i / 3), (i % 3) / 2);
    g.colors.push((i % 3) / 2, 0.25, 0.5);
    // Supplied normals are deliberately custom but outward on every original face.
    const fi = Math.floor(i / 3),
      a = new Vector3(...p(box, box.indices[fi * 3])),
      b = new Vector3(...p(box, box.indices[fi * 3 + 1])),
      c = new Vector3(...p(box, box.indices[fi * 3 + 2]));
    g.normals.push(...b.sub(a).cross(c.sub(a)).normalize().toArray());
  }
  const edges = meshTopology(g).edges,
    selected = edges.flatMap(([a, b], i) =>
      p(g, a)[0] === 1 &&
      p(g, b)[0] === 1 &&
      p(g, a)[2] === 0 &&
      p(g, b)[2] === 0
        ? [i]
        : [],
    );
  assert.equal(selected.length, 2);
  const result = editMeshGeometry(g, {
    ...command(g),
    selection: { mode: "edge", ids: selected },
  });
  clean(result);
  assert.deepEqual(result.uv.slice(0, g.uv.length), g.uv);
  assert.deepEqual(result.colors.slice(0, g.colors.length), g.colors);
  assert.equal(result.uv.length, (result.positions.length / 3) * 2);
  assert.equal(result.colors.length, result.positions.length);
  const cube = closedBox();
  cube.smooth = true;
  cube.normals = Array.from({ length: 8 }, (_, i) =>
    new Vector3(...p(cube, i).map((x) => x - 0.5)).normalize().toArray(),
  ).flat();
  const custom = editMeshGeometry(cube, command(cube));
  assert.deepEqual(custom.normals.slice(0, 3), cube.normals.slice(0, 3));
  const first = editMeshGeometry(closedBox(), command(closedBox()));
  const second = editMeshGeometry(first, {
    ...command(first),
    selection: { mode: "edge", ids: [edgeOf(first, 4, 7)] },
    width: 0.1,
  });
  clean(second);
  for (const i of new Set(first.indices)) {
    const P = p(first, i);
    if (P[0] > 0.75 && P[2] < 0.25)
      assert.ok(
        Math.hypot(
          ...second.normals
            .slice(i * 3, i * 3 + 3)
            .map((x, k) => x - first.normals[i * 3 + k]),
        ) < 1e-8,
      );
  }
});

test("invalid widths, selection, open/nonconvex solids and creases fail atomically; budget checks run before publishing IDs", () => {
  const g = closedBox(),
    before = structuredClone(g);
  const invalid = [
    { width: 0 },
    { width: 1 },
    { width: 1e-10 },
    { width: NaN },
    { segments: 0 },
    { segments: 17 },
    { segments: 1.5 },
    { selection: { mode: "face", ids: [0] } },
    { selection: { mode: "edge", ids: [0, 1] } },
    { selection: { mode: "edge", ids: [edgeOf(g, 0, 2)] } },
  ];
  for (const extra of invalid)
    assert.throws(() => editMeshGeometry(g, command(g, extra)));
  assert.deepEqual(g, before);
  assert.throws(
    () => editMeshGeometry(halfBox(), command(halfBox())),
    /closed mesh/,
  );
  const concave = closedBox();
  concave.positions.splice(18, 3, 0.2, 0.2, 0.2);
  assert.throws(
    () => editMeshGeometry(concave, command(concave)),
    /convex solid/,
  );
  assert.throws(
    () => editMeshGeometry({ ...g, creases: [[1, 2]] }, command(g)),
    /clear crease/,
  );
  assert.throws(
    () => bevelEdge(structuredClone(g), command(g), 8),
    /vertex budget/,
  );
  let published = false;
  assert.throws(() =>
    editMeshGeometry(g, command(g, { width: 5 }), {
      onRemap: () => (published = true),
    }),
  );
  assert.equal(published, false);
});

test("endpoint landmarks require explicit remapping and follow visible referenced vertices in atomic document commands", () => {
  const g = closedBox(),
    d = emptyDocument();
  d.nodes = [
    makeNode("mesh", { id: "study", position: [0, 0, 0], geometry: g }),
  ];
  d.review = {
    version: 1,
    landmarks: {
      tip: { node: "study", vertex: 1 },
      fixed: { node: "study", vertex: 6 },
    },
    measurements: [],
    symmetry: [],
  };
  const before = structuredClone(d),
    cmd = { ...command(g), op: "meshEdit", id: "study" };
  assert.throws(() => applyCommands(d, [cmd]), /landmark/);
  assert.deepEqual(d, before);
  const result = applyCommands(d, [{ ...cmd, landmarkPolicy: "remap" }]),
    n = result.nodes[0],
    anchor = result.review.landmarks.tip;
  assert.ok(anchor.vertex >= 8);
  assert.ok(n.geometry.indices.includes(anchor.vertex));
  assert.equal(result.review.landmarks.fixed.vertex, 6);
  assert.deepEqual(
    auditMeasurements(result).landmarks.find((l) => l.id === "tip").point,
    p(n.geometry, anchor.vertex),
  );
  assert.notDeepEqual(p(n.geometry, anchor.vertex), p(g, 1));
});
