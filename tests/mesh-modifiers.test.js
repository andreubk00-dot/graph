import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyDocument,
  makeNode,
  applyCommands,
  validateDocument,
} from "../src/document.js";
import { evaluateMeshGeometry } from "../src/mesh-modifiers.js";
import { geometryFor } from "../src/scene.js";
import { auditMesh } from "../src/mesh-audit.js";
import { auditMeasurements } from "../src/model-review.js";
import { halfBox, closedBox } from "./fixtures/mesh-study.js";
const mirror = { type: "mirror", axis: "x", side: "positive" };
function source(g = halfBox()) {
  const d = emptyDocument();
  d.nodes = [
    makeNode("mesh", { id: "study", position: [0, 0, 0], geometry: g }),
  ];
  return d;
}
const set = (d, modifiers = [mirror]) =>
  applyCommands(d, [{ op: "setModifiers", id: "study", modifiers }]);

test("live mirror preserves canonical geometry and attributes while evaluating a closed outward surface", () => {
  const d = source(),
    g = d.nodes[0].geometry;
  g.uv = g.positions.flatMap((_, i) => (i % 3 ? [] : [i / 24, 0.5]));
  g.colors = g.positions.map((_, i) => (i % 3 === 0 ? 1 : 0.2));
  const before = structuredClone(d),
    live = set(d),
    n = live.nodes[0];
  assert.deepEqual(d, before);
  assert.deepEqual(n.geometry, g);
  const evaluated = evaluateMeshGeometry(n),
    r = auditMesh(evaluated);
  assert.equal(evaluated.positions.length, 36);
  assert.equal(evaluated.indices.length, 60);
  assert.deepEqual(evaluated.positions.slice(0, 24), g.positions);
  assert.deepEqual(evaluated.uv.slice(16, 18), g.uv.slice(2, 4));
  assert.deepEqual(evaluated.colors.slice(24, 27), g.colors.slice(3, 6));
  for (const k of [
    "boundaryEdges",
    "nonManifoldEdges",
    "windingConflicts",
    "degenerate",
    "normalErrors",
    "inwardNormals",
  ])
    assert.equal(r[k], 0, k);
  const buffer = geometryFor(n);
  assert.deepEqual(
    Array.from(buffer.attributes.position.array),
    evaluated.positions,
  );
  buffer.dispose();
  assert.deepEqual(n.geometry, g);
});

test("live source edits propagate, invalid cross-plane edits fail atomically, disable and bake preserve meaning", () => {
  const live = set(source()),
    before = structuredClone(live);
  const moved = applyCommands(live, [
    {
      op: "meshEdit",
      id: "study",
      action: "setVertex",
      vertex: 6,
      position: [1.2, 1.1, 1],
    },
  ]);
  assert.deepEqual(live, before);
  const e = evaluateMeshGeometry(moved.nodes[0]);
  assert.deepEqual(e.positions.slice(33, 36), [-1.2, 1.1, 1]);
  assert.throws(
    () =>
      applyCommands(moved, [
        {
          op: "meshEdit",
          id: "study",
          action: "setVertex",
          vertex: 6,
          position: [-0.2, 1.1, 1],
        },
      ]),
    /one half/,
  );
  const disabled = set(moved, [{ ...mirror, enabled: false }]);
  assert.equal(
    evaluateMeshGeometry(disabled.nodes[0]),
    disabled.nodes[0].geometry,
  );
  const removed = set(moved, []);
  assert.equal(removed.nodes[0].modifiers, undefined);
  const baked = applyCommands(moved, [{ op: "bakeModifiers", id: "study" }]);
  assert.deepEqual(baked.nodes[0].geometry, e);
  assert.equal(baked.nodes[0].modifiers, undefined);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(moved))), moved);
  const disabledBake = applyCommands(disabled, [
    { op: "bakeModifiers", id: "study" },
  ]);
  assert.deepEqual(disabledBake.nodes[0].geometry, disabled.nodes[0].geometry);
});

test("mirror metadata is strict even when disabled; seam caps and skin binding reject", () => {
  for (const modifiers of [
    null,
    {},
    [mirror, mirror],
    [{ type: "remesh" }],
    [{ ...mirror, enabled: 0 }],
    [{ ...mirror, axis: "w", enabled: false }],
    [{ ...mirror, tolerance: -1 }],
    [{ ...mirror, offset: Infinity }],
    [{ ...mirror, bisect: true }],
  ])
    assert.throws(() => set(source(), modifiers));
  assert.throws(() => set(source(closedBox())), /mirror plane/);
  const d = set(source());
  assert.throws(
    () => applyCommands(d, [{ op: "bindSkin", id: "study", joints: [] }]),
    /Bake or remove/,
  );
  const bad = structuredClone(d);
  bad.nodes[0].skin = {};
  assert.throws(() => validateDocument(bad), /Bake or remove/);
  const primitive = emptyDocument();
  primitive.nodes = [makeNode("box", { id: "study", modifiers: [mirror] })];
  assert.throws(() => validateDocument(primitive), /mesh supports/);
});

test("evaluation preserves source landmark IDs, snaps only the evaluated seam and duplication retains modifiers", () => {
  const d = source();
  d.nodes[0].geometry.positions[0] = 0.000001;
  d.review = {
    version: 1,
    landmarks: {
      tip: { node: "study", vertex: 6 },
      seam: { node: "study", vertex: 0 },
    },
    measurements: [],
    symmetry: [],
  };
  const live = set(d),
    report = auditMeasurements(live);
  assert.equal(live.nodes[0].geometry.positions[0], 0.000001);
  assert.equal(report.landmarks.find((l) => l.id === "seam").point[0], 0);
  assert.deepEqual(
    report.landmarks.find((l) => l.id === "tip").point,
    [1, 1, 1],
  );
  const baked = applyCommands(live, [{ op: "bakeModifiers", id: "study" }]);
  assert.deepEqual(baked.review, live.review);
  assert.deepEqual(auditMeasurements(baked).landmarks, report.landmarks);
  const duplicated = applyCommands(live, [{ op: "duplicate", ids: ["study"] }]);
  assert.deepEqual(duplicated.nodes[1].modifiers, live.nodes[0].modifiers);
});

test("evaluated mesh and scene budgets cannot be bypassed using small source halves", () => {
  const d = source({
    positions: [1, 0, 0, 1, 1, 0, 1, 0, 1],
    indices: Array.from({ length: 180000 }, (_, i) => i % 3),
  });
  assert.throws(() => set(d), /triangle indices/);
  const g = {
    positions: Array.from({ length: 20000 }, () => [
      1, 0, 0, 1, 1, 0, 1, 0, 1,
    ]).flat(),
    indices: Array.from({ length: 60000 }, (_, i) => i),
  };
  assert.throws(() => set(source(g)), /vertex budget/);
  const many = source();
  const triangle = {
    positions: [1, 0, 0, 1, 1, 0, 1, 0, 1],
    indices: Array.from({ length: 150000 }, (_, i) => i % 3),
  };
  many.nodes = [0, 1, 2].map((i) =>
    makeNode("mesh", { id: `m${i}`, geometry: triangle, modifiers: [mirror] }),
  );
  assert.throws(() => validateDocument(many), /Scene exceeds.*triangles/);
});
