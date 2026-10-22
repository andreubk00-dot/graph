# Hard creases and normal discontinuities · version 0.12

Hard edge tags preserve sharp features through Loop subdivision and produce actual split shading normals in the viewport and GLB. This release implements **binary, persistent creases**. Fractional/semi-sharp strengths, explicit corner weights, angle-based auto-marking and rounded edge bevels remain future work.

## Workshop

Select edges under **Вершины · рёбра · грани**, then use **Пометить выбранные рёбра жёсткими** or **Снять жёсткость выбранных рёбер** in the subdivision panel. Orange lines identify the source's marked edges, including attribute-seam counterparts. **Снять все метки жёсткости** removes every tag. No subdivision modifier is required to control shading normals on the current mesh; use smooth shading to see the difference from full flat shading.

Tags, subdivision, mirror, normal splits and numeric transforms use the same canonical/evaluated workflow. Draft Undo/Redo records tags and topology together; Apply is one project undo/autosave step and Cancel discards the draft. Existing vertex landmarks keep canonical IDs and follow the evaluated vertex positions. A crease can change those positions because it changes the subdivision mask; check that the criterion still describes the intended point.

## Schema and API

Optional mesh-only `geometry.creases` is an array of at most 100000 unique existing triangle-edge endpoint pairs. Pairs contain distinct canonical vertex IDs; order within a pair is irrelevant. Do not store transient edge-selection numbers in project geometry. Empty arrays are accepted; editing commands remove the property when there are no remaining tags. Invalid pairs, stale/nonexistent edges and duplicate pairs fail atomically.

```js
forge.execute([{ op: "meshEdit", id: "subject", action: "setCreases",
  selection: { mode: "edge", ids: [0, 3, 7] }, enabled: true }]);
// Selection IDs come from forge.meshTopology(id).edges, refreshed after edits.
forge.execute([{ op: "meshEdit", id: "subject", action: "setCreases",
  selection: { mode: "edge", ids: [0] }, enabled: false }]);
// Remove all crease tags:
forge.execute([{ op: "meshEdit", id: "subject", action: "clearCreases" }]);
```

Direct create/update/imported JSON may provide `geometry.creases: [[0, 1], [1, 2]]`. Attribute splits at identical Float32 positions share physical edge semantics: tagging/clearing one edge affects all corresponding seam instances. UV/color vertex slots are preserved, not welded. Moving a previously coincident attribute instance can separate it physically; existing edit operations first expand its inherited tags so surviving copies retain their own metadata.

Marking/clearing tags preserves the existing position, index, normal, UV and color buffers; repeated commands that do not change tags leave the document untouched. Actual hard normals are computed in the rendering/export path, so toggling tags does not overwrite custom source normals.

## Shape rules and topology edits

Boundary edges retain their existing Loop boundary treatment. An explicitly hard interior edge inserts its midpoint instead of the smooth 3/8–1/8 edge point. At an even vertex, boundary and tagged-edge neighbors form the sharp-neighbor set:

- Zero/one sharp neighbor: ordinary smooth Loop vertex mask (a single crease terminates as a dart).
- Two sharp neighbors: 3/4 P + 1/8 of each neighbor, preserving a crease chain.
- Three or more: keep the vertex fixed, preserving the corner.

Each tagged edge produces two tagged child edges at every subdivision level. Mirror copies tags to reflected endpoint IDs, reuses seam IDs and removes duplicate seam tags. Modifier order still matters. Baking retains the generated canonical tags so hard shading remains after the modifier is removed.

Edge splitting transfers each tag to its child segments, including separate UV/color instances. Merging redirects tag endpoints to the surviving vertex, removes collapsed tags and retains only actual surviving edges. Face deletion removes tags whose edge disappeared. Region extrusion keeps surviving base tags and copies selected-region tags to their cap counterparts; new longitudinal walls are not automatically marked. Source transforms preserve endpoint IDs.

The current planar corner-bevel tool **rejects a corner touched by a crease** rather than guessing how to route the sharp feature through a new cap. Clear those tags explicitly before beveling. Unrelated tags remain supported. Rounded edge beveling is a separate roadmap item.

## Shading, vertex identity and skins

`src/mesh-creases.js` computes area-weighted normal groups by connected triangle fans, joining across unmarked physical edges and keeping crease-separated fans distinct. UV seams alone do not force a normal discontinuity. A terminating crease can still share a normal around its endpoint through the remaining smooth fan; subdivision inserts new crease vertices along the edge. Hard tags on coplanar triangles may split slots without changing their normal directions.

`scene.geometryFor` creates **render-only** copies when one canonical vertex needs several normals. All original vertex positions remain in the original prefix; additional slots copy positions, UVs, colors and, for a bound skin, the actual four joint indices/weights from their source vertex. Source buffers and stored weights are not expanded or overwritten. GLB receives this actual shaded surface; exported vertex count can exceed the canonical count without changing the triangle surface. Full flat shading retains the existing export-only face-normal conversion.

Tag editing of a bound rest mesh requires explicit unbinding, like other meshEdit commands. A canonical creased mesh can be bound after baking its modifiers; normal splitting copies weights without changing the bind pose. Modifier settings remain prohibited on bound skins.

Creased surface shading rejects inconsistent/nonmanifold edges and cancelling normal fans. This is not a collision, overlap or arbitrary repair system. The existing subdivision topology checks and mesh/scene budgets remain in force. GPU normal splitting is bounded by canonical slots plus triangle corners, like the existing flat export expansion.

## Verification and reproduction

`tests/mesh-creases.test.js` covers analytical masks, sharp planes/corners, normal groups, UV/color seams, topological propagation, both modifier orders, bake/landmark continuity and copying varied skin weights. `tests/browser/mesh-creases.spec.js` exercises real controls, history/reload, split inheritance, bevel rejection, GLB positions/normals and bake persistence. These are technical checks, not certification of artistic or anatomical quality.

```sh
npm test
npm run test:e2e -- tests/browser/mesh-creases.spec.js tests/browser/mesh-subdivision.spec.js tests/browser/mesh-modifiers.spec.js tests/browser/mesh-editor.spec.js tests/browser/mesh-topology.spec.js tests/browser/rig.spec.js
npm run build
node scripts/render-crease-review.js /tmp/graph-crease-review
```

The capture script compares a smooth technical half-box with one having marked upper-rim edges, using real workshop and clean scene renders. It saves the live JSON, GLB and topology report. No new character asset is presented. Algorithm context: [OpenSubdiv: creases and corners](https://graphics.pixar.com/opensubdiv/docs/subdivision_surfaces.html#creases-and-corners); the Loop masks and finite-level limits remain as documented in [SUBDIVISION.md](SUBDIVISION.md).

Recorded verification on 2026-10-21: all 113 unit tests, 25 relevant browser scenarios (including rigging) and the production build passed. The three new browser scenarios passed again after preserving custom source buffers/no-op behavior; analytical and seam tests additionally check repeated commands and surviving UV-chart tags after deletion. Actual smooth-versus-hard front, side, top, perspective and clean scene renders were inspected. The technical fixture retains 8 source vertices / 10 triangles with 3 source rim tags; mirror → level-2 subdivision produces 162 canonical vertices / 320 triangles, 24 inherited tags, and 186 rendered/exported vertices after hard-normal splits. Audit: one connected surface, full local-X reflection matches, zero boundary/nonmanifold edges, winding conflicts, degeneracies or normal errors. Browser and CLI GLB bytes match exactly. Khronos glTF Validator 2.0.0-dev.3.10 reports zero errors, warnings and informational messages: [crease-validation.json](crease-validation.json).
