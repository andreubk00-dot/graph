# Development order for game asset authoring

The editor is being developed before a new artistic character is attempted. Technical topology, deformation and contact fixtures are engineering acceptance checks, not anatomy/AAA certification.

## 1. Direct modeling

Implemented in 0.8: vertex/edge/triangle selection; numeric and gizmo translation; region extrusion, face deletion and normal rebuilding; applied half-mesh mirror with seam reuse; orthographic modeling views and embedded raster references; atomic API operations and isolated draft history.

Version 0.9 additionally implements local triangle-edge splits, explicit vertex merging and a single planar convex-corner bevel with atomic landmark remapping. See [TOPOLOGY_TOOLS.md](TOPOLOGY_TOOLS.md).

Version 0.10 adds one live half-mesh mirror with isolated source/evaluated geometry, toggle/remove/bake, stable source landmark IDs and a shared viewport/export evaluator. See [LIVE_MIRROR.md](LIVE_MIRROR.md).

Version 0.11 adds 1–3 levels of Loop triangular subdivision and an ordered bounded stack (one mirror + one subdivision), canonical cage picking and stable source vertex landmarks through evaluation/baking. See [SUBDIVISION.md](SUBDIVISION.md).

Version 0.12 adds binary persistent hard creases, propagation through Loop/mirror/topology edits and render-only normal-fan splitting that preserves source vertex IDs and copies skin attributes. See [CREASES.md](CREASES.md).

Version 0.13 adds a bounded single-edge rounded bevel on closed convex solids, face-offset width, 1–16 segments, analytic band normals and explicit endpoint-landmark remapping. Geometry tests and an actual Node GLB round-trip pass; browser/visual acceptance remains pending sandbox access. See [ROUNDED_BEVEL.md](ROUNDED_BEVEL.md).

Version 0.14 adds single interior-vertex dissolve for planar convex triangle fans, with whole-patch affine attribute checks, preserved normals, atomic landmark remapping and rejection of active subdivision. Surface audits distinguish retained unused vertex slots from real disconnected surfaces. See [DISSOLVE.md](DISSOLVE.md).

Still needed to complete this stage:

- Complete rounded bevel acceptance in the browser, then support multiple adjacent edges with explicit corner/miter treatment and broader topology. The initial single-edge convex tool rejects unsupported widths/topology instead of guessing a repair.
- Loop cuts and broader dissolve (edges, concave/boundary patches and attribute seams), plus merge/repair workflows. Reference landmarks must be remapped or explicitly invalidated when vertex identity changes.
- Quad/ngon authoring topology with deterministic triangulation for rendering/export.
- Extend the two-type ordered modifier stack with fractional/semi-sharp crease controls, quad Catmull–Clark/adaptive subdivision and broader modifier types. Editing, baking, saving and exported results must agree; source topology and evaluated topology need distinct identities.
- Faster component picking/updates for larger game meshes and broader crease/hard-edge controls.

Acceptance: edit a technical asset through selection → shape change → topology change → mirror → undo/redo → save/reload → GLB round-trip; inspect front/side/perspective renders and verify manifold topology where a closed surface is intended. Closed/zero-area/nonmanifold cases must fail clearly rather than corrupt a project.

## 2. Rigging tools

Existing foundation: bone hierarchy, four-influence linear skinning, saved bind matrices, exact weight commands, rig/hinge diagnostics and posed-vertex sampling.

Next: bone placement/orientation UI, vertex influence inspection, weight editing/painting with normalization, mirror rules, then two-bone IK controls and explicit keyframe baking. Deforming the bind pose must not silently rebind the mesh. Test shoulder/elbow/hip/knee deformation poses and vertex positions after GLB round-trip. Joint limits/proportions require a chosen anatomical or mechanical reference.

## 3. UV, materials and texture workflow

Next: mark seams, UV selection/transforms, checker visualization, unwrap/packing, material texture slots and portable embedded image export. Then texture painting and high-to-low normal/AO baking with explicit tangent-space conventions. Modeling reference images are not material textures.

Acceptance: checker density/distortion review; UV islands and material appearance survive game-engine import; normal maps light correctly under rotation and mirrored transforms.

## 4. Animation editing

Existing foundation: named clips, object/bone keys, quaternion interpolation and motion checks.

Next: Dope Sheet, curve editor/tangents, motion/pose layers, contact-aware foot controls and cyclic seam checks. Any new interpolation must have a matching export or documented deterministic bake. Validate starts/stops, support transfer, facing and travel direction using references and actual rendered frames.

## 5. Sculpt and retopology

Existing foundation: recipe-based SDF generation and worker previews.

Next: real surface brushes/symmetry and local detail handling, followed by retopology tools and baking to a game mesh. These require explicit memory budgets and responsive cancellation; SDF primitives alone are not a full brush sculpt workflow.

## 6. 2D and pixel authoring

Existing foundation: separate pixel/vector documents, layers/frames, history, PNG/SVG and padded atlas exports, motion reference checks.

Next: direct vector node/handle editing, palette workflows, onion skin and linked cels, better frame timing and visual consistency tools. Preserve exact pixels, alpha, frame duration and atlas bounds in exported game assets.

## 7. Game delivery

Next: LOD and collision generation/editing, triangle/material/texture budgets, scale/pivot conventions and a reproducible import check for the chosen game engine. Validate both static and skinned assets, clips, materials, bounds and collisions in that engine before calling an asset game-ready.

At each stage retain the JSON command/API path, reliable undo/autosave, real multi-view inspection and meaningful tests. A successful test/export is necessary evidence of tool behavior; it does not certify a finished model's anatomy or artistic quality.
