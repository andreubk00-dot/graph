# Topology tools · version 0.9

This stage adds three direct modeling operations to the existing mesh workshop: edge splitting, vertex merging and a planar bevel of one strictly convex corner. It does not implement loop cuts, rounded edge bevels, dissolve, arbitrary mesh intersection or a live modifier stack.

Open a surface object's **Вершины · рёбра · грани** panel, then **Разрезы · объединение · фаска**. Work is isolated until Apply and the complete operation series remains one undoable project edit. Source TRS, clips, original vertex numbering and existing UV/color slots remain intact; new vertices append. Old unused vertex slots remain available by explicit ID, but are omitted from mouse picking and Select All so they cannot mask the visible surface. Edges and faces receive new indices after topology changes; obtain a fresh list with `forge.meshTopology(id)`.

## Split edges

Select edges and set a fraction strictly between 0 and 1. The fraction runs from the lower vertex ID to the higher ID in the selected edge's pair. Split one or several edges at once. All incident triangles are retriangulated with preserved winding; original triangle shape/area and existing vertex IDs remain unchanged.

Exact Float32-position counterparts across a UV or color seam are split together, using the same physical point and interpolating each side's own attributes. Their separate vertex IDs are retained. Selecting oppositely numbered coincident seam edges at a non-midpoint fraction can request conflicting physical positions; such requests are rejected. Nonmanifold or inconsistently wound selected seam edges are rejected. This operation is a local triangle-edge split, not a quad loop-cut tool.

```js
const {edges} = forge.meshTopology('part');
forge.execute([{op:'meshEdit', id:'part', action:'splitEdges',
  selection:{mode:'edge',ids:[0,2]}, fraction:0.5}]);
```

## Merge vertices

Select at least two vertices. Choose an explicit target ID or keep the first selected vertex as target. Placement is either the target position or the average of unique selected Float32 positions; UV duplicates do not bias this average.

Default `attributePolicy:'reject'` refuses a merge when selected UV or color values differ. Explicit `attributePolicy:'target'` keeps the target vertex's values for the surviving surface. It is a deliberate attribute-loss choice, exposed in the UI, not implicit welding.

Triangle indices are redirected to the target, and faces collapsed by that redirection are removed. Original vertex slots remain; merged-away positions move to the result so unused slots cannot extend old bounds. Duplicate faces, inconsistent winding, nonmanifold edges and disconnected surface fans pinched into a shared vertex are rejected. Geometry validation also rejects zero-area remaining triangles. This is not an unrestricted mesh repair algorithm and does not prove freedom from general self-intersection.

```js
forge.execute([{op:'meshEdit', id:'part', action:'mergeVertices',
  selection:{mode:'vertex',ids:[4,7]}, target:4,
  placement:'target', attributePolicy:'reject', landmarkPolicy:'reject'}]);
```

## Planar corner bevel

Select one vertex of a closed, consistently wound, strictly convex corner. Coincident attribute-split instances form one geometric corner. Width is the inward distance of the cutting plane along the normalized sum of unique incident face normals. It is a local distance; object and parent scale are not baked into the operation.

The incident triangles are clipped, a closed convex cut loop is verified, and a planar cap is added. Side attributes interpolate separately across existing seams. The cap has its own vertex/UV slots and planar UV projection; it will need atlas packing before textured game delivery. Normals are rebuilt through the same canonical builder as other mesh edits. The cap's separate vertices permit a sharp edge.

Excessive widths reaching neighboring vertices, open or disconnected fans, flat/concave corners, degenerate cuts and nonconvex cap loops are rejected. This is a single planar vertex truncation, not a multi-segment bevel along selected edges. It does not perform general collision detection against distant geometry.

```js
forge.execute([{op:'meshEdit', id:'part', action:'bevelVertex',
  vertex:6, width:0.05, landmarkPolicy:'reject'}]);
```

## Landmarks, history and source provenance

Merge and bevel replace particular surface vertex identities. If a configured vertex landmark would become unused, the default policy rejects the operation. Set `landmarkPolicy:'remap'`, or enable **Перенести ориентиры на результат**, to explicitly move it to the merge target or new cap-center vertex. Other landmarks and local rigid points remain untouched. A split leaves all existing vertex references unchanged.

Both geometry and landmark references commit as one atomic edit; failure leaves the project unchanged. Draft Undo/Redo restores geometry and draft landmark identities together. Applying a topology draft refuses externally changed review metadata so a stale draft cannot silently overwrite its meaning. Unbinding is required before editing a skinned mesh. Real geometry edits clear an obsolete SDF sculpt recipe.

Low-level `editTopology` / `bevelCorner` in `src/mesh-topology.js` mutate an isolated geometry draft and return a vertex-remapping Map. The application/CLI entry is `meshEdit`: it clones source geometry, rebuilds normals, validates Float32 triangles and budgets, applies the landmark policy, and validates the entire document. Do not bypass that path when editing a project.

## Validation

The unit suite exercises all 31 nonempty edge subsets of a two-triangle quad at three fractions (93 cases), UV/color seams, both merge placements, explicit attribute and landmark policies, atomic refusal of bad geometry, 24 cube corner/width combinations and six octahedron corners with analytical cut volumes. It verifies closure, winding, normals and the visible destination of relocated landmarks. Browser scenarios cover UI policies, draft/project undo, autosave, cap picking, GLB round-trip, compact layout and stale review metadata. These are engineering checks on technical fixtures; they do not establish anatomy or artistic quality.

`node scripts/render-topology-review.js /tmp/graph-topology-review` reproduces the actual workshop, a bevel → split → merge series, perspective/front/side/top PNGs, source JSON, GLB and project Undo/Redo verification. The saved result was independently reproduced with CLI `apply`/`export`; the full project, including relocated landmarks, matched the browser result.

Final checks: **96 unit tests**, **11 relevant browser scenarios** (plus the merge-policy scenario repeated after the unused-target guard) and the production build passed. The real captures were inspected. Khronos glTF Validator 2.0.0-dev.3.10 reported **0 errors, 0 warnings, 0 infos** for the exported technical study: [topology-validation.json](topology-validation.json). Its source has 22 retained vertex slots, 14 unique positions, 24 triangles and one closed component with no boundary/nonmanifold edges, winding conflicts, degenerates or normal errors. The flat-shaded GLB contains 72 export vertices and 24 triangles. These results apply to this fixture, not arbitrary future assets.
