import { subdivideMeshGeometry } from "./mesh-subdivision.js";
import { editMeshGeometry } from "./mesh-edit.js";

// Bounded ordered stack: one mirror and one Loop subdivision; stable source IDs.
export function validateModifiers(node) {
  const list = node.modifiers;
  if (list === undefined) return;
  if (node.type !== "mesh" || !Array.isArray(list) || list.length > 2)
    throw new Error(
      "A mesh supports at most one mirror and one subdivision modifier",
    );
  if (list.length && node.skin)
    throw new Error("Bake or remove modifiers before binding skin");
  const types = new Set();
  for (const m of list) {
    if (
      !m ||
      typeof m !== "object" ||
      Array.isArray(m) ||
      !["mirror", "subdivision"].includes(m.type)
    )
      throw new Error("Unsupported mesh modifier");
    if (types.has(m.type)) throw new Error("Duplicate modifier type");
    types.add(m.type);
    if (m.enabled !== undefined && typeof m.enabled !== "boolean")
      throw new Error("Modifier enabled must be a boolean");
    const options =
      m.type === "mirror"
        ? ["type", "enabled", "axis", "side", "offset", "tolerance"]
        : ["type", "enabled", "levels"];
    if (Object.keys(m).some((k) => !options.includes(k)))
      throw new Error("Unsupported modifier option");
    if (m.type === "subdivision") {
      if (
        m.levels !== undefined &&
        (!Number.isInteger(m.levels) || m.levels < 1 || m.levels > 3)
      )
        throw new Error("Subdivision levels must be an integer from 1 to 3");
      continue;
    }
    if (m.axis !== undefined && !["x", "y", "z"].includes(m.axis))
      throw new Error("Invalid mirror axis");
    if (m.side !== undefined && !["positive", "negative"].includes(m.side))
      throw new Error("Invalid mirror side");
    for (const [key, max] of [
      ["offset", 100000],
      ["tolerance", 1],
    ])
      if (
        m[key] !== undefined &&
        (!Number.isFinite(m[key]) ||
          Math.abs(m[key]) > max ||
          (key === "tolerance" && m[key] < 0))
      )
        throw new Error("Invalid mirror plane or tolerance");
  }
}

export function evaluateMeshGeometry(node) {
  validateModifiers(node);
  let geometry = node.geometry;
  for (const m of node.modifiers ?? [])
    if (m.enabled !== false)
      geometry =
        m.type === "mirror"
          ? editMeshGeometry(geometry, { ...m, action: "mirror" })
          : subdivideMeshGeometry(geometry, m.levels ?? 1);
  return geometry;
}

export function setModifiers(node, modifiers) {
  if (!node || node.type !== "mesh")
    throw new Error("Modifiers require a mesh");
  if (!Array.isArray(modifiers)) throw new Error("Modifiers must be an array");
  const candidate = { ...node, modifiers: structuredClone(modifiers) };
  evaluateMeshGeometry(candidate); // Validate even disabled metadata; fail before mutation.
  if (modifiers.length) node.modifiers = candidate.modifiers;
  else delete node.modifiers;
}

export function bakeModifiers(node) {
  if (!node?.modifiers?.length)
    throw new Error("Object has no modifiers to bake");
  const geometry = evaluateMeshGeometry(node);
  if (geometry !== node.geometry) {
    node.geometry = geometry;
    delete node.sculpt;
  }
  delete node.modifiers;
}
