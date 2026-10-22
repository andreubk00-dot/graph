import { test, expect } from "@playwright/test";
import { emptyDocument, makeNode } from "../../src/document.js";
import { closedBox } from "../fixtures/mesh-study.js";
import { meshTopology } from "../../src/mesh-edit.js";
async function load(page) {
  const d = emptyDocument();
  d.name = "Creases · technical study";
  const geometry = { ...closedBox(), smooth: true };
  d.nodes = [makeNode("mesh", { id: "study", position: [0, 0, 0], geometry })];
  d.review = {
    version: 1,
    landmarks: { tip: { node: "study", vertex: 6 } },
    measurements: [],
    symmetry: [],
  };
  const edges = meshTopology(geometry).edges,
    rim = edges.flatMap(([a, b], i) =>
      geometry.positions[a * 3 + 1] === 1 &&
      geometry.positions[b * 3 + 1] === 1 &&
      [0, 1, 2].filter(
        (k) => geometry.positions[a * 3 + k] !== geometry.positions[b * 3 + k],
      ).length === 1
        ? [i]
        : [],
    );
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => {
    window.forge.load(d);
    window.lab = window.forge.openMeshEditor("study");
  }, d);
  await page.evaluate((ids) => window.lab.select("edge", ids), rim);
  return { source: d, rim };
}

test("crease controls preserve an upper rim, source geometry, history and JSON reload", async ({
  page,
}) => {
  test.setTimeout(90000);
  const { source } = await load(page);
  await page.locator("#mesh-set-creases").click();
  await expect(page.locator("#mesh-crease-stats")).toHaveText(
    "Жёстких рёбер: 4",
  );
  await page.locator("#mesh-subdivision-levels").fill("2");
  await page.locator("#mesh-subdivision").click();
  expect(
    await page.evaluate(() => window.lab.getDraft().geometry.positions),
  ).toEqual(source.nodes[0].geometry.positions);
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#mesh-undo").click();
  await page.locator("#mesh-undo").click();
  await expect(page.locator("#mesh-crease-stats")).toHaveText(
    "Жёстких рёбер: 0",
  );
  await page.locator("#mesh-redo").click();
  await page.locator("#mesh-redo").click();
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const output = await page.evaluate(() => window.forge.getDocument());
  expect(output.nodes[0].geometry.creases).toHaveLength(4);
  const point = await page.evaluate(async () => {
    const { auditMeasurements } = await import("/src/model-review.js");
    return auditMeasurements(window.forge.getDocument()).landmarks[0].point;
  });
  expect(point[1]).toBe(1);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#redo").click();
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(output);
  await page.evaluate(
    () => (window.lab = window.forge.openMeshEditor("study")),
  );
  await expect(page.locator("#mesh-crease-stats")).toHaveText(
    "Жёстких рёбер: 4",
  );
});

test("splitting inherits crease tags, touching corner bevel rejects clearly and clearing stays undoable", async ({
  page,
}) => {
  test.setTimeout(90000);
  const { source, rim } = await load(page);
  await page.locator("#mesh-set-creases").click();
  await page.evaluate((i) => window.lab.select("edge", [i]), rim[0]);
  await page.locator("#mesh-split-edges").click();
  await expect(page.locator("#mesh-crease-stats")).toHaveText(
    "Жёстких рёбер: 5",
  );
  await page.evaluate(() => window.lab.select("vertex", [6]));
  const before = await page.evaluate(() => window.lab.getDraft());
  await page.locator("#mesh-bevel-vertex").click();
  await expect(page.locator("#mesh-error")).toContainText("Clear creases");
  expect(await page.evaluate(() => window.lab.getDraft())).toEqual(before);
  await page.locator("#mesh-clear-creases").click();
  await expect(page.locator("#mesh-crease-stats")).toHaveText(
    "Жёстких рёбер: 0",
  );
  await page.locator("#mesh-undo").click();
  await expect(page.locator("#mesh-crease-stats")).toHaveText(
    "Жёстких рёбер: 5",
  );
  await page.locator("#mesh-close").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
});

test("GLB keeps actual hard normals; baking keeps crease metadata and canonical landmark IDs", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.locator("#mesh-set-creases").click();
  await page.evaluate(() => window.lab.setSubdivision({ levels: 2 }));
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const { createGLB, geometryFor, disposeScene } = await import(
      "/src/scene.js"
    );
    const { GLTFLoader } = await import(
      "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
    );
    const { auditMesh } = await import("/src/mesh-audit.js");
    const { auditMeasurements } = await import("/src/model-review.js");
    const d = window.forge.getDocument(),
      before = JSON.stringify(d),
      buffer = geometryFor(d.nodes[0]);
    const serialize = (g) => ({
      positions: Array.from(g.attributes.position.array),
      normals: Array.from(g.attributes.normal.array),
      indices: Array.from(g.index.array),
    });
    const expected = serialize(buffer),
      glb = await new GLTFLoader().parseAsync(await createGLB(d), "");
    let actual;
    glb.scene.traverse((o) => {
      if (o.isMesh) actual = serialize(o.geometry);
    });
    const report = auditMesh(actual),
      groups = new Map();
    let splitNormal = false;
    for (let i = 0; i < actual.positions.length / 3; i++) {
      const key = actual.positions.slice(i * 3, i * 3 + 3).join(":"),
        n = actual.normals.slice(i * 3, i * 3 + 3);
      if (
        groups.has(key) &&
        groups.get(key).reduce((s, x, k) => s + x * n[k], 0) < 0.99
      )
        splitNormal = true;
      groups.set(key, n);
    }
    buffer.dispose();
    disposeScene(glb.scene);
    return {
      expected,
      actual,
      report,
      splitNormal,
      point: auditMeasurements(d).landmarks[0].point,
      unchanged: JSON.stringify(window.forge.getDocument()) === before,
    };
  });
  expect(result.actual).toEqual(result.expected);
  expect(result.splitNormal).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.report.triangles).toBe(192);
  for (const k of [
    "boundaryEdges",
    "nonManifoldEdges",
    "windingConflicts",
    "degenerate",
    "normalErrors",
    "inwardNormals",
  ])
    expect(result.report[k], k).toBe(0);
  await page.evaluate(() => {
    window.lab = window.forge.openMeshEditor("study");
    window.lab.bakeModifiers();
  });
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const baked = await page.evaluate(async () => {
    const { auditMeasurements } = await import("/src/model-review.js");
    const d = window.forge.getDocument();
    return {
      n: d.nodes[0],
      anchor: d.review.landmarks.tip,
      point: auditMeasurements(d).landmarks[0].point,
    };
  });
  expect(baked.n.modifiers).toBeUndefined();
  expect(baked.n.geometry.creases).toHaveLength(16);
  expect(baked.n.geometry.positions).toHaveLength(294);
  expect(baked.anchor.vertex).toBe(6);
  expect(baked.point).toEqual(result.point);
});
