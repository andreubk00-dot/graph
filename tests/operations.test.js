import test from "node:test";
import assert from "node:assert/strict";
import { Matrix4, Vector3 } from "three";
import {
  starterDocument,
  emptyDocument,
  applyCommands,
  poseFor,
} from "../src/document.js";
import { poseMatrix, matrixPose, selectionRoots } from "../src/operations.js";
function world(doc, id, time, clip = null) {
  const n = doc.nodes.find((n) => n.id === id);
  return (n.parent ? world(doc, n.parent, time, clip) : new Matrix4()).multiply(
    poseMatrix(poseFor(doc, n, time, clip)),
  );
}
function sameWorld(a, b, ids, time, clip) {
  for (const id of ids) {
    const one = world(a, id, time, clip),
      two = world(b, id, time, clip);
    for (let i = 0; i < 16; i++)
      assert.ok(
        Math.abs(one.elements[i] - two.elements[i]) < 1e-6,
        `${id} changed at ${time}`,
      );
  }
}
function animated() {
  return applyCommands(starterDocument(), [
    { op: "createClip", id: "bob", name: "Bob", duration: 2 },
    {
      op: "keyframe",
      id: "body",
      clip: "bob",
      time: 0,
      rotation: [0.1, 0.2, 0.3],
    },
    {
      op: "keyframe",
      id: "body",
      clip: "bob",
      time: 2,
      position: [0, 2, 0],
      rotation: [0.3, 0.8, 0.2],
    },
  ]);
}

test("grouping siblings preserves descendants and every action between keyframes", () => {
  const before = animated(),
    after = applyCommands(before, [
      { op: "group", id: "assembly", ids: ["body", "head", "visor"] },
    ]);
  assert.equal(after.nodes.find((n) => n.id === "visor").parent, "head");
  for (const clip of [null, "bob"])
    for (const time of [0, 0.3, 1, 1.6, 2])
      sameWorld(before, after, ["body", "head", "visor", "eye-l"], time, clip);
  assert.deepEqual(selectionRoots(before, ["head", "visor", "body"]), [
    "head",
    "body",
  ]);
});
test("ungrouping static uniformly scaled groups preserves animated children", () => {
  const grouped = applyCommands(animated(), [
    { op: "group", id: "assembly", ids: ["body", "head"] },
    {
      op: "update",
      id: "assembly",
      position: [0.3, 2, 0.2],
      rotation: [0.2, 0.3, 0.1],
      scale: [1.3, 1.3, 1.3],
    },
  ]);
  const after = applyCommands(grouped, [{ op: "ungroup", id: "assembly" }]);
  for (const clip of [null, "bob"])
    for (const time of [0, 0.3, 1, 1.6, 2])
      sameWorld(grouped, after, ["body", "head", "visor", "eye-l"], time, clip);
  assert.ok(!after.nodes.some((n) => n.id === "assembly"));
});
test("invalid grouping, animation loss and shear fail atomically", () => {
  const doc = animated();
  assert.throws(
    () => applyCommands(doc, [{ op: "group", ids: ["body", "plinth"] }]),
    /same parent/,
  );
  const grouped = applyCommands(doc, [
    { op: "group", id: "assembly", ids: ["body", "head"] },
  ]);
  assert.throws(
    () =>
      applyCommands(grouped, [
        { op: "keyframe", id: "assembly", time: 0 },
        { op: "ungroup", id: "assembly" },
      ]),
    /Animated groups/,
  );
  assert.throws(
    () =>
      applyCommands(grouped, [
        { op: "update", id: "assembly", scale: [2, 1, 1] },
        { op: "ungroup", id: "assembly" },
      ]),
    /uniform/,
  );
  assert.throws(
    () =>
      matrixPose(
        poseMatrix({
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [2, 1, 1],
        }).multiply(
          poseMatrix({
            position: [0, 0, 0],
            rotation: [0, 0, 0.5],
            scale: [1, 1, 1],
          }),
        ),
      ),
    /shear/,
  );
  assert.deepEqual(
    grouped.nodes.find((n) => n.id === "assembly").scale,
    [1, 1, 1],
  );
});
test("batch duplication copies every clip without duplicating selected descendants twice", () => {
  const before = animated(),
    idMap = Object.fromEntries(
      before.nodes
        .filter((n) =>
          ["head", "visor", "eye-l", "eye-r", "body"].includes(n.id),
        )
        .map((n) => [n.id, `copy-${n.id}`]),
    );
  const after = applyCommands(before, [
    {
      op: "duplicate",
      ids: ["head", "visor", "body"],
      idMap,
      offset: [2, 0, 0],
    },
  ]);
  assert.equal(after.nodes.length, before.nodes.length + 5);
  assert.equal(
    after.nodes.find((n) => n.id === "copy-visor").parent,
    "copy-head",
  );
  assert.equal(after.clips[0].tracks["copy-body"].length, 2);
  assert.equal(
    poseFor(
      after,
      after.nodes.find((n) => n.id === "copy-body"),
      1,
      "bob",
    ).position[0],
    2,
  );
  assert.equal(before.clips[0].tracks["copy-body"], undefined);
});
test("prototype-like IDs can be duplicated and grouped without mutating prototypes", () => {
  const doc = applyCommands(emptyDocument(), [
    { op: "create", type: "box", id: "__proto__" },
  ]);
  const copied = applyCommands(doc, [
    {
      op: "duplicate",
      ids: ["__proto__"],
      idMap: { ["__proto__"]: "copy-proto" },
    },
    { op: "group", ids: ["__proto__", "copy-proto"], id: "assembly" },
  ]);
  assert.equal(copied.nodes.length, 3);
  assert.equal(copied.nodes[0].parent, "assembly");
});

test("shear checks remain relative for small models and large scene coordinates", () => {
  const small = poseMatrix({
    position: [100000, 0, 0],
    rotation: [0, 0, 0],
    scale: [0.01, 0.02, 0.01],
  }).multiply(
    poseMatrix({
      position: [0, 0, 0],
      rotation: [0, 0, 0.001],
      scale: [1, 1, 1],
    }),
  );
  assert.throws(() => matrixPose(small), /shear/);
  const exact = poseMatrix({
    position: [100000, -1, 4],
    rotation: [0.1, 0.2, 0.3],
    scale: [0.002, 0.003, 0.004],
  });
  const rebuilt = poseMatrix(matrixPose(exact));
  for (let i = 0; i < 16; i++)
    assert.ok(Math.abs(rebuilt.elements[i] - exact.elements[i]) < 1e-8);
});
