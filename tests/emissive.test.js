import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  emptyDocument,
  applyCommands,
  validateDocument,
} from "../src/document.js";
import { buildContent, disposeScene, createGLB } from "../src/scene.js";
// Match the CLI's browser-independent binary export environment.
if (!globalThis.FileReader)
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        (result) => {
          this.result = result;
          this.onloadend?.();
        },
        (error) => this.onerror?.(error),
      );
    }
  };
test("emissive materials survive commands, the viewport and GLB with physical intensity", async () => {
  const doc = applyCommands(emptyDocument(), [
    { op: "create", type: "sphere", id: "ember" },
    { op: "update", id: "ember", emissive: "#ff4000", emissiveIntensity: 3.5 },
  ]);
  const root = new THREE.Group(),
    map = new Map();
  buildContent(root, doc, map);
  assert.equal(map.get("ember").material.emissive.getHexString(), "ff4000");
  assert.equal(map.get("ember").material.emissiveIntensity, 3.5);
  disposeScene(root);
  const data = new Uint8Array(await createGLB(doc));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const gltf = JSON.parse(
    new TextDecoder().decode(data.slice(20, 20 + view.getUint32(12, true))),
  );
  const mat = gltf.materials[0];
  assert.ok(mat.emissiveFactor[0] > 0.99);
  assert.equal(mat.emissiveFactor[2], 0);
  assert.equal(
    mat.extensions.KHR_materials_emissive_strength.emissiveStrength,
    3.5,
  );
});
test("legacy materials default to zero emission and invalid edits remain atomic", () => {
  const legacy = applyCommands(emptyDocument(), [
    { op: "create", type: "box", id: "box" },
  ]);
  delete legacy.nodes[0].emissive;
  delete legacy.nodes[0].emissiveIntensity;
  const normalized = validateDocument(legacy);
  assert.equal(normalized.nodes[0].emissive, "#000000");
  assert.equal(normalized.nodes[0].emissiveIntensity, 0);
  assert.equal(legacy.nodes[0].emissive, undefined);
  for (const patch of [
    { emissive: "red" },
    { emissive: null },
    { emissiveIntensity: -1 },
    { emissiveIntensity: 21 },
    { emissiveIntensity: NaN },
    { emissiveIntensity: null },
  ]) {
    assert.throws(() =>
      applyCommands(normalized, [{ op: "update", id: "box", ...patch }]),
    );
    assert.equal(normalized.nodes[0].emissiveIntensity, 0);
  }
});

test("GLB omits an ineffective emissive strength extension on a black emitter without changing the source", async () => {
  const d = applyCommands(emptyDocument(), [
      {
        op: "create",
        id: "unlit-emission",
        type: "box",
        emissive: "#000000",
        emissiveIntensity: 0,
      },
    ]),
    before = structuredClone(d),
    bytes = new Uint8Array(await createGLB(d)),
    view = new DataView(bytes.buffer),
    json = JSON.parse(
      new TextDecoder().decode(bytes.slice(20, 20 + view.getUint32(12, true))),
    );
  assert.equal(
    json.materials[0].extensions?.KHR_materials_emissive_strength,
    undefined,
  );
  assert.equal(json.materials[0].emissiveFactor, undefined);
  assert.deepEqual(d, before);
});
