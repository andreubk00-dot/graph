import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import {
  runCycle,
  solveTwoBone,
  rangerPose,
  auditMotion,
  advanceClipTime,
} from "../src/locomotion.js";
import { ranger, rune } from "../src/art-examples.js";
import { flipArtHorizontal, validateArt } from "../src/art-document.js";
import { auditMesh } from "../src/mesh-audit.js";
import { validateDocument, poseFor } from "../src/document.js";
import { buildContent, disposeScene } from "../src/scene.js";
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);
test("run contacts lock to world ground, with continuous lift and velocity at both transitions", () => {
  const d = 2.9;
  for (let p = 0; p < 0.3; p += 0.01) {
    const a = runCycle(p),
      b = runCycle(p + 0.001);
    near(b.forward + d * (p + 0.001), a.forward + d * p);
    assert.equal(a.height, 0);
  }
  const eps = 1e-6;
  for (const p of [0, 0.3]) {
    const a = runCycle(p - eps),
      b = runCycle(p),
      c = runCycle(p + eps);
    near((b.forward - a.forward) / eps, (c.forward - b.forward) / eps, 0.0001);
    near(a.height, c.height, 0.00001);
  }
  for (let i = 0; i < 100; i++) {
    const pose = rangerPose(i / 100);
    for (const leg of pose.legs) {
      near(Math.hypot(...leg.knee.map((v, j) => v - leg.hip[j])), 12);
      near(Math.hypot(...leg.ankle.map((v, j) => v - leg.knee[j])), 12);
    }
  }
  assert.throws(() => solveTwoBone([0, 0], [100, 0], 1, 1), /Unreachable/);
});
test("Ranger moves right, catches reversed planted feet, and flipping all frames preserves valid direction", () => {
  const d = ranger();
  assert.deepEqual(auditMotion(d).issues, []);
  assert.ok(
    auditMotion(d).feet.every(
      (f) => f.maxSlip <= 0.5 && f.maxGroundError === 0,
    ),
  );
  const wrong = structuredClone(d);
  for (const f of wrong.motion.feet)
    f.points = f.points.map(([x, y]) => [63 - x, y]);
  assert.ok(auditMotion(wrong).issues.some((s) => s.includes("скольжение")));
  const flipped = flipArtHorizontal(d);
  assert.equal(flipped.motion.facing, "left");
  assert.deepEqual(auditMotion(flipped).issues, []);
  for (let i = 0; i < d.frames.length; i++)
    for (let j = 0; j < d.frames[i].layers.length; j++) {
      const a = d.frames[i].layers[j].pixels,
        b = flipped.frames[i].layers[j].pixels;
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++)
          assert.equal(a[y * 64 + x], b[y * 64 + 63 - x]);
    }
  assert.deepEqual(flipArtHorizontal(flipped), d);
  const v = rune();
  assert.deepEqual(flipArtHorizontal(flipArtHorizontal(v)), v);
  const bad = structuredClone(d);
  bad.motion.feet[0].points.pop();
  assert.throws(() => validateArt(bad), /foot track/);
});
test("nonloop playback holds its final pose; looping playback wraps", () => {
  assert.deepEqual(advanceClipTime(0.8, 0.2, 0.88, false), {
    time: 0.88,
    ended: true,
  });
  near(advanceClipTime(0.8, 0.2, 0.88).time, 0.12);
});
test("topology audit welds hard seams and catches holes, winding and inward normals", () => {
  const box = new THREE.BoxGeometry(),
    g = {
      positions: Array.from(box.attributes.position.array),
      normals: Array.from(box.attributes.normal.array),
      indices: Array.from(box.index.array),
    };
  assert.equal(auditMesh(g).boundaryEdges, 0);
  assert.equal(auditMesh(g).mirrorMatch, 1);
  assert.equal(
    auditMesh({ ...g, indices: g.indices.slice(3) }).boundaryEdges,
    3,
  );
  const reverse = [...g.indices];
  [reverse[0], reverse[1]] = [reverse[1], reverse[0]];
  assert.equal(auditMesh({ ...g, indices: reverse }).windingConflicts, 3);
  assert.equal(auditMesh({ ...g, indices: reverse }).inwardNormals, 1);
  box.dispose();
});
test("topology audit ignores retained unused vertex slots in surface metrics", () => {
  const g = {
    positions: [-1, 0, 0, 1, 0, 0, 0, 1, 0, 900, 900, 900],
    normals: [0,0,1, 0,0,1, 0,0,1, 2,0,0],
    indices: [0,1,2],
  };
  const report = auditMesh(g);
  assert.equal(report.vertices, 4);
  assert.equal(report.unusedVertices, 1);
  assert.equal(report.weldedVertices, 3);
  assert.equal(report.components, 1);
  assert.equal(report.normalErrors, 0);
  assert.equal(report.mirrorMatch, 1);
  assert.deepEqual(report.bounds, [[-1,1], [0,1], [0,0]]);
});

test("Asterion source has closed consistently oriented surfaces and symmetric precision parts", async () => {
  const d = validateDocument(
    JSON.parse(await readFile("examples/asterion.graph.json", "utf8")),
  );
  for (const n of d.nodes.filter((n) => n.type === "mesh")) {
    const a = auditMesh(n.geometry);
    for (const k of [
      "boundaryEdges",
      "nonManifoldEdges",
      "windingConflicts",
      "degenerate",
      "normalErrors",
      "inwardNormals",
    ])
      assert.equal(a[k], 0, `${n.id}: ${k}`);
    assert.equal(a.components, 1);
    if (n.id !== "leather-binding") assert.equal(a.mirrorMatch, 1, n.id);
  }
});
test("Cinder forward clip advances +Z while contact ankles remain planted without sideways drift", async () => {
  const d = validateDocument(
      JSON.parse(await readFile("examples/cinder-demon.graph.json", "utf8")),
    ),
    clip = d.clips.find((c) => c.id === "run-forward"),
    content = new THREE.Group(),
    map = new Map();
  buildContent(content, d, map);
  assert.equal(clip.loop, false);
  const sample = (phase, id) => {
    for (const n of d.nodes) {
      const o = map.get(n.id),
        p = poseFor(d, n, phase * clip.duration, clip.id);
      o.position.fromArray(p.position);
      o.rotation.set(...p.rotation);
      o.scale.fromArray(p.scale);
    }
    content.updateMatrixWorld(true);
    return map.get(id).getWorldPosition(new THREE.Vector3());
  };
  for (const [side, offset] of [
    ["left", 0],
    ["right", 0.5],
  ]) {
    const a = sample(offset, `${side}-foot`);
    for (const p of [0.03125, 0.0625, 0.125, 0.1875, 0.25]) {
      const b = sample(offset + p, `${side}-foot`);
      near(b.x, a.x, 0.00001);
      near(b.y, a.y, 0.008);
      near(b.z, a.z, 0.008);
    }
  }
  near(sample(1, "demon").z - sample(0, "demon").z, 2.9);
  disposeScene(content);
});

test("Asterion GLB preserves mesh attributes, materials and grip pivot", async () => {
  const { createGLB } = await import("../src/scene.js");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
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
  const d = validateDocument(
      JSON.parse(await readFile("examples/asterion.graph.json", "utf8")),
    ),
    gltf = await new GLTFLoader().parseAsync(await createGLB(d), "");
  assert.deepEqual(
    gltf.scene.getObjectByName("asterion").position.toArray(),
    [0, 0, 0],
  );
  for (const n of d.nodes.filter((n) => n.type === "mesh")) {
    const o = gltf.scene.getObjectByName(n.id);
    assert.ok(o?.isMesh, n.id);
    assert.equal(
      o.geometry.attributes.position.count,
      n.geometry.positions.length / 3,
    );
    assert.equal(
      o.geometry.attributes.normal.count,
      o.geometry.attributes.position.count,
    );
    if (n.geometry.uv)
      assert.equal(
        o.geometry.attributes.uv.count,
        o.geometry.attributes.position.count,
      );
    else assert.equal(o.geometry.attributes.uv, undefined);
    near(o.material.roughness, n.roughness);
    near(o.material.metalness, n.metalness);
    const original = new THREE.Color(n.color);
    near(o.material.color.r, original.r);
    near(o.material.color.g, original.g);
    near(o.material.color.b, original.b);
  }
  disposeScene(gltf.scene);
});

test("motion reflection respects pixel centers and vector extents at the canvas boundary", () => {
  const p = ranger();
  p.motion.feet[0].points[0][0] = p.width;
  assert.throws(() => validateArt(p), /foot track/);
  const v = rune();
  v.motion = {
    version: 1,
    kind: "run",
    facing: "right",
    distance: 1,
    groundY: 0,
    feet: ["a", "b"].map((id) => ({
      id,
      points: [[v.width, 0]],
      contact: [true],
    })),
  };
  assert.equal(flipArtHorizontal(v).motion.feet[0].points[0][0], 0);
  assert.deepEqual(flipArtHorizontal(flipArtHorizontal(v)), v);
});
