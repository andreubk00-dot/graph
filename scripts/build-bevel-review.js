// Technical fixture and actual GLB round-trip; no browser or subprocess required.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { emptyDocument, makeNode, applyCommands } from "../src/document.js";
import { meshTopology } from "../src/mesh-edit.js";
import { createGLB, geometryFor, disposeScene } from "../src/scene.js";
import { auditMesh } from "../src/mesh-audit.js";
import { closedBox } from "../tests/fixtures/mesh-study.js";

if (!globalThis.FileReader) globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.();
    }, error => this.onerror?.(error));
  }
};

const out = resolve(process.argv[2] ?? "/tmp/graph-bevel-review");
await mkdir(out, { recursive: true });
const source = emptyDocument();
source.name = "Rounded edge · technical study";
source.nodes = [makeNode("mesh", {
  id: "study", position: [0, 0, 0], color: "#a5d7ce", geometry: closedBox(),
})];
source.review = {
  version: 1, landmarks: { tip: { node: "study", vertex: 1 } },
  measurements: [], symmetry: [],
};
const edge = meshTopology(source.nodes[0].geometry).edges.findIndex(
  ([a, b]) => a === 1 && b === 2,
);
assert.ok(edge >= 0);
const commands = [{
  op: "meshEdit", id: "study", action: "bevelEdge",
  selection: { mode: "edge", ids: [edge] }, width: 0.2, segments: 8,
  landmarkPolicy: "remap",
}];
const before = JSON.stringify(source), result = applyCommands(source, commands);
assert.equal(JSON.stringify(source), before);
const snapshot = JSON.stringify(result);
const bytes = await createGLB(result);
const loaded = await new GLTFLoader().parseAsync(bytes, "");
const expected = geometryFor(result.nodes[0]);
const serialize = g => ({
  positions: Array.from(g.attributes.position.array),
  normals: Array.from(g.attributes.normal.array),
  indices: Array.from(g.index.array),
});
try {
  const meshes = [];
  loaded.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 1);
  assert.deepEqual(serialize(meshes[0].geometry), serialize(expected));
  assert.equal(JSON.stringify(result), snapshot);
  const report = auditMesh(serialize(meshes[0].geometry));
  assert.equal(report.triangles, 72);
  assert.equal(report.components, 1);
  for (const key of ["boundaryEdges", "nonManifoldEdges", "windingConflicts", "degenerate", "normalErrors", "inwardNormals"])
    assert.equal(report[key], 0, key);
  assert.ok(result.nodes[0].geometry.indices.includes(result.review.landmarks.tip.vertex));
  for (const [name, data] of Object.entries({
    "source.graph.json": source, "commands.json": commands,
    "study.graph.json": result, "roundtrip.json": {
      exactPositionsNormalsIndices: true, sourceUnchanged: true,
      remappedLandmark: result.review.landmarks.tip.vertex, audit: report,
    },
  })) await writeFile(`${out}/${name}`, JSON.stringify(data, null, 2) + "\n");
  await writeFile(`${out}/study.glb`, new Uint8Array(bytes));
  console.log(JSON.stringify({ out, bytes: bytes.byteLength, triangles: report.triangles, exactRoundTrip: true }));
} finally {
  expected.dispose();
  disposeScene(loaded.scene);
}
