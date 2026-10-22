import test from "node:test";
import assert from "node:assert/strict";
import { subdivideMeshGeometry } from "../src/mesh-subdivision.js";
import { evaluateMeshGeometry } from "../src/mesh-modifiers.js";
import {
  emptyDocument,
  makeNode,
  applyCommands,
  validateDocument,
} from "../src/document.js";
import { auditMeasurements } from "../src/model-review.js";
import { auditMesh } from "../src/mesh-audit.js";
import { halfBox } from "./fixtures/mesh-study.js";

export function tetrahedron() {
  return {
    positions: [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1],
    indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
    smooth: true,
  };
}
const node = (
  geometry = tetrahedron(),
  modifiers = [{ type: "subdivision" }],
) => ({ type: "mesh", geometry, modifiers });
const surface = (g) =>
  g.indices.flatMap((i) => g.positions.slice(i * 3, i * 3 + 3));
const clean = (g) => {
  const r = auditMesh(g);
  for (const k of [
    "boundaryEdges",
    "nonManifoldEdges",
    "windingConflicts",
    "degenerate",
    "normalErrors",
    "inwardNormals",
  ])
    assert.equal(r[k], 0, k);
};

test("Loop uses analytical interior masks, preserves source IDs and adds four oriented children per triangle", () => {
  const input = tetrahedron(),
    before = structuredClone(input),
    g = subdivideMeshGeometry(input);
  assert.deepEqual(input, before);
  assert.deepEqual(g.positions.slice(0, 3), [0.25, 0.25, 0.25]);
  assert.deepEqual(g.positions.slice(12, 15), [0, 0.5, 0]); // Edge 0–2: 3/8 endpoints + 1/8 opposites.
  assert.equal(g.positions.length / 3, 10);
  assert.equal(g.indices.length / 3, 16);
  clean(g);
  for (const levels of [2, 3]) {
    const smooth = subdivideMeshGeometry(input, levels);
    assert.equal(smooth.indices.length / 3, 4 * 4 ** levels);
    assert.equal(smooth.positions.length / 3, 2 + 2 * 4 ** levels);
    clean(smooth);
  }
});

test("open boundaries use 3/4–1/8 even masks and midpoint odd masks; unused vertex slots remain stable", () => {
  const g = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 7, 8, 9],
    indices: [0, 1, 2],
  };
  const s = subdivideMeshGeometry(g);
  assert.deepEqual(s.positions.slice(0, 3), [0.125, 0.125, 0]);
  assert.deepEqual(s.positions.slice(9, 12), [7, 8, 9]);
  assert.deepEqual(s.positions.slice(12, 15), [0.5, 0, 0]);
  assert.deepEqual(s.normals.slice(9, 12), [0, 1, 0]);
  assert.equal(auditMesh(s).boundaryEdges, 6);
  assert.equal(s.indices.length, 12);
});

test("UV/color seams remain split while positions and smooth normals match the welded surface", () => {
  const t = tetrahedron(),
    split = { positions: surface(t), uv: [], colors: [], smooth: true };
  for (let i = 0; i < 12; i++) {
    split.uv.push(
      Math.floor(i / 3) * 2 + (i % 3 === 1 ? 1 : 0),
      i % 3 === 2 ? 1 : 0,
    );
    split.colors.push(Math.floor(i / 3) / 3, 0, 1);
  }
  const g = subdivideMeshGeometry(split),
    welded = subdivideMeshGeometry(t);
  assert.deepEqual(surface(g), surface(welded));
  assert.deepEqual(g.uv.slice(0, 24), split.uv);
  assert.deepEqual(g.colors.slice(0, 36), split.colors);
  assert.deepEqual(g.uv.slice(24, 26), [0.5, 0]);
  const normals = new Map();
  for (let i = 0; i < g.positions.length / 3; i++) {
    const k = g.positions.slice(i * 3, i * 3 + 3).join(":"),
      n = g.normals.slice(i * 3, i * 3 + 3);
    if (normals.has(k)) assert.deepEqual(n, normals.get(k));
    else normals.set(k, n);
  }
  assert.equal(normals.size, 10);
  assert.equal(g.positions.length / 3, 24);
  clean(g);
  clean(subdivideMeshGeometry(split, 2));
});

test("subdivision rejects duplicate faces, inconsistent winding, nonmanifold edges and pinched vertex fans", () => {
  const t = tetrahedron(),
    before = structuredClone(t);
  const duplicate = structuredClone(t);
  duplicate.indices.push(...t.indices.slice(0, 3));
  assert.throws(
    () => subdivideMeshGeometry(duplicate),
    /duplicate|nonmanifold|winding/,
  );
  const reversed = structuredClone(t);
  reversed.indices.splice(0, 3, 0, 1, 2);
  assert.throws(() => subdivideMeshGeometry(reversed), /winding/);
  const pinched = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0],
    indices: [0, 1, 2, 0, 3, 4],
  };
  assert.throws(() => subdivideMeshGeometry(pinched), /boundary|pinched/);
  const nonmanifold = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1],
    indices: [0, 1, 2, 1, 0, 3, 0, 1, 4],
  };
  assert.throws(() => subdivideMeshGeometry(nonmanifold), /nonmanifold/);
  const touching = {
    positions: [...t.positions, ...t.positions.map((x) => 2 - x)],
    indices: [...t.indices],
  };
  for (let i = 0; i < t.indices.length; i += 3)
    touching.indices.push(
      t.indices[i] + 4,
      t.indices[i + 2] + 4,
      t.indices[i + 1] + 4,
    );
  assert.throws(() => subdivideMeshGeometry(touching), /pinched/);
  assert.deepEqual(t, before);
});

test("ordered mirror/subdivision stacks are deterministic, symmetric, distinct and bake without changing landmark IDs", () => {
  const mirror = { type: "mirror" },
    sub = { type: "subdivision", levels: 2 };
  const a = evaluateMeshGeometry(node(halfBox(), [mirror, sub])),
    b = evaluateMeshGeometry(node(halfBox(), [sub, mirror]));
  assert.notDeepEqual(a.positions, b.positions);
  clean(a);
  clean(b);
  assert.equal(auditMesh(a).mirrorMatch, 1);
  assert.equal(auditMesh(b).mirrorMatch, 1);
  const d = emptyDocument();
  d.nodes = [
    makeNode("mesh", { id: "study", position: [0, 0, 0], geometry: halfBox() }),
  ];
  d.review = {
    version: 1,
    landmarks: { tip: { node: "study", vertex: 6 } },
    measurements: [],
    symmetry: [],
  };
  const live = applyCommands(d, [
    { op: "setModifiers", id: "study", modifiers: [mirror, sub] },
  ]);
  assert.deepEqual(live.nodes[0].geometry, d.nodes[0].geometry);
  const p = auditMeasurements(live).landmarks[0].point;
  assert.notDeepEqual(p, [1, 1, 1]);
  const baked = applyCommands(live, [{ op: "bakeModifiers", id: "study" }]);
  assert.deepEqual(baked.nodes[0].geometry, a);
  assert.deepEqual(baked.review, live.review);
  assert.deepEqual(auditMeasurements(baked).landmarks[0].point, p);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(live))), live);
});

test("subdivision settings, skin restrictions and exponential triangle budgets fail before changing source", () => {
  for (const levels of [0, 4, 1.5, null, "2", Infinity])
    assert.throws(() =>
      evaluateMeshGeometry(
        node(tetrahedron(), [{ type: "subdivision", levels }]),
      ),
    );
  for (const modifiers of [
    [{ type: "subdivision", axis: "x" }],
    [{ type: "subdivision" }, { type: "subdivision" }],
    [{ type: "subdivision", levels: 4, enabled: false }],
  ])
    assert.throws(() => evaluateMeshGeometry(node(tetrahedron(), modifiers)));
  assert.throws(
    () => evaluateMeshGeometry({ ...node(), skin: {} }),
    /Bake or remove/,
  );
  const mesh = { positions: [], indices: [] };
  for (let i = 0; i < 1600; i++) {
    mesh.positions.push(i, 0, 0, i + 0.5, 0, 0, i, 0.5, 0);
    mesh.indices.push(i * 3, i * 3 + 1, i * 3 + 2);
  }
  const before = structuredClone(mesh);
  assert.throws(() => subdivideMeshGeometry(mesh, 3), /triangle budget/);
  assert.deepEqual(mesh, before);
});
