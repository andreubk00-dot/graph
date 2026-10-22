import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { motionStudy } from "../src/review-fixture.js";
import { deformationStudy } from "../src/rig-fixture.js";
import { auditMeasurements, auditLocomotion } from "../src/model-review.js";
import { applyCommands, validateDocument } from "../src/document.js";
const near = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);

test("contact speed does not amplify floating-point duplicate sample times", () => {
  const d=motionStudy(),clip=d.clips.find(c=>c.id==='travel');
  d.review.motion.requireFlight=false;
  for(const side of ['left','right']) {
    const keys=clip.tracks[side+'-sole'],x=side==='left'?-.15:.15;
    for(const k of keys)k.position=[x,0,.1-k.time*.5];
    const time=.6000000000000001;
    keys.push({time,position:[x,0,.1-time*.5+1e-15],rotation:[0,0,0],scale:[1,1,1]});
  }
  const r=auditLocomotion(d);
  for(const f of r.feet){assert.ok(f.maxSlip<1e-12);assert.ok(f.maxSlipSpeed<1e-8);}
});

test("reference distances and ratios distinguish rest and animated poses and stay valid under root scale", () => {
  const d = motionStudy(),
    r = auditMeasurements(d);
  assert.deepEqual(r.issues, []);
  near(r.measurements[0].value, 0.3);
  near(r.measurements[1].value, 2 / 3);
  assert.equal(r.pose, "rest");
  const posed = auditMeasurements(d, { pose: "clip", clip: "travel", time: 0 });
  assert.ok(posed.issues.some((s) => s.includes("асимметрия")));
  const scaled = applyCommands(d, [
      {
        op: "update",
        id: "motion-root",
        position: [2, 3, 4],
        rotation: [0.2, 0.4, 0.1],
        scale: [2, 2, 2],
      },
    ]),
    report = auditMeasurements(scaled);
  near(report.measurements[0].value, 0.6);
  near(report.measurements[1].value, 2 / 3);
  assert.equal(report.symmetry[0].pass, true);
});

test("symmetry plane works in a rotated frame with nonuniform scale and detects an asymmetric edit", () => {
  const d = motionStudy(),
    pose = applyCommands(d, [
      {
        op: "update",
        id: "motion-root",
        position: [4, 2, -3],
        rotation: [0.3, 0.5, 0.2],
        scale: [2, 1, 3],
      },
    ]);
  assert.equal(auditMeasurements(pose).symmetry[0].pass, true);
  const changed = applyCommands(pose, [
    { op: "update", id: "left-sole", position: [-0.12, 0, 0] },
  ]);
  assert.equal(auditMeasurements(changed).symmetry[0].pass, false);
  near(auditMeasurements(changed).symmetry[0].maxError, 0.06);
});

test("surface landmarks follow actual skin deformation and reject ambiguous rigid points on a skin", () => {
  let d = deformationStudy();
  const review = {
    version: 1,
    landmarks: {
      top: { node: "deformation-mesh", vertex: 0 },
      hinge: { node: "joint-hinge", point: [0, 0, 0] },
    },
    measurements: [{ id: "reach", between: ["top", "hinge"] }],
  };
  d = applyCommands(d, [{ op: "setReview", review }]);
  const r = auditMeasurements(d, { pose: "clip", clip: "bend", time: 1 }),
    p = r.landmarks.find((l) => l.id === "top").point;
  near(p[0], -0.9);
  near(p[1], 0.9);
  near(r.measurements[0].value, Math.hypot(0.9, 0.16));
  const bad = structuredClone(review);
  bad.landmarks.top = { node: "deformation-mesh", point: [0, 1.8, 0] };
  assert.throws(
    () => applyCommands(d, [{ op: "setReview", review: bad }]),
    /vertex/,
  );
});

test("review schema and dangling references fail atomically, including contacts and clip references", () => {
  const d = motionStudy(),
    original = structuredClone(d);
  for (const mutate of [
    (r) => (r.landmarks["left-center"].node = "missing"),
    (r) => (r.measurements[0].between = ["none", "left-toe"]),
    (r) => (r.motion.clip = "missing"),
    (r) => (r.motion.forward = [0, 1, 0]),
    (r) =>
      (r.motion.feet[0].contacts = [
        { landmark: "left-center", start: 0.5, end: 0.2 },
      ]),
    (r) => (r.motion.tolerances.slip = -1),
    (r) => (r.symmetry[0].plane.axis = "q"),
    (r) => (r.measurements[0].range = [2, 1]),
    (r) => (r.motion.feet[0].contacts[0].landmark = "right-center"),
  ]) {
    const bad = structuredClone(d);
    mutate(bad.review);
    assert.throws(() => validateDocument(bad));
  }
  assert.throws(
    () => applyCommands(d, [{ op: "delete", id: "left-sole" }]),
    /Review/,
  );
  assert.deepEqual(d, original);
  const removed = applyCommands(d, [
    { op: "delete", id: "left-sole" },
    { op: "setReview", review: null },
  ]);
  assert.equal(removed.review, undefined);
});

test("zero reference lengths and measurements without ranges are reported without false passing", () => {
  const d = motionStudy();
  d.review.measurements = [
    {
      id: "undefined",
      between: ["left-heel", "left-toe"],
      reference: ["left-center", "left-center"],
    },
    { id: "observe", between: ["left-heel", "left-toe"] },
  ];
  const r = auditMeasurements(d);
  assert.equal(r.measurements[0].value, null);
  assert.equal(r.measurements[0].pass, false);
  assert.equal(r.measurements[1].pass, null);
  assert.ok(r.issues.length);
});

test("correct stance and virtual in-place stride lock world contacts, and audits leave source untouched", () => {
  const d = motionStudy(),
    before = structuredClone(d),
    a = auditLocomotion(d),
    b = auditLocomotion(d, { clip: "in-place", mode: "inPlace", distance: 1 });
  assert.deepEqual(a.issues, []);
  assert.deepEqual(b.issues, []);
  near(a.forwardDistance, 1);
  near(a.averageSpeed, 0.5);
  assert.ok(a.airborne);
  for (const f of a.feet) {
    assert.ok(f.maxSlip < 0.0003);
    assert.ok(f.maxGroundError < 0.0002);
  }
  near(a.feet[0].maxSlip, b.feet[0].maxSlip);
  assert.deepEqual(d, before);
});

test("motion checks separately detect sliding, reversed root motion, floor penetration and opposite facing", () => {
  const d = motionStudy();
  assert.ok(
    auditLocomotion(d, { clip: "sliding" }).feet.every((f) => f.maxSlip > 0.1),
  );
  const back = auditLocomotion(d, { clip: "backwards" });
  near(back.forwardDistance, -1);
  near(back.reverseDistance, 1);
  assert.ok(back.issues.some((s) => s.includes("назад")));
  const below = auditLocomotion(d, { clip: "below-ground" });
  assert.ok(below.feet.every((f) => f.maxPenetration > 0.039));
  assert.ok(below.issues.some((s) => s.includes("ниже земли")));
  const facing = auditLocomotion(d, { clip: "wrong-facing" });
  near(facing.maxFacingAngle, 180);
  assert.ok(facing.feet.every((f) => f.maxSlip < 0.004));
  assert.ok(facing.issues.some((s) => s.includes("взгляда")));
  assert.ok(
    auditLocomotion(d, { clip: "in-place" }).issues.some((s) =>
      s.includes("продвижения"),
    ),
  );
});

test("motion includes exact ancestor key times so a short root glitch is not missed by a coarse grid", () => {
  const d = applyCommands(motionStudy(), [
      {
        op: "keyframe",
        id: "motion-root",
        clip: "travel",
        time: 0.0123,
        position: [0, 0, -0.4],
      },
    ]),
    r = auditLocomotion(d, { samples: 3 });
  assert.ok(r.rootTrail.some((t) => t.time === 0.0123));
  assert.ok(r.reverseDistance > 0.39);
  assert.ok(r.issues.some((s) => s.includes("назад")));
});

test("height bob does not count as sideways motion and changing contact anchors is supported", () => {
  const d = motionStudy();
  for (const k of d.clips[0].tracks["motion-root"])
    k.position[1] = Math.sin(k.time * Math.PI) * 0.02;
  const r = auditLocomotion(d);
  near(r.sidewaysDistance, 0);
  assert.ok(r.feet[0].maxGroundError > 0);
  const c = motionStudy();
  c.review.motion.feet[0].contacts = [
    { landmark: "left-heel", start: 0, end: 0.15 },
    { landmark: "left-toe", start: 0.15, end: 0.3 },
  ];
  assert.deepEqual(auditLocomotion(c).issues, []);
});

test("review metadata survives roundtrip and duplicate rigs keep scene criteria on the original subject", () => {
  const d = motionStudy();
  assert.deepEqual(
    validateDocument(JSON.parse(JSON.stringify(d))).review,
    d.review,
  );
  const clone = applyCommands(d, [
    { op: "duplicate", ids: ["motion-root"], offset: [3, 0, 0] },
  ]);
  assert.deepEqual(clone.review, d.review);
  assert.deepEqual(auditLocomotion(clone).issues, []);
});

test("forward progress alone does not hide a root trajectory that veers sideways", () => {
  const d = motionStudy();
  for (const k of d.clips[0].tracks["motion-root"]) k.position[0] = k.time / 2;
  const r = auditLocomotion(d);
  near(r.forwardDistance, 1);
  near(r.travelAngle, 45);
  assert.ok(r.issues.some((s) => s.includes("Траектория")));
});

test("model review CLI exposes machine-readable metrics and fails a sliding export gate", async () => {
  const fs = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { promisify } = await import("node:util"),
    { execFile } = await import("node:child_process"),
    dir = await fs.mkdtemp(join(tmpdir(), "graph-model-audit-")),
    source = join(dir, "study.json");
  try {
    await fs.writeFile(source, JSON.stringify(motionStudy()));
    const run = promisify(execFile),
      ok = JSON.parse(
        (
          await run(process.execPath, [
            "scripts/forge.js",
            "audit-model",
            source,
          ])
        ).stdout,
      );
    assert.deepEqual(ok.issues, []);
    near(ok.motion.forwardDistance, 1);
    await assert.rejects(
      run(process.execPath, [
        "scripts/forge.js",
        "audit-model",
        source,
        "sliding",
      ]),
      (e) => e.code === 2 && JSON.parse(e.stdout).motion.feet[0].maxSlip > 0.1,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
