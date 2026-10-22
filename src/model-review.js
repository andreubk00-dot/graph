import * as THREE from "three";
import {
  validateDocument,
  poseFor,
  keysFor,
  clipDuration,
} from "./document.js";
import { buildContent, disposeScene } from "./scene.js";
export function landmarkPosition(anchor, objects) {
  const object = objects.get(anchor.node),
    p = new THREE.Vector3();
  if (!object) throw new Error("Landmark node not found");
  if (anchor.vertex !== undefined) object.getVertexPosition(anchor.vertex, p);
  else p.fromArray(anchor.point);
  p.applyMatrix4(object.matrixWorld);
  if (!p.toArray().every(Number.isFinite))
    throw new Error("Non-finite landmark world position");
  return p;
}
function sampler(doc) {
  const root = new THREE.Group(),
    objects = new Map();
  buildContent(root, doc, objects);
  return {
    objects,
    pose(clip, time, rest = false) {
      for (const n of doc.nodes) {
        const o = objects.get(n.id),
          p = rest ? n : poseFor(doc, n, time, clip);
        o.position.fromArray(p.position);
        o.rotation.set(...p.rotation);
        o.scale.fromArray(p.scale);
      }
      root.updateMatrixWorld(true);
    },
    point(id) {
      return landmarkPosition(doc.review.landmarks[id], objects);
    },
    dispose() {
      disposeScene(root);
    },
  };
}
export function auditMeasurements(
  input,
  { pose = "rest", clip = null, time = 0 } = {},
) {
  const doc = validateDocument(input);
  if (
    !["rest", "clip"].includes(pose) ||
    (pose === "clip" &&
      (!Number.isFinite(time) || time < 0 || time > clipDuration(doc, clip)))
  )
    throw new Error("Invalid measurement pose");
  if (!doc.review)
    return {
      available: false,
      issues: ["Ориентиры и критерии ещё не заданы."],
    };
  const s = sampler(doc);
  try {
    s.pose(clip, time, pose === "rest");
    const r = doc.review,
      points = new Map(Object.keys(r.landmarks).map((id) => [id, s.point(id)])),
      length = (pair) => points.get(pair[0]).distanceTo(points.get(pair[1])),
      issues = [];
    const measurements = (r.measurements ?? []).map((m) => {
      let value = length(m.between);
      if (m.reference) {
        const base = length(m.reference);
        value = base > 1e-10 ? value / base : null;
      }
      const pass =
        value === null
          ? false
          : m.range
            ? value >= m.range[0] - 1e-9 && value <= m.range[1] + 1e-9
            : null;
      if (value === null)
        issues.push(`${m.label ?? m.id}: нулевая база отношения`);
      else if (pass === false)
        issues.push(`${m.label ?? m.id}: вне заданного диапазона`);
      return {
        id: m.id,
        label: m.label ?? m.id,
        value,
        unit: m.reference ? "ratio" : "m",
        range: m.range ?? null,
        pass,
        between: m.between,
      };
    });
    const symmetry = (r.symmetry ?? []).map((test) => {
      const matrix = s.objects.get(test.plane.node).matrixWorld;
      if (matrix.determinant() === 0)
        throw new Error("Singular symmetry frame");
      const axis = new THREE.Vector3();
      axis[test.plane.axis] = 1;
      const origin = axis
          .clone()
          .multiplyScalar(test.plane.offset)
          .applyMatrix4(matrix),
        normal = axis
          .clone()
          .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
      const pairs = test.pairs.map(([left, right]) => {
        const a = points.get(left),
          b = points.get(right),
          mirror = a
            .clone()
            .addScaledVector(normal, -2 * a.clone().sub(origin).dot(normal));
        return { left, right, error: mirror.distanceTo(b) };
      });
      const maxError = Math.max(...pairs.map((p) => p.error)),
        pass = maxError <= test.tolerance + 1e-9;
      if (!pass)
        issues.push(`${test.label ?? test.id}: асимметрия превышает допуск`);
      return {
        id: test.id,
        label: test.label ?? test.id,
        pairs,
        maxError,
        tolerance: test.tolerance,
        pass,
        plane: { point: origin.toArray(), normal: normal.toArray() },
      };
    });
    return {
      available: true,
      pose,
      clip: pose === "rest" ? null : clip,
      time: pose === "rest" ? null : time,
      landmarks: [...points].map(([id, p]) => ({
        id,
        label: r.landmarks[id].label ?? id,
        node: r.landmarks[id].node,
        point: p.toArray(),
      })),
      measurements,
      symmetry,
      issues,
      scope:
        "Расстояния, отношения и симметрия по заданному референсу. Не автоматическое распознавание анатомии.",
    };
  } finally {
    s.dispose();
  }
}
function sampleTimes(doc, clip, count, contacts) {
  if (!Number.isInteger(count) || count < 3 || count > 241)
    throw new Error("Motion audit needs 3–241 uniform samples");
  const duration = clipDuration(doc, clip),
    set = new Set();
  const add = (t) => {
    set.add(t);
    if (set.size > 4096)
      throw new Error("Motion audit exceeds 4096 sample times");
  };
  for (let i = 0; i < count; i++) add((duration * i) / (count - 1));
  for (const n of doc.nodes) for (const k of keysFor(doc, n, clip)) add(k.time);
  const boundaries = new Set([0, 1]);
  for (const c of contacts) {
    add(c.start * duration);
    add(c.end * duration);
    boundaries.add(c.start);
    boundaries.add(c.end);
  }
  const b = [...boundaries].sort((a, b) => a - b);
  for (let i = 1; i < b.length; i++) add(((b[i - 1] + b[i]) * duration) / 2);
  return [...set].sort((a, b) => a - b);
}
export function auditLocomotion(
  input,
  { clip, samples = 121, mode, distance } = {},
) {
  const doc = validateDocument(input),
    m = doc.review?.motion;
  if (!m)
    return {
      available: false,
      issues: ["Для 3D-движения не заданы опора и направление."],
    };
  clip = clip === undefined ? m.clip : clip;
  mode = mode ?? m.mode;
  distance = distance ?? m.distance;
  if (
    !["root", "inPlace"].includes(mode) ||
    (mode === "inPlace" &&
      (!Number.isFinite(distance) || distance <= 0 || distance > 10000))
  )
    throw new Error("Invalid locomotion mode/distance");
  const duration = clipDuration(doc, clip),
    times = sampleTimes(
      doc,
      clip,
      samples,
      m.feet.flatMap((f) => f.contacts),
    ),
    forward = new THREE.Vector3(...m.forward).normalize(),
    s = sampler(doc),
    issues = [];
  const feet = m.feet.map((f) => ({
    id: f.id,
    label: f.label ?? f.id,
    maxSlip: 0,
    maxSlipSpeed: 0,
    maxGroundError: 0,
    maxPenetration: 0,
    worstTime: null,
    contactSamples: 0,
    trail: [],
    contacts: f.contacts.map((c) => ({
      ...c,
      origin: null,
      previous: null,
      previousTime: null,
      maxSlip: 0,
      maxSlipSpeed: 0,
      maxGroundError: 0,
      worstTime: null,
    })),
  }));
  let startRoot,
    lastRoot,
    startActual,
    endActual,
    forwardDistance = 0,
    reverseDistance = 0,
    sidewaysDistance = 0,
    maxFacingAngle = 0,
    airborne = false,
    worstFacingTime = null;
  const rootTrail = [];
  try {
    for (const time of times) {
      s.pose(clip, time);
      const phase = time / duration,
        offset = forward
          .clone()
          .multiplyScalar(mode === "inPlace" ? distance * phase : 0),
        root = s.objects.get(m.root),
        actual = root.getWorldPosition(new THREE.Vector3()),
        world = actual.clone().add(offset);
      startActual ??= actual.clone();
      endActual = actual.clone();
      startRoot ??= world.clone();
      if (lastRoot) {
        const progress = world.clone().sub(lastRoot).dot(forward);
        forwardDistance += progress;
        reverseDistance += Math.max(0, -progress);
      }
      const displacement = world.clone().sub(startRoot);
      displacement.y = 0;
      sidewaysDistance = Math.max(
        sidewaysDistance,
        displacement
          .addScaledVector(forward, -displacement.dot(forward))
          .length(),
      );
      lastRoot = world.clone();
      rootTrail.push({ time, point: world.toArray() });
      const face = new THREE.Vector3(...m.facingAxis).transformDirection(
        root.matrixWorld,
      );
      face.y = 0;
      const angle =
        face.lengthSq() < 1e-12
          ? 180
          : (Math.acos(
              THREE.MathUtils.clamp(face.normalize().dot(forward), -1, 1),
            ) *
              180) /
            Math.PI;
      if (angle > maxFacingAngle) {
        maxFacingAngle = angle;
        worstFacingTime = time;
      }
      const points = new Map();
      const point = (id) => {
        if (!points.has(id)) points.set(id, s.point(id).add(offset));
        return points.get(id);
      };
      let allAbove = true,
        anyContact = false;
      for (let i = 0; i < m.feet.length; i++) {
        const f = m.feet[i],
          r = feet[i];
        for (const id of f.sole) {
          const y = point(id).y;
          const penetration = Math.max(0, m.groundY - y);
          if (penetration > r.maxPenetration) {
            r.maxPenetration = penetration;
            r.worstTime ??= time;
          }
          if (y - m.groundY <= m.flightHeight) allAbove = false;
        }
        r.trail.push({
          time,
          point: point(f.sole[0]).toArray(),
          contact: r.contacts.some(
            (c) => phase >= c.start - 1e-10 && phase <= c.end + 1e-10,
          ),
        });
        for (const c of r.contacts) {
          if (phase < c.start - 1e-10 || phase > c.end + 1e-10) continue;
          anyContact = true;
          r.contactSamples++;
          const p = point(c.landmark);
          c.origin ??= p.clone();
          const drift = p.clone().sub(c.origin);
          drift.y = 0;
          const slip = drift.length(),
            error = Math.abs(p.y - m.groundY);
          if (slip > c.maxSlip) {
            c.maxSlip = slip;
            c.worstTime = time;
          }
          c.maxGroundError = Math.max(c.maxGroundError, error);
          if (c.previous && time > c.previousTime) {
            const delta = p.clone().sub(c.previous);
            delta.y = 0;
            c.maxSlipSpeed = Math.max(
              c.maxSlipSpeed,
              delta.length() / (time - c.previousTime),
            );
          }
          c.previous = p.clone();
          c.previousTime = time;
          if (slip > r.maxSlip) {
            r.maxSlip = slip;
            r.worstTime = time;
          }
          if (error > r.maxGroundError) {
            r.maxGroundError = error;
            r.worstTime = time;
          }
          r.maxSlipSpeed = Math.max(r.maxSlipSpeed, c.maxSlipSpeed);
        }
      }
      airborne ||= !anyContact && allAbove;
    }
    for (const r of feet) {
      if (!r.contactSamples) issues.push(`${r.label}: нет заданной фазы опоры`);
      if (r.maxSlip > m.tolerances.slip + 1e-9)
        issues.push(`${r.label}: скольжение точки опоры`);
      if (r.maxGroundError > m.tolerances.ground + 1e-9)
        issues.push(`${r.label}: точка опоры не на земле`);
      if (r.maxPenetration > m.tolerances.penetration + 1e-9)
        issues.push(`${r.label}: подошва ниже земли`);
      for (const c of r.contacts) {
        delete c.origin;
        delete c.previous;
        delete c.previousTime;
      }
    }
    if (forwardDistance <= m.tolerances.travel)
      issues.push("Нет продвижения вперёд по заданной оси");
    if (reverseDistance > m.tolerances.travel + 1e-9)
      issues.push("Есть движение корня назад");
    if (maxFacingAngle > m.tolerances.facingAngle + 1e-9)
      issues.push("Направление взгляда не совпадает с направлением движения");
    if (m.requireFlight && !airborne)
      issues.push("Не найдена выраженная фаза полёта");
    const travel = lastRoot.clone().sub(startRoot);
    travel.y = 0;
    const travelAngle =
      travel.lengthSq() < 1e-12
        ? null
        : (Math.acos(
            THREE.MathUtils.clamp(travel.normalize().dot(forward), -1, 1),
          ) *
            180) /
          Math.PI;
    if (
      travelAngle !== null &&
      travelAngle >
        (m.tolerances.directionAngle ?? m.tolerances.facingAngle) + 1e-9
    )
      issues.push("Траектория корня отклоняется от заданного направления");
    const actualRootTravel = endActual.clone().sub(startActual);
    actualRootTravel.y = 0;
    if (
      mode === "inPlace" &&
      actualRootTravel.length() > m.tolerances.travel + 1e-9
    )
      issues.push(
        "В режиме на месте корень смещается: виртуальное продвижение требует повторной настройки",
      );
    return {
      available: true,
      clip,
      duration,
      mode,
      distance: mode === "inPlace" ? distance : null,
      samples: times.length,
      forward: forward.toArray(),
      groundY: m.groundY,
      forwardDistance,
      reverseDistance,
      sidewaysDistance,
      averageSpeed: forwardDistance / duration,
      maxFacingAngle,
      travelAngle,
      worstFacingTime,
      airborne,
      feet,
      rootTrail,
      issues,
      scope:
        "Заданные точки подошвы и интервалы опоры на горизонтальной земле Y. Проверка кинематики, не динамики, баланса или всей поверхности стопы.",
    };
  } finally {
    s.dispose();
  }
}
