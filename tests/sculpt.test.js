import test from "node:test";
import assert from "node:assert/strict";
import { sculptGeometry, compileField, DEFAULT_SCULPT } from "../src/sculpt.js";
import {
  applyCommands,
  emptyDocument,
  validateDocument,
} from "../src/document.js";
import { geometryFor, buildContent, disposeScene } from "../src/scene.js";
import * as THREE from "three";
function components(g) {
  const seen = new Set(),
    adj = Array.from({ length: g.positions.length / 3 }, () => []);
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = g.indices.slice(i, i + 3);
    adj[a].push(b, c);
    adj[b].push(a, c);
    adj[c].push(a, b);
  }
  let count = 0;
  for (let i = 0; i < adj.length; i++)
    if (adj[i].length && !seen.has(i)) {
      count++;
      const stack = [i];
      seen.add(i);
      while (stack.length)
        for (const j of adj[stack.pop()])
          if (!seen.has(j)) {
            seen.add(j);
            stack.push(j);
          }
    }
  return count;
}
test("implicit sculpt is one welded, closed surface with outward unit normals and linear colors", () => {
  const r = {
      version: 1,
      resolution: 24,
      bounds: [
        [-1.5, -1.5, -1.5],
        [1.5, 1.5, 1.5],
      ],
      parts: [
        {
          shape: "ellipsoid",
          center: [0, 0, 0],
          radius: [1, 1, 1],
          color: "#ff8000",
        },
      ],
    },
    g = sculptGeometry(r);
  assert.equal(components(g), 1);
  const edges = new Map();
  let volume = 0;
  for (let i = 0; i < g.indices.length; i += 3) {
    const ids = g.indices.slice(i, i + 3);
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3],
        key = [Math.min(a, b), Math.max(a, b)].join(":");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    const [a, b, c] = ids.map((i) => g.positions.slice(i * 3, i * 3 + 3));
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  assert.ok([...edges.values()].every((n) => n === 2));
  assert.ok(Math.abs(volume / ((4 * Math.PI) / 3) - 1) < 0.03);
  for (let i = 0; i < g.normals.length; i += 3) {
    assert.ok(Math.abs(Math.hypot(...g.normals.slice(i, i + 3)) - 1) < 1e-6);
    assert.ok(
      g.positions
        .slice(i, i + 3)
        .reduce((s, v, j) => s + v * g.normals[i + j], 0) > 0.9,
    );
  }
  assert.equal(g.colors[0], 1);
  assert.ok(g.colors[1] > 0.21 && g.colors[1] < 0.22);
  assert.equal(g.colors[2], 0);
});
test("smooth union merges volumes and subtract removes material instead of covering it", () => {
  const g = sculptGeometry(DEFAULT_SCULPT);
  assert.equal(components(g), 1);
  const f = compileField(DEFAULT_SCULPT);
  assert.ok(f.sample(-0.23, 0.77, 0.46).distance > 0);
  assert.ok(f.sample(0, 0, 0).distance < 0);
  const doc = applyCommands(emptyDocument(), [
    { op: "sculpt", id: "body", recipe: DEFAULT_SCULPT },
  ]);
  assert.equal(doc.nodes.length, 1);
  assert.equal(doc.nodes[0].type, "mesh");
  assert.ok(doc.nodes[0].sculpt);
  const root = new THREE.Group(),
    map = new Map();
  buildContent(root, doc, map);
  assert.ok(map.get("body").material.vertexColors);
  assert.ok(map.get("body").geometry.attributes.color);
  disposeScene(root);
  const changed = structuredClone(DEFAULT_SCULPT);
  changed.parts[0].radius[0] = 0.8;
  const next = applyCommands(doc, [
    { op: "sculpt", id: "body", recipe: changed },
  ]);
  assert.notDeepEqual(
    next.nodes[0].geometry.positions,
    doc.nodes[0].geometry.positions,
  );
  const before = structuredClone(doc);
  assert.throws(() =>
    applyCommands(doc, [
      { op: "sculpt", id: "body", recipe: { ...changed, resolution: 1000 } },
    ]),
  );
  assert.deepEqual(doc, before);
});
test("field bounds, malformed sources and vertex colors are rejected before scene changes", () => {
  for (const recipe of [
    { ...DEFAULT_SCULPT, resolution: 11 },
    { ...DEFAULT_SCULPT, parts: [] },
    {
      ...DEFAULT_SCULPT,
      bounds: [
        [0, 0, 0],
        [1, 1, 1],
      ],
    },
    {
      ...DEFAULT_SCULPT,
      parts: [
        {
          shape: "capsule",
          a: [0, 0, 0],
          b: [1, 0, 0],
          radius: 1,
          endRadius: -1,
        },
      ],
    },
  ])
    assert.throws(() => sculptGeometry(recipe));
  const doc = applyCommands(emptyDocument(), [
    { op: "sculpt", id: "body", recipe: DEFAULT_SCULPT },
  ]);
  const bad = structuredClone(doc);
  bad.nodes[0].geometry.colors[0] = 2;
  assert.throws(() => validateDocument(bad));
  const geometry = geometryFor(doc.nodes[0]);
  assert.equal(
    geometry.attributes.color.count,
    geometry.attributes.position.count,
  );
  geometry.dispose();
});

test("surface cleanup drops whole isolated components and retains a closed main surface", () => {
  const recipe = {
    version: 1,
    resolution: 32,
    bounds: [
      [-2, -1, -1],
      [2, 1, 1],
    ],
    parts: [
      {
        shape: "ellipsoid",
        center: [-0.8, 0, 0],
        radius: [0.5, 0.5, 0.5],
        smooth: 0,
      },
      {
        shape: "ellipsoid",
        center: [0.8, 0, 0],
        radius: [0.25, 0.25, 0.25],
        smooth: 0,
      },
    ],
  };
  assert.equal(components(sculptGeometry(recipe)), 2);
  const g = sculptGeometry({ ...recipe, keepLargestSurface: true });
  assert.equal(components(g), 1);
  assert.ok(Math.max(...g.positions.filter((_, i) => i % 3 === 0)) < 0);
  assert.throws(() => sculptGeometry({ ...recipe, keepLargestSurface: "yes" }));
});
