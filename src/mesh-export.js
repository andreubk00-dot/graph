import { BufferGeometry, BufferAttribute, Vector3 } from "three";
import { isDegenerateTriangle } from "./mesh-geometry.js";

// glTF has no material.flatShading flag. Bake face normals in an export-only
// buffer, retaining the document/viewport vertex identities and all attributes.
export function flatExportGeometry(input) {
  const position = input.attributes.position,
    normal = input.attributes.normal;
  const ids =
    input.index?.array ?? Array.from({ length: position.count }, (_, i) => i);
  const valid = [],
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    cross = new Vector3(),
    n = new Vector3();
  let split = false;
  for (let i = 0; i < ids.length; i += 3) {
    const triangle = [ids[i], ids[i + 1], ids[i + 2]];
    if (isDegenerateTriangle(position.array, ...triangle)) {
      split = true;
      continue;
    }
    valid.push(...triangle);
    a.fromBufferAttribute(position, triangle[0]);
    b.fromBufferAttribute(position, triangle[1]);
    c.fromBufferAttribute(position, triangle[2]);
    cross.crossVectors(b.sub(a), c.sub(a)).normalize();
    if (
      !normal ||
      triangle.some(
        (v) => n.fromBufferAttribute(normal, v).dot(cross) < 1 - 1e-5,
      )
    )
      split = true;
  }
  if (!split) return input; // Existing split face normals (e.g. a box) already agree.
  if (!valid.length) throw new Error("No valid triangles to export");
  const output = new BufferGeometry();
  for (const [name, attribute] of Object.entries(input.attributes)) {
    if (name === "normal") continue;
    const values = new attribute.array.constructor(
      valid.length * attribute.itemSize,
    );
    for (let i = 0; i < valid.length; i++)
      for (let k = 0; k < attribute.itemSize; k++)
        values[i * attribute.itemSize + k] =
          attribute.array[valid[i] * attribute.itemSize + k];
    output.setAttribute(
      name,
      new BufferAttribute(values, attribute.itemSize, attribute.normalized),
    );
  }
  output.computeVertexNormals();
  output.normalizeNormals();
  return output;
}
