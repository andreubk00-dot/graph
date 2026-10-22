import { runCycle, solveTwoBone } from "../src/locomotion.js";
// Reproducible Graph Forge asset. Geometry, materials and animation use the editor schema.
import fs from "node:fs/promises";
import * as THREE from "three";
import { makeNode, validateDocument } from "../src/document.js";
const nodes = [],
  animated = new Map();
const C = {
  skin: "#54272a",
  muscle: "#74352f",
  ridge: "#30272c",
  horn: "#241d25",
  ivory: "#c6a082",
  lava: "#ff4c08",
  core: "#ffd36b",
};
function add(
  id,
  type,
  parent,
  position,
  scale = [1, 1, 1],
  color = C.skin,
  extra = {},
) {
  const node = makeNode(type, {
    id,
    name: id.replaceAll("-", " "),
    parent,
    position,
    scale,
    color,
    roughness: 0.76,
    ...extra,
  });
  nodes.push(node);
  return node;
}
function group(id, parent, pos) {
  return add(id, "group", parent, pos);
}
function orb(id, parent, pos, scale, color = C.skin, extra = {}) {
  return add(id, "sphere", parent, pos, scale, color, {
    geometry: { segments: 20 },
    ...extra,
  });
}
function glow(id, parent, pos, scale, color = C.lava, intensity = 2) {
  return orb(id, parent, pos, scale, color, {
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 1,
  });
}
function animate(node, fn) {
  animated.set(node.id, fn);
}
// Swept radial surfaces following arbitrary paths, with variable elliptical cross sections.
function tube(
  id,
  parent,
  points,
  radii,
  color = C.horn,
  sides = 10,
  extra = {},
) {
  const positions = [],
    indices = [];
  const path = points.map((p) => new THREE.Vector3(...p));
  for (let i = 0; i < path.length; i++) {
    const tangent = path[Math.min(i + 1, path.length - 1)]
      .clone()
      .sub(path[Math.max(0, i - 1)])
      .normalize();
    const ref =
      Math.abs(tangent.y) > 0.9
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(tangent, ref).normalize(),
      v = new THREE.Vector3().crossVectors(tangent, u).normalize();
    const r = Array.isArray(radii[i]) ? radii[i] : [radii[i], radii[i]];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      positions.push(
        ...path[i]
          .clone()
          .addScaledVector(u, Math.cos(a) * r[0])
          .addScaledVector(v, Math.sin(a) * r[1])
          .toArray(),
      );
    }
    if (i)
      for (let j = 0; j < sides; j++) {
        const a = (i - 1) * sides + j,
          b = (i - 1) * sides + ((j + 1) % sides),
          c = i * sides + j,
          d = i * sides + ((j + 1) % sides);
        indices.push(a, b, c, b, d, c);
      }
  }
  const start = positions.length / 3;
  positions.push(...points[0], ...points.at(-1));
  for (let j = 0; j < sides; j++) {
    indices.push(start, (j + 1) % sides, j);
    const b = (path.length - 1) * sides;
    indices.push(start + 1, b + j, b + ((j + 1) % sides));
  }
  return add(id, "mesh", parent, [0, 0, 0], [1, 1, 1], color, {
    geometry: { positions, indices, smooth: true },
    ...extra,
  });
}
function fissure(id, parent, points, r = 0.014) {
  return tube(
    id,
    parent,
    points,
    points.map(() => r),
    C.lava,
    6,
    { emissive: C.lava, emissiveIntensity: 2.3 },
  );
}
function horn(id, parent, points, r = 0.15) {
  return tube(
    id,
    parent,
    points,
    points.map((_, i) =>
      Math.max(0.003, r * (1 - i / (points.length - 1)) ** 0.85),
    ),
    C.horn,
    12,
  );
}
const root = group("demon", null, [0, 1.85, 0]);
root.name = "CINDER — бегущий демон";
const torso = group("torso", "demon", [0, 0.12, 0]);
// Heavy chest tapering into the pelvis; layered muscle volumes and obsidian armor.
tube(
  "torso-anatomy",
  "torso",
  [
    [0, -0.12, 0],
    [0, 0.1, 0],
    [0, 0.43, 0],
    [0, 0.78, -0.015],
    [0, 1.04, 0],
    [0, 1.13, 0],
  ],
  [
    [0.3, 0.24],
    [0.35, 0.26],
    [0.39, 0.24],
    [0.64, 0.32],
    [0.59, 0.28],
    [0.31, 0.2],
  ],
  C.skin,
  20,
);
orb("pelvis", "demon", [0, -0.03, -0.02], [0.76, 0.5, 0.59], C.ridge);
for (const s of [-1, 1]) {
  orb(
    `hip-plate-${s}`,
    "demon",
    [s * 0.29, 0.02, 0.12],
    [0.36, 0.42, 0.43],
    C.skin,
    { rotation: [0, 0, s * -0.2] },
  );
  orb(
    `pectoral-${s}`,
    "torso",
    [s * 0.3, 0.84, 0.23],
    [0.64, 0.4, 0.27],
    C.muscle,
    { rotation: [0, s * 0.12, s * 0.12] },
  );
  orb(
    `latissimus-${s}`,
    "torso",
    [s * 0.4, 0.64, -0.2],
    [0.43, 0.64, 0.33],
    C.muscle,
    { rotation: [0, 0, s * -0.22] },
  );
  for (let j = 0; j < 3; j++) {
    orb(
      `abdominal-${s}-${j}`,
      "torso",
      [s * (0.11 + 0.025 * j), 0.51 - j * 0.18, 0.235],
      [0.225 - j * 0.012, 0.19, 0.16],
      C.muscle,
    );
    orb(
      `rib-${s}-${j}`,
      "torso",
      [s * (0.4 - 0.045 * j), 0.62 - j * 0.14, 0.18],
      [0.21, 0.09, 0.16],
      C.ridge,
      { rotation: [0, 0, s * 0.65] },
    );
  }
  fissure(`chest-fissure-${s}`, "torso", [
    [s * 0.12, 1, 0.29],
    [s * 0.22, 0.88, 0.365],
    [s * 0.39, 0.84, 0.34],
    [s * 0.52, 0.75, 0.26],
  ]);
  fissure(`flank-fissure-${s}`, "torso", [
    [s * 0.31, 0.16, 0.22],
    [s * 0.28, 0.34, 0.25],
    [s * 0.33, 0.45, 0.27],
  ]);
}
fissure(
  "sternum-fire",
  "torso",
  [
    [0, 0.15, 0.26],
    [0, 0.4, 0.28],
    [0, 0.68, 0.3],
    [0, 1.02, 0.29],
  ],
  0.019,
);
glow(
  "heart-furnace",
  "torso",
  [0, 0.74, 0.319],
  [0.12, 0.2, 0.07],
  C.core,
  2.5,
);
for (let j = 0; j < 6; j++) {
  orb(
    `vertebra-${j}`,
    "torso",
    [0, 0.1 + j * 0.18, -0.27],
    [0.14, 0.15, 0.12],
    C.ridge,
  );
  horn(
    `spinal-spike-${j}`,
    "torso",
    [
      [0, 0.12 + j * 0.18, -0.28],
      [0, 0.22 + j * 0.18, -0.43],
      [0, 0.32 + j * 0.18, -0.49],
    ],
    0.07,
  );
}
// Expressive face with brow, burning eye slits, teeth and four swept horns.
const head = group("head", "torso", [0, 1.25, 0.04]);
orb("neck", "torso", [0, 1.14, 0.01], [0.35, 0.38, 0.34], C.muscle);
orb("cranium", "head", [0, 0.19, 0], [0.58, 0.66, 0.48], C.skin);
orb("jaw", "head", [0, -0.055, 0.13], [0.43, 0.27, 0.4], C.ridge);
orb("muzzle", "head", [0, 0.05, 0.21], [0.38, 0.19, 0.31], C.skin);
orb("mouth-shadow", "head", [0, -0.035, 0.304], [0.33, 0.085, 0.06], "#100c12");
horn(
  "chin-spike",
  "head",
  [
    [0, -0.12, 0.25],
    [0, -0.29, 0.28],
    [0, -0.35, 0.17],
  ],
  0.1,
);
for (const s of [-1, 1]) {
  orb(
    `cheek-${s}`,
    "head",
    [s * 0.21, 0.075, 0.17],
    [0.21, 0.27, 0.24],
    C.ridge,
    { rotation: [0, s * 0.3, s * 0.3] },
  );
  glow(
    `eye-${s}`,
    "head",
    [s * 0.145, 0.21, 0.219],
    [0.19, 0.065, 0.075],
    C.core,
    4,
  );
  orb(`brow-${s}`, "head", [s * 0.15, 0.275, 0.23], [0.3, 0.1, 0.14], C.ridge, {
    rotation: [0, 0, s * 0.23],
  });
  horn(
    `great-horn-${s}`,
    "head",
    [
      [s * 0.21, 0.4, -0.03],
      [s * 0.37, 0.58, -0.06],
      [s * 0.49, 0.83, -0.18],
      [s * 0.44, 1.04, -0.24],
      [s * 0.28, 1.14, -0.14],
    ],
    0.145,
  );
  for (let k = 0; k < 5; k++) {
    const t = 0.12 + k * 0.105,
      p = new THREE.Vector3().lerpVectors(
        new THREE.Vector3(s * 0.21, 0.4, -0.03),
        new THREE.Vector3(s * 0.49, 0.83, -0.18),
        t * 1.8,
      );
    const r = 0.14 * (1 - t) ** 0.85;
    const ring = add(
      `horn-ridge-${s}-${k}`,
      "torus",
      "head",
      p.toArray(),
      [r * 2, r * 2, r * 0.8],
      k % 2 ? C.ridge : "#49313a",
      {
        geometry: { segments: 16, tube: 0.055 },
        rotation: [Math.PI / 2, 0, s * -0.5],
      },
    );
  }
  horn(
    `temple-horn-${s}`,
    "head",
    [
      [s * 0.24, 0.22, -0.06],
      [s * 0.43, 0.29, -0.2],
      [s * 0.5, 0.46, -0.35],
      [s * 0.43, 0.59, -0.42],
    ],
    0.095,
  );
  horn(
    `ear-${s}`,
    "head",
    [
      [s * 0.25, 0.13, -0.04],
      [s * 0.43, 0.2, -0.1],
      [s * 0.48, 0.26, -0.17],
    ],
    0.09,
  );
  fissure(
    `face-scar-${s}`,
    "head",
    [
      [s * 0.11, 0.36, 0.22],
      [s * 0.06, 0.28, 0.25],
      [s * 0.09, 0.13, 0.29],
    ],
    0.009,
  );
  for (let k = 0; k < 3; k++) {
    const x = s * (0.065 + 0.065 * k);
    tube(
      `fang-${s}-${k}`,
      "head",
      [
        [x, 0.005, 0.332],
        [x, -0.06 - (k === 2 ? 0.04 : 0), 0.35],
      ],
      [0.022, 0.002],
      C.ivory,
      8,
    );
  }
}
horn(
  "nose-ridge",
  "head",
  [
    [0, 0.33, 0.2],
    [0, 0.16, 0.31],
    [0, 0.09, 0.33],
  ],
  0.065,
);
// Jointed arms, separated muscle and armor volumes, long hooked fingers.
for (const s of [-1, 1]) {
  const side = s < 0 ? "left" : "right";
  const upper = group(`${side}-upper-arm`, "torso", [s * 0.63, 0.92, -0.015]);
  orb(
    `${side}-deltoid`,
    upper.id,
    [s * 0.055, -0.04, 0],
    [0.48, 0.47, 0.48],
    C.muscle,
  );
  orb(
    `${side}-shoulder-armor`,
    upper.id,
    [s * 0.11, 0.1, -0.035],
    [0.49, 0.26, 0.48],
    C.ridge,
  );
  for (let j = 0; j < 3; j++)
    horn(
      `${side}-shoulder-spike-${j}`,
      upper.id,
      [
        [s * (0.1 + 0.08 * j), 0.15, -0.16 + j * 0.15],
        [s * (0.3 + 0.1 * j), 0.39, -0.22 + j * 0.17],
        [s * (0.35 + 0.13 * j), 0.61 - j * 0.05, -0.3 + j * 0.18],
      ],
      0.1 - j * 0.015,
    );
  tube(
    `${side}-upper-arm-flesh`,
    upper.id,
    [
      [0, -0.12, 0],
      [s * 0.035, -0.33, 0.01],
      [s * 0.02, -0.62, 0],
    ],
    [
      [0.19, 0.19],
      [0.17, 0.19],
      [0.12, 0.13],
    ],
    C.skin,
    16,
  );
  orb(
    `${side}-biceps`,
    upper.id,
    [s * 0.025, -0.33, 0.11],
    [0.27, 0.43, 0.23],
    C.muscle,
  );
  fissure(
    `${side}-arm-crack`,
    upper.id,
    [
      [s * 0.19, -0.16, 0.08],
      [s * 0.17, -0.31, 0.12],
      [s * 0.12, -0.48, 0.1],
    ],
    0.012,
  );
  const fore = group(`${side}-forearm`, upper.id, [s * 0.02, -0.65, 0]);
  orb(`${side}-elbow`, fore.id, [0, 0, -0.015], [0.27, 0.28, 0.26], C.ridge);
  tube(
    `${side}-forearm-flesh`,
    fore.id,
    [
      [0, 0, 0],
      [s * 0.015, -0.22, 0.01],
      [0, -0.56, 0],
    ],
    [
      [0.14, 0.14],
      [0.18, 0.16],
      [0.105, 0.1],
    ],
    C.skin,
    16,
  );
  orb(
    `${side}-gauntlet`,
    fore.id,
    [0, -0.24, -0.06],
    [0.34, 0.48, 0.22],
    C.ridge,
  );
  horn(
    `${side}-elbow-spike`,
    fore.id,
    [
      [0, -0.03, -0.11],
      [0, 0.08, -0.3],
      [0, 0.25, -0.38],
    ],
    0.1,
  );
  fissure(
    `${side}-gauntlet-crack`,
    fore.id,
    [
      [s * 0.11, -0.12, 0.12],
      [s * 0.14, -0.27, 0.09],
      [s * 0.08, -0.43, 0.08],
    ],
    0.014,
  );
  const hand = group(`${side}-hand`, fore.id, [0, -0.59, 0.015]);
  orb(`${side}-palm`, hand.id, [0, -0.08, 0], [0.29, 0.3, 0.19], C.muscle);
  for (let f = 0; f < 4; f++) {
    const x = (f - 1.5) * 0.075,
      length = 0.22 + (f === 1 || f === 2 ? 0.07 : 0);
    tube(
      `${side}-finger-${f}`,
      hand.id,
      [
        [x, -0.16, 0.015],
        [x * 1.18, -0.26, 0.055],
        [x * 1.22, -0.16 - length, 0.13],
      ],
      [0.04, 0.034, 0.02],
      C.skin,
      10,
    );
    horn(
      `${side}-talon-${f}`,
      hand.id,
      [
        [x * 1.22, -0.16 - length, 0.13],
        [x * 1.1, -0.2 - length, 0.22],
        [x * 0.9, -0.15 - length, 0.29],
      ],
      0.029,
    );
  }
  tube(
    `${side}-thumb`,
    hand.id,
    [
      [s * -0.12, -0.04, 0.01],
      [s * -0.22, -0.12, 0.06],
      [s * -0.22, -0.22, 0.13],
    ],
    [0.05, 0.038, 0.021],
    C.skin,
    10,
  );
  horn(
    `${side}-thumb-claw`,
    hand.id,
    [
      [s * -0.22, -0.22, 0.13],
      [s * -0.2, -0.27, 0.2],
      [s * -0.16, -0.25, 0.26],
    ],
    0.028,
  );
  animate(upper, (u) => ({
    rotation: [
      0.85 * Math.cos(2 * Math.PI * u + (s < 0 ? 0 : Math.PI)),
      0,
      s * 0.16,
    ],
  }));
  animate(fore, (u) => ({
    rotation: [
      -1.05 + 0.35 * Math.sin(2 * Math.PI * u + (s < 0 ? 0 : Math.PI)),
      0,
      0,
    ],
  }));
  animate(hand, (u) => ({
    rotation: [0.1 * Math.sin(2 * Math.PI * u), 0, s * 0.08],
  }));
  // Two-bone IK gait, planted foot translates backward during contact, high return arc.
  const thigh = group(`${side}-thigh`, "demon", [s * 0.29, -0.06, 0]);
  tube(
    `${side}-thigh-flesh`,
    thigh.id,
    [
      [0, 0, 0],
      [s * 0.03, -0.24, 0.035],
      [0, -0.59, 0.015],
      [0, -0.88, 0],
    ],
    [
      [0.21, 0.23],
      [0.255, 0.25],
      [0.18, 0.18],
      [0.12, 0.13],
    ],
    C.skin,
    18,
  );
  orb(
    `${side}-quadriceps`,
    thigh.id,
    [s * 0.025, -0.35, 0.16],
    [0.35, 0.61, 0.24],
    C.muscle,
    { rotation: [-0.1, 0, s * -0.04] },
  );
  fissure(
    `${side}-thigh-lava`,
    thigh.id,
    [
      [s * 0.2, -0.13, 0.13],
      [s * 0.23, -0.29, 0.18],
      [s * 0.15, -0.43, 0.18],
      [s * 0.14, -0.57, 0.13],
    ],
    0.015,
  );
  const shin = group(`${side}-shin`, thigh.id, [0, -0.88, 0]);
  orb(`${side}-kneecap`, shin.id, [0, 0.015, 0.09], [0.28, 0.3, 0.24], C.ridge);
  horn(
    `${side}-knee-spike`,
    shin.id,
    [
      [0, 0.03, 0.17],
      [0, 0.12, 0.32],
      [0, 0.19, 0.42],
    ],
    0.1,
  );
  tube(
    `${side}-shin-flesh`,
    shin.id,
    [
      [0, 0, 0],
      [0, -0.25, -0.045],
      [0, -0.66, -0.015],
      [0, -0.92, 0],
    ],
    [
      [0.13, 0.13],
      [0.16, 0.17],
      [0.085, 0.1],
      [0.08, 0.09],
    ],
    C.skin,
    16,
  );
  tube(
    `${side}-shin-carapace`,
    shin.id,
    [
      [0, -0.11, 0.11],
      [0, -0.43, 0.12],
      [0, -0.78, 0.05],
    ],
    [
      [0.1, 0.07],
      [0.095, 0.065],
      [0.045, 0.035],
    ],
    C.ridge,
    10,
  );
  fissure(
    `${side}-shin-lava`,
    shin.id,
    [
      [s * 0.07, -0.21, 0.15],
      [s * 0.08, -0.38, 0.15],
      [s * 0.04, -0.63, 0.1],
    ],
    0.011,
  );
  const foot = group(`${side}-foot`, shin.id, [0, -0.92, 0]);
  for (const half of [-1, 1])
    orb(
      `${side}-cloven-hoof-${half}`,
      foot.id,
      [half * 0.087, -0.12, 0.1],
      [0.17, 0.26, 0.43],
      C.horn,
      { geometry: { segments: 12 }, rotation: [0, half * 0.055, 0] },
    );
  orb(`${side}-fetlock`, foot.id, [0, 0.02, -0.02], [0.2, 0.24, 0.2], C.skin);
  fissure(
    `${side}-hoof-split`,
    foot.id,
    [
      [0, -0.03, 0.25],
      [0, -0.11, 0.308],
      [0, -0.2, 0.27],
    ],
    0.014,
  );
  function legPose(u) {
    const gait = runCycle(u + (s < 0 ? 0 : 0.5)),
      z = gait.forward,
      y = 0.25 + gait.height;
    const hipY = 1.87 + 0.055 * Math.cos(4 * Math.PI * (u + 0.1)) - 0.06;
    const knee = solveTwoBone([0, hipY], [z, y], 0.88, 0.92, 1);
    const a = Math.atan2(-knee[0], hipY - knee[1]),
      worldShin = Math.atan2(-(z - knee[0]), knee[1] - y),
      b = worldShin - a;
    return [
      a,
      b,
      -a - b + (gait.contact ? 0 : -0.3 * Math.sin(Math.PI * gait.swing)),
    ];
  }
  animate(thigh, (u) => ({ rotation: [legPose(u)[0], 0, 0] }));
  animate(shin, (u) => ({ rotation: [legPose(u)[1], 0, 0] }));
  animate(foot, (u) => ({ rotation: [legPose(u)[2], 0, 0] }));
}
// Chained tail with additive follow-through and an arrowhead.
let previous = "demon";
for (let j = 0; j < 7; j++) {
  const tail = group(
    `tail-joint-${j}`,
    previous,
    j === 0 ? [0, 0.03, -0.23] : [0, -0.035, -0.25],
  );
  const r = 0.12 * (1 - j / 9);
  tube(
    `tail-segment-${j}`,
    tail.id,
    [
      [0, 0, 0],
      [0, -0.02, -0.15],
      [0, -0.035, -0.28],
    ],
    [r, r * 0.9, r * 0.82],
    C.skin,
    12,
  );
  if (j % 2 === 0)
    fissure(
      `tail-ember-${j}`,
      tail.id,
      [
        [r * 0.7, 0, -0.02],
        [r * 0.8, -0.01, -0.16],
        [r * 0.65, -0.02, -0.23],
      ],
      0.01,
    );
  animate(tail, (u) => ({
    rotation: [
      j === 0 ? -0.2 : 0.05 + 0.1 * Math.sin(2 * Math.PI * u - j * 0.6),
      0.15 * Math.sin(2 * Math.PI * u - j * 0.55),
      0,
    ],
  }));
  previous = tail.id;
}
tube(
  "tail-arrow",
  previous,
  [
    [0, -0.035, -0.2],
    [0, -0.035, -0.33],
    [0, -0.035, -0.58],
  ],
  [
    [0.05, 0.04],
    [0.19, 0.065],
    [0.003, 0.003],
  ],
  C.ridge,
  8,
);
// Solid animated flame tongues: portable mesh effects, no texture or runtime dependency.
const flameSpecs = [];
for (let i = 0; i < 12; i++)
  flameSpecs.push([
    "torso",
    [
      ((i % 3) - 1) * 0.22,
      0.3 + Math.floor(i / 3) * 0.22,
      -0.22 - Math.sin(i * 2) * 0.05,
    ],
    0.5 + (i % 4) * 0.16,
    0.09 + (i % 3) * 0.025,
    i,
  ]);
for (const side of ["left", "right"]) {
  flameSpecs.push([`${side}-upper-arm`, [0, 0.19, -0.02], 0.65, 0.13, 13]);
  flameSpecs.push([`${side}-forearm`, [0, -0.16, -0.15], 0.48, 0.095, 15]);
  flameSpecs.push([`${side}-shin`, [0, -0.18, -0.11], 0.48, 0.085, 17]);
}
flameSpecs.push(["head", [0, 0.43, -0.11], 0.65, 0.12, 19]);
flameSpecs.forEach(([parent, pos, h, r, seed], i) => {
  const pivot = group(`flame-${i}`, parent, pos);
  const path = [
    [0, 0, 0],
    [0.025, h * 0.22, -h * 0.16],
    [-0.03, h * 0.5, -h * 0.3],
    [0.04, h * 0.76, -h * 0.52],
    [0.02, h, -h * 0.63],
  ];
  const radii = [r * 0.65, r, r * 0.65, r * 0.32, 0.002];
  tube(`flame-${i}-outer`, pivot.id, path, radii, "#e52c04", 10, {
    emissive: "#ff3000",
    emissiveIntensity: 0.85,
  });
  tube(
    `flame-${i}-inner`,
    pivot.id,
    path.slice(0, 4).map((p, j) => [p[0], p[1] * 0.77, p[2] - 0.018]),
    [r * 0.4, r * 0.55, r * 0.33, 0.002],
    "#ffb52b",
    8,
    { emissive: "#ff8708", emissiveIntensity: 1.4 },
  );
  animate(pivot, (u) => ({
    scale: [
      1 + 0.13 * Math.sin(2 * Math.PI * u * 2 + seed),
      0.87 + 0.22 * Math.sin(2 * Math.PI * u * 3 + seed),
      1,
    ],
    rotation: [
      0.1 * Math.sin(2 * Math.PI * u * 2 + seed),
      0.12 * Math.cos(2 * Math.PI * u + seed),
      0.16 * Math.sin(2 * Math.PI * u * 3 + seed),
    ],
  }));
});
for (let i = 0; i < 20; i++) {
  const a = i * 2.3999,
    r = 0.48 + (i % 4) * 0.15;
  const ember = glow(
    `ember-${i}`,
    "demon",
    [Math.cos(a) * r, 0.4 + (i % 5) * 0.36, -0.5 - Math.sin(a) * 0.35],
    [0.025, 0.055, 0.025],
    i % 3 ? C.lava : C.core,
    3,
  );
  animate(ember, (u) => ({
    position: [
      Math.cos(a + u * 2 * Math.PI) * r,
      0.35 + (i % 5) * 0.33 + 0.16 * Math.sin(u * 2 * Math.PI + a),
      -0.5 - Math.sin(a + u * 2 * Math.PI) * 0.46,
    ],
    scale: [
      0.025 * (0.6 + 0.35 * Math.sin(u * 4 * Math.PI + a)),
      0.055,
      0.025 * (0.6 + 0.35 * Math.sin(u * 4 * Math.PI + a)),
    ],
  }));
}
animate(root, (u) => ({
  position: [0, 1.87 + 0.055 * Math.cos(4 * Math.PI * (u + 0.1)), 0],
  rotation: [0, 0, 0],
}));
animate(torso, (u) => ({
  rotation: [
    0.2 + 0.025 * Math.cos(4 * Math.PI * u),
    0.075 * Math.sin(2 * Math.PI * u),
    -0.035 * Math.sin(2 * Math.PI * u),
  ],
}));
animate(head, (u) => ({
  rotation: [
    -0.1,
    0.035 * Math.sin(2 * Math.PI * u + 1),
    0.025 * Math.sin(2 * Math.PI * u),
  ],
}));
const duration = 0.88,
  tracks = {};
for (const [id, fn] of animated) {
  const n = nodes.find((n) => n.id === id);
  tracks[id] = Array.from({ length: 33 }, (_, i) => ({
    time: (duration * i) / 32,
    position: [...n.position],
    rotation: [...n.rotation],
    scale: [...n.scale],
    ...fn(i === 32 ? 0 : i / 32),
  }));
}
for (const [id, fn] of animated)
  Object.assign(
    nodes.find((n) => n.id === id),
    fn(0),
  );
const document = validateDocument({
  version: 1,
  name: "CINDER · Burning demon · Run",
  duration,
  fps: 30,
  nodes,
  clips: [
    { id: "run", name: "Run", duration, tracks },
    {
      id: "run-forward",
      name: "Run forward",
      duration,
      loop: false,
      tracks: {
        ...structuredClone(tracks),
        demon: tracks.demon.map((k) => ({
          ...structuredClone(k),
          position: [k.position[0], k.position[1], (2.9 * k.time) / duration],
        })),
      },
    },
  ],
});
await fs.writeFile(
  "examples/cinder-demon.graph.json",
  JSON.stringify(document),
);
console.log(
  `CINDER: ${nodes.length} objects, ${Object.keys(tracks).length} animated tracks, ${duration}s seamless Run.`,
);
