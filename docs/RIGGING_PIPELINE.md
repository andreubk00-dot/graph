# Rigging pipeline: engineering notes and acceptance gates

Reviewed on 2026-10-20. This document records what was studied and what the editor actually implements. It is not an anatomy certification or a claim of AAA asset quality.

## Sources reviewed

- [Khronos glTF 2.0 specification: Skins and Joint Hierarchy](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#skins): joint palettes, inverse bind matrices, a common root, affine matrices, and joint-controlled geometry.
- [Khronos glTF tutorial 20: Skins](https://github.com/KhronosGroup/glTF-Tutorials/blob/main/gltfTutorial/gltfTutorial_020_Skins.md): the weighted joint transform, bind shape handling, JOINTS_0 and WEIGHTS_0.
- [Khronos glTF tutorial 7: Animations](https://github.com/KhronosGroup/glTF-Tutorials/blob/main/gltfTutorial/gltfTutorial_007_Animations.md): independent local transform tracks and time interpolation.
- Implementation cross-check against the installed Three.js 0.180 sources: `src/objects/SkinnedMesh.js`, `src/objects/Skeleton.js`, `examples/jsm/exporters/GLTFExporter.js`, and `examples/jsm/loaders/GLTFLoader.js` under `node_modules/three`.

These are engineering sources. They do not establish human proportions, joint ranges for an individual, or running biomechanics. Those require appropriate anatomical and motion references before creating a character.

## Rules derived from the specification

1. A vertex is deformed by a weighted sum of joint matrices, not by placing separate spheres near a hinge. Every vertex has up to four unique active influences; weights must be nonnegative and sum to one. Bad data is rejected, never silently normalized.
2. Capture inverse bind matrices once from bone world transforms in the bind pose. Do not recompute them while posing, seeking, rebuilding a view or exporting. Store the mesh bind matrix separately. The Three.js exporter folds it into glTF inverse bind matrices.
3. Pose the joints or a common rig root. Direct animation or transform edits of the skinned mesh would be ignored by glTF skinning; the editor blocks those operations and explains the correct target.
4. Keep bone identities and the vertex order stable. Duplicate a complete rig with its mesh and remap the joint palette. Removing a referenced joint or hiding a joint used by a visible skin must fail atomically. Use the overlay switch to hide the rig display.
5. Inspect deformed bounds. Rest-pose geometry bounds can cull moving limbs and misplace selection boxes; invalidate them after posing and compute deformed bounds when needed. Skinned meshes disable frustum culling in this first implementation to keep off-screen rest bounds from hiding visible limbs.
6. Compare actual deformed world vertices before and after a GLB roundtrip, including interpolated times, root transforms, a nonidentity mesh bind matrix, and duplicated rigs. Successful serialization alone proves little.

## Implemented now

- Bone nodes, hierarchical bone animation, linear blend skinning with up to 256 palette joints, four influences per vertex, explicit bind matrices, and glTF skin export.
- Exact API weight assignment with undo/autosave, selected-bone weight visualization, rig overlays excluded from clean captures and exports.
- Author-defined hinge diagnostics: signed twist and off-axis swing relative to the bone's base `rotation`; per-clip checks include all bone key times and a uniform time grid. Constraints report violations; they do not solve or clamp a pose.
- Segment-length and animated-scale diagnostics. Segment length is measured in parent-local coordinates. These checks do not account for every deformation introduced by animated non-bone ancestors.
- A technical cylinder with a three-joint chain, a legal 90-degree bend and an intentionally invalid 165-degree bend. Its 135-degree bound is an arbitrary test setting, not a human joint recommendation.

Linear blend skinning can lose volume at bent joints and show candy-wrapper artifacts during twist. A smooth-looking technical cylinder does not prove that a human elbow, shoulder or hip has good topology or weights. Weight painting, corrective shapes, twist distribution, dual-quaternion skinning, retargeting and production rigs are not implemented.

## Before making the next character

- Establish reference: style, intended species/body type, front and side views in the same scale, height and anatomical landmarks. Do not force every body into one head-count rule.
- Locate real joint pivots and measure segment lengths. Review clavicle, scapula, rib cage and pelvis relationships. A shoulder is not just a hinge; hips and shoulders need coupled multi-axis behavior.
- Build deformation topology and validate it in flexion, extension and twist. Check silhouettes from several views, armpits, groin, elbows and knees. No visible seams or interpenetration should be concealed by one camera.
- Bind and inspect influence transitions. Test attachments separately; a rigid weapon belongs under a hand bone, whereas soft tissue needs deformation. Examine loss of volume at difficult poses.
- For locomotion, review the entire body: pelvis and rib-cage rotation, trunk lean, arms opposing legs, foot orientation and toe-off. Evaluate cadence, stride, world speed and contacts together. Correct foot paths alone do not make a convincing run.
- Sample touchdown, mid-stance, toe-off, flight and recovery on stationary ground. Check forward direction in world coordinates and then under the chosen camera. In-place loops and root-motion clips must be distinguished.
- Then address UV layout, texture density, physically based materials, normals/tangents, LOD, skeleton compatibility, runtime budgets and engine import. None of these are certified by a topology counter.

The next character should wait until its reference and deformation checks are supported. The current change deliberately develops the editor and uses no new artistic character model.

## Independent export validation

The technical bench was exported and checked with the official Khronos `gltf-validator` 2.0.0-dev.3.10. The final report is saved in [rigging-validation.json](rigging-validation.json): **0 errors, 1 warning, 1 informational message**.

- `NODE_SKINNED_MESH_NON_ROOT`: the export preserves the editing hierarchy, where the mesh is under the rig group. glTF skinning ignores mesh-node parent transforms; joint world transforms control deformation. Move the common root containing the bones, not an isolated mesh parent. Roundtrip tests cover nonidentity binding and common-root transforms. This warning is retained and documented rather than hidden or silenced.
- `UNUSED_OBJECT` for `TEXCOORD_0`: the bench preserves its UV buffer although its current material has no texture. Keeping editable UV data is intentional.

Zero-weight joint slots are canonicalized to index zero in the GPU/export buffers, including weights that round to Float32 zero. Source influence data is unchanged. A black emissive material omits the ineffective emissive-strength extension on export; its physical emission remains zero and the source is unchanged.

To repeat independent validation without adding an application dependency:

```bash
node scripts/render-rig-review.js /tmp/graph-rig-review
node scripts/forge.js export /tmp/graph-rig-review/bench.graph.json /tmp/graph-rig-review/bench.glb
npm install --prefix /tmp/graph-validator --no-save --ignore-scripts gltf-validator@2.0.0-dev.3.10
node --input-type=module - <<'JS'
import fs from 'node:fs/promises';
import validator from '/tmp/graph-validator/node_modules/gltf-validator/index.js';
const bytes = await fs.readFile('/tmp/graph-rig-review/bench.glb');
const report = await validator.validateBytes(new Uint8Array(bytes), {uri: 'bench.glb'});
console.log(report.issues);
JS
```

Format validation does not establish anatomy, mesh deformation quality or visual fidelity.
