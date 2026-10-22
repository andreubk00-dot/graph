# Mesh workshop · introduced in version 0.8

Version 0.10 adds a separate [live mirror](LIVE_MIRROR.md); the applied operation documented below remains available when no live modifier is present.

This iteration implements the first modeling milestone. It uses a technical half-box to test topology and manipulation; no new character asset is presented.

## Using the editor

Select a surface object and choose **Вершины · рёбра · грани** in its inspector. A separate draft opens in the object's **local rest coordinates**, without parent transforms or animation. The main project stays unchanged until **Применить сетку и референсы**. Cancel/Escape discards the draft. Apply is one project undo step, includes autosave, and preserves clips and object TRS. A primitive becomes a canonical mesh when geometry edits are applied; opening/cancelling it or only saving reference images does not convert it.

- Select vertices, edges or triangle faces by click; Shift toggles membership. Empty-space click clears selection. **Выбор насквозь** permits hidden vertex/edge selection. Faces use the nearest surface hit.
- Component IDs are zero-based. Edges are enumerated in first-encounter order through triangles, with each pair internally sorted. After topology edits, obtain a fresh edge/face list instead of reusing stale IDs.
- Move selected components with the translation gizmo or a numeric XYZ offset in local meters. Shared vertices move once. A single vertex can also receive exact coordinates.
- **Выдавить выбранные грани** replaces the selected triangle caps with translated copies and builds walls only around the region's boundary. Exact Float32-position adjacency across UV/hard-edge splits is recognized when finding region boundaries, without merging attribute vertices. It does not add a bottom to an originally open sheet. Use a nonzero offset; offsets collapsing side walls are rejected. Selected regions need consistent winding and manifold edges. General self-intersection/vertex-manifold certification is not implemented.
- **Удалить выбранные грани** removes triangles, retaining original vertex IDs, including unused vertices. **Пересчитать нормали** rebuilds normals from the remaining triangles. Unused vertices receive a valid unit normal; cancelling normals on referenced vertices require repairing winding/splitting and are rejected.
- Draft Undo/Redo and Ctrl+Z/Ctrl+Shift+Z affect local edits. The project history changes only after Apply. If the source node or project references have changed through an external API call while the dialog is open, Apply refuses the stale draft.

Interactive limits: 20,000 vertices, 40,000 triangles, 128 operations per apply, up to 30 draft history snapshots (approximately 32 MiB budget). The command API retains the existing larger mesh/scene budgets. Edits to a skinned rest mesh require explicit `unbindSkin` first; no implicit weight remapping is attempted. Geometric edits clear `node.sculpt`, because its generated recipe no longer describes the edited surface.

## Mirror and seam

**Отразить и сварить шов** is a committed mesh operation, not a live modifier. Choose X/Y/Z, a plane offset, source side and a seam tolerance. All **referenced** source vertices must lie on that half. Faces crossing the plane are rejected; bisect is not implemented. Delete the unwanted faces first. Unreferenced retained vertices do not prevent mirroring.

Vertices within the tolerance snap to the plane and reuse their own IDs on both halves. Other vertices append reflected copies. Reflected triangle winding is reversed. Remove any seam-plane caps first; duplicate internal walls are rejected. Distinct coincident vertices remain distinct: the operation does not destroy UV seams, color seams or existing hard-edge splits. Welding here joins each boundary vertex to its reflected counterpart, not arbitrary coincident source vertices.

Existing vertex IDs and vertex-landmark references remain stable. Deleting nearby faces can leave an existing landmark on an unused vertex; check that it still denotes the intended surface location. Extrusion appends vertices and keeps cap face slots; deletion changes face IDs. UV/color attributes are retained or copied to appended vertices. New extrusion walls need UV authoring, and mirrored UVs share texture space. Hard-edge authoring, UV unwrap, automatic mirror skin weights and a general modifier stack are future work; version 0.10 supplies one live mirror.

## Orthographic references

The workshop has true orthographic front (+Z), right (+X), and top (+Y, screen-up −Z) views, as well as orbitable perspective. Front coordinates are XY, side screen-right is −Z, top coordinates are X/−Z. Orthographic views allow panning/zooming without orbiting. **Вписать** frames the mesh.

In an orthographic view, open **Изображение-референс** and load a local PNG/JPEG/WebP. No remote image requests, SVG or arbitrary markup are supported. UI imports are limited to 1 MiB per file and 4096 pixels per side. Set physical width, opacity and center in the same local coordinates. Images keep their aspect ratio and render behind the editable surface. Each view has one project-wide reference; perspective hides them. References are for modeling in this dialog and do not appear in the main scene, clean scene captures or GLB.

Optional `document.referenceImages` stores at most three embedded raster references, with a combined UTF-16 source-data budget of 4 MiB. Images are embedded for offline portability, so project files and history become larger. Imported rasters are decoded before UI acceptance and before Apply. The schema validates data shape, media type and budget; it is not a raster file decoder.

```js
{
  view: 'front', name: 'front.png',
  data: 'data:image/png;base64,...',
  width: 1.8, opacity: 0.4, center: [0, 0.9, 0]
}
```

## Agent API and CLI

The same operations back the UI, browser API and JSON command batches:

```js
forge.convertToMesh('part'); // bake the existing primitive, preserving TRS/clips
const topology = forge.meshTopology('part'); // {faces: [[v0,v1,v2],...], edges: [[v0,v1],...]}
forge.execute([
  {op:'meshEdit', id:'part', action:'translate',
   selection:{mode:'vertex',ids:[0,1]}, delta:[0,0.02,0]},
  {op:'meshEdit', id:'part', action:'setVertex', vertex:2, position:[0.2,0.4,0]},
  {op:'meshEdit', id:'part', action:'extrude',
   selection:{mode:'face',ids:[0,1]}, delta:[0,0,0.1]},
  {op:'meshEdit', id:'part', action:'mirror', axis:'x',
   offset:0, side:'positive', tolerance:0.00001},
]);
// Additional actions: deleteFaces (face selection), recalculateNormals.
forge.execute([{op:'setReferenceImages', references: images}]); // null removes the field
const lab = forge.openMeshEditor('part');
lab.setView('front');
lab.select('edge', [0]);
lab.operate({action:'translate', selection:{mode:'edge',ids:[0]}, delta:[0,0.02,0]});
const draft = lab.getDraft(); // isolated geometry/operations/selection/refs
const screenPoint = lab.project([0,0,0]);
const png = lab.screenshot(); // actual workshop render, including visible references/helpers
const result = await lab.apply(); // {applied:true} or {applied:false,error}; errors stay visible
```

The commands above demonstrate individual forms, not a valid universal sequence for every mesh. A mirror command still needs a prepared half. Invalid commands abort an entire batch. CLI: `node scripts/forge.js apply input.graph.json commands.json output.graph.json`. The CLI consumes canonical meshes; primitive baking is exposed by the browser API and `bakeMeshGeometry` module. Low-level `convertMesh` commands accept validated canonical buffers.

The shared primitive baker omits zero-area Float32 triangles (for example in axis-ended lathe profiles) without reordering existing vertices, UVs or normals. All final buffers still pass the common mesh and scene validators.

## Next modeling stages

This release does not implement bevel, loop cuts, merge/dissolve, quad/ngon topology, live mirror/subdivision modifiers, brush sculpting, retopology, UV editing, weight painting or IK controls. These remain separate milestones; they should not be described as available. Good topology tests establish mechanical behavior, not anatomical accuracy or artistic quality.

## Reproduction and validation

`node scripts/render-mesh-workshop.js /tmp/graph-mesh-workshop` opens the actual editor, mirrors the technical half-box, extrudes one top region by 0.25 m, captures perspective/front/side/top views and the workshop dialog, imports a deterministic alignment-grid PNG, saves the source and exports GLB. The generated grid is a calibration reference, not character artwork.

The same two `meshEdit` commands were also applied through the CLI and exported independently. Khronos glTF Validator 2.0.0-dev.3.10 reported **0 errors, 0 warnings, 0 infos** for this technical result: [mesh-workshop-validation.json](mesh-workshop-validation.json). The topology audit found 16 vertices, 28 triangles, one component, zero boundary/nonmanifold edges, zero winding conflicts, and zero degenerate triangles/normal errors. The final top step is intentionally asymmetric, so full mirror matching is not an acceptance criterion after the extrusion. These results apply to this fixture, not arbitrary future meshes.

Flat shading has no glTF material flag. Export therefore prepares an independent face-normal buffer when the existing normals do not already match the triangles, expanding UV/color/skin attributes together and removing zero-area primitive triangles. The saved mesh and its viewport/landmark vertex IDs remain unchanged. Export vertex counts can increase for flat surfaces; compare actual triangle positions and shading rather than expecting identical exported vertex IDs. Skinned assets still follow glTF normal deformation rules.

The verification set includes 85 passing unit tests and 43 distinct passing browser scenarios across the broad run and focused reruns. The initial broad browser run exposed a 30-second software-WebGL time budget and an asynchronous bench-readiness race in the test; the default cloud test budget is now 60 seconds and readiness waits for the same required visible state. The timing changes retain the same required-state assertions. Export checks compare actual triangle positions and face normals while allowing the necessary export-only vertex splits. The UV-split fix was tested in the browser, and the final flat-normal export change was followed by nine passing relevant export/animation/skinning scenarios and a production build. This records the combined verification, not a claim of a single fresh full-suite run after every isolated fix.
