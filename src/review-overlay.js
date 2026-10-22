import * as THREE from "three";
import { landmarkPosition } from "./model-review.js";
export function makeReviewOverlay(review, objects) {
  const group = new THREE.Group();
  group.name = "editor-review-overlay";
  const ids = Object.keys(review?.landmarks ?? {}),
    sphere = new THREE.SphereGeometry(0.012, 8, 6),
    material = new THREE.MeshBasicMaterial({
      color: "#ffd36b",
      depthTest: false,
    }),
    dots = new THREE.InstancedMesh(sphere, material, Math.max(1, ids.length));
  dots.count = ids.length;
  dots.frustumCulled = false;
  dots.renderOrder = 12;
  group.add(dots);
  const pairs = (review?.measurements ?? []).map((m) => m.between),
    array = new Float32Array(pairs.length * 6),
    geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(array, 3));
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: "#79e4db", depthTest: false }),
  );
  lines.frustumCulled = false;
  lines.renderOrder = 11;
  group.add(lines);
  const matrix = new THREE.Matrix4();
  return {
    group,
    update() {
      if (!group.visible) return;
      const points = new Map(
        ids.map((id) => [id, landmarkPosition(review.landmarks[id], objects)]),
      );
      ids.forEach((id, i) =>
        dots.setMatrixAt(
          i,
          matrix.makeTranslation(...points.get(id).toArray()),
        ),
      );
      dots.instanceMatrix.needsUpdate = true;
      pairs.forEach((p, i) =>
        array.set(
          [...points.get(p[0]).toArray(), ...points.get(p[1]).toArray()],
          i * 6,
        ),
      );
      geometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      sphere.dispose();
      material.dispose();
      dots.dispose();
      geometry.dispose();
      lines.material.dispose();
    },
  };
}
