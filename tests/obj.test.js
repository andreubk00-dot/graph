import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { importOBJ } from "../src/obj-import.js";
import {
  applyCommands,
  emptyDocument,
  validateDocument,
} from "../src/document.js";
import { geometryFor } from "../src/scene.js";
const quad = `o Panel\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nvn 0 0 2\nf -4/1/1 -3/2/1 -2/3/1 -1/4/1`;
test("OBJ negative indices, UV and explicit normals survive JSON round trip", () => {
  const { document, warnings } = importOBJ(quad, { name: "Panel" }),
    node = document.nodes[1];
  assert.equal(node.type, "mesh");
  assert.equal(node.geometry.positions.length, 12);
  assert.equal(node.geometry.indices.length, 6);
  assert.equal(node.geometry.uv.length, 8);
  assert.deepEqual(node.geometry.normals.slice(0, 3), [0, 0, 1]);
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    validateDocument(JSON.parse(JSON.stringify(document))),
    document,
  );
  const geometry = geometryFor(node);
  assert.equal(geometry.attributes.uv.count, 4);
  geometry.dispose();
});
test("concave OBJ n-gons triangulate to the original area with preserved winding", () => {
  const text =
    "v 0 0 0\nv 2 0 0\nv 2 1 0\nv 1 1 0\nv 1 2 0\nv 0 2 0\nf 1 2 3 4 5 6";
  for (const input of [text, text.replace("f 1 2 3 4 5 6", "f 6 5 4 3 2 1")]) {
    const node = importOBJ(input).document.nodes[1],
      g = geometryFor(node);
    let area = 0;
    for (let i = 0; i < g.index.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) =>
        new Vector3().fromBufferAttribute(
          g.attributes.position,
          g.index.getX(i + k),
        ),
      );
      area += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    assert.ok(Math.abs(area - 3) < 1e-6);
    assert.equal(g.index.count, 12);
    const z = g.attributes.normal.getZ(0);
    assert.equal(Math.sign(z), input === text ? 1 : -1);
    g.dispose();
  }
});
test("OBJ separates parts/material slots and never resolves external files", () => {
  const { document, warnings } = importOBJ(
    "mtllib ../../private.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\no Part A\nusemtl red\nf 1 2 3\no Part B\nusemtl blue\nf 1 3 4",
  );
  assert.equal(document.nodes.length, 3);
  assert.match(document.nodes[1].name, /Part A/);
  assert.match(document.nodes[2].name, /blue/);
  assert.ok(warnings.some((w) => w.includes("not loaded")));
});
test("malformed indices, crossed polygons, non-planar faces and invalid buffers fail", () => {
  for (const input of [
    quad.replace("f -4/1/1 -3/2/1 -2/3/1 -1/4/1", "f 0 2 3"),
    quad.replace("f -4/1/1 -3/2/1 -2/3/1 -1/4/1", "f 1 3 2 4"),
    quad.replace("v 1 1 0", "v 1 1 .5"),
    "v 0 0 0\np 1",
  ])
    assert.throws(() => importOBJ(input));
  assert.throws(
    () =>
      applyCommands(emptyDocument(), [
        {
          op: "create",
          type: "mesh",
          geometry: {
            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            indices: [0, 1, 3],
          },
        },
      ]),
    /index/,
  );
  assert.throws(
    () =>
      applyCommands(emptyDocument(), [
        {
          op: "create",
          type: "mesh",
          geometry: { positions: [0, 0, 0, 1, 0, 0, 2, 0, 0] },
        },
      ]),
    /degenerate/,
  );
});
test("OBJ smoothing groups control vertex sharing and homogeneous positions are supported", () => {
  const text =
    "v 0 0 0 2\nv 2 0 0 2\nv 0 2 0 2\nv 0 0 2 2\ns 1\nf 1 2 3\nf 1 3 4";
  const smooth = importOBJ(text).document.nodes[1],
    flat = importOBJ(text.replace("s 1", "s off")).document.nodes[1];
  assert.equal(smooth.geometry.positions.length, 12);
  assert.equal(flat.geometry.positions.length, 18);
  assert.equal(Math.max(...smooth.geometry.positions), 1);
});

test("partial attributes are reported and missing normals preserve flat-face boundaries", () => {
  const { document, warnings } = importOBJ(
    "v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\ns off\nf 1/1/1 2/2/1 3/3/1\nf 1 3 4",
  );
  const mesh = document.nodes[1],
    g = geometryFor(mesh);
  assert.equal(mesh.geometry.uv, undefined);
  assert.ok(warnings.some((w) => w.includes("Incomplete UV")));
  assert.equal(g.attributes.position.count, 6);
  for (let i = 0; i < 3; i++) assert.equal(g.attributes.normal.getZ(i), 1);
  for (let i = 3; i < 6; i++) assert.equal(g.attributes.normal.getX(i), 1);
  g.dispose();
});

test("generated smooth normals stay continuous across UV and material seams", () => {
  const base =
    "v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nvt 0 0\nvt 1 0\nvt 0 1\nvt 1 1\ns 1\n";
  for (const faces of [
    "f 1/1 2/2 3/3\nf 1/4 3/2 4/1",
    "usemtl left\nf 1 2 3\nusemtl right\nf 1 3 4",
  ]) {
    const doc = importOBJ(base + faces).document;
    for (const mesh of doc.nodes.filter((n) => n.type === "mesh"))
      for (let i = 0; i < mesh.geometry.positions.length; i += 3) {
        if (mesh.geometry.positions.slice(i, i + 3).every((v) => v === 0)) {
          assert.ok(Math.abs(mesh.geometry.normals[i] - Math.SQRT1_2) < 1e-6);
          assert.ok(
            Math.abs(mesh.geometry.normals[i + 2] - Math.SQRT1_2) < 1e-6,
          );
        }
      }
  }
});
