// A deformation bench, deliberately not a character or a claim about anatomy.
import { CylinderGeometry } from "three";
import { emptyDocument, applyCommands } from "./document.js";
export function deformationStudy() {
  const g = new CylinderGeometry(0.16, 0.16, 1.8, 16, 24, false).translate(
      0,
      0.9,
      0,
    ),
    geometry = {
      positions: Array.from(g.attributes.position.array),
      normals: Array.from(g.attributes.normal.array),
      uv: Array.from(g.attributes.uv.array),
      indices: Array.from(g.index.array),
      smooth: true,
    },
    indices = [],
    weights = [];
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i),
      u = Math.max(0, Math.min(1, (y - 0.65) / 0.5)),
      w = u * u * (3 - 2 * u);
    indices.push(0, 1, 0, 0);
    weights.push(1 - w, w, 0, 0);
  }
  g.dispose();
  return applyCommands(emptyDocument(), [
    {
      op: "scene",
      name: "Стенд деформации · не художественная модель",
      duration: 2,
    },
    { op: "create", id: "rig-study", type: "group", position: [0, 0, 0] },
    {
      op: "create",
      id: "joint-root",
      name: "Основание",
      type: "bone",
      parent: "rig-study",
      position: [0, 0, 0],
    },
    {
      op: "create",
      id: "joint-hinge",
      name: "Шарнир · сгибание 0…135°",
      type: "bone",
      parent: "joint-root",
      position: [0, 0.9, 0],
      jointLimit: { axis: "z", min: 0, max: 135, swing: 5 },
    },
    {
      op: "create",
      id: "joint-tip",
      name: "Конец сегмента",
      type: "bone",
      parent: "joint-hinge",
      position: [0, 0.9, 0],
    },
    {
      op: "create",
      id: "deformation-mesh",
      name: "Сетка с плавными весами",
      type: "mesh",
      parent: "rig-study",
      position: [0, 0, 0],
      geometry,
      color: "#b7c5bd",
      roughness: 0.7,
    },
    {
      op: "bindSkin",
      id: "deformation-mesh",
      joints: ["joint-root", "joint-hinge", "joint-tip"],
      indices,
      weights,
    },
    {
      op: "createClip",
      id: "bend",
      name: "Сгибание · 90°",
      duration: 2,
      tracks: {
        "joint-hinge": [0, 1, 2].map((time, i) => ({
          time,
          position: [0, 0.9, 0],
          rotation: [0, 0, i === 1 ? Math.PI / 2 : 0],
          scale: [1, 1, 1],
        })),
      },
    },
    {
      op: "createClip",
      id: "overbend",
      name: "Диагностика · превышение 165°",
      duration: 2,
      tracks: {
        "joint-hinge": [0, 1, 2].map((time, i) => ({
          time,
          position: [0, 0.9, 0],
          rotation: [0, 0, i === 1 ? (165 * Math.PI) / 180 : 0],
          scale: [1, 1, 1],
        })),
      },
    },
  ]);
}
