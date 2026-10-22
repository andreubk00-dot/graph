import test from "node:test";
import assert from "node:assert/strict";
import { validateMeshGeometry } from "../src/mesh-geometry.js";
import {
  creaseNormalGeometry,
  expandedCreases,
  physicalCreases,
} from "../src/mesh-creases.js";
import { editMeshGeometry, meshTopology } from "../src/mesh-edit.js";
import { subdivideMeshGeometry } from "../src/mesh-subdivision.js";
import { evaluateMeshGeometry } from "../src/mesh-modifiers.js";
import { geometryFor } from "../src/scene.js";
import { emptyDocument, makeNode, applyCommands } from "../src/document.js";
import { auditMeasurements } from "../src/model-review.js";
import { auditMesh } from "../src/mesh-audit.js";
import { closedBox, halfBox } from "./fixtures/mesh-study.js";

function hardBox() {
  const g = { ...closedBox(), smooth: true };
  g.creases = meshTopology(g).edges.filter(
    ([a, b]) =>
      [0, 1, 2].filter((k) => g.positions[a * 3 + k] !== g.positions[b * 3 + k])
        .length === 1,
  );
  return g;
}
const tetra = () => ({
  positions: [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1],
  indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
});
const source = (g) => {
  const d = emptyDocument();
  d.nodes = [
    makeNode("mesh", { id: "study", position: [0, 0, 0], geometry: g }),
  ];
  return d;
};

test("crease metadata references unique existing edges and marking is atomic across attribute seams", () => {
  for (const creases of [
    null,
    {},
    [[0, 0]],
    [[0, 99]],
    [[0, 6]],
    [
      [0, 1],
      [1, 0],
    ],
    [[0, 1, 2]],
    [[0, 0.5]],
  ])
    assert.throws(() => validateMeshGeometry({ ...closedBox(), creases }));
  const g = closedBox(),
    d = source(g),
    before = structuredClone(d);
  assert.throws(() =>
    applyCommands(d, [
      {
        op: "meshEdit",
        id: "study",
        action: "setCreases",
        selection: { mode: "face", ids: [0] },
        enabled: true,
      },
    ]),
  );
  assert.deepEqual(d, before);
  const n = applyCommands(d, [
    {
      op: "meshEdit",
      id: "study",
      action: "setCreases",
      selection: { mode: "edge", ids: [0] },
      enabled: true,
    },
  ]);
  assert.deepEqual(n.nodes[0].geometry.creases, [meshTopology(g).edges[0]]);
  const cleared = applyCommands(n, [
    {
      op: "meshEdit",
      id: "study",
      action: "setCreases",
      selection: { mode: "edge", ids: [0] },
      enabled: false,
    },
  ]);
  assert.equal(cleared.nodes[0].geometry.creases, undefined);
  const custom = {
    ...closedBox(),
    normals: Array.from({ length: 8 }, () => [0, 1, 0]).flat(),
  };
  const command = {
    action: "setCreases",
    selection: { mode: "edge", ids: [0] },
    enabled: true,
  };
  assert.deepEqual(
    editMeshGeometry(custom, { action: "clearCreases" }),
    custom,
  );
  assert.deepEqual(
    editMeshGeometry(custom, { ...command, enabled: false }),
    custom,
  );
  const tagged = editMeshGeometry(custom, command);
  assert.deepEqual(tagged.normals, custom.normals);
  assert.deepEqual(editMeshGeometry(tagged, command), tagged);
  const removed = editMeshGeometry(tagged, { action: "clearCreases" });
  assert.deepEqual(removed, custom);
});

test("Loop crease masks handle darts, two-edge chains, fixed corners and midpoint edge children analytically", () => {
  const t = tetra(),
    before = structuredClone(t);
  const dart = subdivideMeshGeometry({ ...t, creases: [[0, 2]] });
  assert.deepEqual(dart.positions.slice(0, 3), [0.25, 0.25, 0.25]);
  assert.deepEqual(dart.positions.slice(12, 15), [0, 1, 0]);
  const chain = subdivideMeshGeometry({
    ...t,
    creases: [
      [0, 1],
      [0, 2],
    ],
  });
  assert.deepEqual(chain.positions.slice(0, 3), [0.5, 0.75, 0.75]);
  const corner = subdivideMeshGeometry(
    {
      ...t,
      creases: [
        [0, 1],
        [0, 2],
        [0, 3],
      ],
    },
    3,
  );
  assert.deepEqual(corner.positions.slice(0, 3), [1, 1, 1]);
  assert.equal(corner.creases.length, 24);
  assert.deepEqual(t, before);
});

test("hard box retains planes and sharp corner positions across subdivision with correctly split render normals", () => {
  const g = hardBox(),
    before = structuredClone(g);
  for (const level of [0, 1, 2, 3]) {
    const evaluated = level ? subdivideMeshGeometry(g, level) : g;
    assert.deepEqual(evaluated.positions.slice(0, 24), g.positions);
    assert.equal(evaluated.creases.length, 12 * 2 ** level);
    const { geometry: render, sources } = creaseNormalGeometry(evaluated);
    assert.deepEqual(
      render.positions.slice(0, evaluated.positions.length),
      evaluated.positions,
    );
    assert.equal(render.normals.length, render.positions.length);
    for (let t = 0; t < render.indices.length; t += 3) {
      const f = render.indices.slice(t, t + 3),
        p = f.map((i) => render.positions.slice(i * 3, i * 3 + 3));
      const u = p[1].map((x, k) => x - p[0][k]),
        v = p[2].map((x, k) => x - p[0][k]);
      const n = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ],
        length = Math.hypot(...n);
      for (const i of f)
        for (let k = 0; k < 3; k++)
          assert.ok(Math.abs(render.normals[i * 3 + k] - n[k] / length) < 1e-8);
    }
    const report = auditMesh(render);
    for (const k of [
      "boundaryEdges",
      "nonManifoldEdges",
      "windingConflicts",
      "degenerate",
      "normalErrors",
      "inwardNormals",
    ])
      assert.equal(report[k], 0, k);
    assert.equal(sources.length, render.positions.length / 3);
    if (!level) assert.equal(sources.length, 24);
  }
  assert.deepEqual(g, before);
});

test("crease semantics cross UV seams while UV/color slots stay separate", () => {
  const g = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    indices: [0, 1, 2, 3, 4, 5],
    uv: [0, 0, 1, 0, 0, 1, 2, 0, 3, 0, 2, 1],
    colors: Array.from({ length: 18 }, (_, i) => (i % 3 === 0 ? 1 : 0.2)),
    creases: [[0, 1]],
  };
  assert.equal(expandedCreases(g).length, 2);
  const unmarked = structuredClone(g);
  delete unmarked.creases;
  const marked = editMeshGeometry(unmarked, {
    action: "setCreases",
    selection: { mode: "edge", ids: [0] },
    enabled: true,
  });
  assert.equal(marked.creases.length, 2);
  assert.deepEqual(
    editMeshGeometry(g, {
      action: "setCreases",
      selection: { mode: "edge", ids: [0] },
      enabled: true,
    }),
    g,
  );
  const split = subdivideMeshGeometry(marked, 2),
    shaded = creaseNormalGeometry(split);
  assert.deepEqual(split.uv.slice(0, 12), g.uv);
  assert.equal(physicalCreases(split).size, 4);
  for (let i = 0; i < shaded.sources.length; i++) {
    const id = shaded.sources[i];
    assert.deepEqual(
      shaded.geometry.uv.slice(i * 2, i * 2 + 2),
      split.uv.slice(id * 2, id * 2 + 2),
    );
    assert.deepEqual(
      shaded.geometry.colors.slice(i * 3, i * 3 + 3),
      split.colors.slice(id * 3, id * 3 + 3),
    );
  }
  const normals = creaseNormalGeometry(g).geometry.normals;
  assert.deepEqual(normals.slice(0, 3), [0, 0, 1]);
  assert.deepEqual(normals.slice(9, 12), [0, 1, 0]);
  const survivingChart = editMeshGeometry(g, {
    action: "deleteFaces",
    selection: { mode: "face", ids: [0] },
  });
  assert.deepEqual(survivingChart.creases, [[3, 4]]);
  const cleared = editMeshGeometry(g, {
    action: "setCreases",
    selection: { mode: "edge", ids: [0] },
    enabled: false,
  });
  assert.equal(cleared.creases, undefined);
});

test("split, merge, extrusion, deletion and mirror preserve surviving crease identity; touching bevels reject", () => {
  const g = hardBox(),
    edge = meshTopology(g).edges.findIndex(([a, b]) => a === 0 && b === 3);
  const split = editMeshGeometry(g, {
    action: "splitEdges",
    selection: { mode: "edge", ids: [edge] },
    fraction: 0.4,
  });
  assert.equal(split.creases.length, 13);
  const merged = editMeshGeometry(split, {
    action: "mergeVertices",
    selection: { mode: "vertex", ids: [0, 8] },
    target: 0,
  });
  assert.equal(merged.creases.length, 12);
  validateMeshGeometry(merged);
  const extruded = editMeshGeometry(g, {
    action: "extrude",
    selection: { mode: "face", ids: [8, 9] },
    delta: [0.2, 0, 0],
  });
  assert.equal(extruded.creases.length, 16);
  validateMeshGeometry(extruded);
  const deleted = editMeshGeometry(g, {
    action: "deleteFaces",
    selection: { mode: "face", ids: [0, 1, 2, 3, 4, 5, 6, 7, 10, 11] },
  });
  assert.equal(deleted.creases.length, 4);
  validateMeshGeometry(deleted);
  assert.throws(
    () => editMeshGeometry(g, { action: "bevelVertex", vertex: 6, width: 0.1 }),
    /Clear creases/,
  );
  const clear = editMeshGeometry(g, { action: "clearCreases" });
  assert.ok(
    editMeshGeometry(clear, { action: "bevelVertex", vertex: 6, width: 0.1 })
      .positions.length > g.positions.length,
  );
  const half = {
    ...halfBox(),
    smooth: true,
    creases: [
      [1, 2],
      [2, 6],
      [6, 5],
      [5, 1],
    ],
  };
  for (const modifiers of [
    [{ type: "mirror" }, { type: "subdivision", levels: 2 }],
    [{ type: "subdivision", levels: 2 }, { type: "mirror" }],
  ]) {
    const e = evaluateMeshGeometry({ type: "mesh", geometry: half, modifiers }),
      shaded = creaseNormalGeometry(e).geometry;
    assert.equal(e.creases.length, 32);
    assert.equal(auditMesh(shaded).mirrorMatch, 1);
    assert.equal(auditMesh(shaded).boundaryEdges, 0);
  }
});

test("baking keeps source landmark prefix and crease tags; render-only splits copy actual skin weights", () => {
  const d = source(hardBox());
  d.review = {
    version: 1,
    landmarks: { corner: { node: "study", vertex: 6 } },
    measurements: [],
    symmetry: [],
  };
  const live = applyCommands(d, [
    {
      op: "setModifiers",
      id: "study",
      modifiers: [{ type: "subdivision", levels: 2 }],
    },
  ]);
  const baked = applyCommands(live, [{ op: "bakeModifiers", id: "study" }]);
  assert.equal(baked.nodes[0].geometry.creases.length, 48);
  assert.deepEqual(
    auditMeasurements(baked).landmarks,
    auditMeasurements(live).landmarks,
  );
  const rig = source(hardBox());
  rig.nodes.push(
    makeNode("bone", { id: "root", position: [0, 0, 0] }),
    makeNode("bone", { id: "child", parent: "root", position: [0, 1, 0] }),
  );
  const bound = applyCommands(rig, [
    {
      op: "bindSkin",
      id: "study",
      joints: ["root", "child"],
      indices: Array.from({ length: 8 }, () => [0, 1, 0, 0]).flat(),
      weights: Array.from({ length: 8 }, (_, i) => [
        i / 7,
        1 - i / 7,
        0,
        0,
      ]).flat(),
    },
  ]);
  const n = bound.nodes[0],
    { sources } = creaseNormalGeometry(n.geometry),
    buffer = geometryFor(n);
  assert.equal(buffer.attributes.skinWeight.count, 24);
  for (let i = 0; i < sources.length; i++)
    for (let j = 0; j < 4; j++)
      assert.equal(
        buffer.attributes.skinWeight.array[i * 4 + j],
        Math.fround(n.skin.weights[sources[i] * 4 + j]),
      );
  buffer.dispose();
});
