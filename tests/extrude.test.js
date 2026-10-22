import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { validateOutline, DEFAULT_OUTLINE } from "../src/polygon.js";
import { emptyDocument, applyCommands } from "../src/document.js";
import { geometryFor } from "../src/scene.js";

test("simple convex and concave outlines triangulate with the specified depth", () => {
  for (const outline of [
    DEFAULT_OUTLINE,
    [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ],
    [...DEFAULT_OUTLINE].reverse(),
  ]) {
    validateOutline(outline);
    const node = applyCommands(emptyDocument(), [
      { op: "create", type: "extrude", geometry: { outline, depth: 0.3 } },
    ]).nodes[0];
    const geo = geometryFor(node);
    geo.computeBoundingBox();
    assert.ok(Math.abs(geo.boundingBox.min.z + 0.15) < 1e-6);
    assert.ok(Math.abs(geo.boundingBox.max.z - 0.15) < 1e-6);
    assert.ok(geo.attributes.position.count > 12);
    for (const v of geo.attributes.position.array)
      assert.ok(Number.isFinite(v));
    for (let i = 0; i < geo.attributes.normal.count; i++)
      assert.ok(
        Math.abs(
          new THREE.Vector3()
            .fromBufferAttribute(geo.attributes.normal, i)
            .length() - 1,
        ) < 1e-5,
      );
    geo.dispose();
  }
});
test("crossed, overlapping, degenerate and non-finite outlines are rejected before scene changes", () => {
  const doc = emptyDocument();
  for (const outline of [
    [
      [0, 0],
      [1, 1],
      [0, 1],
      [1, 0],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [1, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [1, Infinity],
      [1, 1],
    ],
  ]) {
    assert.throws(() =>
      applyCommands(doc, [
        { op: "create", type: "extrude", geometry: { outline } },
      ]),
    );
    assert.equal(doc.nodes.length, 0);
  }
});
