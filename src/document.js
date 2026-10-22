import { creaseNormalGeometry } from "./mesh-creases.js";
import {
  evaluateMeshGeometry,
  validateModifiers,
  setModifiers,
  bakeModifiers,
} from "./mesh-modifiers.js";
import { applyMeshEdit } from "./mesh-edit.js";
import { validateReferences } from "./modeling-references.js";
import { validateReview } from "./review-schema.js";
import {
  validateSkin,
  validateJointLimit,
  bindSkin,
  setSkinWeights,
} from "./skin.js";
import { sculptGeometry, validateSculptRecipe } from "./sculpt.js";
import {
  validateMeshGeometry,
  MAX_SCENE_MESH_VERTICES,
  MAX_SCENE_MESH_TRIANGLES,
} from "./mesh-geometry.js";
import { groupNodes, ungroupNode, duplicateNodes } from "./operations.js";
import { validateOutline } from "./polygon.js";
import { Quaternion, Euler } from "three";
export const VERSION = 1;
export const TYPES = [
  "group",
  "bone",
  "box",
  "sphere",
  "cylinder",
  "cone",
  "torus",
  "plane",
  "capsule",
  "lathe",
  "extrude",
  "mesh",
];
const clone = (value) => structuredClone(value);
export const DEFAULT_PROFILE = [
  [0, -0.5],
  [0.34, -0.5],
  [0.45, -0.3],
  [0.3, 0.12],
  [0.24, 0.42],
  [0.28, 0.5],
  [0, 0.5],
];
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const vector = (value, fallback) =>
  value === undefined ? [...fallback] : value;
export function makeNode(type = "box", options = {}) {
  return {
    id: options.id || crypto.randomUUID(),
    name: options.name || type,
    type,
    parent: options.parent ?? null,
    position: vector(options.position, [0, 0.5, 0]),
    rotation: vector(options.rotation, [0, 0, 0]),
    scale: vector(options.scale, [1, 1, 1]),
    color: options.color || "#b8e986",
    roughness: options.roughness ?? 0.55,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? "#000000",
    emissiveIntensity: options.emissiveIntensity ?? 0,
    visible: options.visible ?? true,
    geometry: options.geometry || {},
    keys: options.keys || [],
    ...(options.modifiers !== undefined
      ? { modifiers: clone(options.modifiers) }
      : {}),
    ...(options.skin ? { skin: clone(options.skin) } : {}),
    ...(options.jointLimit ? { jointLimit: clone(options.jointLimit) } : {}),
    ...(options.sculpt ? { sculpt: clone(options.sculpt) } : {}),
  };
}
export function emptyDocument() {
  return {
    version: VERSION,
    name: "Untitled scene",
    duration: 4,
    fps: 24,
    nodes: [],
  };
}
export function starterDocument() {
  const doc = emptyDocument();
  doc.name = "Scout · character study";
  doc.nodes = [
    makeNode("group", { id: "scout", name: "Scout", position: [0, 0, 0] }),
    makeNode("box", {
      id: "body",
      name: "Body",
      parent: "scout",
      position: [0, 1.5, 0],
      scale: [1.08, 1.05, 0.68],
      color: "#b8e986",
    }),
    makeNode("box", {
      id: "head",
      name: "Helmet",
      parent: "scout",
      position: [0, 2.38, 0],
      scale: [1.35, 0.72, 0.85],
      color: "#e6eadf",
    }),
    makeNode("box", {
      id: "visor",
      name: "Visor",
      parent: "head",
      position: [0, -0.01, 0.51],
      scale: [0.75, 0.35, 0.12],
      color: "#202b31",
      roughness: 0.15,
      metalness: 0.5,
    }),
    makeNode("sphere", {
      id: "eye-l",
      name: "Optic L",
      parent: "visor",
      position: [-0.29, 0, 0.6],
      scale: [0.1, 0.23, 0.14],
      color: "#b8e986",
    }),
    makeNode("sphere", {
      id: "eye-r",
      name: "Optic R",
      parent: "visor",
      position: [0.29, 0, 0.6],
      scale: [0.1, 0.23, 0.14],
      color: "#b8e986",
    }),
    makeNode("cylinder", {
      id: "neck",
      name: "Neck",
      parent: "scout",
      position: [0, 1.98, 0],
      scale: [0.25, 0.25, 0.25],
      color: "#505b61",
    }),
    makeNode("box", {
      id: "arm-l",
      name: "Arm L",
      parent: "scout",
      position: [-0.76, 1.43, 0],
      rotation: [0, 0, -0.12],
      scale: [0.3, 0.87, 0.42],
      color: "#e6eadf",
    }),
    makeNode("box", {
      id: "arm-r",
      name: "Arm R",
      parent: "scout",
      position: [0.76, 1.43, 0],
      rotation: [0, 0, 0.12],
      scale: [0.3, 0.87, 0.42],
      color: "#e6eadf",
    }),
    makeNode("box", {
      id: "leg-l",
      name: "Leg L",
      parent: "scout",
      position: [-0.31, 0.53, 0],
      scale: [0.37, 0.8, 0.43],
      color: "#505b61",
    }),
    makeNode("box", {
      id: "leg-r",
      name: "Leg R",
      parent: "scout",
      position: [0.31, 0.53, 0],
      scale: [0.37, 0.8, 0.43],
      color: "#505b61",
    }),
    makeNode("box", {
      id: "foot-l",
      name: "Boot L",
      parent: "scout",
      position: [-0.31, 0.16, 0.12],
      scale: [0.45, 0.26, 0.69],
      color: "#e6eadf",
    }),
    makeNode("box", {
      id: "foot-r",
      name: "Boot R",
      parent: "scout",
      position: [0.31, 0.16, 0.12],
      scale: [0.45, 0.26, 0.69],
      color: "#e6eadf",
    }),
    makeNode("cylinder", {
      id: "badge",
      name: "Power core",
      parent: "scout",
      position: [0, 1.56, 0.36],
      rotation: [Math.PI / 2, 0, 0],
      scale: [0.17, 0.08, 0.17],
      color: "#ffb86b",
      metalness: 0.3,
    }),
    makeNode("cylinder", {
      id: "plinth",
      name: "Display plinth",
      position: [0, -0.13, 0],
      scale: [2.05, 0.24, 2.05],
      color: "#39454b",
      metalness: 0.15,
    }),
  ];
  for (const n of doc.nodes)
    if (n.type === "box") n.geometry = { bevel: 0.06, bevelSegments: 3 };
  const scout = doc.nodes[0];
  scout.keys = [0, 2, 4].map((time, index) => ({
    time,
    position: [0, index === 1 ? 0.16 : 0, 0],
    rotation: [0, index === 1 ? 0.35 : 0, 0],
    scale: [1, 1, 1],
  }));
  return doc;
}
function fail(message) {
  throw new Error(message);
}
function finite(value, min, max, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(`Invalid ${label}`);
}
function checkVector(v, label, scale = false) {
  if (!Array.isArray(v) || v.length !== 3) fail(`Invalid ${label}`);
  for (const n of v) finite(n, scale ? 0.001 : -100000, 100000, label);
}
export function validateDocument(input) {
  const doc = clone(input);
  if (!record(doc) || doc.version !== VERSION)
    fail("Unsupported project version");
  if (typeof doc.name !== "string" || doc.name.length > 200)
    fail("Invalid scene name");
  finite(doc.duration, 0.1, 600, "duration");
  finite(doc.fps, 1, 120, "FPS");
  if (!Number.isInteger(doc.fps)) fail("FPS must be an integer");
  if (!Array.isArray(doc.nodes) || doc.nodes.length > 2000)
    fail("A scene supports up to 2000 objects");
  if (doc.referenceImages !== undefined)
    validateReferences(doc.referenceImages);
  let meshVertices = 0,
    meshTriangles = 0;
  const ids = new Set();
  for (const n of doc.nodes) {
    if (!record(n)) fail("Invalid object");
    if (
      typeof n.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(n.id) ||
      ids.has(n.id)
    )
      fail(
        "Object IDs must be unique letters, numbers, underscores or hyphens",
      );
    ids.add(n.id);
    if (!TYPES.includes(n.type)) fail(`Unknown primitive: ${n.type}`);
    if (typeof n.name !== "string" || n.name.length > 200)
      fail("Invalid object name");
    if (typeof n.visible !== "boolean") fail("Invalid visibility");
    if (!/^#[0-9a-f]{6}$/i.test(n.color)) fail("Use a six-digit hex color");
    finite(n.roughness, 0, 1, "roughness");
    finite(n.metalness, 0, 1, "metalness");
    if (n.emissive === undefined) n.emissive = "#000000";
    if (n.emissiveIntensity === undefined) n.emissiveIntensity = 0;
    if (!/^#[0-9a-f]{6}$/i.test(n.emissive))
      fail("Use a six-digit emissive hex color");
    finite(n.emissiveIntensity, 0, 20, "emissiveIntensity");
    checkVector(n.position, "position");
    checkVector(n.rotation, "rotation");
    checkVector(n.scale, "scale", true);
    if (!record(n.geometry)) fail("Invalid geometry");
    for (const [key, value] of Object.entries(n.geometry)) {
      switch (key) {
        case "positions":
        case "indices":
        case "normals":
        case "uv":
        case "colors":
        case "creases":
          if (n.type !== "mesh")
            fail("Mesh buffers are only supported by mesh objects");
          break;
        case "segments":
          finite(value, 3, 96, key);
          if (!Number.isInteger(value)) fail("Segments must be an integer");
          break;
        case "outline":
          if (n.type !== "extrude")
            fail("Outline is only supported by extrude");
          validateOutline(value);
          break;
        case "depth":
          finite(value, 0.001, 100, key);
          break;
        case "tube":
          finite(value, 0.01, 1, key);
          break;
        case "bevel":
          finite(value, 0, 0.49, key);
          break;
        case "bevelSegments":
          finite(value, 1, 8, key);
          if (!Number.isInteger(value))
            fail("Bevel segments must be an integer");
          break;
        case "smooth":
          if (typeof value !== "boolean")
            fail("Smooth shading must be a boolean");
          break;
        case "profile": {
          if (
            n.type !== "lathe" ||
            !Array.isArray(value) ||
            value.length < 2 ||
            value.length > 128
          )
            fail("Lathe profile needs 2–128 radius/height points");
          for (const p of value) {
            if (!Array.isArray(p) || p.length !== 2)
              fail("Invalid profile point");
            finite(p[0], 0, 100, "profile radius");
            finite(p[1], -100, 100, "profile height");
          }
          if (!value.some((p) => p[0] > 0))
            fail("Profile must have a positive radius");
          break;
        }
        default:
          fail(`Unsupported geometry option: ${key}`);
      }
    }
    if (n.sculpt !== undefined) {
      if (n.type !== "mesh") fail("Sculpt source requires a mesh");
      n.sculpt = validateSculptRecipe(n.sculpt);
    }
    validateModifiers(n);
    if (n.type === "mesh") {
      validateMeshGeometry(n.geometry);
      const evaluated = evaluateMeshGeometry(n);
      if (evaluated.creases?.length) creaseNormalGeometry(evaluated);
      meshVertices += evaluated.positions.length / 3;
      meshTriangles +=
        (evaluated.indices?.length ?? evaluated.positions.length / 3) / 3;
      if (meshTriangles > MAX_SCENE_MESH_TRIANGLES)
        fail(
          `Scene exceeds ${MAX_SCENE_MESH_TRIANGLES} imported mesh triangles`,
        );
      if (meshVertices > MAX_SCENE_MESH_VERTICES)
        fail(`Scene exceeds ${MAX_SCENE_MESH_VERTICES} imported mesh vertices`);
    }
    validateJointLimit(n);
    validateKeys(n.keys, doc.duration);
  }
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const n of doc.nodes) {
    const visited = new Set([n.id]);
    let parent = n.parent;
    while (parent !== null) {
      if (!byId.has(parent)) fail(`Missing parent: ${parent}`);
      if (visited.has(parent)) fail("Object hierarchy contains a cycle");
      visited.add(parent);
      parent = byId.get(parent).parent;
    }
  }
  for (const n of doc.nodes) validateSkin(n, byId);
  if (doc.clips !== undefined) {
    if (!Array.isArray(doc.clips) || doc.clips.length > 32)
      fail("A project supports up to 32 named clips");
    const clipIds = new Set(),
      names = new Set(["Action"]);
    for (const clip of doc.clips) {
      if (
        !record(clip) ||
        typeof clip.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(clip.id) ||
        clip.id === "default" ||
        clipIds.has(clip.id)
      )
        fail("Clip IDs must be unique and cannot be default");
      clipIds.add(clip.id);
      if (
        typeof clip.name !== "string" ||
        !clip.name.trim() ||
        clip.name.length > 100 ||
        names.has(clip.name)
      )
        fail("Clip names must be unique, nonempty and cannot be Action");
      names.add(clip.name);
      finite(clip.duration, 0.1, 600, "clip duration");
      if (clip.loop !== undefined && typeof clip.loop !== "boolean")
        fail("Invalid clip looping");
      if (!record(clip.tracks)) fail("Invalid clip tracks");
      for (const [id, keys] of Object.entries(clip.tracks)) {
        if (!byId.has(id)) fail(`Track object not found: ${id}`);
        if (byId.get(id).skin && keys.length)
          fail("Animate bones or the rig root, not the skinned mesh transform");
        validateKeys(keys, clip.duration);
      }
    }
  }
  validateReview(doc);
  return doc;
}
function validateKeys(keys, duration) {
  if (!Array.isArray(keys) || keys.length > 2000) fail("Invalid keyframes");
  const times = new Set();
  for (const k of keys) {
    if (!record(k)) fail("Invalid keyframe");
    finite(k.time, 0, duration, "keyframe time");
    if (times.has(k.time)) fail("Duplicate keyframe time");
    times.add(k.time);
    checkVector(k.position, "key position");
    checkVector(k.rotation, "key rotation");
    checkVector(k.scale, "key scale", true);
  }
  keys.sort((a, b) => a.time - b.time);
}
export function getClip(doc, id) {
  if (id == null || id === "default") return null;
  const clip = doc.clips?.find((c) => c.id === id);
  if (!clip) fail(`Clip not found: ${id}`);
  return clip;
}
export function clipDuration(doc, id) {
  return getClip(doc, id)?.duration ?? doc.duration;
}
export function keysFor(doc, node, id) {
  const clip = getClip(doc, id);
  return clip
    ? Object.hasOwn(clip.tracks, node.id)
      ? clip.tracks[node.id]
      : []
    : node.keys;
}
function setTrack(clip, id, keys) {
  Object.defineProperty(clip.tracks, id, {
    value: keys,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}
export function poseFor(doc, node, time, id) {
  return poseAt(node, time, keysFor(doc, node, id));
}
export function poseAt(node, time, keyframes = node.keys) {
  if (!Number.isFinite(time)) fail("Invalid animation time");
  const keys = [...keyframes].sort((a, b) => a.time - b.time);
  if (!keys.length)
    return {
      position: [...node.position],
      rotation: [...node.rotation],
      scale: [...node.scale],
    };
  const a = keys.filter((k) => k.time <= time).at(-1) || keys[0];
  const b = keys.find((k) => k.time > time) || a;
  const t =
    a === b ? 0 : Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
  const result = Object.fromEntries(
    ["position", "rotation", "scale"].map((p) => [
      p,
      a[p].map((v, i) => v + (b[p][i] - v) * t),
    ]),
  );
  if (t > 0 && t < 1) {
    const qa = new Quaternion().setFromEuler(new Euler(...a.rotation));
    const qb = new Quaternion().setFromEuler(new Euler(...b.rotation));
    const e = new Euler().setFromQuaternion(qa.slerp(qb, t));
    result.rotation = [e.x, e.y, e.z];
  }
  return result;
}
export function applyCommands(document, commands) {
  const doc = validateDocument(document);
  if (!Array.isArray(commands) || commands.length > 2000)
    fail("Expected an array of up to 2000 commands");
  for (const cmd of commands) {
    if (!record(cmd)) fail("Invalid command");
    const n = doc.nodes.find((n) => n.id === cmd.id);
    switch (cmd.op) {
      case "group":
        validateDocument(doc);
        groupNodes(doc, cmd, makeNode);
        break;
      case "ungroup":
        validateDocument(doc);
        ungroupNode(doc, cmd.id);
        break;
      case "duplicate":
        validateDocument(doc);
        duplicateNodes(doc, cmd, makeNode);
        break;
      case "setReferenceImages":
        if (cmd.references === null) delete doc.referenceImages;
        else doc.referenceImages = clone(validateReferences(cmd.references));
        break;
      case "setModifiers":
        setModifiers(n, cmd.modifiers);
        break;
      case "bakeModifiers":
        bakeModifiers(n);
        break;
      case "meshEdit":
        applyMeshEdit(n, cmd, doc);
        break;
      case "convertMesh":
        if (!n || ["group", "bone", "mesh"].includes(n.type))
          fail("Choose a primitive to convert");
        validateMeshGeometry(cmd.geometry);
        n.type = "mesh";
        n.geometry = clone(cmd.geometry);
        break;
      case "setReview":
        if (cmd.review === null) delete doc.review;
        else doc.review = clone(cmd.review);
        break;
      case "bindSkin":
        validateDocument(doc);
        bindSkin(doc, n, cmd);
        break;
      case "setSkinWeights":
        setSkinWeights(n, cmd);
        break;
      case "unbindSkin":
        if (!n?.skin) fail("Object has no skin");
        delete n.skin;
        break;
      case "sculpt": {
        if (n?.skin) fail("Unbind skin before rebuilding sculpt geometry");
        if (commands.filter((c) => c.op === "sculpt").length > 4)
          fail("At most four sculpt operations per batch");
        const recipe = validateSculptRecipe(cmd.recipe),
          geometry = sculptGeometry(recipe);
        if (n) {
          if (n.type !== "mesh") fail("Sculpt editing requires a mesh");
          n.geometry = geometry;
          n.sculpt = recipe;
        } else
          doc.nodes.push(
            makeNode("mesh", {
              ...cmd,
              geometry,
              sculpt: recipe,
              color: cmd.color ?? "#ffffff",
            }),
          );
        break;
      }
      case "create":
        doc.nodes.push(makeNode(cmd.type, cmd));
        break;
      case "update":
        if (
          n?.skin &&
          ["position", "rotation", "scale"].some((k) => Object.hasOwn(cmd, k))
        )
          fail(
            "Move the rig root or edit its bones, not the skinned mesh transform",
          );
        if (!n) fail(`Object not found: ${cmd.id}`);
        for (const key of [
          "name",
          "parent",
          "position",
          "rotation",
          "scale",
          "color",
          "roughness",
          "metalness",
          "emissive",
          "emissiveIntensity",
          "visible",
          "geometry",
          "sculpt",
          "skin",
          "jointLimit",
          "modifiers",
        ]) {
          if (Object.hasOwn(cmd, key)) n[key] = clone(cmd[key]);
        }
        break;
      case "delete": {
        if (!n) fail(`Object not found: ${cmd.id}`);
        const removed = new Set([cmd.id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const item of doc.nodes)
            if (removed.has(item.parent) && !removed.has(item.id)) {
              removed.add(item.id);
              changed = true;
            }
        }
        doc.nodes = doc.nodes.filter((item) => !removed.has(item.id));
        for (const clip of doc.clips ?? [])
          for (const id of removed) delete clip.tracks[id];
        break;
      }
      case "keyframe": {
        if (n?.skin)
          fail("Animate bones or the rig root, not the skinned mesh transform");
        if (!n) fail(`Object not found: ${cmd.id}`);
        const clip = getClip(doc, cmd.clip),
          current = keysFor(doc, n, cmd.clip);
        const pose = poseAt(n, cmd.time, current);
        const keys = current.filter(
          (k) => Math.abs(k.time - cmd.time) > 0.0001,
        );
        keys.push({
          time: cmd.time,
          position: clone(cmd.position ?? pose.position),
          rotation: clone(cmd.rotation ?? pose.rotation),
          scale: clone(cmd.scale ?? pose.scale),
        });
        if (clip) setTrack(clip, n.id, keys);
        else n.keys = keys;
        break;
      }
      case "moveKeyframe": {
        if (!n) fail(`Object not found: ${cmd.id}`);
        const keys = keysFor(doc, n, cmd.clip),
          duration = clipDuration(doc, cmd.clip);
        finite(cmd.from, 0, duration, "source keyframe time");
        finite(cmd.time, 0, duration, "keyframe time");
        const key = keys.find((k) => Math.abs(k.time - cmd.from) < 0.0001);
        if (!key) fail("Source keyframe not found");
        if (keys.some((k) => k !== key && Math.abs(k.time - cmd.time) < 0.0001))
          fail("A keyframe already exists at that time");
        key.time = cmd.time;
        break;
      }
      case "removeKeyframe": {
        finite(cmd.time, 0, clipDuration(doc, cmd.clip), "keyframe time");
        if (!n) fail(`Object not found: ${cmd.id}`);
        const clip = getClip(doc, cmd.clip),
          keys = keysFor(doc, n, cmd.clip).filter(
            (k) => Math.abs(k.time - cmd.time) > 0.0001,
          );
        if (clip) setTrack(clip, n.id, keys);
        else n.keys = keys;
        break;
      }
      case "createClip":
        doc.clips ??= [];
        doc.clips.push({
          id: cmd.id ?? crypto.randomUUID(),
          name: cmd.name ?? "New clip",
          duration: cmd.duration ?? doc.duration,
          tracks: clone(cmd.tracks ?? {}),
          ...(cmd.loop !== undefined ? { loop: cmd.loop } : {}),
        });
        break;
      case "updateClip": {
        const clip = getClip(doc, cmd.id);
        if (!clip) fail("Use scene to update default Action");
        for (const key of ["name", "duration", "loop"])
          if (Object.hasOwn(cmd, key)) clip[key] = clone(cmd[key]);
        break;
      }
      case "deleteClip":
        if (!getClip(doc, cmd.id)) fail("Default Action cannot be deleted");
        doc.clips = doc.clips.filter((c) => c.id !== cmd.id);
        break;
      case "duplicateClip": {
        const source = getClip(doc, cmd.source),
          tracks = source
            ? clone(source.tracks)
            : Object.fromEntries(
                doc.nodes
                  .filter((n) => n.keys.length)
                  .map((n) => [n.id, clone(n.keys)]),
              );
        doc.clips ??= [];
        doc.clips.push({
          id: cmd.id ?? crypto.randomUUID(),
          name: cmd.name ?? `${source?.name ?? "Action"} copy`,
          duration: source?.duration ?? doc.duration,
          ...(source?.loop !== undefined ? { loop: source.loop } : {}),
          tracks,
        });
        break;
      }
      case "scene":
        for (const key of ["name", "duration", "fps"])
          if (Object.hasOwn(cmd, key)) doc[key] = cmd[key];
        break;
      default:
        fail(`Unknown command: ${cmd.op}`);
    }
  }
  return validateDocument(doc);
}
