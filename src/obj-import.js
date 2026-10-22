import { ShapeUtils, Vector2, Vector3 } from "three";
import { emptyDocument, makeNode, validateDocument } from "./document.js";
import { validateOutline } from "./polygon.js";
import {
  MAX_MESH_VERTICES,
  MAX_SCENE_MESH_VERTICES,
  MAX_SCENE_MESH_TRIANGLES,
} from "./mesh-geometry.js";

// Parses text only. It never fetches mtllib, textures or external resources.
export function importOBJ(text, { name = "Imported OBJ" } = {}) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > 10 * 1024 * 1024 ||
    text.includes("\0")
  )
    throw new Error("OBJ must be text, up to 10 MB");
  const vertices = [],
    normals = [],
    uvs = [],
    parts = [];
  let label = name,
    material = "",
    smoothing = "off",
    part = null,
    faceId = 0,
    groupScope = 0,
    total = 0,
    triangleCount = 0,
    lineNumber = 0,
    hasMaterials = false,
    ignored = false;
  const error = (message) => {
    throw new Error(`OBJ line ${lineNumber}: ${message}`);
  };
  const numbers = (tokens, count) => {
    if (tokens.length < count) error("Incomplete coordinates");
    const out = tokens.slice(0, count).map(Number);
    if (out.some((v) => !Number.isFinite(v) || Math.abs(v) > 100000))
      error("Invalid coordinate");
    return out;
  };
  const index = (raw, length, kind) => {
    if (!/^-?\d+$/.test(raw ?? "")) error(`Invalid ${kind} index`);
    const n = Number(raw),
      i = n > 0 ? n - 1 : length + n;
    if (!n || !Number.isSafeInteger(n) || i < 0 || i >= length)
      error(`${kind} index is out of range`);
    return i;
  };
  function ensurePart() {
    if (!part) {
      part = {
        name: (label + (material ? " · " + material : "")).slice(0, 200),
        positions: [],
        normals: [],
        normalKeys: [],
        uv: [],
        indices: [],
        map: new Map(),
        hasNormals: true,
        hasUV: true,
        anyUV: false,
      };
      parts.push(part);
      if (parts.length > 1999) error("Too many objects");
    }
    return part;
  }
  function corner(token) {
    const fields = token.split("/");
    if (fields.length > 3) error("Invalid face vertex");
    return {
      v: index(fields[0], vertices.length, "vertex"),
      t: fields[1] ? index(fields[1], uvs.length, "UV") : null,
      n: fields[2] ? index(fields[2], normals.length, "normal") : null,
    };
  }
  function triangles(corners) {
    if (corners.length < 3 || corners.length > 128)
      error("A face needs 3–128 vertices");
    const points = corners.map((c) => vertices[c.v]),
      normal = new Vector3();
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      normal.x += (a[1] - b[1]) * (a[2] + b[2]);
      normal.y += (a[2] - b[2]) * (a[0] + b[0]);
      normal.z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    if (normal.length() < 1e-10) error("Degenerate face");
    normal.normalize();
    const first = new Vector3(...points[0]),
      extent = Math.max(
        ...points.map((p) => new Vector3(...p).distanceTo(first)),
      );
    if (
      points.some(
        (p) =>
          Math.abs(new Vector3(...p).sub(first).dot(normal)) >
          Math.max(1e-6, extent * 1e-5),
      )
    )
      error("Non-planar face: triangulate it before importing");
    const axis = normal
        .toArray()
        .map(Math.abs)
        .indexOf(Math.max(...normal.toArray().map(Math.abs))),
      axes = [0, 1, 2].filter((i) => i !== axis);
    const projected = points.map((p) => [
        p[axes[0]] - points[0][axes[0]],
        p[axes[1]] - points[0][axes[1]],
      ]),
      span = Math.max(...projected.flat().map(Math.abs));
    const outline = projected.map((p) => p.map((v) => v / span));
    try {
      validateOutline(outline);
    } catch (e) {
      error(e.message);
    }
    const faces = ShapeUtils.triangulateShape(
      outline.map((p) => new Vector2(...p)),
      [],
    );
    if (!faces.length) error("Cannot triangulate face");
    for (const triangle of faces) {
      const [a, b, c] = triangle.map((i) => new Vector3(...points[i]));
      if (b.sub(a).cross(c.sub(a)).dot(normal) < 0)
        [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
    }
    return faces;
  }
  for (const raw of text.replace(/\\\r?\n/g, " ").split(/\r?\n/)) {
    lineNumber++;
    const line = raw.split("#", 1)[0].trim();
    if (!line) continue;
    const [op, ...tokens] = line.split(/\s+/);
    switch (op) {
      case "v": {
        let v = numbers(tokens, 3);
        if (tokens.length === 4) {
          const w = Number(tokens[3]);
          if (!Number.isFinite(w) || !w)
            error("Invalid homogeneous coordinate");
          v = v.map((x) => x / w);
        }
        vertices.push(v);
        if (vertices.length > MAX_SCENE_MESH_VERTICES)
          error("Too many source vertices");
        if (tokens.length > 4) ignored = true;
        break;
      }
      case "vn": {
        const n = numbers(tokens, 3),
          length = Math.hypot(...n);
        if (length < 1e-10) error("Zero-length normal");
        normals.push(n.map((v) => v / length));
        if (normals.length > MAX_SCENE_MESH_VERTICES) error("Too many normals");
        break;
      }
      case "vt":
        uvs.push(numbers(tokens, 2));
        if (uvs.length > MAX_SCENE_MESH_VERTICES)
          error("Too many UV coordinates");
        break;
      case "o":
      case "g":
        label = tokens.join(" ") || name;
        groupScope++;
        part = null;
        break;
      case "usemtl":
        material = tokens.join(" ");
        hasMaterials = true;
        part = null;
        break;
      case "mtllib":
        hasMaterials = true;
        break;
      case "s":
        smoothing =
          tokens[0] === "0" || tokens[0] === "off"
            ? "off"
            : (tokens[0] ?? "off");
        break;
      case "f": {
        faceId++;
        if (tokens.length < 3 || tokens.length > 128)
          error("A face needs 3–128 vertices");
        const corners = tokens.map(corner),
          faces = triangles(corners),
          target = ensurePart();
        triangleCount += faces.length;
        if (triangleCount > MAX_SCENE_MESH_TRIANGLES)
          error("Too many imported triangles");
        for (const face of faces)
          for (const ci of face) {
            const c = corners[ci],
              key = `${c.v}/${c.t ?? ""}/${c.n ?? ""}/${smoothing === "off" ? `face-${faceId}` : `smooth-${smoothing}`}`;
            if (c.t !== null) target.anyUV = true;
            let i = target.map.get(key);
            if (i === undefined) {
              i = target.positions.length / 3;
              if (i >= MAX_MESH_VERTICES || ++total > MAX_SCENE_MESH_VERTICES)
                error("Imported mesh vertex limit exceeded");
              target.map.set(key, i);
              target.positions.push(...vertices[c.v]);
              target.normals.push(...(c.n === null ? [0, 0, 0] : normals[c.n]));
              target.normalKeys.push(
                `${groupScope}/${smoothing === "off" ? `face-${faceId}` : `smooth-${smoothing}`}/${c.v}`,
              );
              target.uv.push(...(c.t === null ? [0, 0] : uvs[c.t]));
              if (c.n === null) target.hasNormals = false;
              if (c.t === null) target.hasUV = false;
            }
            target.indices.push(i);
            if (target.indices.length > 300000)
              error("Too many triangles in one object");
          }
        break;
      }
      case "l":
      case "p":
        ignored = true;
        break;
      default:
        error(`Unsupported directive: ${op}`);
    }
  }
  if (!parts.length) throw new Error("OBJ contains no polygon faces");
  if (parts.some((p) => !p.hasNormals)) {
    // Smooth by source vertex/group, independently of UV splits and material slots.
    const sums = new Map();
    for (const p of parts)
      for (let i = 0; i < p.indices.length; i += 3) {
        const triangle = p.indices.slice(i, i + 3),
          [a, b, c] = triangle.map((index) =>
            new Vector3().fromArray(p.positions, index * 3),
          ),
          normal = b.sub(a).cross(c.sub(a));
        for (const index of triangle) {
          const key = p.normalKeys[index];
          if (!sums.has(key)) sums.set(key, new Vector3());
          sums.get(key).add(normal);
        }
      }
    for (const p of parts)
      if (!p.hasNormals)
        p.normals = p.normalKeys.flatMap((key) => {
          const normal = sums.get(key);
          if (!normal || normal.length() < 1e-12)
            throw new Error(
              "OBJ has conflicting faces with undefined smooth normals",
            );
          return normal.clone().normalize().toArray();
        });
  }
  const document = emptyDocument();
  document.name = String(name).slice(0, 200);
  const root = makeNode("group", { name: document.name, position: [0, 0, 0] });
  document.nodes.push(root);
  for (const p of parts) {
    const geometry = {
      positions: p.positions,
      indices: p.indices,
      smooth: true,
    };
    geometry.normals = p.normals;
    if (p.hasUV) geometry.uv = p.uv;
    document.nodes.push(
      makeNode("mesh", {
        name: p.name,
        parent: root.id,
        position: [0, 0, 0],
        color: "#bcc8c4",
        geometry,
      }),
    );
  }
  const warnings = [];
  if (hasMaterials) warnings.push("MTL materials and textures are not loaded");
  if (ignored)
    warnings.push("Lines, points and extra vertex attributes are omitted");
  if (parts.some((p) => !p.hasNormals))
    warnings.push(
      "Missing normals were computed from faces and smoothing groups",
    );
  if (parts.some((p) => p.anyUV && !p.hasUV))
    warnings.push(
      "Incomplete UV coordinates were omitted from parts with missing UVs",
    );
  return { document: validateDocument(document), warnings };
}
