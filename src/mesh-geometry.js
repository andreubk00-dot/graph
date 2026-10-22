import { validateCreases } from "./mesh-creases.js";
export const MAX_MESH_VERTICES = 100000;
export const MAX_SCENE_MESH_VERTICES = 250000;
export const MAX_SCENE_MESH_TRIANGLES = 250000;
function numericArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length)
    throw new Error(`Invalid mesh ${label}`);
  for (const number of value)
    if (
      typeof number !== "number" ||
      !Number.isFinite(number) ||
      Math.abs(number) > 100000
    )
      throw new Error(`Invalid mesh ${label} value`);
}
export function validateMeshGeometry(geometry) {
  const positions = geometry.positions;
  if (
    !Array.isArray(positions) ||
    positions.length < 9 ||
    positions.length % 3 ||
    positions.length > MAX_MESH_VERTICES * 3
  )
    throw new Error(`Mesh requires 3–${MAX_MESH_VERTICES} vertices`);
  numericArray(positions, positions.length, "positions");
  const count = positions.length / 3,
    indices = geometry.indices;
  if (indices !== undefined) {
    if (
      !Array.isArray(indices) ||
      !indices.length ||
      indices.length % 3 ||
      indices.length > 300000
    )
      throw new Error("Invalid mesh triangle indices");
    for (const index of indices)
      if (!Number.isInteger(index) || index < 0 || index >= count)
        throw new Error("Mesh triangle index is outside the vertex array");
  } else if (count % 3)
    throw new Error("A mesh without indices needs complete triangles");
  if (geometry.normals !== undefined) {
    numericArray(geometry.normals, positions.length, "normals");
    for (let i = 0; i < geometry.normals.length; i += 3)
      if (Math.hypot(...geometry.normals.slice(i, i + 3)) < 1e-10)
        throw new Error("Mesh normals cannot be zero");
  }
  if (geometry.colors !== undefined) {
    numericArray(geometry.colors, positions.length, "vertex colors");
    if (geometry.colors.some((c) => c < 0 || c > 1))
      throw new Error("Vertex colors must be linear RGB between 0 and 1");
  }
  if (geometry.uv !== undefined)
    numericArray(geometry.uv, count * 2, "UV coordinates");
  const length = indices?.length ?? count;
  for (let i = 0; i < length; i += 3) {
    const a = (indices?.[i] ?? i) * 3,
      b = (indices?.[i + 1] ?? i + 1) * 3,
      c = (indices?.[i + 2] ?? i + 2) * 3;
    if (isDegenerateTriangle(positions, a / 3, b / 3, c / 3))
      throw new Error("Mesh has a degenerate triangle");
  }
  validateCreases(geometry);
  return count;
}

export function isDegenerateTriangle(positions, a, b, c) {
  const p = (n, axis) => Math.fround(positions[n * 3 + axis]);
  const x = p(b, 0) - p(a, 0),
    y = p(b, 1) - p(a, 1),
    z = p(b, 2) - p(a, 2),
    u = p(c, 0) - p(a, 0),
    v = p(c, 1) - p(a, 1),
    w = p(c, 2) - p(a, 2);
  const area =
    (y * w - z * v) ** 2 + (z * u - x * w) ** 2 + (x * v - y * u) ** 2;
  return (
    area <=
    1e-20 * Math.max(1, (x * x + y * y + z * z) * (u * u + v * v + w * w))
  );
}
