// Blocks and point trajectories are an engineering test, not a character model.
import { emptyDocument, applyCommands } from "./document.js";
import { runCycle } from "./locomotion.js";
export function motionStudy() {
  const base = applyCommands(emptyDocument(), [
    { op: "scene", name: "Стенд измерений и 3D-опоры", duration: 2 },
    {
      op: "create",
      type: "group",
      id: "motion-root",
      position: [0, 0, 0],
      name: "Общий корень стенда",
    },
    ...["left", "right"].flatMap((side, i) => [
      {
        op: "create",
        type: "group",
        id: side + "-sole",
        parent: "motion-root",
        position: [i ? 0.15 : -0.15, 0, 0],
        name: side + " · точки подошвы",
      },
      {
        op: "create",
        type: "box",
        id: side + "-block",
        parent: side + "-sole",
        position: [0, 0.04, 0],
        scale: [0.16, 0.08, 0.28],
        color: i ? "#ddb46d" : "#6daab1",
        name: side + " · технический блок",
      },
    ]),
  ]);
  const variants = [
    ["travel", "Верная опора", 1, 0, 0],
    ["sliding", "Ошибка · скольжение", 1.4, 0, 0],
    ["backwards", "Ошибка · движение назад", -1, 0, 0],
    ["below-ground", "Ошибка · ниже земли", 1, -0.04, 0],
    ["wrong-facing", "Ошибка · взгляд назад", 1, 0, Math.PI],
    ["in-place", "На месте · виртуальный шаг", 0, 0, 0],
  ];
  const commands = variants.map(([id, name, travel, drop, yaw]) => {
    const tracks = { "motion-root": [], "left-sole": [], "right-sole": [] };
    for (let i = 0; i <= 64; i++) {
      const phase = i / 64,
        time = phase * 2;
      tracks["motion-root"].push({
        time,
        position: [0, 0, travel * phase],
        rotation: [0, yaw, 0],
        scale: [1, 1, 1],
      });
      for (const [side, index] of [
        ["left", 0],
        ["right", 1],
      ]) {
        const g = runCycle(phase + index * 0.5, {
          distance: 1,
          duty: 0.3,
          lift: 0.22,
        });
        tracks[side + "-sole"].push({
          time,
          position: [
            index ? 0.15 : -0.15,
            g.height + drop,
            g.forward * (yaw ? -1 : 1),
          ],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        });
      }
    }
    return {
      op: "createClip",
      id,
      name,
      duration: 2,
      loop: id === "in-place",
      tracks,
    };
  });
  const landmarks = {};
  for (const side of ["left", "right"])
    for (const [part, z] of [
      ["center", 0],
      ["heel", -0.1],
      ["toe", 0.1],
    ])
      landmarks[side + "-" + part] = {
        node: side + "-sole",
        point: [0, 0, z],
        label: side + " " + part,
      };
  const review = {
    version: 1,
    landmarks,
    measurements: [
      {
        id: "stance-width",
        label: "Расстояние между блоками",
        between: ["left-center", "right-center"],
        range: [0.299, 0.301],
      },
      {
        id: "length-width",
        label: "Длина / расстояние",
        between: ["left-heel", "left-toe"],
        reference: ["left-center", "right-center"],
        range: [0.66, 0.67],
      },
    ],
    symmetry: [
      {
        id: "bilateral",
        label: "Симметрия базовой расстановки",
        pairs: [
          ["left-center", "right-center"],
          ["left-heel", "right-heel"],
          ["left-toe", "right-toe"],
        ],
        plane: { node: "motion-root", axis: "x", offset: 0 },
        tolerance: 0.001,
      },
    ],
    motion: {
      clip: "travel",
      root: "motion-root",
      forward: [0, 0, 1],
      facingAxis: [0, 0, 1],
      mode: "root",
      groundY: 0,
      requireFlight: true,
      flightHeight: 0.015,
      tolerances: {
        slip: 0.004,
        ground: 0.002,
        penetration: 0.002,
        travel: 0.001,
        facingAngle: 30,
      },
      feet: ["left", "right"].map((side, i) => ({
        id: side,
        label: side,
        sole: [side + "-center", side + "-heel", side + "-toe"],
        contacts: [
          { landmark: side + "-center", start: i * 0.5, end: i * 0.5 + 0.3 },
        ],
      })),
    },
  };
  return applyCommands(base, [...commands, { op: "setReview", review }]);
}
