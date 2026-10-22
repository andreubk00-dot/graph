import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { deformationStudy } from "../src/rig-fixture.js";
import { applyCommands, validateDocument } from "../src/document.js";
import { sampleRig, auditRig } from "../src/rig-audit.js";
import { jointAngles } from "../src/skin.js";
import {
  createGLB,
  disposeScene,
  buildContent,
  updateSkinnedBounds,
} from "../src/scene.js";
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
const near = (a, b, e = 2e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);
const fixture = () => deformationStudy();
const mesh = (d) => d.nodes.find((n) => n.skin);

test("skinning bends the actual surface and preserves a hard 90° end-segment length", () => {
  const d = fixture(),
    m = mesh(d),
    top = m.geometry.positions.findIndex(
      (_, i) => i % 3 === 1 && Math.abs(m.geometry.positions[i] - 1.8) < 1e-6,
    ),
    i = (top - 1) / 3;
  const rest = sampleRig(d, {
      clip: "bend",
      time: 0,
      mesh: m.id,
      vertices: [i],
    }),
    bend = sampleRig(d, { clip: "bend", time: 1, mesh: m.id, vertices: [i] });
  near(rest.vertices[0][1], 1.8);
  near(bend.vertices[0][0], -0.9);
  near(bend.vertices[0][1], 0.9);
  const tip = bend.bones.find((b) => b.id === "joint-tip").position,
    hinge = bend.bones.find((b) => b.id === "joint-hinge").position;
  near(Math.hypot(...tip.map((v, i) => v - hinge[i])), 0.9);
  assert.deepEqual(auditRig(d, { clip: "bend" }).issues, []);
  assert.ok(
    auditRig(d, { clip: "overbend" }).issues.some((s) =>
      s.includes("ограничения"),
    ),
  );
});

test("malformed skin data and hidden or missing bones fail atomically", () => {
  const d = fixture();
  for (const mutate of [
    (m) => m.skin.weights.fill(0, 0, 4),
    (m) => (m.skin.weights[0] = NaN),
    (m) => (m.skin.indices[0] = 999),
    (m) => m.skin.weights.pop(),
    (m) => (m.skin.inverseBindMatrices[0][15] = 0),
    (m) => m.skin.bindMatrix.fill(0),
    (m) => (m.skin.joints[1] = "missing"),
    (m) => m.skin.joints.reverse(),
    (m) => (m.skin.weights[1] = 0.5),
  ]) {
    const bad = structuredClone(d);
    mutate(mesh(bad));
    assert.throws(() => validateDocument(bad));
  }
  const original = structuredClone(d);
  for (const cmd of [
    { op: "delete", id: "joint-hinge" },
    { op: "update", id: "joint-hinge", visible: false },
    { op: "update", id: mesh(d).id, position: [1, 2, 3] },
    { op: "keyframe", id: mesh(d).id, time: 0 },
    { op: "sculpt", id: mesh(d).id, recipe: {} },
  ])
    assert.throws(() => applyCommands(d, [cmd]));
  assert.deepEqual(d, original);
  const hidden = applyCommands(d, [
    { op: "update", id: "rig-study", visible: false },
  ]);
  assert.equal(hidden.nodes[0].visible, false);
});

test("precise weight editing persists, rejects invalid edits and never silently normalizes", () => {
  const d = fixture(),
    before = structuredClone(d),
    edited = applyCommands(d, [
      {
        op: "setSkinWeights",
        id: mesh(d).id,
        vertices: [0, 1],
        influences: [
          { joint: "joint-root", weight: 0.2 },
          { joint: "joint-hinge", weight: 0.8 },
        ],
      },
    ]);
  assert.deepEqual(
    mesh(edited).skin.weights.slice(0, 8),
    [0.2, 0.8, 0, 0, 0.2, 0.8, 0, 0],
  );
  assert.deepEqual(d, before);
  for (const influences of [
    [{ joint: "missing", weight: 1 }],
    [{ joint: "joint-root", weight: 0 }],
    [{ joint: "joint-root", weight: 0.5 }],
    [
      { joint: "joint-root", weight: 0.5 },
      { joint: "joint-root", weight: 0.5 },
    ],
  ])
    assert.throws(() =>
      applyCommands(d, [
        { op: "setSkinWeights", id: mesh(d).id, vertices: [0], influences },
      ]),
    );
  assert.throws(() =>
    applyCommands(d, [
      {
        op: "setSkinWeights",
        id: mesh(d).id,
        vertices: [99999],
        influences: [{ joint: "joint-root", weight: 1 }],
      },
    ]),
  );
});

test("duplicating a complete rig remaps bone references and preserves deformed world positions plus the offset", () => {
  const d = fixture(),
    idMap = Object.fromEntries(d.nodes.map((n) => [n.id, n.id + "-copy"])),
    copy = applyCommands(d, [
      { op: "duplicate", ids: ["rig-study"], idMap, offset: [3, 0, 0] },
    ]);
  const cm = copy.nodes.find((n) => n.id === mesh(d).id + "-copy");
  assert.deepEqual(
    cm.skin.joints,
    mesh(d).skin.joints.map((id) => id + "-copy"),
  );
  for (const t of [0, 0.4, 1]) {
    const a = sampleRig(copy, {
        clip: "bend",
        time: t,
        mesh: mesh(d).id,
        vertices: [0, 30, 200],
      }),
      b = sampleRig(copy, {
        clip: "bend",
        time: t,
        mesh: cm.id,
        vertices: [0, 30, 200],
      });
    a.vertices.forEach((v, i) =>
      v.forEach((x, j) => near(b.vertices[i][j], x + (j === 0 ? 3 : 0))),
    );
  }
  assert.throws(
    () => applyCommands(d, [{ op: "duplicate", ids: [mesh(d).id] }]),
    /complete rig/,
  );
  assert.throws(
    () => applyCommands(d, [{ op: "group", id: "bad", ids: [mesh(d).id] }]),
    /complete rig/,
  );
});

test("GLB skin deformation matches editor vertices under nonidentity binding, animation and root transforms", async () => {
  let d = fixture(),
    m = mesh(d);
  d = applyCommands(d, [
    { op: "unbindSkin", id: m.id },
    {
      op: "update",
      id: "rig-study",
      position: [2, 0.2, -1],
      rotation: [0.1, 0.3, 0],
      scale: [1.3, 1.3, 1.3],
    },
    { op: "update", id: m.id, position: [0.15, 0, 0], rotation: [0, 0.2, 0] },
    {
      op: "bindSkin",
      id: m.id,
      joints: m.skin.joints,
      indices: m.skin.indices,
      weights: m.skin.weights,
    },
    { op: "update", id: "rig-study", position: [3, 0.5, -2] },
  ]);
  m = mesh(d);
  const gltf = await new GLTFLoader().parseAsync(await createGLB(d), "");
  const loaded = gltf.scene.getObjectByName(m.id);
  assert.ok(loaded.isSkinnedMesh);
  assert.equal(loaded.skeleton.bones.length, 3);
  assert.ok(loaded.geometry.attributes.skinWeight);
  for (let v = 0; v < loaded.geometry.attributes.position.count; v++)
    for (let c = 0; c < 4; c++)
      if (loaded.geometry.attributes.skinWeight.getComponent(v, c) === 0)
        assert.equal(
          loaded.geometry.attributes.skinIndex.getComponent(v, c),
          0,
          "Unused influence slots must have zero joint indices",
        );

  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(
    gltf.animations.find((c) => c.name === "Сгибание · 90°"),
  );
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  for (const time of [0, 0.17, 0.67, 1, 1.83, 2]) {
    mixer.setTime(time);
    gltf.scene.updateMatrixWorld(true);
    const indices = [0, 35, 100, 208, 350, 490],
      expected = sampleRig(d, {
        clip: "bend",
        time,
        mesh: m.id,
        vertices: indices,
      });
    indices.forEach((index, i) => {
      const p = loaded
        .getVertexPosition(index, new THREE.Vector3())
        .applyMatrix4(loaded.matrixWorld);
      p.toArray().forEach((x, j) => near(x, expected.vertices[i][j], 4e-6));
    });
  }
  disposeScene(gltf.scene);
});

test("bone diagnostics catch translational stretch, scale animation and off-axis swing", () => {
  const d = fixture(),
    stretched = applyCommands(d, [
      {
        op: "keyframe",
        id: "joint-tip",
        clip: "bend",
        time: 0.337,
        position: [0, 1.2, 0],
        rotation: [0, 0, 0],
        scale: [1, 1.1, 1],
      },
    ]);
  const report = auditRig(stretched, { clip: "bend", samples: 2 });
  assert.ok(report.samples > 2, "Audit must include all exact key times");
  assert.ok(report.issues.some((s) => s.includes("длина")));
  assert.ok(report.issues.some((s) => s.includes("масштаб")));
  const off = applyCommands(d, [
    {
      op: "keyframe",
      id: "joint-hinge",
      clip: "bend",
      time: 1,
      rotation: [0.4, 0, Math.PI / 2],
    },
  ]);
  assert.ok(
    auditRig(off, { clip: "bend" }).bones.find((b) => b.id === "joint-hinge")
      .maxSwing > 5,
  );
  const rest = [0.3, 0.4, -0.2],
    q = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(...rest))
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          0.7,
        ),
      ),
    e = new THREE.Euler().setFromQuaternion(q),
    angles = jointAngles(rest, [e.x, e.y, e.z], "z");
  near(angles.twist, (0.7 * 180) / Math.PI);
  near(angles.swing, 0);
});

test("animated skin bounds are invalidated and recomputed from deformed vertices", () => {
  const d = fixture(),
    root = new THREE.Group(),
    map = new Map();
  buildContent(root, d, map);
  const m = map.get(mesh(d).id),
    a = new THREE.Box3().setFromObject(m);
  assert.ok(a.max.y > 1.79);
  map.get("joint-hinge").rotation.z = Math.PI / 2;
  updateSkinnedBounds(root);
  const b = new THREE.Box3().setFromObject(m);
  assert.ok(b.min.x < -0.89);
  assert.ok(b.max.y < 1.2);
  disposeScene(root);
});

test("rig audit CLI emits a machine-readable report and a nonzero status for violations", async () => {
  const fs = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { promisify } = await import("node:util"),
    { execFile } = await import("node:child_process"),
    directory = await fs.mkdtemp(join(tmpdir(), "graph-rig-cli-")),
    source = join(directory, "bench.json");
  try {
    await fs.writeFile(source, JSON.stringify(fixture()));
    const run = promisify(execFile),
      ok = await run(process.execPath, [
        "scripts/forge.js",
        "audit-rig",
        source,
        "bend",
      ]);
    assert.equal(JSON.parse(ok.stdout).bones.length, 3);
    assert.deepEqual(JSON.parse(ok.stdout).issues, []);
    await assert.rejects(
      run(process.execPath, [
        "scripts/forge.js",
        "audit-rig",
        source,
        "overbend",
      ]),
      (e) => e.code === 2 && JSON.parse(e.stdout).issues.length > 0,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
