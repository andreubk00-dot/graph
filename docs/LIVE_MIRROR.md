# Live mirror · introduced in version 0.10

Version 0.11 extends the original single-mirror workflow to an ordered mirror + Loop subdivision stack. The original 0.10 contract is recorded below; see [SUBDIVISION.md](SUBDIVISION.md) for current stack limits, ordering, source-cage picking and bake-all behavior.

The first nondestructive modifier is a **single half-mesh mirror**. This is not a general modifier stack, subdivision, bisect, UV unwrap or mirrored skin weighting.

In **Вершины · рёбра · грани**, choose axis, source side, local plane offset and seam tolerance, then **Создать / обновить живое зеркало**. Edit the source vertices, edges and faces: the rendered other half updates immediately. Source wire/points and component IDs refer only to the canonical half; reflected faces cannot be picked until baking. **Вписать** frames the complete evaluated surface. The inspector identifies source vertex counts and the live mirror state.

The checkbox disables evaluation without removing settings. **Убрать живое зеркало** removes only the modifier. **Запечь зеркало в сетку** replaces the canonical half with the evaluated surface and removes the modifier. Baking a disabled mirror only removes its settings. Local undo/redo includes source edits, mirror changes and baking, in their original order. Apply commits the entire draft as one project undo step; Cancel leaves the project unchanged. Save/reload retains the source half and settings.

## Command API

```js
forge.execute([
  { op: "setModifiers", id: "subject", modifiers: [{
    type: "mirror", enabled: true,
    axis: "x", side: "positive", offset: 0, tolerance: 0.00001
  }] },
  { op: "meshEdit", id: "subject", action: "setVertex",
    vertex: 6, position: [1.2, 1.1, 1] }
]);
// Later, explicitly turn the evaluated result into editable canonical data:
forge.execute([{ op: "bakeModifiers", id: "subject" }]);
// Remove settings without changing the source:
// forge.execute([{ op: "setModifiers", id: "subject", modifiers: [] }]);
```

Optional `node.modifiers` is preserved by create/duplicate/save. At most one modifier is supported. Defaults: enabled, X axis, positive side, offset 0, tolerance 0.00001. Settings reject unknown options, invalid types, offsets outside ±100000 and tolerance outside 0…1, even when disabled. `update` may replace the array; `setModifiers` with `[]` removes the property. Workshop controller additions: `setLiveMirror(settings | null)`, `bakeModifiers()`; `getDraft()` includes `modifiers` and the ordered operation series.

## Geometry contract

- Shared `evaluateMeshGeometry` calls the existing applied-mirror kernel. Browser viewport, workshop surface, inspection, landmark evaluation, PNG rendering and GLB use the evaluated geometry. Exports never mutate source buffers or bake the saved project implicitly.
- Referenced source vertices must lie on one side within tolerance. Remove seam-plane caps first. Crossing the plane, snapping that produces degenerate triangles, and invalid resulting buffers fail atomically. Disabled modifiers do not restrict sidedness; re-enabling validates the current source.
- Seam vertices snap **in the evaluated result only** and retain their canonical IDs. Reflected vertices append after all source slots, including retained unused slots. Triangle winding reverses on the reflected side. UV/color splits remain separate; UVs are copied into shared texture space. Smooth normals are recalculated on the resulting topology; flat shading retains the existing export-only face-normal baking path.
- Existing source vertex landmarks keep their IDs and follow the evaluated source prefix, including seam snapping. New reflected landmarks require baking first. Baking preserves source IDs and review metadata. As with other source edits, confirm each landmark still denotes the intended surface location.
- Canonical and evaluated meshes must satisfy existing mesh budgets; scene budgets count evaluated vertices/triangles. Workshop limits also apply to the evaluated result. A mirror cannot hide excess geometry behind a smaller source.
- Any modifier, including disabled settings, must be baked or removed before skin binding. Existing skins reject modifiers. There is no automatic weight duplication. Real baking invalidates an obsolete sculpt recipe; toggling/removing the modifier preserves the canonical recipe.

## Verification

`tests/mesh-modifiers.test.js` covers source isolation, shared surface construction, UV/colors, outward closed topology, source edits, invalid planes, disable/remove/bake, JSON persistence, landmark identity, duplicate, skin restrictions and evaluated budgets. `tests/browser/mesh-modifiers.spec.js` exercises real controls, modal/project history, save/reload, derived-face picking, atomic failures and GLB surface/winding round-trip.

Reproduce actual technical-fixture renders (not an artistic model):

```sh
node scripts/render-mirror-review.js /tmp/graph-mirror-review
```

The script captures source versus evaluated front views, perspective/side/top, the workshop, a `.graph.json` with its live modifier and the evaluated `.glb`. Topology checks certify this fixture only; they do not certify artistic quality, arbitrary manifoldness, anatomical accuracy or collision-free meshes.

Recorded check on 2026-10-21: all 101 unit tests, 14 relevant browser tests and the production build passed. Actual front/source-front/perspective/side/top renders were inspected. The fixture has 8 source vertices / 10 source triangles and 12 evaluated vertices / 20 evaluated triangles, one component, no open/nonmanifold edges, winding conflicts, degenerate triangles or normal errors. Browser and CLI GLB bytes matched exactly. Flat shading expands the export to 60 vertices; canonical IDs remain unchanged. Khronos glTF Validator 2.0.0-dev.3.10 reported zero errors, warnings and informational messages: [mirror-validation.json](mirror-validation.json).
