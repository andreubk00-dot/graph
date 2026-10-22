import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyDocument,
  starterDocument,
  validateDocument,
  applyCommands,
  poseAt,
} from "../src/document.js";

test("starter scene is valid and has an animated character", () => {
  const doc = validateDocument(starterDocument());
  assert.equal(doc.nodes.length, 15);
  assert.equal(doc.nodes.find((n) => n.id === "scout").keys.length, 3);
});
test("commands create nested models and interpolate keyframes", () => {
  const doc = applyCommands(emptyDocument(), [
    { op: "create", type: "group", id: "actor", position: [0, 0, 0] },
    { op: "create", type: "box", id: "child", parent: "actor" },
    { op: "keyframe", id: "actor", time: 0, position: [0, 0, 0] },
    { op: "keyframe", id: "actor", time: 2, position: [4, 2, 0] },
  ]);
  assert.deepEqual(poseAt(doc.nodes[0], 1).position, [2, 1, 0]);
  assert.deepEqual(poseAt(doc.nodes[0], 4).position, [4, 2, 0]);
  assert.equal(doc.nodes[1].parent, "actor");
});
test("a rejected batch leaves the original document untouched", () => {
  const doc = starterDocument(),
    before = structuredClone(doc);
  assert.throws(
    () =>
      applyCommands(doc, [
        { op: "update", id: "body", color: "#ff0000" },
        { op: "update", id: "body", scale: [0, 1, 1] },
      ]),
    /scale/,
  );
  assert.deepEqual(doc, before);
});
test("parent cycles, dangling parents, duplicate IDs, invalid keys are rejected", () => {
  const doc = starterDocument();
  assert.throws(
    () => applyCommands(doc, [{ op: "update", id: "scout", parent: "body" }]),
    /cycle/,
  );
  assert.throws(
    () => applyCommands(doc, [{ op: "update", id: "body", parent: "missing" }]),
    /Missing parent/,
  );
  assert.throws(
    () => applyCommands(doc, [{ op: "create", type: "sphere", id: "body" }]),
    /unique/,
  );
  assert.throws(
    () => applyCommands(doc, [{ op: "keyframe", id: "scout", time: 5 }]),
    /time/,
  );
});
test("delete cascades through all descendants but preserves siblings", () => {
  const doc = applyCommands(starterDocument(), [{ op: "delete", id: "head" }]);
  assert.ok(
    !doc.nodes.some((n) => ["head", "visor", "eye-l", "eye-r"].includes(n.id)),
  );
  assert.ok(doc.nodes.some((n) => n.id === "body"));
});
test("keyframes are replaced at the same time and can be removed", () => {
  let doc = applyCommands(starterDocument(), [
    { op: "keyframe", id: "scout", time: 2, position: [0, 5, 0] },
  ]);
  assert.equal(doc.nodes[0].keys.length, 3);
  assert.equal(poseAt(doc.nodes[0], 2).position[1], 5);
  doc = applyCommands(doc, [{ op: "removeKeyframe", id: "scout", time: 2 }]);
  assert.equal(doc.nodes[0].keys.length, 2);
});
test("round-trip JSON preserves materials, transforms and animation", () => {
  const doc = starterDocument();
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
});
test("duration changes cannot silently discard animation", () => {
  assert.throws(
    () => applyCommands(starterDocument(), [{ op: "scene", duration: 1 }]),
    /time/,
  );
});

test("malformed commands, vectors, FPS and geometry cannot poison a scene", () => {
  for (const commands of [
    [null],
    [{ op: "create", type: "box", position: Array(3) }],
    [{ op: "scene", fps: 23.5 }],
    [{ op: "create", type: "box", geometry: { bevel: 1 } }],
    [{ op: "create", type: "sphere", geometry: { segments: 8.5 } }],
    [
      {
        op: "create",
        type: "lathe",
        geometry: {
          profile: [
            [0, 0],
            [0, 1],
          ],
        },
      },
    ],
  ]) {
    assert.throws(() => applyCommands(emptyDocument(), commands));
  }
  assert.throws(() => poseAt(starterDocument().nodes[0], NaN), /time/);
});

test("keyframe retiming is atomic and rejects occupied times", () => {
  const original = starterDocument();
  const moved = applyCommands(original, [
    { op: "moveKeyframe", id: "scout", from: 2, time: 1 },
  ]);
  assert.deepEqual(
    moved.nodes[0].keys.map((k) => k.time),
    [0, 1, 4],
  );
  assert.equal(moved.nodes[0].keys[1].position[1], 0.16);
  assert.throws(
    () =>
      applyCommands(original, [
        { op: "moveKeyframe", id: "scout", from: 2, time: 4 },
      ]),
    /already exists/,
  );
  assert.throws(
    () =>
      applyCommands(original, [
        { op: "moveKeyframe", id: "scout", from: 1, time: 3 },
      ]),
    /not found/,
  );
  assert.deepEqual(
    original.nodes[0].keys.map((k) => k.time),
    [0, 2, 4],
  );
});
