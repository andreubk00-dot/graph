import { CatmullRomCurve3, Vector3 } from "three";
import fs from "node:fs/promises";
import { emptyDocument, applyCommands } from "../src/document.js";
import { ranger, rune } from "../src/art-examples.js";
import { frameSVG } from "../src/art-document.js";
const parts = [];
const e = (center, radius, color, smooth = 0.12, extra = {}) =>
  parts.push({ shape: "ellipsoid", center, radius, color, smooth, ...extra });
const c = (a, b, radius, color, smooth = 0.08, extra = {}) =>
  parts.push({ shape: "capsule", a, b, radius, color, smooth, ...extra });
e([0, 0.55, -0.1], [0.93, 0.64, 0.48], "#253d46", 0.25);
e([0, 1.1, -0.05], [0.34, 0.75, 0.32], "#486269", 0.24);
e([0, 2.08, -0.04], [0.54, 0.71, 0.47], "#435a61", 0.17);
e([0, 1.74, 0.18], [0.4, 0.38, 0.36], "#38535a", 0.16);
e([0, 2.06, 0.48], [0.09, 0.25, 0.15], "#6f8581", 0.08);
for (const s of [-1, 1]) {
  e([s * 0.76, 0.72, -0.08], [0.43, 0.37, 0.43], "#2a414b", 0.22);
  c([s * 0.2, 1.42, 0.03], [s * 0.72, 0.87, 0.2], 0.15, "#40595d", 0.12, {
    endRadius: 0.22,
  });
  e([s * 0.27, 0.7, 0.28], [0.43, 0.26, 0.18], "#48615f", 0.18, {
    rotation: [0, 0, s * 0.14],
  });
  e([s * 0.36, 2.0, 0.28], [0.15, 0.27, 0.22], "#4b6263", 0.1, {
    rotation: [0, 0, s * 0.3],
  });
  e([s * 0.23, 2.34, 0.34], [0.3, 0.115, 0.19], "#536a6b", 0.09, {
    rotation: [0, 0, s * 0.23],
  });
  const points = [
    [s * 0.37, 2.58, -0.1],
    [s * 0.6, 2.88, -0.13],
    [s * 0.69, 3.18, -0.22],
    [s * 0.58, 3.43, -0.24],
    [s * 0.4, 3.58, -0.17],
  ];
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)))
    .getPoints(8)
    .map((p) => p.toArray());
  const radii = Array.from(
    { length: 9 },
    (_, i) => 0.175 * (1 - i / 8) ** 0.85 + 0.009,
  );
  for (let j = 0; j < 8; j++)
    c(curve[j], curve[j + 1], radii[j], "#18242f", 0.025, {
      endRadius: radii[j + 1],
    });
  c([s * 0.4, 1.86, 0.27], [s * 0.51, 1.63, 0.34], 0.09, "#c2b68c", 0.07, {
    endRadius: 0.015,
  });
  e([s * 0.225, 2.22, 0.47], [0.17, 0.105, 0.16], "#163c46", 0.024, {
    op: "subtract",
    rotation: [0, 0, s * 0.18],
  });
  c([s * 0.4, 2.03, 0.5], [s * 0.28, 1.9, 0.53], 0.028, "#b6ae7b", 0.014, {
    op: "subtract",
  });
  c([s * 0.4, 0.86, 0.43], [s * 0.72, 0.74, 0.37], 0.04, "#b6ae7b", 0.025, {
    op: "subtract",
  });
  c([s * 0.42, 0.79, 0.46], [s * 0.72, 0.65, 0.36], 0.035, "#b6ae7b", 0.02, {
    op: "subtract",
  });
  c([s * 0.22, 1.26, 0.22], [s * 0.4, 1.03, 0.3], 0.035, "#294f58", 0.018, {
    op: "subtract",
  });
}
c([-0.22, 1.81, 0.51], [0.22, 1.81, 0.51], 0.052, "#193c43", 0.018, {
  op: "subtract",
});
c([0, 0.34, 0.37], [0, 0.82, 0.43], 0.032, "#a4ae8d", 0.018, {
  op: "subtract",
});
const recipe = {
  version: 1,
  resolution: 96,
  keepLargestSurface: true,
  bounds: [
    [-1.5, -0.35, -1],
    [1.5, 3.85, 1.1],
  ],
  parts,
};
let doc = applyCommands(emptyDocument(), [
  { op: "scene", name: "Ossuary Warden · sculpt study" },
  {
    op: "sculpt",
    id: "warden",
    name: "Warden · continuous carved surface",
    recipe,
    position: [0, 0.1, 0],
    roughness: 0.73,
  },
]);
for (const s of [-1, 1])
  doc = applyCommands(doc, [
    {
      op: "create",
      type: "extrude",
      id: `eye-${s}`,
      name: "Inset jade eye",
      parent: "warden",
      position: [s * 0.225, 2.22, 0.455],
      rotation: [0, 0, s * 0.18],
      color: "#90ffd6",
      emissive: "#51eab8",
      emissiveIntensity: 1.4,
      geometry: {
        outline: [
          [-0.12, 0],
          [-0.06, 0.031],
          [0.055, 0.027],
          [0.12, 0],
          [0.05, -0.025],
          [-0.06, -0.026],
        ],
        depth: 0.016,
      },
    },
  ]);
await fs.writeFile(
  "examples/warden.sculpt.json",
  JSON.stringify(recipe, null, 2),
);
await fs.writeFile("examples/warden.graph.json", JSON.stringify(doc));
await fs.writeFile("examples/ranger.art.json", JSON.stringify(ranger()));
await fs.writeFile("examples/tideglass.art.json", JSON.stringify(rune()));
await fs.writeFile("examples/tideglass.svg", frameSVG(rune()));
console.log(
  "Asset pack:",
  parts.length,
  "sculpt fields;",
  doc.nodes[0].geometry.indices.length / 3,
  "triangles; 8 pixel frames; vector illustration.",
);

const lowRecipe = { ...recipe, resolution: 48 };
const low = applyCommands(doc, [
  { op: "scene", name: "Ossuary Warden · LOD1" },
  { op: "sculpt", id: "warden", recipe: lowRecipe },
]);
await fs.writeFile("examples/warden-low.graph.json", JSON.stringify(low));
await fs.writeFile(
  "examples/asset-pack.json",
  JSON.stringify(
    {
      version: 1,
      assets: [
        {
          id: "asterion",
          kind: "3d",
          source: "asterion.graph.json",
          model: "asterion.glb",
          generator: "scripts/build-asterion.js",
          triangles: 6292,
          upAxis: "Y",
          units: "meters",
          pivot: "grip",
          animated: false,
        },
        {
          id: "cinder",
          kind: "3d",
          source: "cinder-demon.graph.json",
          model: "cinder-demon.glb",
          generator: "scripts/build-demon.js",
          upAxis: "Y",
          forwardAxis: "Z",
          units: "meters",
          animated: true,
          clips: [
            {
              id: "run",
              duration: 0.88,
              loop: true,
              rootDistance: 0,
            },
            {
              id: "run-forward",
              duration: 0.88,
              loop: false,
              rootDistance: 2.9,
            },
          ],
        },
        {
          id: "warden",
          kind: "3d",
          source: "warden.graph.json",
          recipe: "warden.sculpt.json",
          model: "warden.glb",
          lods: [
            {
              file: "warden.glb",
              triangles: doc.nodes[0].geometry.indices.length / 3 + 40,
            },
            {
              file: "warden-low.glb",
              triangles: low.nodes[0].geometry.indices.length / 3 + 40,
            },
          ],
          upAxis: "Y",
          forwardAxis: "Z",
          units: "meters",
          materials: "vertex-color",
          animated: false,
        },
        {
          id: "ranger",
          kind: "pixel",
          source: "ranger.art.json",
          atlas: "ranger-atlas.png",
          metadata: "ranger-atlas.json",
          width: 64,
          height: 64,
          frames: 8,
          frameDuration: 80,
        },
        {
          id: "tideglass",
          kind: "vector",
          source: "tideglass.art.json",
          svg: "tideglass.svg",
          png: "tideglass.png",
          width: 512,
          height: 512,
        },
      ],
    },
    null,
    2,
  ),
);
console.log(
  "Warden LOD1:",
  low.nodes[0].geometry.indices.length / 3,
  "triangles",
);
