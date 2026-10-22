# Reference measurements and 3D locomotion

Reviewed on 2026-10-20. This stage develops the editor and uses technical blocks and point trajectories, not a new artistic character.

## Sources studied

OpenSim's public API describes two useful engineering principles:

- [Station.h](https://github.com/opensim-org/opensim-core/blob/main/OpenSim/Simulation/Model/Station.h): a station is fixed in a parent physical frame; its location and velocity can be expressed in ground coordinates.
- [Measurement.h](https://github.com/opensim-org/opensim-core/blob/main/OpenSim/Tools/Measurement.h): a measurement uses distances between marker pairs.
- [ModelScaler.h](https://github.com/opensim-org/opensim-core/blob/main/OpenSim/Tools/ModelScaler.h): model scaling can compare marker-pair distances in a model and in an experimental/static reference.

The editor does not implement OpenSim's solver or reproduce its source code. The design uses explicit local landmarks, world-space measurements, and author-selected references. These sources do not establish ideal human proportions or universal joint limits.

## Scope and conventions

- Source scenes use meters and +Y up. Motion audits assume a horizontal ground at `groundY`. The intended world forward vector is horizontal; `facingAxis` is local to the chosen root.
- Reference criteria are explicit. An optional range is an author's tolerance, not an automatically inferred anatomical norm. Empty ranges produce observations, not passing checks.
- Rest measurements evaluate base node TRS and saved skin bind matrices, ignoring animation. Clip measurements evaluate a chosen clip and time. A running pose is expected to be asymmetric; do not indiscriminately apply neutral-pose symmetry to every animation frame.
- A rigid landmark uses `{node, point: [x,y,z]}`. A surface landmark uses `{node, vertex: index}` on a canonical mesh. Surface points on skins read actual deformed vertices. Arbitrary rigid points on a skinned mesh are rejected because they would not follow deformation.
- Vertex landmarks depend on vertex identity. Reordering vertices or replacing topology requires checking the references again. No anatomical landmark detection is implemented.

## Source schema

Optional `document.review` has version 1:

```js
{
  version: 1,
  landmarks: {
    a: {node: 'left-sole', point: [0, 0, -0.1]},
    b: {node: 'left-sole', point: [0, 0, 0.1]},
    c: {node: 'right-sole', point: [0, 0, 0]}
  },
  measurements: [
    {id: 'length', between: ['a','b'], range: [0.199,0.201]},
    {id: 'ratio', between: ['a','b'], reference: ['a','c']}
  ],
  symmetry: [
    {id: 'mirrored', pairs: [['a','c']],
     plane: {node: 'actor', axis: 'x', offset: 0}, tolerance: 0.005}
  ]
}
```

Numbers in this example describe a technical setup; they are not anatomical standards. Length ranges are in world meters, ratio ranges are dimensionless. A zero-length ratio denominator is an explicit failure, with a null value. Symmetry reflects points across the actual world plane derived from the given local frame, using an inverse-transpose normal so nonuniform scale is handled correctly.

Limits: 128 landmarks, 64 measurements, 16 symmetry tests, 64 pairs per symmetry test. Referenced nodes and mesh vertices must exist. Deleting referenced objects or clips requires updating/removing the criteria in the same atomic command batch. Scene-level criteria remain attached to the original subject when a rig is duplicated; they are not silently reassigned to the copy.

## Locomotion reference

`review.motion` declares the clip, a motion root, intended forward direction, local facing axis, reference sole points and contact phases:

```js
{
  clip: 'travel', root: 'actor',
  forward: [0,0,1], facingAxis: [0,0,1],
  mode: 'root', groundY: 0,
  requireFlight: true, flightHeight: 0.015,
  tolerances: {slip: 0.004, ground: 0.002, penetration: 0.002,
               travel: 0.001, facingAngle: 30, directionAngle: 30},
  feet: [
    {id:'left', sole:['left-heel','left-toe'],
     contacts:[{landmark:'left-heel',start:0,end:0.1},
               {landmark:'left-toe',start:0.1,end:0.3}]},
    {id:'right', sole:['right-heel','right-toe'],
     contacts:[{landmark:'right-heel',start:0.5,end:0.6},
               {landmark:'right-toe',start:0.6,end:0.8}]}
  ]
}
```

The example tolerances and phases are arbitrary test settings. Contacts are ordered, nonoverlapping intervals in fractions of the cycle, 0–1. A foot may change contact landmarks at toe-off rather than pretending its heel remains stationary through the entire roll. Each contact is measured against its own initial world position.

- `root` mode uses actual world motion.
- `inPlace` mode requires `distance` in meters per cycle. Analysis adds a virtual linear translation to the root and sampled points; it never changes the document. Net horizontal root drift is reported so an already moving clip is not silently double-counted.
- Slip is maximum horizontal distance from the contact interval's initial point; slip speed is also reported. Ground error is measured during declared contact. Penetration checks all declared sole points throughout the clip.
- Root forward travel, accumulated reverse travel, horizontal sideways deviation, net trajectory angle, and facing angle are separate metrics. A positive forward component does not excuse a strongly sideways trajectory. `directionAngle` defaults to `facingAngle` if omitted.
- Flight requires no declared contact and all sampled sole points above `flightHeight`. This tests kinematics of the supplied points, not force, stability or balance.

The time grid includes uniform samples, every node key time (including animated ancestors), every contact boundary, and midpoints of schedule gaps. It is bounded at 4096 times. Defaults are 121 uniform times; 3–241 can be requested. Sampling does not prove that every possible subframe extremum is safe.

No full-surface collision, slopes, physical contact forces, center-of-mass estimation, inverse dynamics, automatic body proportions or human gait certification are implemented. Straight-line audits need a fixed intended forward direction; turning clips need separately defined references.

## Editor and agent workflow

Open **Контроль модели**. Draft JSON can be inspected without committing it. **Сохранить критерии** makes one undoable edit with autosave. Malformed drafts clear the old report so stale passing results cannot remain visible. A landmark can be drafted from selection; surface vertices can be entered explicitly. The controls on the right override only the current analysis; saving persists the JSON criteria on the left. Virtual distance is enabled only for in-place analysis.

The lab shows measured values, author ranges, mirror errors, root travel and sole-height curves. Green graph samples mark the supplied contact schedule. Foot rows navigate to a problematic sampled pose. The technical bench includes correct contact, sliding, backwards travel, penetration, opposite facing, and in-place variants.

The overlay shows actual posed landmarks and measurement lines. It is editor-only and omitted from clean screenshots and GLB. Explicit diagnostic screenshots may include it.

```js
forge.execute([{op:'setReview', review: criteria}]);
const reference = forge.auditMeasurements();
const posed = forge.auditMeasurements({pose:'clip', clip:'run', time:0.2});
const movement = forge.auditLocomotion({clip:'run', samples:121});
const inPlace = forge.auditLocomotion({clip:'run-in-place', mode:'inPlace', distance:2.9});
forge.setReviewVisible(true);
const png = forge.screenshot({review:true});
forge.openReview();
```

`node scripts/forge.js audit-model project.graph.json [clip-id]` emits JSON. Code 2 means reference violations or missing measurement configuration; code 1 means invalid input; code 0 means no violations of the configured criteria. A measurement-only scene need not configure locomotion. Missing locomotion settings are explicitly marked `available: false`; this is not a passing motion test.

These tools make comparisons repeatable. Visual silhouettes, deformation poses, anatomical references, topology, materials and game-engine integration still need separate review before a character is presented as a finished game asset.
