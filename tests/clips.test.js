import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyDocument,
  starterDocument,
  applyCommands,
  poseFor,
  keysFor,
  clipDuration,
  validateDocument,
} from "../src/document.js";

test("named clips are isolated from Action and from the rest pose", () => {
  const doc = applyCommands(starterDocument(), [
    { op: "createClip", id: "jump", name: "Jump", duration: 2 },
    {
      op: "keyframe",
      id: "body",
      clip: "jump",
      time: 0,
      position: [0, 1.5, 0],
    },
    {
      op: "keyframe",
      id: "body",
      clip: "jump",
      time: 2,
      position: [0, 3.5, 0],
    },
  ]);
  const body = doc.nodes.find((n) => n.id === "body"),
    scout = doc.nodes[0];
  assert.equal(poseFor(doc, body, 1, "jump").position[1], 2.5);
  assert.equal(poseFor(doc, body, 1, null).position[1], 1.5);
  assert.deepEqual(poseFor(doc, scout, 1, "jump").position, scout.position);
  assert.equal(clipDuration(doc, "jump"), 2);
  assert.equal(scout.keys.length, 3);
  assert.equal(body.keys.length, 0);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
});
test("clip duplication, retiming, object deletion and clip deletion are atomic", () => {
  let doc = applyCommands(starterDocument(), [
    { op: "duplicateClip", source: "default", id: "hover", name: "Hover" },
  ]);
  doc = applyCommands(doc, [
    { op: "moveKeyframe", id: "scout", clip: "hover", from: 2, time: 1 },
  ]);
  assert.deepEqual(
    doc.nodes[0].keys.map((k) => k.time),
    [0, 2, 4],
  );
  assert.deepEqual(
    keysFor(doc, doc.nodes[0], "hover").map((k) => k.time),
    [0, 1, 4],
  );
  const before = structuredClone(doc);
  assert.throws(
    () =>
      applyCommands(doc, [{ op: "updateClip", id: "hover", duration: 0.5 }]),
    /time/,
  );
  assert.deepEqual(doc, before);
  doc = applyCommands(doc, [{ op: "delete", id: "scout" }]);
  assert.deepEqual(doc.clips[0].tracks, {});
  doc = applyCommands(doc, [{ op: "deleteClip", id: "hover" }]);
  assert.equal(doc.clips.length, 0);
});
test("invalid clip references, duplicate names and reserved IDs are rejected", () => {
  const doc = starterDocument();
  for (const command of [
    { op: "keyframe", id: "scout", clip: "missing", time: 0 },
    { op: "createClip", id: "default", name: "Walk" },
    { op: "createClip", id: "walk", name: "Action" },
    { op: "createClip", id: "walk", name: "Walk", tracks: { missing: [] } },
  ])
    assert.throws(() => applyCommands(doc, [command]));
  assert.equal(doc.clips, undefined);
});
test("object IDs matching prototype properties remain valid track keys", () => {
  const doc = applyCommands(emptyDocument(), [
    { op: "create", type: "box", id: "__proto__" },
    { op: "createClip", id: "walk", name: "Walk" },
    {
      op: "keyframe",
      id: "__proto__",
      clip: "walk",
      time: 0,
      position: [1, 2, 3],
    },
  ]);
  assert.ok(Object.hasOwn(doc.clips[0].tracks, "__proto__"));
  assert.deepEqual(poseFor(doc, doc.nodes[0], 0, "walk").position, [1, 2, 3]);
  assert.equal(Object.getPrototypeOf(doc.clips[0].tracks), Object.prototype);
});

test("clip loop mode is validated, copied and changed atomically", () => {
  const d = applyCommands(emptyDocument(), [
    {
      op: "createClip",
      id: "travel",
      name: "Travel",
      duration: 1,
      loop: false,
    },
    { op: "duplicateClip", source: "travel", id: "copy", name: "Copy" },
  ]);
  assert.equal(d.clips[1].loop, false);
  const updated = applyCommands(d, [
    { op: "updateClip", id: "copy", loop: true },
  ]);
  assert.equal(updated.clips[1].loop, true);
  assert.equal(d.clips[1].loop, false);
  assert.throws(
    () => applyCommands(d, [{ op: "updateClip", id: "travel", loop: "false" }]),
    /looping/,
  );
  assert.equal(d.clips[0].loop, false);
});
