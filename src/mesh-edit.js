import { bevelEdge } from "./mesh-bevel.js";
import { dissolveVertex } from "./mesh-dissolve.js";
import {
  physicalEdgeKey,
  physicalCreases,
  expandedCreases,
  retainCreases,
  positionKey,
} from "./mesh-creases.js";
import { editTopology, bevelCorner } from "./mesh-topology.js";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { validateMeshGeometry, MAX_MESH_VERTICES } from "./mesh-geometry.js";

export function meshTopology(geometry) {
  const indices =
    geometry.indices ??
    Array.from({ length: geometry.positions.length / 3 }, (_, i) => i);
  const faces = [],
    edges = [],
    map = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const face = indices.slice(i, i + 3);
    faces.push(face);
    for (let j = 0; j < 3; j++) {
      const a = face[j],
        b = face[(j + 1) % 3],
        key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!map.has(key)) {
        map.set(key, edges.length);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    }
  }
  return { faces, edges };
}
function vector(v, label) {
  if (
    !Array.isArray(v) ||
    v.length !== 3 ||
    v.some((x) => !Number.isFinite(x) || Math.abs(x) > 100000)
  )
    throw new Error(`Invalid ${label} vector`);
  return v;
}
export function selectedVertices(geometry, selection) {
  const { faces, edges } = meshTopology(geometry),
    count = geometry.positions.length / 3;
  if (
    !selection ||
    !["vertex", "edge", "face"].includes(selection.mode) ||
    !Array.isArray(selection.ids) ||
    !selection.ids.length
  )
    throw new Error("Select mesh components first");
  const limit =
    selection.mode === "vertex"
      ? count
      : selection.mode === "edge"
        ? edges.length
        : faces.length;
  const ids = [...new Set(selection.ids)];
  if (ids.some((i) => !Number.isInteger(i) || i < 0 || i >= limit))
    throw new Error("Mesh selection index is out of range");
  return [
    ...new Set(
      ids.flatMap((i) =>
        selection.mode === "vertex"
          ? [i]
          : selection.mode === "edge"
            ? edges[i]
            : faces[i],
      ),
    ),
  ];
}
export function editMeshGeometry(input, command, { onRemap } = {}) {
  let remap = new Map();
  validateMeshGeometry(input);
  const g = structuredClone(input),
    count = g.positions.length / 3;
  const { faces, edges } = meshTopology(g);
  const baseCreases = g.creases?.length ? expandedCreases(g) : [];
  if (baseCreases.length) g.creases = baseCreases;
  g.indices = faces.flat();
  const point = (i) => g.positions.slice(i * 3, i * 3 + 3);
  const append = (i) => {
    if (g.positions.length / 3 >= MAX_MESH_VERTICES)
      throw new Error("Mesh vertex budget exceeded");
    const id = g.positions.length / 3;
    for (const [key, size] of [
      ["positions", 3],
      ["uv", 2],
      ["colors", 3],
    ])
      if (g[key]) g[key].push(...g[key].slice(i * size, i * size + size));
    return id;
  };
  switch (command.action) {
    case "dissolveVertex": {
      if (command.landmarkPolicy !== undefined &&
          !["reject", "remap"].includes(command.landmarkPolicy))
        throw new Error("Invalid landmark policy");
      // Freeze source smooth normals before changing triangle area contributions.
      if (!g.normals && g.smooth !== false) {
        const buffer = new BufferGeometry();
        try {
          buffer.setAttribute("position", new Float32BufferAttribute(g.positions, 3));
          buffer.setIndex(g.indices);
          buffer.computeVertexNormals();
          g.normals = Array.from(buffer.attributes.normal.array);
          const used = new Set(g.indices);
          for (let i = 0; i < count; i++) {
            if (Math.hypot(...g.normals.slice(i * 3, i * 3 + 3)) < 1e-10) {
              if (used.has(i)) throw new Error("Cannot preserve cancelling source normals");
              g.normals[i * 3 + 1] = 1;
            }
          }
        } finally { buffer.dispose(); }
      }
      remap = dissolveVertex(g, command);
      validateMeshGeometry(g);
      onRemap?.(remap);
      return g;
    }
    case "bevelEdge": {
      if (
        command.landmarkPolicy !== undefined &&
        !["reject", "remap"].includes(command.landmarkPolicy)
      )
        throw new Error("Invalid landmark policy");
      remap = bevelEdge(g, command, MAX_MESH_VERTICES);
      validateMeshGeometry(g);
      onRemap?.(remap);
      return g;
    }
    case "setCreases": {
      if (
        typeof command.enabled !== "boolean" ||
        command.selection?.mode !== "edge"
      )
        throw new Error("Creases require edge selection and boolean enabled");
      selectedVertices(g, command.selection);
      const selected = new Set(
        command.selection.ids.map((i) => physicalEdgeKey(g, ...edges[i])),
      );
      const current = physicalCreases(g);
      if ([...selected].every((k) => current.has(k) === command.enabled))
        return structuredClone(input);
      for (const k of selected)
        command.enabled ? current.add(k) : current.delete(k);
      g.creases = edges.filter(([a, b]) =>
        current.has(physicalEdgeKey(g, a, b)),
      );
      if (!g.creases.length) delete g.creases;
      if (input.indices === undefined) delete g.indices;
      validateMeshGeometry(g);
      onRemap?.(remap);
      return g;
    }
    case "clearCreases": {
      const result = structuredClone(input);
      delete result.creases;
      return result;
    }
    case "splitEdges":
    case "mergeVertices":
    case "bevelVertex": {
      if (
        command.landmarkPolicy !== undefined &&
        !["reject", "remap"].includes(command.landmarkPolicy)
      )
        throw new Error("Invalid landmark policy");
      if (
        command.action === "bevelVertex" &&
        baseCreases.some((pair) =>
          pair.some(
            (i) => positionKey(g, i) === positionKey(g, command.vertex),
          ),
        )
      )
        throw new Error("Clear creases touching the corner before beveling");
      remap =
        command.action === "bevelVertex"
          ? bevelCorner(g, command, MAX_MESH_VERTICES)
          : editTopology(g, command, MAX_MESH_VERTICES);
      if (command.action === "mergeVertices" && g.creases?.length)
        g.creases = baseCreases.map((pair) =>
          pair.map((i) => remap.get(i) ?? i),
        );
      break;
    }
    case "translate": {
      const delta = vector(command.delta, "translation");
      const vertices = selectedVertices(g, command.selection);
      if (delta.every((x) => x === 0)) return structuredClone(input);
      for (const i of vertices)
        for (let a = 0; a < 3; a++) g.positions[i * 3 + a] += delta[a];
      break;
    }
    case "setVertex": {
      const i = command.vertex;
      if (!Number.isInteger(i) || i < 0 || i >= count)
        throw new Error("Vertex index is out of range");
      const position = vector(command.position, "position");
      if (position.every((v, a) => v === g.positions[i * 3 + a]))
        return structuredClone(input);
      g.positions.splice(i * 3, 3, ...position);
      break;
    }
    case "extrude": {
      if (command.selection?.mode !== "face")
        throw new Error("Extrusion requires faces");
      const vertices = selectedVertices(g, command.selection),
        delta = vector(command.delta, "extrusion");
      if (Math.hypot(...delta) < 1e-8)
        throw new Error("Extrusion requires a nonzero offset");
      // Topological adjacency follows exact Float32 positions across attribute
      // splits. Keep the distinct source IDs/UVs; only suppress internal walls.
      const welded = [],
        positions = new Map();
      for (let i = 0; i < count; i++) {
        const key = point(i).map(Math.fround).join(":");
        if (!positions.has(key)) positions.set(key, positions.size);
        welded.push(positions.get(key));
      }
      const selected = new Set(command.selection.ids),
        boundary = new Map();
      for (const i of selected) {
        const f = faces[i];
        for (let j = 0; j < 3; j++) {
          const a = f[j],
            b = f[(j + 1) % 3],
            wa = welded[a],
            wb = welded[b],
            key = wa < wb ? `${wa}:${wb}` : `${wb}:${wa}`;
          const previous = boundary.get(key);
          if (previous) {
            if (
              previous.count !== 1 ||
              previous.wa !== wb ||
              previous.wb !== wa
            )
              throw new Error(
                "Extrusion requires consistently wound manifold faces",
              );
            previous.count++;
          } else boundary.set(key, { a, b, wa, wb, count: 1 });
        }
      }
      const rim = [...boundary.values()].filter((e) => e.count === 1);
      if (!rim.length)
        throw new Error("Extrusion requires an open region boundary");
      // Reject edges already shared by >2 faces, including outside the region.
      const incidence = new Map();
      for (const f of faces)
        for (let j = 0; j < 3; j++) {
          const a = f[j],
            b = f[(j + 1) % 3],
            wa = welded[a],
            wb = welded[b],
            key = wa < wb ? `${wa}:${wb}` : `${wb}:${wa}`;
          incidence.set(key, (incidence.get(key) ?? 0) + 1);
        }
      for (const [key] of boundary)
        if (incidence.get(key) > 2)
          throw new Error("Cannot extrude a nonmanifold region");
      const copies = new Map(vertices.map((i) => [i, append(i)]));
      for (const [old, id] of copies)
        for (let a = 0; a < 3; a++)
          g.positions[id * 3 + a] = point(old)[a] + delta[a];
      g.indices = faces.flatMap((f, i) =>
        selected.has(i) ? f.map((v) => copies.get(v)) : f,
      );
      for (const { a, b } of rim)
        g.indices.push(a, b, copies.get(b), a, copies.get(b), copies.get(a));
      if (baseCreases.length)
        g.creases = [
          ...baseCreases,
          ...baseCreases
            .filter((pair) => pair.every((i) => copies.has(i)))
            .map((pair) => pair.map((i) => copies.get(i))),
        ];
      break;
    }
    case "deleteFaces": {
      if (command.selection?.mode !== "face")
        throw new Error("Deleting requires faces");
      selectedVertices(g, command.selection);
      const ids = new Set(command.selection.ids);
      g.indices = faces.filter((_, i) => !ids.has(i)).flat();
      if (!g.indices.length)
        throw new Error("Cannot delete every face; delete the object instead");
      break;
    }
    case "mirror": {
      const axis = ["x", "y", "z"].indexOf(command.axis ?? "x"),
        offset = command.offset ?? 0,
        tolerance = command.tolerance ?? 0.00001,
        side = command.side ?? "positive";
      if (
        axis < 0 ||
        !Number.isFinite(offset) ||
        Math.abs(offset) > 100000 ||
        !Number.isFinite(tolerance) ||
        tolerance < 0 ||
        tolerance > 1 ||
        !["positive", "negative"].includes(side)
      )
        throw new Error("Invalid mirror plane or tolerance");
      const sign = side === "positive" ? 1 : -1,
        copies = new Map(),
        used = new Set(g.indices);
      for (let i = 0; i < count; i++) {
        if (!used.has(i)) continue;
        const distance = g.positions[i * 3 + axis] - offset;
        if (sign * distance < -tolerance)
          throw new Error(
            "Mirror needs one half of the mesh; remove faces on the other side first",
          );
        if (Math.abs(distance) <= tolerance) {
          g.positions[i * 3 + axis] = offset;
          copies.set(i, i);
        } else {
          const id = append(i);
          g.positions[id * 3 + axis] = offset - distance;
          copies.set(i, id);
        }
      }
      for (const f of faces) {
        if (f.every((i) => copies.get(i) === i))
          throw new Error(
            "Remove faces lying on the mirror plane before welding the seam",
          );
        g.indices.push(...[f[0], f[2], f[1]].map((i) => copies.get(i)));
      }
      if (baseCreases.length)
        g.creases = [
          ...baseCreases,
          ...baseCreases.map((pair) => pair.map((i) => copies.get(i))),
        ];
      break;
    }
    case "recalculateNormals":
      break;
    default:
      throw new Error(`Unknown mesh edit: ${command.action}`);
  }
  // Preserve split vertices, UVs and colors. The shared geometry builder computes
  // fresh normals. Do not weld by position: coincident UV/hard-edge splits matter.
  if (g.creases) retainCreases(g);
  delete g.normals;
  validateMeshGeometry(g);
  const buffer = new BufferGeometry();
  try {
    buffer.setAttribute("position", new Float32BufferAttribute(g.positions, 3));
    buffer.setIndex(g.indices);
    buffer.computeVertexNormals();
    const normals = Array.from(buffer.attributes.normal.array),
      used = new Set(g.indices);
    for (let i = 0; i < normals.length; i += 3) {
      if (Math.hypot(...normals.slice(i, i + 3)) < 1e-10) {
        if (used.has(i / 3))
          throw new Error(
            "Cannot compute a normal for cancelling faces; fix winding or split vertices",
          );
        normals[i + 1] = 1; // Retained, unreferenced vertex: keep its ID and a valid unit normal.
      }
    }
    g.normals = normals;
  } finally {
    buffer.dispose();
  }
  validateMeshGeometry(g);
  onRemap?.(remap);
  return g;
}
export function applyMeshEdit(node, command, document) {
  if (!node || node.type !== "mesh")
    throw new Error("Mesh editing requires a mesh object");
  if (node.skin) throw new Error("Unbind skin before editing rest geometry");
  if (command.action === "dissolveVertex" && node.modifiers?.some(
    m => m.type === "subdivision" && m.enabled !== false,
  )) throw new Error("Bake or disable subdivision before dissolving; evaluated shape depends on topology");
  let remap = new Map();
  const geometry = editMeshGeometry(node.geometry, command, {
    onRemap: (map) => (remap = map),
  });
  const affected = Object.values(document?.review?.landmarks ?? {}).filter(
    (a) => a.node === node.id && remap.has(a.vertex),
  );
  if (affected.length && command.landmarkPolicy !== "remap")
    throw new Error(
      "Operation replaces a landmark vertex; explicitly use landmarkPolicy: remap or update the criteria first",
    );
  for (const anchor of affected) anchor.vertex = remap.get(anchor.vertex);
  if (JSON.stringify(geometry) !== JSON.stringify(node.geometry)) {
    node.geometry = geometry;
    delete node.sculpt; // Generated recipe no longer describes this edited surface.
  }
}
