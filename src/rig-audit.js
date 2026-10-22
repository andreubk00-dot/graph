import * as THREE from "three";
import {
  validateDocument,
  poseFor,
  keysFor,
  clipDuration,
} from "./document.js";
import { buildContent, disposeScene } from "./scene.js";
import { jointAngles } from "./skin.js";
export function auditRig(input, { clip = null, samples = 61 } = {}) {
  const doc = validateDocument(input),
    duration = clipDuration(doc, clip);
  if (!Number.isInteger(samples) || samples < 2 || samples > 241)
    throw new Error("Rig audit needs 2–241 uniform samples");
  const bones = doc.nodes.filter((n) => n.type === "bone"),
    byId = new Map(doc.nodes.map((n) => [n.id, n])),
    times = new Set(
      Array.from({ length: samples }, (_, i) => (i * duration) / (samples - 1)),
    );
  for (const bone of bones)
    for (const key of keysFor(doc, bone, clip)) times.add(key.time);
  if (times.size > 4096)
    throw new Error(
      "Rig audit exceeds 4096 sample times; split the animation clip",
    );
  const reports = bones.map((n) => ({
    id: n.id,
    name: n.name,
    parent: n.parent,
    restLength:
      byId.get(n.parent)?.type === "bone" ? Math.hypot(...n.position) : null,
    maxLengthDrift: 0,
    maxScaleDrift: 0,
    minTwist: Infinity,
    maxTwist: -Infinity,
    maxSwing: 0,
    violations: 0,
    worstTime: null,
    limit: n.jointLimit ?? null,
  }));
  for (const time of [...times].sort((a, b) => a - b))
    for (let i = 0; i < bones.length; i++) {
      const n = bones[i],
        r = reports[i],
        p = poseFor(doc, n, time, clip);
      if (r.restLength !== null)
        r.maxLengthDrift = Math.max(
          r.maxLengthDrift,
          Math.abs(Math.hypot(...p.position) - r.restLength),
        );
      r.maxScaleDrift = Math.max(
        r.maxScaleDrift,
        ...p.scale.map((s, j) => Math.abs(s / n.scale[j] - 1)),
      );
      if (n.jointLimit) {
        const a = jointAngles(n.rotation, p.rotation, n.jointLimit.axis);
        r.minTwist = Math.min(r.minTwist, a.twist);
        r.maxTwist = Math.max(r.maxTwist, a.twist);
        r.maxSwing = Math.max(r.maxSwing, a.swing);
        if (
          a.twist < n.jointLimit.min - 1e-4 ||
          a.twist > n.jointLimit.max + 1e-4 ||
          a.swing > n.jointLimit.swing + 1e-4
        ) {
          r.violations++;
          r.worstTime ??= time;
        }
      }
    }
  const issues = [];
  for (const r of reports) {
    if (!r.limit) {
      r.minTwist = null;
      r.maxTwist = null;
    }
    if (r.maxLengthDrift > Math.max(0.0001, (r.restLength ?? 0) * 0.001))
      issues.push(`${r.name}: меняется длина сегмента`);
    if (r.maxScaleDrift > 0.001)
      issues.push(`${r.name}: анимирован масштаб кости`);
    if (r.violations)
      issues.push(`${r.name}: выход за заданные ограничения сустава`);
  }
  const skins = doc.nodes
    .filter((n) => n.skin)
    .map((n) => {
      const used = new Set();
      let maxInfluences = 0;
      for (let i = 0; i < n.skin.weights.length; i += 4) {
        let count = 0;
        for (let j = 0; j < 4; j++)
          if (n.skin.weights[i + j] > 0) {
            used.add(n.skin.joints[n.skin.indices[i + j]]);
            count++;
          }
        maxInfluences = Math.max(maxInfluences, count);
      }
      return {
        id: n.id,
        vertices: n.geometry.positions.length / 3,
        joints: n.skin.joints.length,
        usedJoints: used.size,
        maxInfluences,
      };
    });
  return {
    clip,
    duration,
    samples: times.size,
    bones: reports,
    skins,
    issues,
    scope:
      "Заданные ограничения и длины сегментов. Не оценка анатомии, пропорций, пересечений или художественного качества.",
  };
}
// Deformed surface and bone positions are read from the same Three.js implementation as the viewport.
export function sampleRig(
  input,
  { clip = null, time = 0, mesh, vertices = [] } = {},
) {
  const doc = validateDocument(input),
    duration = clipDuration(doc, clip);
  if (
    !Number.isFinite(time) ||
    time < 0 ||
    time > duration ||
    !Array.isArray(vertices) ||
    vertices.length > 10000
  )
    throw new Error("Invalid rig sample");
  const root = new THREE.Group(),
    map = new Map();
  try {
    buildContent(root, doc, map);
    for (const n of doc.nodes) {
      const o = map.get(n.id),
        p = poseFor(doc, n, time, clip);
      o.position.fromArray(p.position);
      o.rotation.set(...p.rotation);
      o.scale.fromArray(p.scale);
    }
    root.updateMatrixWorld(true);
    const o = map.get(mesh),
      points = vertices.map((i) => {
        if (
          !o?.isSkinnedMesh ||
          !Number.isInteger(i) ||
          i < 0 ||
          i >= o.geometry.attributes.position.count
        )
          throw new Error("Invalid skinned vertex sample");
        return o
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(o.matrixWorld)
          .toArray();
      });
    return {
      time,
      bones: doc.nodes
        .filter((n) => n.type === "bone")
        .map((n) => ({
          id: n.id,
          position: map
            .get(n.id)
            .getWorldPosition(new THREE.Vector3())
            .toArray(),
        })),
      vertices: points,
    };
  } finally {
    disposeScene(root);
  }
}
