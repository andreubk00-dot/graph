import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyArt,
  validateArt,
  paintLine,
  floodFill,
  compositePixels,
  frameSVG,
  atlasLayout,
} from "../src/art-document.js";
import { ranger, rune } from "../src/art-examples.js";
test("pixel lines have no gaps, mirror symmetry and a bounded four-connected fill", () => {
  const d = emptyArt("pixel", 9, 9),
    p = d.frames[0].layers[0].pixels;
  paintLine(p, 9, 9, [1, 1], [3, 7], 1, { mirror: true });
  for (let y = 1; y < 8; y++) {
    assert.ok(p.slice(y * 9, (y + 1) * 9).some((x) => x === 1));
    for (let x = 0; x < 9; x++) assert.equal(p[y * 9 + x], p[y * 9 + 8 - x]);
  }
  p.fill(0);
  paintLine(p, 9, 9, [4, 0], [4, 8], 1);
  floodFill(p, 9, 9, 0, 0, 2);
  assert.equal(p[0], 2);
  assert.equal(p[8], 0);
  assert.equal(p[4], 1);
  assert.throws(() => paintLine(p, 9, 9, [0, 0], [9, 0], 1));
});
test("transparent palette compositing respects layer order, visibility and opacity", () => {
  const d = emptyArt("pixel", 1, 1);
  d.palette = ["#00000000", "#ff0000ff", "#0000ffff"];
  d.frames[0].layers[0].pixels = [1];
  d.frames[0].layers.push({
    id: "top",
    name: "Top",
    visible: true,
    opacity: 0.5,
    pixels: [2],
  });
  assert.deepEqual([...compositePixels(d)], [128, 0, 128, 255]);
  d.frames[0].layers[0].visible = false;
  assert.deepEqual([...compositePixels(d)], [0, 0, 255, 128]);
  d.frames[0].layers[1].visible = false;
  assert.deepEqual([...compositePixels(d)], [0, 0, 0, 0]);
});
test("2D documents reject invalid pixels, paths, external resources and memory overflows", () => {
  const d = emptyArt();
  for (const mutate of [
    (d) => (d.width = NaN),
    (d) => (d.frames[0].duration = 0),
    (d) => (d.frames[0].layers[0].pixels[0] = 999),
    (d) => (d.palette[0] = "#000000ff"),
    (d) => d.frames.push(structuredClone(d.frames[0])),
  ]) {
    const bad = structuredClone(d);
    mutate(bad);
    assert.throws(() => validateArt(bad));
  }
  const v = emptyArt("vector");
  v.frames[0].layers[0].paths = [
    {
      d: [
        ["M", 0, 0],
        ["L", 5, 5],
      ],
      fill: "url(https://example.com)",
    },
  ];
  assert.throws(() => validateArt(v));
  v.frames[0].layers[0].paths[0].fill = "#fff000";
  v.frames[0].layers[0].paths[0].d.push(["C", 1, 2]);
  assert.throws(() => validateArt(v));
  const big = emptyArt("pixel", 256, 256);
  big.frames = Array.from({ length: 64 }, (_, i) => ({
    ...structuredClone(big.frames[0]),
    id: `f${i}`,
    layers: [
      ...structuredClone(big.frames[0].layers),
      { ...structuredClone(big.frames[0].layers[0]), id: "b" },
    ],
  }));
  assert.throws(() => validateArt(big), /million/);
});
test("game atlas has exact unscaled cells, transparent padding, source durations and escaped vector output", () => {
  const d = ranger(),
    layout = atlasLayout(d, { columns: 4, padding: 2 });
  assert.equal(layout.width, 272);
  assert.equal(layout.height, 136);
  assert.equal(layout.frames.length, 8);
  assert.equal(layout.frames[4].frame.x, 2);
  assert.equal(layout.frames[4].frame.y, 70);
  assert.ok(
    layout.frames.every(
      (f) => f.duration === 80 && f.frame.w === 64 && f.frame.h === 64,
    ),
  );
  assert.notDeepEqual(
    d.frames[0].layers[1].pixels,
    d.frames[4].layers[1].pixels,
  );
  const v = rune();
  v.name = '<script>alert("x")</script>';
  const svg = frameSVG(v);
  assert.ok(svg.includes("linearGradient"));
  assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(!svg.includes("<script>"));
  assert.ok(!svg.includes("https://"));
  assert.throws(() => atlasLayout(d, { columns: 0 }));
});
