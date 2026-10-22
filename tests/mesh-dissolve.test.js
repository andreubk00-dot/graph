import test from "node:test";
import assert from "node:assert/strict";
import { editMeshGeometry, applyMeshEdit } from "../src/mesh-edit.js";
import { emptyDocument, makeNode, applyCommands } from "../src/document.js";
import { auditMesh } from "../src/mesh-audit.js";
import { closedBox } from "./fixtures/mesh-study.js";
import { createGLB, geometryFor, disposeScene } from "../src/scene.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

if (!globalThis.FileReader) globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.();
    }, error => this.onerror?.(error));
  }
};

export function planarFan(count = 6) {
  const positions = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const angle = 2 * Math.PI * i / count;
    positions.push(Math.cos(angle), Math.sin(angle), 0);
  }
  const indices = [];
  for (let i = 0; i < count; i++) indices.push(0, i + 1, (i + 1) % count + 1);
  return {
    positions, indices, smooth: true,
    uv: positions.flatMap((_, i) => i % 3 ? [] : [positions[i] / 4 + 0.5, positions[i + 1] / 4 + 0.5]),
    colors: positions.flatMap((_, i) => i % 3 ? [] : [positions[i] / 4 + 0.5, positions[i + 1] / 4 + 0.5, 0.3]),
    normals: positions.map((_, i) => i % 3 === 2 ? 1 : 0),
  };
}
const command = (extra = {}) => ({ action: "dissolveVertex", selection: { mode: "vertex", ids: [0] }, ...extra });
const area = g => {
  let sum = 0;
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = g.indices.slice(i, i + 3).map(id => g.positions.slice(id*3, id*3+3));
    const u = b.map((x,k) => x-a[k]), v = c.map((x,k) => x-a[k]);
    sum += Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])/2;
  }
  return sum;
};

test("planar interior dissolve reduces two triangles without moving vertices or changing affine attributes", () => {
  for (const n of [3, 4, 6, 12, 64]) {
    const source = planarFan(n), before = structuredClone(source);
    const result = editMeshGeometry(source, command());
    assert.equal(result.indices.length / 3, n - 2);
    assert.ok(!result.indices.includes(0));
    for (const name of ["positions", "uv", "colors", "normals"]) assert.deepEqual(result[name], source[name]);
    assert.ok(Math.abs(area(result) - area(source)) < 1e-6);
    const report = auditMesh(result);
    assert.equal(report.boundaryEdges, n);
    for (const key of ["degenerate", "nonManifoldEdges", "windingConflicts", "normalErrors", "inwardNormals"])
      assert.equal(report[key], 0, key);
    assert.deepEqual(source, before);
  }
});

test("dissolve works in an oblique plane and preserves computed source smooth normals", () => {
  const g = planarFan();
  delete g.normals;
  for (let i = 0; i < g.positions.length; i += 3) {
    const [x, y] = g.positions.slice(i, i + 2);
    g.positions.splice(i, 3, 4 + x, -2 + y * 0.6, 8 + y * 0.8);
  }
  const result = editMeshGeometry(g, command());
  assert.ok(Math.abs(area(result) - area(g)) < 1e-6);
  for (let i = 0; i < result.normals.length; i += 3) {
    assert.ok(Math.abs(result.normals[i]) < 1e-6);
    assert.ok(Math.abs(result.normals[i + 1] + 0.8) < 1e-6);
    assert.ok(Math.abs(result.normals[i + 2] - 0.6) < 1e-6);
  }
});

test("closed technical solid keeps its surface and boundary crease tags", () => {
  const g = closedBox();
  g.positions.push(0.5, 0.5, 0);
  g.indices.splice(0, 6, 8,0,3, 8,3,2, 8,2,1, 8,1,0);
  g.creases = [[0,3]];
  const result = editMeshGeometry(g, command({ selection: { mode: "vertex", ids: [8] } }));
  assert.equal(result.indices.length/3, 12);
  assert.deepEqual(result.creases, [[0,3]]);
  const report = auditMesh(result);
  assert.equal(report.components, 1);
  for (const key of ["boundaryEdges", "nonManifoldEdges", "windingConflicts", "degenerate"])
    assert.equal(report[key], 0, key);
  assert.ok(Math.abs(area(result) - 6) < 1e-6);
});

test("non-affine UV, color and normal fields reject atomically, including boundary-only differences", () => {
  for (const [name, index] of [["uv", 0], ["uv", 6], ["colors", 0], ["colors", 9], ["normals", 0]]) {
    const g = planarFan();
    g[name][index] += 0.1;
    const before = structuredClone(g);
    let published = false;
    assert.throws(() => editMeshGeometry(g, command(), { onRemap: () => published = true }), /not affine/);
    assert.deepEqual(g, before);
    assert.equal(published, false);
  }
});

test("open, disconnected, nonplanar, concave and seam fans fail without guessing a repair", () => {
  const invalid = [];
  const open = planarFan(); open.indices.splice(0,3); invalid.push(open);
  const disconnected = planarFan(); disconnected.indices.push(0,1,2); invalid.push(disconnected);
  const nonplanar = planarFan(); nonplanar.positions[5] = 0.1; invalid.push(nonplanar);
  const concave = planarFan(); concave.positions[3] = 0.1; invalid.push(concave);
  const seam = planarFan();
  for (const [name,size] of [["positions",3],["normals",3],["uv",2],["colors",3]])
    seam[name].push(...seam[name].slice(0,size));
  seam.indices[0] = 7; invalid.push(seam);
  for (const g of invalid) {
    const before = structuredClone(g);
    assert.throws(() => editMeshGeometry(g, command()));
    assert.deepEqual(g, before);
  }
  const g = planarFan(); g.smooth = false; g.creases = [[0,1]];
  assert.throws(() => editMeshGeometry(g, command()), /clear creases/);
  for (const ids of [[], [0,1], [-1], [1], [100], [0.5]])
    assert.throws(() => editMeshGeometry(planarFan(), command({ selection: { mode: "vertex", ids } })));
});

test("dissolve remaps affected landmarks only on explicit request and blocks bound skins", () => {
  const d = emptyDocument();
  d.nodes = [makeNode("mesh", { id: "study", geometry: planarFan() })];
  d.review = { version: 1, landmarks: { center: { node: "study", vertex: 0 }, corner: { node: "study", vertex: 2 } }, measurements: [], symmetry: [] };
  const edit = { op: "meshEdit", id: "study", ...command() };
  const before = structuredClone(d);
  assert.throws(() => applyCommands(d, [edit]), /landmark/);
  assert.deepEqual(d, before);
  const result = applyCommands(d, [{ ...edit, landmarkPolicy: "remap" }]);
  assert.ok(result.nodes[0].geometry.indices.includes(result.review.landmarks.center.vertex));
  assert.equal(result.review.landmarks.corner.vertex, 2);
  assert.deepEqual(d, before);
  assert.throws(() => editMeshGeometry(planarFan(), command({ landmarkPolicy: "guess" })), /landmark policy/);
  assert.throws(() => applyMeshEdit({ type: "mesh", skin: {}, geometry: planarFan() }, command(), d), /Unbind skin/);
  const smoothCrease = planarFan(); smoothCrease.creases = [[1,2]];
  assert.throws(() => editMeshGeometry(smoothCrease, command()), /fan normals are topology-dependent/);
  const live = structuredClone(d);
  live.nodes[0].modifiers = [{ type: "subdivision", levels: 1 }];
  assert.throws(() => applyCommands(live, [{ ...edit, landmarkPolicy: "remap" }]), /disable subdivision/);
  live.nodes[0].modifiers[0].enabled = false;
  assert.equal(applyCommands(live, [{ ...edit, landmarkPolicy: "remap" }]).nodes[0].geometry.indices.length, 12);
});

test("replacement cannot reuse a diagonal already present outside the patch", () => {
  const g = planarFan(4);
  g.indices.push(1,3,2, 1,4,3);
  const before = structuredClone(g);
  assert.throws(() => editMeshGeometry(g, command()), /diagonal already exists/);
  assert.deepEqual(g, before);
});

test("dissolved surface attributes survive a real GLB round-trip without changing source", async () => {
  const source = emptyDocument();
  source.nodes = [makeNode("mesh", { id: "study", geometry: planarFan() })];
  const result = applyCommands(source, [{ op: "meshEdit", id: "study", ...command() }]);
  const before = JSON.stringify(result), expected = geometryFor(result.nodes[0]);
  const loaded = await new GLTFLoader().parseAsync(await createGLB(result), "");
  try {
    const meshes = [];
    loaded.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    assert.equal(meshes.length, 1);
    const actual = meshes[0].geometry;
    for (const name of ["position", "normal", "uv", "color"])
      assert.deepEqual(Array.from(actual.attributes[name].array), Array.from(expected.attributes[name].array));
    assert.deepEqual(Array.from(actual.index.array), Array.from(expected.index.array));
    assert.equal(actual.index.count/3, 4);
    assert.equal(JSON.stringify(result), before);
    assert.equal(source.nodes[0].geometry.indices.length/3, 6);
  } finally {
    expected.dispose();
    disposeScene(loaded.scene);
  }
});
