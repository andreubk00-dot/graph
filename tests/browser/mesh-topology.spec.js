import { test, expect } from "@playwright/test";
import { emptyDocument, makeNode } from "../../src/document.js";
import { closedBox } from "../fixtures/mesh-study.js";
async function load(page, geometry = closedBox(), vertex = 6) {
  const d = emptyDocument();
  d.name = "Topology technical study";
  d.nodes = [makeNode("mesh", { id: "study", position: [0, 0, 0], geometry })];
  d.review = {
    version: 1,
    landmarks: { tip: { node: "study", vertex } },
    measurements: [],
    symmetry: [],
  };
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => {
    window.forge.load(d);
    window.lab = window.forge.openMeshEditor("study");
  }, d);
  return d;
}
test("edge splitting keeps both UV seam sides and is one undoable project edit", async ({
  page,
}) => {
  test.setTimeout(90000);
  const g = {
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 3, 4, 5],
    uv: [0, 0, 1, 0, 1, 1, 0.2, 0, 0.8, 1, 0, 1],
  };
  const source = await load(page, g, 0);
  await page.locator("#mesh-mode").selectOption("edge");
  await page.locator("#mesh-ids").fill("2");
  await page.locator("#mesh-select-ids").click();
  await page.locator("#mesh-split-fraction").fill(".3");
  await page.locator("#mesh-split-edges").click();
  await expect(page.locator("#mesh-stats")).toContainText("4 треугольников");
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids),
  ).toEqual([]);
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  let output = await page.evaluate(
    () => window.forge.getDocument().nodes[0].geometry,
  );
  expect(output.positions).toHaveLength(24);
  expect(output.uv.slice(0, 12)).toEqual(g.uv);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#redo").click();
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes[0].geometry.indices,
    ),
  ).toHaveLength(12);
});
test("merge requires explicit UV and landmark policies and restores both in draft/project history", async ({
  page,
}) => {
  test.setTimeout(90000);
  const source = await load(
    page,
    {
      positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
      indices: [0, 1, 2, 0, 2, 3],
      uv: [0, 0, 1, 0, 1, 1, 0, 1],
    },
    1,
  );
  await page.evaluate(() => window.lab.select("vertex", [0, 1]));
  await page.locator("#mesh-merge-vertices").click();
  await expect(page.locator("#mesh-error")).toContainText("discard uv");
  expect(await page.evaluate(() => window.lab.getDraft().operations)).toEqual(
    [],
  );
  await page.locator("#mesh-attribute-policy").selectOption("target");
  await page.locator("#mesh-merge-vertices").click();
  await expect(page.locator("#mesh-error")).toContainText("ориентира");
  await page.locator("#mesh-remap-landmarks").check();
  await page.locator("#mesh-merge-vertices").click();
  expect(
    await page.evaluate(() => window.lab.getDraft().landmarks.tip.vertex),
  ).toBe(0);
  await page.locator("#mesh-undo").click();
  expect(
    await page.evaluate(() => window.lab.getDraft().landmarks.tip.vertex),
  ).toBe(1);
  await page.locator("#mesh-redo").click();
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.forge.getDocument().review.landmarks.tip.vertex,
    ),
  ).toBe(0);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
});
test("convex corner bevel preserves a closed GLB surface and unused IDs cannot mask cap picking", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const source = await load(page);
  await page.evaluate(() => window.lab.select("vertex", [6]));
  await page.locator("#mesh-bevel-width").fill("2");
  await page.locator("#mesh-bevel-vertex").click();
  await expect(page.locator("#mesh-error")).toContainText("reduce");
  await page.locator("#mesh-bevel-width").fill(".2");
  await page.locator("#mesh-bevel-vertex").click();
  await expect(page.locator("#mesh-error")).toContainText("ориентира");
  await page.locator("#mesh-remap-landmarks").check();
  await page.locator("#mesh-bevel-vertex").click();
  await expect(page.locator("#mesh-stats")).toContainText("24 треугольников");
  const id = await page.evaluate(
    () => window.lab.getDraft().landmarks.tip.vertex,
  );
  expect(id).toBeGreaterThan(7);
  await page.evaluate(() => {
    window.lab.setView("front");
    window.lab.select("vertex", []);
  });
  const p = await page.evaluate((id) => {
    const g = window.lab.getDraft().geometry;
    return window.lab.project(g.positions.slice(id * 3, id * 3 + 3));
  }, id);
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids),
  ).toEqual([id]);
  await page.evaluate(() => window.lab.setView("perspective"));
  await page
    .locator("#mesh-dialog")
    .screenshot({ path: "/tmp/graph-topology-ui.png" });
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const { createGLB, disposeScene } = await import("/src/scene.js"),
      { GLTFLoader } = await import(
        "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
      ),
      { auditMesh } = await import("/src/mesh-audit.js");
    const d = window.forge.getDocument(),
      before = JSON.stringify(d),
      glb = await new GLTFLoader().parseAsync(await createGLB(d), "");
    let report;
    glb.scene.traverse((o) => {
      if (o.isMesh)
        report = auditMesh({
          positions: Array.from(o.geometry.attributes.position.array),
          normals: Array.from(o.geometry.attributes.normal.array),
          ...(o.geometry.index
            ? { indices: Array.from(o.geometry.index.array) }
            : {}),
        });
    });
    disposeScene(glb.scene);
    return {
      report,
      unchanged: JSON.stringify(window.forge.getDocument()) === before,
      anchor: d.review.landmarks.tip.vertex,
    };
  });
  expect(result.unchanged).toBe(true);
  expect(result.anchor).toBe(id);
  expect(result.report.boundaryEdges).toBe(0);
  expect(result.report.nonManifoldEdges).toBe(0);
  expect(result.report.windingConflicts).toBe(0);
  expect(result.report.normalErrors).toBe(0);
  expect(result.report.triangles).toBe(24);
  expect(errors).toEqual([]);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
});
test("topology drafts refuse stale review metadata and remain usable on a compact viewport", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.evaluate(() => {
    window.lab.operate({ action: "bevelVertex", vertex: 0, width: 0.1 });
    const review = window.forge.getDocument().review;
    review.landmarks.tip.vertex = 5;
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
  await page.locator("#mesh-topology-panel").evaluate((e) => (e.open = true));
  await expect(page.locator("#mesh-bevel-vertex")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
