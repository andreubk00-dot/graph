# Rounded edge bevel · 0.13

`meshEdit` now supports `bevelEdge`: a circular-profile bevel of one convex physical edge on a closed, outward-wound convex solid. This is an applied geometry operation, not a live modifier. The initial tool deliberately rejects concave solids, open surfaces, multiple physical edges, and adjacent-edge miters. It accepts at most 512 referenced physical vertices and 2048 source triangles, within the existing output mesh budgets.

## Width and segments

`width` is the positive offset **along each neighboring face** from the original edge to the arc tangent point. It is not always the radius. If θ is the angle between the two outward face normals, the circular radius is `width / tan(θ / 2)`. For a right-angle edge the radius equals width.

`segments` is an integer from 1 to 16 (default 4). One segment produces a flat chamfer; multiple segments approximate the circle with straight chords and use analytic radial band normals. The existing end faces close the band. The tool clips the convex solid by the chord planes, and rejects a width that would reach another source vertex. It does not shorten neighboring edges through a guessed miter. A partial segment of a longer collinear ridge can therefore also be rejected.

## Workshop and command API

Open the mesh workshop, select an edge, and set **Фаска ребра** width and segments. The operation clears obsolete edge/face selection IDs. Draft undo/redo includes geometry and landmark remapping; Apply commits the operation series as one project history step. An externally changed source or review definition prevents stale Apply.

```json
{
  "op": "meshEdit",
  "id": "study",
  "action": "bevelEdge",
  "selection": { "mode": "edge", "ids": [0] },
  "width": 0.2,
  "segments": 8,
  "landmarkPolicy": "remap"
}
```

Obtain current edge IDs using `meshTopology(geometry).edges`; ID 0 above is only illustrative. Coplanar triangulation diagonals are not bevelable edges. Separate canonical UV/normal slots at the same exact Float32 positions may be selected together when they represent the same physical edge. Multiple distinct physical edges are rejected.

Vertex landmarks affected by the removed endpoints reject the operation by default. Explicit `landmarkPolicy: "remap"` (or the workshop checkbox) maps each affected source endpoint to its nearest **referenced** final vertex. This deterministic replacement is a geometry reference, not a guarantee that the original semantic landmark is still appropriate; review its meaning after modeling. Original vertex slots remain as a prefix, including unused slots. Remapping is published only after successful geometry validation.

Clear existing crease tags explicitly before this operation: routing persistent hard tags through the new bevel band is not implemented. Bound skins require explicit unbinding. An open mirror half needs its closed evaluated mirror baked before beveling. Other live modifiers continue to evaluate the changed source; bevel does not silently disable subdivision.

## Attributes and shading

Source UV/color seams retain separate attribute slots. Intersections interpolate source attributes; the band receives an independent affine UV chart and averaged boundary colors. This is not a full unwrap or a textured-asset quality check.

Flat source faces retain explicit planar normals through normal splits. Supplied smooth source normals are interpolated; a multi-segment band receives radial normals, and a one-segment band a planar normal. The result enables explicit smooth shading, including material refresh inside the workshop. Source, viewport and GLB use the same buffers. A later operation that rebuilds normals can change this lighting: the bevel is applied geometry, without a persistent analytic recipe.

## Reproduce and inspect

```bash
# No GPU, browser or child process: create source, commands, result and actual GLB.
node scripts/build-bevel-review.js /tmp/graph-bevel-review

# Requires localhost and system Chromium. Produces real multi-view PNG captures.
node scripts/render-bevel-review.js /tmp/graph-bevel-review

node --test --test-isolation=none tests/mesh-bevel.test.js
npx playwright test tests/browser/mesh-bevel.spec.js --workers=1
```

The build script compares positions, normals and indices after a real GLB export/import, checks closed topology and the remapped landmark, and writes `roundtrip.json`. The technical box fixture uses width 0.2 and 8 segments: 72 triangles, 90 render vertices, 38 referenced welded positions. It is an engineering fixture, not a new artistic asset.

Verification in the current cloud sandbox: the geometry suite includes a sweep of 108 box-edge/width/segment combinations across all twelve physical edges. The standalone GLB round-trip passed with exact buffer equality and no boundary/nonmanifold/winding/degenerate/normal errors. Direct CLI apply/export also reproduced the same result. Browser tests and visual captures remain **unverified** because the sandbox denies child-process creation and localhost listening. No independent Khronos validator result is claimed for this fixture.

Next: execute the prepared browser scenarios and inspect actual front/side/top/perspective renders; then extend bevel to adjacent edges with explicit corner/miter treatment and to broader topology. General bevel support remains unfinished.
