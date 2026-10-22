import { test, expect } from "@playwright/test";
import { emptyDocument, makeNode } from "../../src/document.js";
import { meshTopology } from "../../src/mesh-edit.js";
import { closedBox } from "../fixtures/mesh-study.js";
async function load(page) {
  const d = emptyDocument();
  d.name = "Rounded edge · technical study";
  const geometry = closedBox();
  d.nodes = [makeNode("mesh", { id: "study", position: [0, 0, 0], geometry })];
  d.review = {
    version: 1,
    landmarks: { tip: { node: "study", vertex: 1 } },
    measurements: [],
    symmetry: [],
  };
  const edge = meshTopology(geometry).edges.findIndex(
    (e) => e[0] === 1 && e[1] === 2,
  );
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate(
    ({ d, edge }) => {
      window.forge.load(d);
      window.lab = window.forge.openMeshEditor("study");
      window.lab.select("edge", [edge]);
    },
    { d, edge },
  );
  return d;
}

test("rounded edge controls reject unsafe width and landmark loss, then commit one reloadable history step", async ({
  page,
}) => {
  test.setTimeout(90000);
  const source = await load(page);
  await page.locator("#mesh-edge-bevel-width").fill("2");
  await page.locator("#mesh-bevel-edge").click();
  await expect(page.locator("#mesh-error")).toContainText("reduce the width");
  await page.locator("#mesh-edge-bevel-width").fill(".15");
  await page.locator("#mesh-edge-bevel-segments").fill("6");
  await page.locator("#mesh-bevel-edge").click();
  await expect(page.locator("#mesh-error")).toContainText("ориентира");
  expect(await page.evaluate(() => window.lab.getDraft().operations)).toEqual(
    [],
  );
  await page.locator("#mesh-remap-landmarks").check();
  await page.locator("#mesh-bevel-edge").click();
  await expect(page.locator("#mesh-error")).toBeEmpty();
  await expect(page.locator("#mesh-stats")).toContainText("60 треугольников");
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids),
  ).toEqual([]);
  const anchor = await page.evaluate(
    () => window.lab.getDraft().landmarks.tip.vertex,
  );
  expect(anchor).toBeGreaterThan(7);
  expect(await page.evaluate(() => window.lab.getDraft().geometry.smooth)).toBe(
    true,
  );
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#mesh-undo").click();
  expect(
    await page.evaluate(() => window.lab.getDraft().landmarks.tip.vertex),
  ).toBe(1);
  await page.locator("#mesh-redo").click();
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const result = await page.evaluate(() => window.forge.getDocument());
  expect(result.review.landmarks.tip.vertex).toBe(anchor);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#redo").click();
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(result);
});

test("rounded bevel GLB keeps the closed surface and analytic normals without changing saved source", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(() =>
    window.lab.operate({
      action: "bevelEdge",
      selection: window.lab.getDraft().selection,
      width: 0.15,
      segments: 8,
      landmarkPolicy: "remap",
    }),
  );
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
    buffer.dispose();
    disposeScene(glb.scene);
    return {
      actual,
      expected,
      audit: auditMesh(actual),
      unchanged: before === JSON.stringify(window.forge.getDocument()),
    };
  });
  expect(result.actual).toEqual(result.expected);
  expect(result.unchanged).toBe(true);
  expect(result.audit.triangles).toBe(72);
  expect(result.audit.components).toBe(1);
  for (const k of [
    "boundaryEdges",
    "nonManifoldEdges",
    "windingConflicts",
    "degenerate",
    "normalErrors",
    "inwardNormals",
  ])
    expect(result.audit[k], k).toBe(0);
  expect(errors).toEqual([]);
});

test("rounded bevel refuses stale review metadata and remains usable in a compact workshop", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.evaluate(() => {
    window.lab.operate({
      action: "bevelEdge",
      selection: window.lab.getDraft().selection,
      width: 0.1,
      segments: 4,
      landmarkPolicy: "remap",
    });
    const review = window.forge.getDocument().review;
    review.landmarks.tip.vertex = 6;
    window.forge.execute([{ op: "setReview", review }]);
  });
  const result = await page.evaluate(() => window.lab.apply());
  expect(result.applied).toBe(false);
  await expect(page.locator("#mesh-error")).toContainText(
    "Критерии модели изменились",
  );
  await page.locator("#mesh-close").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes[0].geometry.positions,
    ),
  ).toHaveLength(24);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () => (window.lab = window.forge.openMeshEditor("study")),
  );
  await page.locator("#mesh-bevel-edge").scrollIntoViewIfNeeded();
  await expect(page.locator("#mesh-bevel-edge")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
