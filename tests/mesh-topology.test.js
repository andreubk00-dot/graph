import test from "node:test";
import assert from "node:assert/strict";
import { editMeshGeometry, meshTopology } from "../src/mesh-edit.js";
import { applyCommands, emptyDocument, makeNode } from "../src/document.js";
import { auditMesh } from "../src/mesh-audit.js";
import { closedBox } from "./fixtures/mesh-study.js";
import { deformationStudy } from "../src/rig-fixture.js";
const quad = () => ({
  positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
  indices: [0, 1, 2, 0, 2, 3],
});
function doc(g = closedBox()) {
  const d = emptyDocument();
  d.nodes = [
    makeNode("mesh", { id: "subject", position: [0, 0, 0], geometry: g }),
  ];
  return d;
}
function volume(g) {
  let sum = 0;
  for (const f of meshTopology(g).faces) {
    const [a, b, c] = f.map((i) => g.positions.slice(i * 3, i * 3 + 3));
    sum +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return sum;
}
function closed(g) {
  const a = auditMesh(g);
  for (const key of [
    "boundaryEdges",
    "nonManifoldEdges",
    "windingConflicts",
    "degenerate",
    "normalErrors",
    "inwardNormals",
  ])
    assert.equal(a[key], 0, key);
  assert.equal(a.components, 1);
}

test("all 93 triangle-edge subset/fraction splits preserve area, winding and old vertex IDs", () => {
  const source = quad(),
    before = structuredClone(source);
  for (let mask = 1; mask < 32; mask++)
    for (const fraction of [0.2, 0.5, 0.8]) {
      const ids = Array.from({ length: 5 }, (_, i) => i).filter(
          (i) => mask & (1 << i),
        ),
        g = editMeshGeometry(source, {
          action: "splitEdges",
          selection: { mode: "edge", ids },
          fraction,
        });
      let area = 0;
      for (const f of meshTopology(g).faces) {
        const [a, b, c] = f.map((i) => g.positions.slice(i * 3, i * 3 + 3));
        const signed =
          (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        assert.ok(signed > 0);
        area += signed / 2;
      }
      assert.ok(Math.abs(area - 1) < 1e-12);
      assert.deepEqual(g.positions.slice(0, 12), source.positions);
      assert.equal(auditMesh(g).normalErrors, 0);
    }
  assert.deepEqual(source, before);
});
test("edge split follows UV seam counterparts while preserving separate attributes and interpolating colors", () => {
  const source = {
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 3, 4, 5],
    uv: [0, 0, 1, 0, 1, 1, 0.2, 0, 0.8, 1, 0, 1],
    colors: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1],
  };
  const g = editMeshGeometry(source, {
    action: "splitEdges",
    selection: { mode: "edge", ids: [2] },
    fraction: 0.3,
  });
  assert.equal(g.positions.length / 3, 8);
  assert.equal(g.indices.length / 3, 4);
  assert.deepEqual(g.positions.slice(18, 21), g.positions.slice(21, 24));
  assert.deepEqual(g.uv.slice(0, 12), source.uv);
  assert.notDeepEqual(g.uv.slice(12, 14), g.uv.slice(14, 16));
  assert.ok(Math.abs(g.uv[12] - 0.3) < 1e-12);
  assert.equal(auditMesh(g).boundaryEdges, 4);
  const box = editMeshGeometry(closedBox(), {
    action: "splitEdges",
    selection: { mode: "edge", ids: [0, 1, 2] },
    fraction: 0.25,
  });
  closed(box);
  assert.ok(Math.abs(volume(box) - 1) < 1e-12);
});
test("invalid edge splits reject atomically including conflicting seam directions", () => {
  const d = doc(),
    before = structuredClone(d);
  for (const fraction of [0, 1, -1, NaN])
    assert.throws(() =>
      applyCommands(d, [
        {
          op: "meshEdit",
          id: "subject",
          action: "splitEdges",
          selection: { mode: "edge", ids: [0] },
          fraction,
        },
      ]),
    );
  assert.throws(() =>
    editMeshGeometry(quad(), {
      action: "splitEdges",
      selection: { mode: "edge", ids: [99] },
    }),
  );
  const seam = {
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0],
    indices: [0, 1, 2, 3, 4, 5],
  };
  assert.throws(
    () =>
      editMeshGeometry(seam, {
        action: "splitEdges",
        selection: { mode: "edge", ids: [2, 3] },
        fraction: 0.3,
      }),
    /conflicting/,
  );
  assert.deepEqual(d, before);
});
test("vertex merge has explicit attribute policy and deterministic target/center placement", () => {
  const source = { ...quad(), uv: [0, 0, 1, 0, 1, 1, 0, 1] };
  assert.throws(
    () =>
      editMeshGeometry(source, {
        action: "mergeVertices",
        selection: { mode: "vertex", ids: [0, 1] },
      }),
    /discard uv/,
  );
  const g = editMeshGeometry(source, {
    action: "mergeVertices",
    selection: { mode: "vertex", ids: [0, 1] },
    attributePolicy: "target",
    placement: "center",
  });
  assert.deepEqual(g.positions.slice(0, 6), [0.5, 0, 0, 0.5, 0, 0]);
  assert.deepEqual(g.indices, [0, 2, 3]);
  assert.deepEqual(g.uv, source.uv);
  const merged = editMeshGeometry(closedBox(), {
    action: "mergeVertices",
    selection: { mode: "vertex", ids: [0, 1] },
    target: 0,
  });
  closed(merged);
});
test("merge rejects pinched fans, duplicate faces and invalid target IDs", () => {
  const pinch = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0],
    indices: [0, 1, 2, 3, 4, 5],
  };
  assert.throws(
    () =>
      editMeshGeometry(pinch, {
        action: "mergeVertices",
        selection: { mode: "vertex", ids: [0, 3] },
      }),
    /pinch/,
  );
  const tetra = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
  };
  assert.throws(
    () =>
      editMeshGeometry(tetra, {
        action: "mergeVertices",
        selection: { mode: "vertex", ids: [0, 1] },
      }),
    /duplicate/,
  );
  assert.throws(
    () =>
      editMeshGeometry(quad(), {
        action: "mergeVertices",
        selection: { mode: "vertex", ids: [0, 1] },
        target: 2,
      }),
    /target/,
  );
});
test("merge landmark remapping is explicit, atomic and changes only affected vertex anchors", () => {
  const d = doc();
  d.review = {
    version: 1,
    landmarks: {
      corner: { node: "subject", vertex: 1 },
      other: { node: "subject", vertex: 5 },
    },
    measurements: [],
    symmetry: [],
  };
  const before = structuredClone(d),
    command = {
      op: "meshEdit",
      id: "subject",
      action: "mergeVertices",
      selection: { mode: "vertex", ids: [0, 1] },
      target: 0,
    };
  assert.throws(() => applyCommands(d, [command]), /landmark/);
  assert.deepEqual(d, before);
  const result = applyCommands(d, [{ ...command, landmarkPolicy: "remap" }]);
  assert.equal(result.review.landmarks.corner.vertex, 0);
  assert.equal(result.review.landmarks.other.vertex, 5);
  closed(result.nodes[0].geometry);
});
test("bevel preserves closed geometry and analytical cut volume for all cube and octahedron corners", () => {
  for (let vertex = 0; vertex < 8; vertex++)
    for (const width of [0.05, 0.2, 0.4]) {
      const source = closedBox(),
        g = editMeshGeometry(source, { action: "bevelVertex", vertex, width });
      closed(g);
      assert.ok(
        Math.abs(volume(g) - (1 - (width * Math.sqrt(3)) ** 3 / 6)) < 1e-9,
      );
      assert.equal(source.positions.length, 24);
    }
  const octa = {
    positions: [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1],
    indices: [
      0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 4, 2, 1, 3, 4, 1, 5, 3, 1, 2, 5,
    ],
  };
  for (let vertex = 0; vertex < 6; vertex++) {
    const g = editMeshGeometry(octa, {
      action: "bevelVertex",
      vertex,
      width: 0.2,
    });
    closed(g);
    assert.ok(Math.abs(volume(g) - (4 / 3 - (2 / 3) * 0.2 ** 3)) < 1e-9);
  }
});
test("bevel handles split UV/color corner instances and adds a separately mapped planar cap", () => {
  const box = closedBox(),
    source = {
      positions: box.indices.flatMap((i) =>
        box.positions.slice(i * 3, i * 3 + 3),
      ),
      indices: Array.from({ length: 36 }, (_, i) => i),
      uv: Array.from({ length: 72 }, (_, i) => (i % 7) / 7),
      colors: Array.from({ length: 108 }, (_, i) => (i % 5) / 5),
    };
  let remap;
  const g = editMeshGeometry(
    source,
    { action: "bevelVertex", vertex: 0, width: 0.2 },
    { onRemap: (map) => (remap = map) },
  );
  assert.equal(remap.size, 6);
  assert.deepEqual(g.uv.slice(0, 72), source.uv);
  assert.deepEqual(g.colors.slice(0, 108), source.colors);
  assert.equal(g.uv.length / 2, g.positions.length / 3);
  assert.equal(g.colors.length, g.positions.length);
  closed(g);
  assert.ok(new Set(g.indices).has(remap.get(0)));
});
test("bevel rejects invalid widths, flat/open and concave corners without source mutation", () => {
  const d = doc(),
    before = structuredClone(d);
  for (const width of [0, -1, 2, NaN])
    assert.throws(() =>
      applyCommands(d, [
        {
          op: "meshEdit",
          id: "subject",
          action: "bevelVertex",
          vertex: 0,
          width,
        },
      ]),
    );
  assert.deepEqual(d, before);
  assert.throws(
    () =>
      editMeshGeometry(quad(), {
        action: "bevelVertex",
        vertex: 0,
        width: 0.1,
      }),
    /closed/,
  );
  const concave = closedBox();
  concave.positions.splice(0, 3, 0.6, 0.6, 0.6);
  assert.throws(
    () =>
      editMeshGeometry(concave, {
        action: "bevelVertex",
        vertex: 0,
        width: 0.05,
      }),
    /convex|direction/,
  );
});
test("bevel moves a permitted landmark to the visible cap center; bound skins stay protected", () => {
  const d = doc();
  d.review = {
    version: 1,
    landmarks: { tip: { node: "subject", vertex: 0 } },
    measurements: [],
    symmetry: [],
  };
  const command = {
    op: "meshEdit",
    id: "subject",
    action: "bevelVertex",
    vertex: 0,
    width: 0.2,
  };
  assert.throws(() => applyCommands(d, [command]), /landmark/);
  const next = applyCommands(d, [{ ...command, landmarkPolicy: "remap" }]),
    id = next.review.landmarks.tip.vertex,
    g = next.nodes[0].geometry;
  assert.equal(id, g.positions.length / 3 - 1);
  assert.ok(g.indices.includes(id));
  const rig = deformationStudy(),
    skin = rig.nodes.find((n) => n.skin);
  for (const action of ["splitEdges", "mergeVertices", "bevelVertex"])
    assert.throws(
      () => applyCommands(rig, [{ ...command, id: skin.id, action }]),
      /Unbind/,
    );
});

test("merge refuses an unused result, including collapse of an entire detached component", () => {
  const separate = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0],
    indices: [0, 1, 2, 3, 4, 5],
  };
  const d = doc(separate),
    before = structuredClone(d);
  assert.throws(
    () =>
      applyCommands(d, [
        {
          op: "meshEdit",
          id: "subject",
          action: "mergeVertices",
          selection: { mode: "vertex", ids: [0, 1] },
        },
      ]),
    /surviving surface/,
  );
  assert.deepEqual(d, before);
  const orphan = quad();
  orphan.positions.push(2, 2, 2, 3, 3, 3);
  assert.throws(
    () =>
      editMeshGeometry(orphan, {
        action: "mergeVertices",
        selection: { mode: "vertex", ids: [4, 5] },
      }),
    /surviving surface/,
  );
});
