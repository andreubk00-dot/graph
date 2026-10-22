import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { validateDocument, poseFor } from "../src/document.js";
import { buildContent, createGLB, disposeScene } from "../src/scene.js";
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
test("CINDER has a seamless run, airborne phases, planted hooves and matching GLB motion", async () => {
  const doc = validateDocument(
    JSON.parse(
      await readFile(
        new URL("../examples/cinder-demon.graph.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const clip = doc.clips.find((c) => c.id === "run");
  for (const keys of Object.values(clip.tracks)) {
    const first = keys[0],
      last = keys.at(-1);
    for (const field of ["position", "rotation", "scale"])
      assert.deepEqual(last[field], first[field]);
    assert.equal(last.time, clip.duration);
  }
  // At left-foot touchdown, the left arm must swing back (contralateral gait).
  assert.ok(
    poseFor(
      doc,
      doc.nodes.find((n) => n.id === "left-upper-arm"),
      0,
      "run",
    ).rotation[0] > 0,
  );
  assert.ok(
    poseFor(
      doc,
      doc.nodes.find((n) => n.id === "left-thigh"),
      0,
      "run",
    ).rotation[0] < 0,
  );
  const content = new THREE.Group(),
    map = new Map();
  buildContent(content, doc, map);
  const gltf = await new GLTFLoader().parseAsync(await createGLB(doc), "");
  assert.deepEqual(
    gltf.animations.map((c) => c.name),
    ["Run", "Run forward"],
  );
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(gltf.animations[0]).play();
  let airborne = false,
    contact = false;
  for (let i = 0; i < 32; i++) {
    const time = (clip.duration * (i + 0.37)) / 32;
    for (const n of doc.nodes) {
      const o = map.get(n.id),
        p = poseFor(doc, n, time, "run");
      o.position.fromArray(p.position);
      o.rotation.set(...p.rotation);
      o.scale.fromArray(p.scale);
    }
    content.updateMatrixWorld(true);
    mixer.setTime(time);
    gltf.scene.updateMatrixWorld(true);
    for (const id of [
      "demon",
      "head",
      "left-foot",
      "right-hand",
      "tail-joint-6",
      "flame-0",
      "ember-0",
    ]) {
      const a = map.get(id).matrixWorld.elements,
        b = gltf.scene.getObjectByName(id).matrixWorld.elements;
      assert.ok(
        a.every((v, j) => Math.abs(v - b[j]) < 0.00005),
        `GLB pose mismatch ${id} at ${time}`,
      );
    }
    const lows = ["left", "right"].map(
      (side) => new THREE.Box3().setFromObject(map.get(`${side}-foot`)).min.y,
    );
    assert.ok(
      Math.min(...lows) > -0.035,
      `Hoof below ground at ${time}: ${lows}`,
    );
    airborne ||= lows.every((y) => y > 0.05);
    contact ||= lows.some((y) => y < 0.035);
  }
  assert.ok(airborne, "Running requires an airborne phase");
  assert.ok(contact, "Running needs ground contact");
  mixer.stopAllAction();
  const forwardAction = mixer.clipAction(gltf.animations[1]);
  forwardAction.setLoop(THREE.LoopOnce, 1);
  forwardAction.clampWhenFinished = true;
  forwardAction.play();
  for (const time of [0.12, 0.48, 0.88]) {
    for (const n of doc.nodes) {
      const o = map.get(n.id),
        p = poseFor(doc, n, time, "run-forward");
      o.position.fromArray(p.position);
      o.rotation.set(...p.rotation);
      o.scale.fromArray(p.scale);
    }
    content.updateMatrixWorld(true);
    mixer.setTime(time);
    gltf.scene.updateMatrixWorld(true);
    for (const id of ["demon", "left-foot", "right-foot"]) {
      const a = map.get(id).matrixWorld.elements,
        b = gltf.scene.getObjectByName(id).matrixWorld.elements;
      assert.ok(
        a.every((v, j) => Math.abs(v - b[j]) < 0.00005),
        `GLB forward pose mismatch ${id} at ${time}`,
      );
    }
  }
  disposeScene(content);
  disposeScene(gltf.scene);
});
