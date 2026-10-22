import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { emptyDocument, applyCommands } from "../src/document.js";
import { geometryFor, buildContent, disposeScene } from "../src/scene.js";

test("rounded boxes preserve unit bounds and have valid normals", () => {
  const node = applyCommands(emptyDocument(), [
    { op: "create", type: "box", geometry: { bevel: 0.1, bevelSegments: 3 } },
  ]).nodes[0];
  const geometry = geometryFor(node);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  for (const s of size.toArray()) assert.ok(Math.abs(s - 1) < 0.00001);
  const normals = geometry.attributes.normal;
  for (let i = 0; i < normals.count; i++) {
    const length = new THREE.Vector3().fromBufferAttribute(normals, i).length();
    assert.ok(Number.isFinite(length) && Math.abs(length - 1) < 0.0001);
  }
  assert.ok(geometry.attributes.position.count > 24);
  geometry.dispose();
});

test("lathe profiles and capsule dimensions produce finite exportable geometry", () => {
  const doc = applyCommands(emptyDocument(), [
    {
      op: "create",
      type: "lathe",
      geometry: {
        segments: 24,
        profile: [
          [0, -1],
          [0.6, -1],
          [0.3, 0.8],
          [0, 1],
        ],
      },
    },
    { op: "create", type: "capsule" },
  ]);
  for (const n of doc.nodes) {
    const geometry = geometryFor(n);
    geometry.computeBoundingBox();
    for (const v of geometry.attributes.position.array)
      assert.ok(Number.isFinite(v));
    assert.ok(geometry.index.count > 0);
    for (let i = 0; i < geometry.attributes.normal.count; i++)
      assert.ok(
        Math.abs(
          new THREE.Vector3()
            .fromBufferAttribute(geometry.attributes.normal, i)
            .length() - 1,
        ) < 0.0001,
      );
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.y > 0.99);
    geometry.dispose();
  }
  const root = new THREE.Group(),
    map = new Map();
  buildContent(root, doc, map);
  for (const object of map.values()) {
    assert.equal(object.material.flatShading, false);
    assert.ok(object.geometry.attributes.uv);
  }
  disposeScene(root);
});

test("flat export bakes exact face normals and expands UV, color and skin attributes without changing source IDs", async () => {
  const { flatExportGeometry } = await import("../src/mesh-export.js");
  const source = geometryFor({
    type: "mesh",
    geometry: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
      indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
      uv: [0, 0, 1, 0, 0, 1, 1, 1],
      colors: [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1],
    },
  });
  source.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(
      [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
      4,
    ),
  );
  source.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(
      [0.75, 0.25, 0, 0, 1, 0, 0, 0, 0.4, 0.6, 0, 0, 1, 0, 0, 0],
      4,
    ),
  );
  const indices = Array.from(source.index.array),
    original = Array.from(source.attributes.position.array),
    result = flatExportGeometry(source);
  assert.notEqual(result, source);
  assert.equal(result.index, null);
  assert.equal(result.attributes.position.count, 12);
  assert.deepEqual(Array.from(source.attributes.position.array), original);
  assert.deepEqual(Array.from(source.index.array), indices);
  for (const name of ["position", "uv", "color", "skinIndex", "skinWeight"]) {
    const attribute = source.attributes[name],
      expected = indices.flatMap((i) =>
        Array.from(
          attribute.array.slice(
            i * attribute.itemSize,
            (i + 1) * attribute.itemSize,
          ),
        ),
      );
    assert.deepEqual(Array.from(result.attributes[name].array), expected);
    assert.equal(
      result.attributes[name].array.constructor,
      attribute.array.constructor,
    );
  }
  for (let i = 0; i < 12; i += 3) {
    const p = (j) =>
        new THREE.Vector3().fromBufferAttribute(result.attributes.position, j),
      a = p(i),
      cross = p(i + 1)
        .sub(a)
        .cross(p(i + 2).sub(a))
        .normalize();
    for (let j = 0; j < 3; j++)
      assert.ok(
        cross.dot(
          new THREE.Vector3().fromBufferAttribute(
            result.attributes.normal,
            i + j,
          ),
        ) >
          1 - 1e-6,
      );
  }
  source.dispose();
  result.dispose();
});
test("flat export keeps existing hard-edge geometry and removes zero-area primitive tip triangles", async () => {
  const { flatExportGeometry } = await import("../src/mesh-export.js"),
    { validateMeshGeometry } = await import("../src/mesh-geometry.js");
  const box = geometryFor({ type: "box", geometry: {} });
  assert.equal(flatExportGeometry(box), box);
  box.dispose();
  const lathe = geometryFor({
      type: "lathe",
      geometry: {
        segments: 8,
        profile: [
          [0, -0.5],
          [0.5, 0],
          [0, 0.5],
        ],
      },
    }),
    baked = flatExportGeometry(lathe);
  assert.notEqual(baked, lathe);
  assert.equal(baked.index, null);
  assert.ok(baked.attributes.position.count < lathe.index.count);
  validateMeshGeometry({
    positions: Array.from(baked.attributes.position.array),
    normals: Array.from(baked.attributes.normal.array),
  });
  lathe.dispose();
  baked.dispose();
});
