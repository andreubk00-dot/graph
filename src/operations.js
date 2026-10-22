import { Matrix4, Vector3, Quaternion, Euler } from "three";

export function selectionRoots(doc, ids) {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 2000 ||
    ids.some((id) => typeof id !== "string")
  )
    throw new Error("Select at least one object");
  const byId = new Map(doc.nodes.map((n) => [n.id, n])),
    selected = new Set(ids);
  for (const id of selected)
    if (!byId.has(id)) throw new Error(`Object not found: ${id}`);
  return [...selected].filter((id) => {
    let parent = byId.get(id).parent;
    while (parent !== null) {
      if (selected.has(parent)) return false;
      parent = byId.get(parent).parent;
    }
    return true;
  });
}
export function poseMatrix(pose) {
  return new Matrix4().compose(
    new Vector3(...pose.position),
    new Quaternion().setFromEuler(new Euler(...pose.rotation)),
    new Vector3(...pose.scale),
  );
}
export function matrixPose(matrix) {
  const position = new Vector3(),
    quaternion = new Quaternion(),
    scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  if (
    [...position.toArray(), ...quaternion.toArray(), ...scale.toArray()].some(
      (v) => !Number.isFinite(v),
    ) ||
    scale.toArray().some((v) => v < 0.001)
  )
    throw new Error("Transform would produce a zero or negative scale");
  const rebuilt = new Matrix4().compose(position, quaternion, scale);
  // Scale-relative basis tolerance: neither large translations nor tiny geometry may hide shear.
  if (
    matrix.elements.some(
      (v, i) =>
        Math.abs(v - rebuilt.elements[i]) >
        (i < 12
          ? 1e-6 *
            Math.max(1e-8, Math.abs(scale.getComponent(Math.floor(i / 4))))
          : 1e-8 * Math.max(1, Math.abs(v))),
    )
  )
    throw new Error(
      "This transform introduces shear. Use uniform parent scales or move objects separately.",
    );
  const euler = new Euler().setFromQuaternion(quaternion);
  return {
    position: position.toArray(),
    rotation: [euler.x, euler.y, euler.z],
    scale: scale.toArray(),
  };
}
function requireCompleteRigs(doc, roots) {
  const included = new Set(roots);
  let previous = -1;
  while (previous !== included.size) {
    previous = included.size;
    for (const n of doc.nodes) if (included.has(n.parent)) included.add(n.id);
  }
  for (const n of doc.nodes)
    if (
      included.has(n.id) &&
      n.skin &&
      !n.skin.joints.every((id) => included.has(id))
    )
      throw new Error("Select the complete rig root with its bones and skin");
}
export function groupNodes(doc, cmd, makeNode) {
  requireCompleteRigs(doc, selectionRoots(doc, cmd.ids));
  const ids = selectionRoots(doc, cmd.ids),
    byId = new Map(doc.nodes.map((n) => [n.id, n])),
    nodes = ids.map((id) => byId.get(id)),
    parent = nodes[0].parent;
  if (nodes.some((n) => n.parent !== parent))
    throw new Error("Grouping requires objects with the same parent");
  const pivot = [0, 1, 2].map(
    (axis) =>
      nodes.reduce((sum, n) => sum + n.position[axis], 0) / nodes.length,
  );
  const group = makeNode("group", {
    id: cmd.id,
    name: cmd.name ?? "Group",
    parent,
    position: pivot,
  });
  doc.nodes.push(group);
  for (const n of nodes) {
    n.parent = group.id;
    n.position = n.position.map((v, i) => v - pivot[i]);
    for (const key of n.keys)
      key.position = key.position.map((v, i) => v - pivot[i]);
    for (const clip of doc.clips ?? [])
      for (const key of Object.hasOwn(clip.tracks, n.id)
        ? clip.tracks[n.id]
        : [])
        key.position = key.position.map((v, i) => v - pivot[i]);
  }
}
export function ungroupNode(doc, id) {
  const group = doc.nodes.find((n) => n.id === id);
  if (!group || group.type !== "group")
    throw new Error("Select a group to ungroup");
  if (
    group.keys.length ||
    (doc.clips ?? []).some(
      (c) => Object.hasOwn(c.tracks, id) && c.tracks[id].length,
    )
  )
    throw new Error(
      "Animated groups cannot be ungrouped without baking their animation",
    );
  const children = doc.nodes.filter((n) => n.parent === id),
    matrix = poseMatrix(group),
    uniform = Math.max(...group.scale) - Math.min(...group.scale) < 1e-8;
  for (const child of children) {
    const keys = [
      ...child.keys,
      ...(doc.clips ?? []).flatMap((c) =>
        Object.hasOwn(c.tracks, child.id) ? c.tracks[child.id] : [],
      ),
    ];
    if (!uniform && keys.length)
      throw new Error(
        "Ungrouping animated children requires a uniform group scale",
      );
    const pose = matrixPose(matrix.clone().multiply(poseMatrix(child)));
    Object.assign(child, pose);
    child.parent = group.parent;
    child.visible = group.visible && child.visible;
    for (const key of keys)
      Object.assign(key, matrixPose(matrix.clone().multiply(poseMatrix(key))));
  }
  doc.nodes = doc.nodes.filter((n) => n.id !== id);
  for (const clip of doc.clips ?? []) delete clip.tracks[id];
}
export function duplicateNodes(doc, cmd, makeNode) {
  requireCompleteRigs(doc, selectionRoots(doc, cmd.ids));
  const roots = new Set(selectionRoots(doc, cmd.ids)),
    descendants = new Set(roots);
  let count = -1;
  while (count !== descendants.size) {
    count = descendants.size;
    for (const n of doc.nodes)
      if (descendants.has(n.parent)) descendants.add(n.id);
  }
  const offset = cmd.offset ?? [1.5, 0, 0];
  if (
    !Array.isArray(offset) ||
    offset.length !== 3 ||
    offset.some((v) => typeof v !== "number" || !Number.isFinite(v))
  )
    throw new Error("Invalid duplication offset");
  const ids = new Map(
    [...descendants].map((id) => [
      id,
      cmd.idMap && Object.hasOwn(cmd.idMap, id)
        ? cmd.idMap[id]
        : crypto.randomUUID(),
    ]),
  );
  if (new Set(ids.values()).size !== ids.size)
    throw new Error("Duplicate IDs in duplication map");
  const originals = doc.nodes.filter((n) => descendants.has(n.id));
  for (const n of originals) {
    const copy = structuredClone(n);
    copy.id = ids.get(n.id);
    copy.parent = ids.get(n.parent) ?? n.parent;
    if (copy.skin)
      copy.skin.joints = copy.skin.joints.map((id) => ids.get(id) ?? id);
    copy.name = copy.name.slice(0, 195) + " copy";
    if (roots.has(n.id)) {
      copy.position = copy.position.map((v, i) => v + offset[i]);
      for (const k of copy.keys)
        k.position = k.position.map((v, i) => v + offset[i]);
    }
    doc.nodes.push(makeNode(copy.type, copy));
    for (const clip of doc.clips ?? [])
      if (Object.hasOwn(clip.tracks, n.id)) {
        const keys = structuredClone(clip.tracks[n.id]);
        if (roots.has(n.id))
          for (const k of keys)
            k.position = k.position.map((v, i) => v + offset[i]);
        Object.defineProperty(clip.tracks, copy.id, {
          value: keys,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
  }
}
