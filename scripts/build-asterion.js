// Controlled hard-surface model: exact bilateral profiles, faceted blade, rounded guard.
import fs from "node:fs/promises";
import * as THREE from "three";
import { emptyDocument, makeNode, validateDocument } from "../src/document.js";
import { auditMesh, stripEmptyFaces } from "../src/mesh-audit.js";
const doc = emptyDocument();
doc.name = "ASTERION · Precision-forged blade";
doc.nodes.push(
  makeNode("group", {
    id: "asterion",
    name: "ASTERION · grip pivot / meters",
    position: [0, 0, 0],
    scale: [0.4, 0.4, 0.4],
  }),
);
function mesh(
  id,
  geometry,
  {
    color = "#ffffff",
    metalness = 0.8,
    roughness = 0.28,
    emissive = "#000000",
    emissiveIntensity = 0,
  } = {},
) {
  geometry.translate(0, -0.55, 0);
  geometry.normalizeNormals();
  let g = {
    positions: Array.from(geometry.attributes.position.array),
    normals: Array.from(geometry.attributes.normal.array),
    smooth: true,
  };
  if (geometry.index) g.indices = Array.from(geometry.index.array);
  if (geometry.attributes.uv) g.uv = Array.from(geometry.attributes.uv.array);
  if (geometry.attributes.color)
    g.colors = Array.from(geometry.attributes.color.array);
  g = stripEmptyFaces(g);
  geometry.dispose();
  doc.nodes.push(
    makeNode("mesh", {
      id,
      name: id.replaceAll("-", " "),
      parent: "asterion",
      position: [0, 0, 0],
      geometry: g,
      color,
      metalness,
      roughness,
      emissive,
      emissiveIntensity,
    }),
  );
  return g;
}
// Explicit cross-section facets retain hard edges across the blade and smooth taper along its length.
const rings = [
  [1.12, 0.18],
  [1.25, 0.225],
  [1.58, 0.205],
  [2.6, 0.16],
  [2.98, 0.11],
  [3.4, 0.001],
];
const cross = [
  [-1, 0],
  [-0.76, 0.52],
  [0, 1],
  [0.76, 0.52],
  [1, 0],
  [0.76, -0.52],
  [0, -1],
  [-0.76, -0.52],
];
const positions = [],
  colors = [],
  indices = [],
  uv = [];
for (let band = 0; band < 8; band++) {
  const start = positions.length / 3;
  for (let row = 0; row < rings.length; row++) {
    const [y, w] = rings[row],
      thickness = Math.max(0.001, 0.07 * (w / 0.225));
    for (const j of [band, (band + 1) % 8]) {
      positions.push(cross[j][0] * w, y, cross[j][1] * thickness);
      uv.push(j / 8, (y - 1.12) / 2.28);
      const color = new THREE.Color(
        band === 0 || band === 3 || band === 4 || band === 7
          ? "#d9e6ec"
          : band % 2
            ? "#7d9eb1"
            : "#aec4d0",
      );
      colors.push(color.r, color.g, color.b);
    }
    if (row) {
      const a = start + (row - 1) * 2,
        b = a + 1,
        c = start + row * 2,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
}
let blade = new THREE.BufferGeometry();
blade.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
blade.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
blade.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
blade.setIndex(indices);
blade.computeVertexNormals();
// Ring traversal is clockwise viewed from +Y: reverse if normals face inward.
const pos = blade.attributes.position,
  normal = blade.attributes.normal;
let dot = 0;
for (let i = 0; i < pos.count; i++)
  dot += pos.getX(i) * normal.getX(i) + pos.getZ(i) * normal.getZ(i);
if (dot < 0) {
  for (let i = 0; i < indices.length; i += 3)
    [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  blade.setIndex(indices);
  blade.computeVertexNormals();
}
// Close both ends with independent flat-normal caps, preserving bevel creases.
const caps = [];
for (const [row, sign] of [
  [0, -1],
  [rings.length - 1, 1],
]) {
  const [y, w] = rings[row],
    t = Math.max(0.001, (0.07 * w) / 0.225);
  for (let j = 0; j < 8; j++) {
    const a = cross[j],
      b = cross[(j + 1) % 8],
      triangle = [
        [0, y, 0],
        [a[0] * w, y, a[1] * t],
        [b[0] * w, y, b[1] * t],
      ];
    if (sign < 0) triangle.reverse();
    caps.push(...triangle.flat());
  }
}
const cap = new THREE.BufferGeometry();
cap.setAttribute("position", new THREE.Float32BufferAttribute(caps, 3));
cap.computeVertexNormals();
const flat = blade.toNonIndexed(),
  joined = { position: [], normal: [], color: [], uv: [] };
for (const g of [flat, cap])
  for (let i = 0; i < g.attributes.position.count; i++) {
    joined.position.push(
      g.attributes.position.getX(i),
      g.attributes.position.getY(i),
      g.attributes.position.getZ(i),
    );
    joined.normal.push(
      g.attributes.normal.getX(i),
      g.attributes.normal.getY(i),
      g.attributes.normal.getZ(i),
    );
    joined.color.push(
      ...(g.attributes.color
        ? [
            g.attributes.color.getX(i),
            g.attributes.color.getY(i),
            g.attributes.color.getZ(i),
          ]
        : new THREE.Color("#7c94a2").toArray()),
    );
    joined.uv.push(
      ...(g.attributes.uv
        ? [g.attributes.uv.getX(i), g.attributes.uv.getY(i)]
        : [0, 0]),
    );
  }
blade.dispose();
flat.dispose();
cap.dispose();
blade = new THREE.BufferGeometry();
for (const k of ["position", "normal", "color", "uv"])
  blade.setAttribute(
    k,
    new THREE.Float32BufferAttribute(joined[k], k === "uv" ? 2 : 3),
  );
mesh("blade", blade, { roughness: 0.24 });
function extrude(id, shape, depth, bevel, material) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 4,
    curveSegments: 20,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  return mesh(id, g, material);
}
function polygon(points) {
  const s = new THREE.Shape();
  s.moveTo(...points[0]);
  points.slice(1).forEach((p) => s.lineTo(...p));
  s.closePath();
  return s;
}
const guard = new THREE.Shape();
guard.moveTo(0, 1.16);
guard.bezierCurveTo(-0.18, 1.17, -0.38, 1.1, -0.53, 1.13);
guard.quadraticCurveTo(-0.63, 1.16, -0.66, 1.28);
guard.quadraticCurveTo(-0.7, 1.01, -0.49, 0.99);
guard.quadraticCurveTo(-0.22, 0.98, 0, 1.04);
guard.quadraticCurveTo(0.22, 0.98, 0.49, 0.99);
guard.quadraticCurveTo(0.7, 1.01, 0.66, 1.28);
guard.quadraticCurveTo(0.63, 1.16, 0.53, 1.13);
guard.bezierCurveTo(0.38, 1.1, 0.18, 1.17, 0, 1.16);
guard.closePath();
extrude("swept-guard", guard, 0.18, 0.025, {
  color: "#b68d48",
  metalness: 0.84,
  roughness: 0.3,
});
extrude(
  "guard-collar",
  polygon([
    [-0.16, 1.02],
    [-0.22, 1.1],
    [-0.13, 1.23],
    [0, 1.28],
    [0.13, 1.23],
    [0.22, 1.1],
    [0.16, 1.02],
  ]),
  0.22,
  0.014,
  { color: "#283e50", metalness: 0.85 },
);
extrude(
  "guard-jewel",
  polygon([
    [-0.075, 1.1],
    [0, 1.185],
    [0.075, 1.1],
    [0, 1.045],
  ]),
  0.012,
  0.005,
  {
    color: "#7acac1",
    metalness: 0.25,
    roughness: 0.18,
    emissive: "#1c796f",
    emissiveIntensity: 0.25,
  },
);
// Place the jewel on the front face of the collar; all central details stay exactly on X=0.
doc.nodes.at(-1).position[2] = 0.132;
const profile = [
  [0, 0.19],
  [0.072, 0.19],
  [0.092, 0.24],
  [0.082, 0.35],
  [0.074, 0.56],
  [0.081, 0.82],
  [0.1, 0.94],
  [0.1, 1.03],
  [0, 1.03],
].map((p) => new THREE.Vector2(...p));
mesh("wrapped-grip", new THREE.LatheGeometry(profile, 12), {
  color: "#253746",
  metalness: 0.05,
  roughness: 0.86,
});
for (const y of [0.24, 0.93]) {
  const profile = [
    [0, y - 0.025],
    [0.095, y - 0.025],
    [0.105, y - 0.012],
    [0.105, y + 0.012],
    [0.095, y + 0.025],
    [0, y + 0.025],
  ].map((p) => new THREE.Vector2(...p));
  mesh(
    `grip-ferrule-${Math.round(y * 100)}`,
    new THREE.LatheGeometry(profile, 24),
    { color: "#c6a35d", roughness: 0.32 },
  );
}
const wrap = new THREE.CatmullRomCurve3(
  Array.from({ length: 161 }, (_, i) => {
    const t = i / 160,
      y = 0.28 + t * 0.61,
      r = 0.087 + Math.abs(y - 0.58) * 0.009,
      a = t * Math.PI * 2 * 6;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  }),
);
const tube = new THREE.TubeGeometry(wrap, 160, 0.008, 6, false),
  flatTube = tube.toNonIndexed();
const tubePos = Array.from(flatTube.attributes.position.array),
  tubeNormals = Array.from(flatTube.attributes.normal.array),
  tubeUV = Array.from(flatTube.attributes.uv.array);
for (const [row, t, sign] of [
  [0, 0, -1],
  [160, 1, 1],
]) {
  const center = wrap.getPointAt(t),
    normal = wrap.getTangentAt(t).multiplyScalar(sign);
  for (let j = 0; j < 6; j++) {
    const a = new THREE.Vector3().fromBufferAttribute(
        tube.attributes.position,
        row * 7 + j,
      ),
      b = new THREE.Vector3().fromBufferAttribute(
        tube.attributes.position,
        row * 7 + j + 1,
      ),
      points = [center, a, b];
    if (a.clone().sub(center).cross(b.clone().sub(center)).dot(normal) < 0)
      [points[1], points[2]] = [points[2], points[1]];
    for (const v of points) {
      tubePos.push(...v.toArray());
      tubeNormals.push(...normal.toArray());
      tubeUV.push(0.5, 0.5);
    }
  }
}
tube.dispose();
flatTube.dispose();
const closedTube = new THREE.BufferGeometry();
closedTube.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(tubePos, 3),
);
closedTube.setAttribute(
  "normal",
  new THREE.Float32BufferAttribute(tubeNormals, 3),
);
closedTube.setAttribute("uv", new THREE.Float32BufferAttribute(tubeUV, 2));
mesh("leather-binding", closedTube, {
  color: "#647d87",
  metalness: 0.02,
  roughness: 0.8,
});
extrude(
  "pommel-frame",
  polygon([
    [0, 0.01],
    [-0.13, 0.1],
    [-0.12, 0.23],
    [0, 0.29],
    [0.12, 0.23],
    [0.13, 0.1],
  ]),
  0.14,
  0.02,
  { color: "#b28c4d", roughness: 0.29 },
);
extrude(
  "pommel-inset",
  polygon([
    [0, 0.055],
    [-0.073, 0.115],
    [-0.07, 0.195],
    [0, 0.235],
    [0.07, 0.195],
    [0.073, 0.115],
  ]),
  0.018,
  0.005,
  { color: "#3c7379", metalness: 0.35, roughness: 0.22 },
);
doc.nodes.at(-1).position[2] = 0.1;
// A central engraved-looking luminous channel uses one thin mesh, aligned to the blade ridge.
for (const sign of [-1, 1]) {
  const ys = [1.4, 1.58, 2.6, 2.75, 2.82],
    pos = [],
    idx = [];
  for (const [i, y] of ys.entries()) {
    let k = Math.max(
      1,
      rings.findIndex((r) => r[0] >= y),
    );
    const [y0, w0] = rings[k - 1],
      [y1, w1] = rings[k],
      w = w0 + ((w1 - w0) * (y - y0)) / (y1 - y0),
      z = (0.07 * w) / 0.225 + 0.0015,
      r = i === ys.length - 1 ? 0.0005 : 0.01;
    for (const [x, dz] of [
      [-r, 0.0005],
      [r, 0.0005],
      [r, -0.0005],
      [-r, -0.0005],
    ])
      pos.push(x, y, sign * (z + dz));
    if (i)
      for (let j = 0; j < 4; j++) {
        const a = (i - 1) * 4 + j,
          b = (i - 1) * 4 + ((j + 1) % 4),
          c = i * 4 + j,
          d = i * 4 + ((j + 1) % 4);
        idx.push(a, b, c, b, d, c);
      }
  }
  idx.push(0, 2, 1, 0, 3, 2);
  const end = (ys.length - 1) * 4;
  idx.push(end, end + 1, end + 2, end, end + 2, end + 3);
  if (sign < 0)
    for (let i = 0; i < idx.length; i += 3)
      [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  mesh(`rune-channel-${sign}`, g, {
    color: "#57b7ad",
    metalness: 0.1,
    roughness: 0.6,
    emissive: "#1e6f67",
    emissiveIntensity: 0.5,
  });
}
const valid = validateDocument(doc),
  reports = Object.fromEntries(
    valid.nodes
      .filter((n) => n.type === "mesh")
      .map((n) => [n.id, auditMesh(n.geometry, { tolerance: 1e-5 })]),
  );
await fs.writeFile("examples/asterion.graph.json", JSON.stringify(valid));
await fs.writeFile(
  "examples/asterion-quality.json",
  JSON.stringify(reports, null, 2),
);
for (const [name, r] of Object.entries(reports))
  console.log(name, JSON.stringify(r));
