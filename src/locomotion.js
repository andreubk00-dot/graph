// Convention: positive forward, positive height. Phase 0 is touchdown.
const finite = (v, min, max) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function runCycle(
  phase,
  { distance = 2.9, duty = 0.3, lift = 0.58 } = {},
) {
  if (
    !Number.isFinite(phase) ||
    !finite(distance, 0.001, 10000) ||
    !finite(duty, 0.15, 0.49) ||
    !finite(lift, 0, 1000)
  )
    throw new Error("Invalid gait parameters");
  phase = ((phase % 1) + 1) % 1;
  const contact = phase < duty,
    reach = (distance * duty) / 2;
  if (contact)
    return {
      phase,
      contact,
      forward: reach - distance * phase,
      height: 0,
      swing: 0,
    };
  const q = (phase - duty) / (1 - duty),
    q2 = q * q,
    q3 = q2 * q,
    m = -distance * (1 - duty);
  return {
    phase,
    contact,
    forward:
      (2 * q3 - 3 * q2 + 1) * -reach +
      (q3 - 2 * q2 + q) * m +
      (-2 * q3 + 3 * q2) * reach +
      (q3 - q2) * m,
    height: lift * Math.sin(Math.PI * q) ** 2,
    swing: q,
  };
}
export function solveTwoBone(hip, target, upper, lower, bend = -1) {
  if (
    ![hip, target].every(
      (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite),
    ) ||
    !finite(upper, 0.001, 10000) ||
    !finite(lower, 0.001, 10000) ||
    ![-1, 1].includes(bend)
  )
    throw new Error("Invalid two-bone IK");
  const dx = target[0] - hip[0],
    dy = target[1] - hip[1],
    d = Math.hypot(dx, dy);
  if (
    d < 1e-8 ||
    d > upper + lower + 1e-6 ||
    d < Math.abs(upper - lower) - 1e-6
  )
    throw new Error("Unreachable limb target");
  const a = (upper * upper - lower * lower + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, upper * upper - a * a));
  return [
    hip[0] + (dx / d) * a + ((bend * -dy) / d) * h,
    hip[1] + (dy / d) * a + ((bend * dx) / d) * h,
  ];
}
export function rangerPose(phase) {
  const p = ((phase % 1) + 1) % 1,
    angle = p * Math.PI * 2,
    bob = Math.round(-1.2 * Math.cos(4 * Math.PI * (p + 0.1))),
    hip = [31, 37 + bob];
  const legs = [0, 0.5].map((offset) => {
    const gait = runCycle(p + offset, { distance: 44, duty: 0.3, lift: 10 }),
      ankle = [31 + gait.forward, 56 - gait.height];
    return {
      ...gait,
      hip: [...hip],
      ankle,
      knee: solveTwoBone(hip, ankle, 12, 12, -1),
      sole: [ankle[0], ankle[1] + 3],
    };
  });
  const arms = [0, Math.PI].map((offset) => {
    const a = angle + offset,
      shoulder = [30, 26 + bob],
      hand = [33 - 6 * Math.cos(a), 33 + bob + 2 * Math.sin(a)];
    return { shoulder, hand, elbow: solveTwoBone(shoulder, hand, 8, 9, 1) };
  });
  return { hip, bob, legs, arms };
}
export function validateMotion(m, doc) {
  if (m === undefined) return;
  if (
    !m ||
    m.version !== 1 ||
    m.kind !== "run" ||
    !["right", "left"].includes(m.facing) ||
    !finite(m.distance, 0.001, 8192) ||
    !finite(m.groundY, 0, doc.height) ||
    !Array.isArray(m.feet) ||
    m.feet.length < 2 ||
    m.feet.length > 4
  )
    throw new Error("Invalid motion reference");
  if (m.sourceEdited !== undefined && typeof m.sourceEdited !== "boolean")
    throw new Error("Invalid motion reference status");
  const ids = new Set();
  for (const f of m.feet) {
    if (
      !f ||
      typeof f.id !== "string" ||
      !f.id.length ||
      f.id.length > 100 ||
      ids.has(f.id) ||
      !Array.isArray(f.points) ||
      f.points.length !== doc.frames.length ||
      !f.points.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          finite(p[0], 0, doc.width - (doc.kind === "pixel" ? 1 : 0)) &&
          finite(p[1], 0, doc.height),
      ) ||
      !Array.isArray(f.contact) ||
      f.contact.length !== doc.frames.length ||
      !f.contact.every((v) => typeof v === "boolean")
    )
      throw new Error("Invalid foot track");
    ids.add(f.id);
  }
}
export function auditMotion(doc) {
  validateMotion(doc.motion, doc);
  if (!doc.motion)
    return {
      available: false,
      issues: ["Для сцены не заданы направление и точки опоры."],
    };
  const m = doc.motion,
    sign = m.facing === "right" ? 1 : -1,
    total = doc.frames.reduce((s, f) => s + f.duration, 0),
    times = [];
  let time = 0;
  for (const f of doc.frames) {
    times.push(time);
    time += f.duration;
  }
  const issues = m.sourceEdited
      ? ["Рисунок изменён: точки опоры требуют повторной проверки"]
      : [],
    feet = m.feet.map((f) => {
      let maxSlip = 0,
        maxGroundError = 0,
        backwardSteps = 0,
        contacts = 0;
      for (let i = 0; i < f.points.length; i++) {
        if (!f.contact[i]) continue;
        contacts++;
        maxGroundError = Math.max(
          maxGroundError,
          Math.abs(f.points[i][1] - m.groundY),
        );
        const j = (i + 1) % f.points.length;
        if (!f.contact[j]) continue;
        const dt = (j === 0 ? total : times[j]) - times[i],
          dx = f.points[j][0] - f.points[i][0];
        if (dx * sign > 1) backwardSteps++;
        maxSlip = Math.max(
          maxSlip,
          Math.abs(dx + (sign * m.distance * dt) / total),
        );
      }
      if (!contacts) issues.push(`${f.id}: нет опоры`);
      if (backwardSteps)
        issues.push(`${f.id}: опорная стопа движется в сторону взгляда`);
      if (maxSlip > 1.5)
        issues.push(`${f.id}: скольжение ${maxSlip.toFixed(2)} px`);
      if (maxGroundError > 1) issues.push(`${f.id}: стопа не на земле`);
      return { id: f.id, maxSlip, maxGroundError, backwardSteps, contacts };
    });
  const airborne = doc.frames.some((_, i) =>
    m.feet.every((f) => !f.contact[i] && f.points[i][1] < m.groundY - 0.5),
  );
  if (!airborne) issues.push("Нет видимой фазы полёта");
  return {
    available: true,
    facing: m.facing,
    duration: total,
    distance: m.distance,
    speed: m.distance / (total / 1000),
    feet,
    airborne,
    issues,
  };
}
export function advanceClipTime(time, delta, duration, loop = true) {
  if (
    !finite(time, 0, 600) ||
    !finite(delta, 0, 600) ||
    !finite(duration, 0.1, 600) ||
    typeof loop !== "boolean"
  )
    throw new Error("Invalid playback time");
  const next = time + delta;
  return loop
    ? { time: next % duration, ended: false }
    : { time: Math.min(next, duration), ended: next >= duration };
}
