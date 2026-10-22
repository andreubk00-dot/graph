# Loop subdivision and ordered modifiers · introduced in version 0.11

Version 0.12 adds persistent hard-edge tags and split shading normals; see [CREASES.md](CREASES.md). The original uncreased 0.11 contract is recorded below.

This milestone adds **Loop subdivision of triangle meshes** and an ordered stack containing at most one mirror and one subdivision modifier. The canonical control mesh stays editable. The shared evaluator supplies the workshop, main viewport, measurements, clean PNG captures and GLB; export does not modify the saved source.

## Use

Open **Вершины · рёбра · грани**, then **Сглаживание · Loop subdivision**. Choose 1–3 levels and **Добавить / обновить subdivision**. Every level replaces each triangle with four. The checkbox disables subdivision while retaining its settings; **Убрать subdivision** removes only that modifier. Mirror controls independently retain subdivision. When both exist, **Порядок вычисления** selects mirror → subdivision or subdivision → mirror. These produce different surfaces, especially around the mirror boundary.

The displayed wire, points, numeric vertex IDs and face picking refer to the **source control mesh**. The smooth surface has different faces and is not directly selectable. Picking source faces uses a separate canonical raycast mesh, rather than treating subdivided triangle indices as source IDs. Use **Выбор насквозь** to access obscured control points. **Вписать** includes both source cage and evaluated surface.

**Запечь все модификаторы** evaluates the enabled stack in order, turns that result into the canonical mesh and removes all modifier settings. Disabled modifiers contribute no geometry. Baking clears the old edge/face selection, whose IDs no longer identify the same components; draft Undo restores that selection. Baking preserves the existing source vertex IDs as a prefix; newly generated vertices append. Source vertex landmarks follow the moved evaluated vertices before baking and retain the same positions/IDs afterwards. Baking clears an obsolete sculpt recipe only when geometry changes. Creating, editing, toggling, ordering, removing and baking are part of draft Undo/Redo; Apply is one project history/autosave operation and Cancel discards the draft.

Loop changes the shape and generally shrinks its volume. It does not repair anatomy or proportions. Source triangulation influences the result: asymmetric diagonals can cause asymmetric smoothing. Mirror first ensures reflection symmetry for a valid half. Set the existing **Сглаживание** shading option when smooth lighting is desired; subdivision does not silently override the source shading setting. Creases, hard-edge tags, quad Catmull–Clark, volume preservation, collision checks, adaptive subdivision and automatic weights remain future work.

## API

```js
forge.execute([{ op: "setModifiers", id: "subject", modifiers: [
  { type: "mirror", axis: "x", side: "positive", offset: 0, tolerance: 0.00001 },
  { type: "subdivision", levels: 2, enabled: true }
] }]);
// Source edits continue through meshEdit. Save preserves this source + stack.
forge.execute([{ op: "bakeModifiers", id: "subject" }]);
```

`node.modifiers` allows 0–2 entries; each type occurs at most once and array order is evaluation order. Subdivision supports only `type`, optional boolean `enabled` (default true), and optional integer `levels` (default 1, range 1–3). Disabled settings are still schema validated. `setModifiers` replaces the entire stack; `[]` removes it. `create`, `update`, duplicate and JSON reload preserve it. A bound skin rejects any modifier settings; bake/remove before binding. Each intermediate mesh and final scene must satisfy existing geometry budgets; the workshop also checks its interactive budget against the final result.

Workshop controller: `setSubdivision(settings | null)`, existing `setLiveMirror(settings | null)` now preserves other types, `operate({op:"setModifiers",modifiers:[...]})` sets/reorders the stack, and `bakeModifiers()` bakes it all. `getDraft()` includes the source geometry and ordered modifiers.

## Geometry and attributes

`src/mesh-subdivision.js` uses Loop's interior weights: beta = (5/8 − (3/8 + cos(2π/n)/4)²)/n, an even vertex = (1−n·beta)P + beta·sum(neighbors), and an interior edge point = 3/8 of each endpoint + 1/8 of each opposite vertex. Boundary even vertices use 3/4 P + 1/8 of each boundary neighbor; boundary edge points are midpoints. Updates read the old level simultaneously, including when attribute slots share a position.

Adjacency is determined by exact Float32 positions across UV/color splits. Attribute slots are kept separate. Existing UVs/colors stay on even slots; new per-edge attribute slots linearly interpolate their two endpoint attributes. No UV unwrap or UV smoothing is performed. Positions along attribute seams agree and normals are area-weighted across their physical topology when subdivision is the final modifier. A subsequent mirror uses its existing normal-recalculation policy. Custom hard normals are recomputed, not preserved as creases. Unreferenced canonical slots keep their position/ID and receive a valid fallback normal.

Duplicate coincident faces, nonmanifold edges, disconnected/pinched vertex fans, inconsistent winding, invalid boundaries, degeneracy and cancelling normals fail explicitly. This is not an arbitrary mesh repair/collision system. Separate surfaces that touch at exactly the same Float32 vertex position may be interpreted as a pinched fan and rejected; separate them before subdivision.

Triangle/vertex expansion is checked before allocating child buffers. All source buffers and intermediate results are validated; disabled subdivision does not require manifold source topology until enabled. Any failure leaves the document/draft intact.

Algorithm references: Charles Loop, *Smooth Subdivision Surfaces Based on Triangles*, University of Utah master's thesis (1987); [PBRT: Subdivision Surfaces](https://pbr-book.org/3ed-2018/Shapes/Subdivision_Surfaces). This implementation evaluates a finite 1–3 levels, without PBRT's separate projection to the limit surface.

## Reproduction

Unit tests cover analytical masks on a tetrahedron and open triangle, topology rejection, multiple levels, seam attributes/normals, ordered stacks, source isolation, landmark continuity and budgets. Browser tests exercise real controls, independent toggles, reordering, source face picking, history, JSON reload, GLB positions/normals and baking. Tests certify these engineering cases, not artistic or anatomical quality.

```sh
npm test
npm run test:e2e -- tests/browser/mesh-subdivision.spec.js tests/browser/mesh-modifiers.spec.js tests/browser/mesh-editor.spec.js tests/browser/mesh-topology.spec.js
npm run build
node scripts/render-subdivision-review.js /tmp/graph-subdivision-review
```

The capture script uses a technical tapered half-box, not a character. It saves canonical/mirror/smooth front views, perspective/side/top, the workshop, clean scene views, the live `.graph.json`, evaluated `.glb` and topology report.

Recorded verification on 2026-10-21: 107 unit tests and 17 relevant browser scenarios passed; all three subdivision browser scenarios passed again after the bake-selection adjustment, with an additional targeted check for selection clearing/restoration. Production build passed. Actual front/side/top/perspective and clean scene renders were inspected. The level-2 mirror → subdivision fixture retains 8 canonical vertices / 10 triangles and evaluates to 162 vertices / 320 triangles, one component, complete local-X reflection matches, and zero boundary/nonmanifold edges, winding conflicts, degeneracies or normal errors. Browser and CLI produced identical GLB bytes. Independent Khronos glTF Validator 2.0.0-dev.3.10 reported zero errors, warnings and informational messages: [subdivision-validation.json](subdivision-validation.json).
