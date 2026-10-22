import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyDocument,
  makeNode,
  applyCommands,
  validateDocument,
} from "../src/document.js";
import {
  editMeshGeometry,
  meshTopology,
  selectedVertices,
} from "../src/mesh-edit.js";
import { bakeMeshGeometry } from "../src/mesh-convert.js";
import { geometryFor } from "../src/scene.js";
import {
  validateReferences,
  MAX_REFERENCE_BYTES,
} from "../src/modeling-references.js";
import { deformationStudy } from "../src/rig-fixture.js";

import { halfBox } from "./fixtures/mesh-study.js";
const quad = () => ({
  positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
  indices: [0, 1, 2, 0, 2, 3],
  uv: [0, 0, 1, 0, 1, 1, 0, 1],
  colors: [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1],
});
function nodeDoc(g = quad()) {
  const d = emptyDocument();
  d.nodes.push(
    makeNode("mesh", { id: "subject", position: [0, 0, 0], geometry: g }),
  );
  return d;
}
function edgeIncidence(g) {
  const m = new Map();
  for (const f of meshTopology(g).faces)
    for (let j = 0; j < 3; j++) {
      const a = f[j],
        b = f[(j + 1) % 3],
        key = [a, b].sort((a, b) => a - b).join(":");
      const item = m.get(key) ?? { count: 0, direction: 0 };
      item.count++;
      item.direction += a < b ? 1 : -1;
      m.set(key, item);
    }
  return [...m.values()];
}
function volume(g) {
  let v = 0;
  for (const [a, b, c] of meshTopology(g).faces) {
    const p = (i) => g.positions.slice(i * 3, i * 3 + 3),
      x = p(a),
      y = p(b),
      z = p(c);
    v +=
      (x[0] * (y[1] * z[2] - y[2] * z[1]) +
        x[1] * (y[2] * z[0] - y[0] * z[2]) +
        x[2] * (y[0] * z[1] - y[1] * z[0])) /
      6;
  }
  return v;
}

test("component movement deduplicates shared vertices and preserves UV/color seams and source", () => {
  const source = quad(),
    before = structuredClone(source),
    selection = { mode: "face", ids: [0, 1, 0] };
  assert.deepEqual(selectedVertices(source, selection), [0, 1, 2, 3]);
  const result = editMeshGeometry(source, {
    action: "translate",
    selection,
    delta: [0.2, 0, 0.1],
  });
  assert.deepEqual(source, before);
  assert.equal(result.positions[0], 0.2);
  assert.equal(result.positions[6], 1.2);
  assert.deepEqual(result.uv, source.uv);
  assert.deepEqual(result.colors, source.colors);
  const edge = meshTopology(source).edges.findIndex(
    (e) => e[0] === 0 && e[1] === 2,
  );
  const moved = editMeshGeometry(source, {
    action: "translate",
    selection: { mode: "edge", ids: [edge] },
    delta: [0, 0, 0.5],
  });
  assert.equal(moved.positions[2], 0.5);
  assert.equal(moved.positions[8], 0.5);
  assert.equal(moved.positions[5], 0);
  assert.deepEqual(
    editMeshGeometry(result, {
      action: "translate",
      selection,
      delta: [0, 0, 0],
    }),
    result,
  );
  assert.deepEqual(
    editMeshGeometry(result, {
      action: "setVertex",
      vertex: 0,
      position: result.positions.slice(0, 3),
    }),
    result,
  );
});
test("region extrusion creates only boundary walls and keeps selected cap face slots", () => {
  const q = quad(),
    result = editMeshGeometry(q, {
      action: "extrude",
      selection: { mode: "face", ids: [0, 1] },
      delta: [0, 0, 0.5],
    });
  assert.equal(result.positions.length / 3, 8);
  assert.equal(result.indices.length / 3, 10);
  assert.deepEqual(result.indices.slice(0, 6), [4, 5, 6, 4, 6, 7]);
  assert.equal(edgeIncidence(result).filter((e) => e.count === 1).length, 4);
  assert.equal(edgeIncidence(result).filter((e) => e.count > 2).length, 0);
  assert.equal(result.uv.length, 16);
  assert.deepEqual(result.uv.slice(8), q.uv);
  assert.deepEqual(result.colors.slice(12), q.colors);
});
test("mirror welds original seam IDs, reverses winding and produces a closed outward solid", () => {
  const result = editMeshGeometry(halfBox(), { action: "mirror", axis: "x" });
  assert.equal(result.positions.length / 3, 12);
  assert.equal(result.indices.length / 3, 20);
  for (const e of edgeIncidence(result)) {
    assert.equal(e.count, 2);
    assert.equal(e.direction, 0);
  }
  assert.ok(Math.abs(volume(result) - 2) < 1e-9);
  assert.ok(result.positions.includes(-1));
  for (let i = 0; i < result.normals.length; i += 3)
    assert.ok(
      Math.abs(Math.hypot(...result.normals.slice(i, i + 3)) - 1) < 1e-6,
    );
});
test("extrusion of a closed solid keeps manifold orientation and volume", () => {
  const box = editMeshGeometry(halfBox(), { action: "mirror", axis: "x" });
  const result = editMeshGeometry(box, {
    action: "extrude",
    selection: { mode: "face", ids: [6, 7] },
    delta: [0, 0.5, 0],
  });
  for (const e of edgeIncidence(result)) {
    assert.equal(e.count, 2);
    assert.equal(e.direction, 0);
  }
  assert.ok(Math.abs(volume(result) - 2.5) < 1e-9);
});
test("mirror handles negative side and offset; ignores retained unused vertices after face deletion", () => {
  const source = quad();
  source.positions.push(-8, 4, 4);
  source.uv.push(0, 0);
  source.colors.push(1, 1, 1);
  const mirrored = editMeshGeometry(source, { action: "mirror" });
  assert.equal(mirrored.positions[12], -8);
  assert.equal(mirrored.positions.length / 3, 7);
  const shifted = quad();
  for (let i = 0; i < shifted.positions.length; i += 3)
    shifted.positions[i] = 2 - shifted.positions[i];
  const r = editMeshGeometry(shifted, {
    action: "mirror",
    axis: "x",
    offset: 2,
    side: "negative",
  });
  assert.ok(r.positions.includes(3));
  const deleted = editMeshGeometry(quad(), {
    action: "deleteFaces",
    selection: { mode: "face", ids: [0] },
  });
  assert.equal(deleted.positions.length, 12);
  assert.deepEqual(deleted.indices, [0, 2, 3]);
  assert.equal(deleted.normals[4], 1);
});
test("invalid edits fail atomically without destroying the sculpt source or metadata", () => {
  const d = nodeDoc(),
    before = structuredClone(d);
  for (const command of [
    { action: "setVertex", vertex: 1, position: [0, 0, 0] },
    {
      action: "translate",
      selection: { mode: "vertex", ids: [99] },
      delta: [0, 1, 0],
    },
    {
      action: "extrude",
      selection: { mode: "edge", ids: [0] },
      delta: [0, 0, 1],
    },
    {
      action: "extrude",
      selection: { mode: "face", ids: [0, 1] },
      delta: [0, 0, 0],
    },
    { action: "deleteFaces", selection: { mode: "face", ids: [0, 1] } },
    { action: "mirror", axis: "q" },
    {
      action: "translate",
      selection: { mode: "face", ids: [0] },
      delta: [0, NaN, 0],
    },
  ])
    assert.throws(() =>
      applyCommands(d, [{ op: "meshEdit", id: "subject", ...command }]),
    );
  assert.deepEqual(d, before);
  assert.throws(
    () =>
      editMeshGeometry(
        { positions: [-1, 0, 0, 1, 0, 0, 0, 1, 0] },
        { action: "mirror" },
      ),
    /one half/,
  );
  const closed = editMeshGeometry(halfBox(), { action: "mirror" });
  assert.throws(
    () =>
      editMeshGeometry(closed, {
        action: "extrude",
        selection: {
          mode: "face",
          ids: meshTopology(closed).faces.map((_, i) => i),
        },
        delta: [0, 1, 0],
      }),
    /boundary/,
  );
  assert.throws(
    () =>
      editMeshGeometry(
        { positions: [0, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2] },
        { action: "mirror" },
      ),
    /plane/,
  );
});
test("extrusion rejects inconsistent winding and nonmanifold input at selected edges", () => {
  const bad = quad();
  bad.indices = [0, 1, 2, 0, 3, 2];
  assert.throws(
    () =>
      editMeshGeometry(bad, {
        action: "extrude",
        selection: { mode: "face", ids: [0, 1] },
        delta: [0, 0, 1],
      }),
    /wound/,
  );
  const nonmanifold = quad();
  nonmanifold.indices.push(0, 1, 3, 0, 1, 2);
  assert.throws(
    () =>
      editMeshGeometry(nonmanifold, {
        action: "extrude",
        selection: { mode: "face", ids: [0] },
        delta: [0, 0, 1],
      }),
    /nonmanifold/,
  );
});
test("mesh edits preserve vertex landmark IDs and reject bound skin until explicitly unbound", () => {
  const d = nodeDoc();
  d.review = {
    version: 1,
    landmarks: { corner: { node: "subject", vertex: 2 } },
    measurements: [],
    symmetry: [],
  };
  const changed = applyCommands(d, [
    { op: "meshEdit", id: "subject", action: "mirror" },
  ]);
  assert.deepEqual(changed.review, d.review);
  assert.deepEqual(changed.nodes[0].geometry.positions.slice(6, 9), [1, 1, 0]);
  const rig = deformationStudy();
  const skin = rig.nodes.find((n) => n.skin);
  assert.ok(skin);
  assert.throws(
    () =>
      applyCommands(rig, [
        { op: "meshEdit", id: skin.id, action: "recalculateNormals" },
      ]),
    /Unbind/,
  );
  const unbound = applyCommands(rig, [
    { op: "unbindSkin", id: skin.id },
    {
      op: "meshEdit",
      id: skin.id,
      action: "translate",
      selection: { mode: "vertex", ids: [0] },
      delta: [0.001, 0, 0],
    },
  ]);
  assert.equal(unbound.nodes.find((n) => n.id === skin.id).skin, undefined);
});
test("conversion retains transforms, clips, source appearance and triangle attributes", () => {
  for (const type of [
    "box",
    "sphere",
    "cylinder",
    "cone",
    "torus",
    "plane",
    "capsule",
    "lathe",
    "extrude",
  ]) {
    const d = emptyDocument();
    d.nodes = [
      makeNode(type, {
        id: "shape",
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        scale: [2, 3, 4],
      }),
    ];
    d.nodes[0].keys = [
      {
        time: 0.5,
        position: [2, 3, 4],
        rotation: [0.2, 0.3, 0.4],
        scale: [2, 3, 4],
      },
    ];
    d.clips = [
      {
        id: "move",
        name: "Move",
        duration: 1,
        tracks: { shape: structuredClone(d.nodes[0].keys) },
      },
    ];
    const baked = bakeMeshGeometry(d.nodes[0]);
    const result = applyCommands(d, [
      { op: "convertMesh", id: "shape", geometry: baked },
    ]);
    assert.equal(result.nodes[0].type, "mesh");
    assert.deepEqual(result.clips, d.clips);
    assert.deepEqual(result.nodes[0].keys, d.nodes[0].keys);
    assert.deepEqual(result.nodes[0].position, [1, 2, 3]);
    assert.deepEqual(result.nodes[0].rotation, [0.1, 0.2, 0.3]);
    assert.deepEqual(result.nodes[0].scale, [2, 3, 4]);
    const old = geometryFor(d.nodes[0]),
      next = geometryFor(result.nodes[0]);
    assert.deepEqual(
      Array.from(old.attributes.position.array),
      Array.from(next.attributes.position.array),
    );
    old.dispose();
    next.dispose();
  }
  assert.throws(() => bakeMeshGeometry(makeNode("group")), /surface/);
});
test("embedded references are bounded raster data, project-persistent and atomically removable", () => {
  const ref = {
    view: "front",
    name: "Calibration",
    data: "data:image/png;base64,AAAA",
    width: 2,
    opacity: 0.4,
    center: [0, 1, 0],
  };
  const d = applyCommands(nodeDoc(), [
    { op: "setReferenceImages", references: [ref] },
  ]);
  assert.deepEqual(
    validateDocument(JSON.parse(JSON.stringify(d))).referenceImages,
    [ref],
  );
  assert.equal(
    applyCommands(d, [{ op: "setReferenceImages", references: null }])
      .referenceImages,
    undefined,
  );
  for (const patch of [
    { view: "perspective" },
    { data: "https://example.com/image.png" },
    { data: "data:image/svg+xml;base64,AAAA" },
    { width: 0 },
    { opacity: 2 },
    { center: [0, Infinity, 0] },
    { data: "data:image/png;base64,AAA" },
  ])
    assert.throws(() => validateReferences([{ ...ref, ...patch }]));
  assert.throws(() => validateReferences([ref, ref]), /unique/);
  assert.throws(
    () =>
      validateReferences([
        {
          ...ref,
          data: "data:image/png;base64," + "A".repeat(MAX_REFERENCE_BYTES),
        },
      ]),
    /budget/,
  );
  assert.equal(nodeDoc().referenceImages, undefined);
});

test("extrusion recognizes adjacency across exact-position UV splits without welding attributes", () => {
  const source = {
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 3, 4, 5],
    uv: [0, 0, 0.5, 0, 0.5, 1, 0.5, 0, 1, 1, 1, 0],
  };
  const result = editMeshGeometry(source, {
    action: "extrude",
    selection: { mode: "face", ids: [0, 1] },
    delta: [0, 0, 0.2],
  });
  assert.equal(result.positions.length / 3, 12);
  assert.equal(result.indices.length / 3, 10);
  assert.deepEqual(result.uv.slice(0, 12), source.uv);
  assert.deepEqual(result.uv.slice(12), source.uv);
  assert.deepEqual(result.indices.slice(0, 6), [6, 7, 8, 9, 10, 11]);
  const box = bakeMeshGeometry(makeNode("box"));
  assert.throws(
    () =>
      editMeshGeometry(box, {
        action: "extrude",
        selection: {
          mode: "face",
          ids: meshTopology(box).faces.map((_, i) => i),
        },
        delta: [0, 1, 0],
      }),
    /boundary/,
  );
});
