# Planar interior dissolve · 0.14

`meshEdit` action `dissolveVertex` removes one redundant interior vertex from a planar triangle fan. A fan of N triangles becomes N−2 triangles using existing boundary vertices. The contour and canonical vertex/attribute arrays stay unchanged; the removed vertex slot remains allocated but unreferenced. This provides a controlled cleanup operation before broader decimation and polygon authoring.

## Use

In the mesh workshop select one interior vertex and click **Растворить внутреннюю вершину**. Only a connected, consistently wound fan with 3–64 incident triangles and a strictly convex boundary is supported. Open fans, concavity, self-crossing boundaries, nonplanar patches, coincident attribute seams and conflicting replacement diagonals reject clearly. Planarity and attribute checks use explicit numerical tolerances, not an exact-real arithmetic proof.

```json
{
  "op": "meshEdit",
  "id": "study",
  "action": "dissolveVertex",
  "selection": { "mode": "vertex", "ids": [0] },
  "landmarkPolicy": "remap"
}
```

Get fresh edge/face IDs after the operation. Draft selection clears after success. Undo/redo includes geometry and landmark changes; project Apply remains one atomic history step. Changed review definitions block stale Apply. Cancel or a failed operation leaves the source untouched.

## Preserve attributes and intent

UVs, linear vertex colors and supplied normals must each form one affine field across the entire patch. The check includes every boundary vertex as well as the center; checking only the center average would miss interpolation changes along new diagonals. Non-affine fields reject rather than quietly altering a texture or shading. Without supplied normals on a smooth mesh, source normals are computed and frozen before retriangulation. Other explicit normals are preserved, including normals on unrelated bevel bands.

A referenced landmark on the removed vertex blocks dissolve by default. Explicit `landmarkPolicy: "remap"` (the shared workshop checkbox) moves it to the nearest boundary vertex, with vertex ID breaking equal-distance ties. Review the landmark's semantic meaning afterward. Original vertex slots and all unrelated landmarks remain stable. The remap is published only after successful validation.

Bound skins require explicit unbinding. Active subdivision must be baked or disabled first: an unchanged canonical surface does not imply an unchanged subdivided surface. The low-level geometry-only API has no modifier context, so its caller must enforce that rule. Re-enabling subdivision later can change the evaluated result.

Crease spokes touching the removed vertex must be cleared explicitly. Flat meshes retain unrelated/boundary crease tags. Smooth meshes with any crease tags reject because render-time normal fans are topology-dependent; explicitly clear tags before using this first implementation. Attribute seam processing, concave patches, boundary vertices, batches, edge dissolve and general decimation remain future work.

## Surface diagnostics

`auditMesh` now ignores unreferenced canonical slots when measuring welded surface vertices, components, bounds, mirror correspondence and surface normal errors. `vertices` still counts allocated slots; new `unusedVertices` reports the difference. An unused center retained for stable IDs must not appear as a disconnected surface or enlarge its bounds. This changes the diagnostic treatment of unused slots, not geometry validation requirements.

## Verification

```bash
node --test --test-isolation=none tests/mesh-dissolve.test.js tests/quality.test.js
npx playwright test tests/browser/mesh-dissolve.spec.js --workers=1
```

Core tests cover 3–64-sided fans, an oblique plane, a closed technical solid, unchanged area/attributes, attribute rejection, invalid topology, creases, subdivision, landmark policies, external diagonals and actual GLB export/import. The GLB check compares positions, normals, UVs, colors and indices. These are engineering checks; they do not certify artistic quality.

Browser scenarios cover draft/project history, reload, landmark confirmation and stale review protection. Record their actual execution result separately; merely adding the scenarios is not a passing browser check.

Current cloud verification: 127 core tests passed with `node --test --test-isolation=none --test-skip-pattern='CLI' tests/*.test.js`, including the actual dissolve GLB round-trip. Production build passed. The standard `npm test` invocation reports failures in the two files containing subprocess-based CLI tests; those CLI cases are not included in the 127-test claim. Browser execution is blocked by Vite's `listen EPERM`; the request to run outside the sandbox was interrupted. The two new browser scenarios and the earlier bevel scenarios remain unverified, and no new visual-quality claim is made.
