import { creaseNormalGeometry } from "./mesh-creases.js";
import { evaluateMeshGeometry } from "./mesh-modifiers.js";
import { flatExportGeometry } from "./mesh-export.js";
import { DEFAULT_OUTLINE } from "./polygon.js";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  poseAt,
  validateDocument,
  DEFAULT_PROFILE,
  keysFor,
} from "./document.js";

export function geometryFor(n) {
  const s = Math.round(n.geometry.segments ?? 32);
  switch (n.type) {
    case "mesh": {
      const { geometry: data, sources } = creaseNormalGeometry(
        evaluateMeshGeometry(n),
      );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(data.positions, 3),
      );
      if (data.indices) geometry.setIndex(data.indices);
      if (data.uv)
        geometry.setAttribute(
          "uv",
          new THREE.Float32BufferAttribute(data.uv, 2),
        );
      if (data.colors)
        geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(data.colors, 3),
        );
      if (data.normals)
        geometry.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(data.normals, 3),
        );
      else geometry.computeVertexNormals();
      if (n.skin) {
        const sourceVertices =
          sources ??
          Array.from({ length: data.positions.length / 3 }, (_, i) => i);
        geometry.setAttribute(
          "skinIndex",
          new THREE.Uint16BufferAttribute(
            sourceVertices.flatMap((v) =>
              Array.from({ length: 4 }, (_, j) =>
                Math.fround(n.skin.weights[v * 4 + j]) === 0
                  ? 0
                  : n.skin.indices[v * 4 + j],
              ),
            ),
            4,
          ),
        );
        geometry.setAttribute(
          "skinWeight",
          new THREE.Float32BufferAttribute(
            sourceVertices.flatMap((v) =>
              n.skin.weights.slice(v * 4, v * 4 + 4),
            ),
            4,
          ),
        );
      }
      geometry.normalizeNormals();
      return geometry;
    }
    case "box":
      return n.geometry.bevel > 0
        ? new RoundedBoxGeometry(
            1,
            1,
            1,
            n.geometry.bevelSegments ?? 3,
            n.geometry.bevel,
          )
        : new THREE.BoxGeometry(1, 1, 1);
    case "sphere":
      return new THREE.SphereGeometry(0.5, s, Math.max(8, Math.round(s / 2)));
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, s);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, s);
    case "torus":
      return new THREE.TorusGeometry(0.5, n.geometry.tube ?? 0.15, 16, s);
    case "plane":
      return new THREE.PlaneGeometry(1, 1);
    case "capsule":
      return new THREE.CapsuleGeometry(0.25, 0.5, 8, s);
    case "extrude": {
      const shape = new THREE.Shape(
        (n.geometry.outline ?? DEFAULT_OUTLINE).map(
          (p) => new THREE.Vector2(...p),
        ),
      );
      shape.closePath();
      const depth = n.geometry.depth ?? 0.2;
      return new THREE.ExtrudeGeometry(shape, {
        depth,
        steps: 1,
        bevelEnabled: false,
      }).translate(0, 0, -depth / 2);
    }
    case "lathe": {
      const geometry = new THREE.LatheGeometry(
        (n.geometry.profile ?? DEFAULT_PROFILE).map(
          (p) => new THREE.Vector2(...p),
        ),
        s,
      );
      // Three's lathe end normal retains the last profile-segment length.
      // Normalize it here so the viewport and GLB use the same unit normals.
      geometry.normalizeNormals();
      return geometry;
    }
  }
}
export function buildContent(target, document, map) {
  for (const n of document.nodes) {
    const object =
      n.type === "group"
        ? new THREE.Group()
        : n.type === "bone"
          ? new THREE.Bone()
          : new (n.skin ? THREE.SkinnedMesh : THREE.Mesh)(
              geometryFor(n),
              new THREE.MeshStandardMaterial({
                color: n.color,
                vertexColors: Boolean(n.geometry.colors),
                roughness: n.roughness,
                metalness: n.metalness,
                emissive: n.emissive ?? "#000000",
                emissiveIntensity: n.emissiveIntensity ?? 0,
                flatShading: !(
                  n.geometry.smooth ??
                  (["sphere", "capsule", "lathe", "mesh"].includes(n.type) ||
                    (n.type === "box" && n.geometry.bevel > 0))
                ),
                side: THREE.DoubleSide,
              }),
            );
    object.name = n.id;
    object.userData = { nodeId: n.id, label: n.name };
    object.visible = n.visible;
    const pose = n;
    object.position.fromArray(pose.position);
    object.rotation.set(...pose.rotation);
    object.scale.fromArray(pose.scale);
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
    map.set(n.id, object);
  }
  for (const n of document.nodes)
    (n.parent ? map.get(n.parent) : target).add(map.get(n.id));
  target.updateMatrixWorld(true);
  for (const n of document.nodes)
    if (n.skin) {
      const skeleton = new THREE.Skeleton(
        n.skin.joints.map((id) => map.get(id)),
        n.skin.inverseBindMatrices.map((m) => new THREE.Matrix4().fromArray(m)),
      );
      const mesh = map.get(n.id);
      mesh.bind(skeleton, new THREE.Matrix4().fromArray(n.skin.bindMatrix));
      mesh.frustumCulled = false;
      mesh.boundingBox = null;
      mesh.boundingSphere = null;
    }
}
export function disposeScene(root) {
  root.traverse((o) => {
    o.skeleton?.dispose();
    o.geometry?.dispose();
    o.material?.dispose();
  });
}
export async function createGLB(input) {
  const doc = validateDocument(input),
    root = new THREE.Scene(),
    map = new Map();
  buildContent(root, doc, map);
  // A black emissive factor produces no light at any strength. Avoid exporting
  // a redundant extension while preserving the source and the rendered result.
  root.traverse((o) => {
    if (o.isMesh && o.material.emissive.getHex() === 0)
      o.material.emissiveIntensity = 1;
  });
  function animation(name, duration, clipId) {
    const tracks = [];
    for (const n of doc.nodes)
      if (keysFor(doc, n, clipId).length) {
        const o = map.get(n.id);
        let ancestor = o,
          visible = true;
        while (ancestor) {
          if (!ancestor.visible) visible = false;
          ancestor = ancestor.parent;
        }
        if (!visible) continue;
        const times = [
          ...new Set([
            0,
            ...keysFor(doc, n, clipId).map((k) => k.time),
            duration,
          ]),
        ].sort((a, b) => a - b);
        const poses = times.map((t) => poseAt(n, t, keysFor(doc, n, clipId)));
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${o.uuid}.position`,
            times,
            poses.flatMap((k) => k.position),
          ),
        );
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${o.uuid}.scale`,
            times,
            poses.flatMap((k) => k.scale),
          ),
        );
        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${o.uuid}.quaternion`,
            times,
            poses.flatMap((k) =>
              new THREE.Quaternion()
                .setFromEuler(new THREE.Euler(...k.rotation))
                .toArray(),
            ),
          ),
        );
      }
    return tracks.length
      ? new THREE.AnimationClip(name, duration, tracks)
      : null;
  }
  const animations = [
    animation("Action", doc.duration, null),
    ...(doc.clips ?? []).map((c) => animation(c.name, c.duration, c.id)),
  ].filter(Boolean);
  try {
    root.traverse((o) => {
      if (o.isMesh && o.material.flatShading) {
        const original = o.geometry;
        o.geometry = flatExportGeometry(original);
        if (o.geometry !== original) original.dispose();
      }
    });
    const { GLTFExporter } = await import(
      "three/addons/exporters/GLTFExporter.js"
    );
    return await new GLTFExporter().parseAsync(root, {
      binary: true,
      animations,
      onlyVisible: true,
    });
  } finally {
    disposeScene(root);
  }
}

export function updateSkinnedBounds(root) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.boundingBox = null;
      o.boundingSphere = null;
    }
  });
}
