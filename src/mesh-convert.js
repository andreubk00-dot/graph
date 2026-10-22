import { geometryFor } from "./scene.js";
import { validateMeshGeometry, isDegenerateTriangle } from "./mesh-geometry.js";
export function bakeMeshGeometry(node) {
  if (!node || ["group", "bone"].includes(node.type))
    throw new Error("Choose a surface object");
  if (node.type === "mesh") return structuredClone(node.geometry);
  const buffer = geometryFor(node);
  try {
    const g = {
      positions: Array.from(buffer.attributes.position.array),
      smooth:
        node.geometry.smooth ??
        (["sphere", "capsule", "lathe"].includes(node.type) ||
          (node.type === "box" && node.geometry.bevel > 0)),
    };
    if (buffer.index) g.indices = Array.from(buffer.index.array);
    for (const [name, key] of [
      ["normal", "normals"],
      ["uv", "uv"],
      ["color", "colors"],
    ])
      if (buffer.attributes[name])
        g[key] = Array.from(buffer.attributes[name].array);
    const source =
      g.indices ?? Array.from({ length: g.positions.length / 3 }, (_, i) => i);
    g.indices = [];
    for (let i = 0; i < source.length; i += 3) {
      const triangle = source.slice(i, i + 3);
      if (!isDegenerateTriangle(g.positions, ...triangle))
        g.indices.push(...triangle);
    }
    validateMeshGeometry(g);
    return g;
  } finally {
    buffer.dispose();
  }
}
