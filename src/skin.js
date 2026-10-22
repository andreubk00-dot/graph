import { Matrix4, Vector3, Quaternion, Euler } from "three";
const matrixOK = (m) =>
  Array.isArray(m) &&
  m.length === 16 &&
  m.every(
    (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e10,
  ) &&
  Math.abs(m[3]) + Math.abs(m[7]) + Math.abs(m[11]) + Math.abs(m[15] - 1) <
    1e-8 &&
  Math.abs(new Matrix4().fromArray(m).determinant()) > 1e-12;
export function validateSkin(node, byId) {
  const s = node.skin;
  if (s === undefined) return;
  if (node.keys.length)
    throw new Error(
      "Animate bones or the rig root, not the skinned mesh transform",
    );
  if (
    node.type !== "mesh" ||
    !s ||
    !Array.isArray(s.joints) ||
    !s.joints.length ||
    s.joints.length > 256 ||
    new Set(s.joints).size !== s.joints.length
  )
    throw new Error("Skin needs a mesh and 1–256 unique bones");
  for (const id of s.joints)
    if (typeof id !== "string" || byId.get(id)?.type !== "bone")
      throw new Error(`Skin bone not found: ${id}`);
  // One connected bone hierarchy; the first joint is its root, including zero-weight intermediates.
  const set = new Set(s.joints);
  for (const id of s.joints.slice(1)) {
    let p = byId.get(id).parent;
    while (p !== s.joints[0]) {
      if (!set.has(p))
        throw new Error(
          "Skin joints must form one connected bone hierarchy, root first",
        );
      p = byId.get(p).parent;
    }
  }
  if (
    !matrixOK(s.bindMatrix) ||
    !Array.isArray(s.inverseBindMatrices) ||
    s.inverseBindMatrices.length !== s.joints.length ||
    !s.inverseBindMatrices.every(matrixOK)
  )
    throw new Error("Invalid skin bind matrices");
  const size = (node.geometry.positions.length / 3) * 4;
  if (
    !Array.isArray(s.indices) ||
    s.indices.length !== size ||
    !Array.isArray(s.weights) ||
    s.weights.length !== size
  )
    throw new Error("Skin needs four joint indices and weights per vertex");
  for (let i = 0; i < size; i += 4) {
    let sum = 0;
    const used = new Set();
    for (let j = 0; j < 4; j++) {
      const index = s.indices[i + j],
        w = s.weights[i + j];
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= s.joints.length ||
        typeof w !== "number" ||
        !Number.isFinite(w) ||
        w < 0 ||
        w > 1
      )
        throw new Error("Invalid skin influence");
      if (w > 0) {
        if (used.has(index)) throw new Error("Duplicate active skin influence");
        used.add(index);
      }
      sum += w;
    }
    if (Math.abs(sum - 1) > 1e-5)
      throw new Error("Skin weights must sum to one");
  }
  let visible = node;
  while (visible && visible.visible) visible = byId.get(visible.parent);
  if (!visible)
    for (const id of s.joints) {
      let bone = byId.get(id);
      while (bone) {
        if (!bone.visible)
          throw new Error(
            "Visible skin cannot reference a hidden bone; use the rig overlay toggle",
          );
        bone = byId.get(bone.parent);
      }
    }
}
export function validateJointLimit(n) {
  const l = n.jointLimit;
  if (l === undefined) return;
  if (
    n.type !== "bone" ||
    !l ||
    !["x", "y", "z"].includes(l.axis) ||
    ![l.min, l.max, l.swing].every(Number.isFinite) ||
    l.min < -180 ||
    l.max > 180 ||
    l.min > 0 ||
    l.max < 0 ||
    l.min >= l.max ||
    l.swing < 0 ||
    l.swing > 180
  )
    throw new Error("Invalid bone joint limit (degrees relative to rest)");
}
export function worldRestMatrices(doc) {
  const map = new Map(doc.nodes.map((n) => [n.id, n])),
    cache = new Map();
  function world(id) {
    if (cache.has(id)) return cache.get(id);
    const n = map.get(id);
    if (!n) throw new Error("Bind node not found");
    const local = new Matrix4().compose(
      new Vector3(...n.position),
      new Quaternion().setFromEuler(new Euler(...n.rotation)),
      new Vector3(...n.scale),
    );
    const m = n.parent ? world(n.parent).clone().multiply(local) : local;
    cache.set(id, m);
    return m;
  }
  for (const n of doc.nodes) world(n.id);
  return cache;
}
export function bindSkin(doc, node, cmd) {
  if (node?.modifiers?.length)
    throw new Error("Bake or remove modifiers before binding skin");
  if (node?.type !== "mesh") throw new Error("Select a mesh for skin binding");
  if (!Array.isArray(cmd.joints)) throw new Error("Skin joints are required");
  const matrices = worldRestMatrices(doc);
  node.skin = {
    joints: structuredClone(cmd.joints),
    indices: structuredClone(cmd.indices),
    weights: structuredClone(cmd.weights),
    bindMatrix: matrices.get(node.id).toArray(),
    inverseBindMatrices: cmd.joints.map((id) => {
      if (!matrices.has(id)) throw new Error("Bind bone not found");
      return matrices.get(id).clone().invert().toArray();
    }),
  };
}
export function setSkinWeights(node, cmd) {
  if (
    !node?.skin ||
    !Array.isArray(cmd.vertices) ||
    !cmd.vertices.length ||
    cmd.vertices.length > 100000 ||
    !Array.isArray(cmd.influences) ||
    !cmd.influences.length ||
    cmd.influences.length > 4
  )
    throw new Error("Weight edit needs vertices and 1–4 influences");
  const ids = cmd.influences.map((i) => node.skin.joints.indexOf(i.joint)),
    weights = cmd.influences.map((i) => i.weight);
  if (
    ids.some((i) => i < 0) ||
    new Set(ids).size !== ids.length ||
    weights.some((w) => !Number.isFinite(w) || w <= 0 || w > 1) ||
    Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-5
  )
    throw new Error(
      "Weight edit requires unique bones and positive weights summing to one",
    );
  for (const v of cmd.vertices) {
    if (
      !Number.isInteger(v) ||
      v < 0 ||
      v >= node.geometry.positions.length / 3
    )
      throw new Error("Weight vertex outside mesh");
    for (let j = 0; j < 4; j++) {
      node.skin.indices[v * 4 + j] = ids[j] ?? 0;
      node.skin.weights[v * 4 + j] = weights[j] ?? 0;
    }
  }
}
export function jointAngles(rest, rotation, axis) {
  const r = new Quaternion()
      .setFromEuler(new Euler(...rest))
      .invert()
      .multiply(new Quaternion().setFromEuler(new Euler(...rotation))),
    i = ["x", "y", "z"].indexOf(axis),
    component = [r.x, r.y, r.z][i],
    length = Math.hypot(component, r.w);
  if (length < 1e-10) return { twist: 0, swing: 180 };
  const q = new Quaternion(0, 0, 0, r.w / length);
  q[axis] = component / length;
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const swing = r.clone().multiply(q.clone().invert());
  return {
    twist: (2 * Math.atan2(q[axis], q.w) * 180) / Math.PI,
    swing:
      (2 *
        Math.atan2(Math.hypot(swing.x, swing.y, swing.z), Math.abs(swing.w)) *
        180) /
      Math.PI,
  };
}
