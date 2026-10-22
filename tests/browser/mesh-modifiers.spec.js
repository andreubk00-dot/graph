import { test, expect } from "@playwright/test";
import { emptyDocument, makeNode } from "../../src/document.js";
import { halfBox } from "../fixtures/mesh-study.js";
async function load(page) {
  const d = emptyDocument();
  d.name = "Live mirror · technical study";
  d.nodes = [
    makeNode("mesh", { id: "study", position: [0, 0, 0], geometry: halfBox() }),
  ];
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => {
    window.forge.load(d);
    window.lab = window.forge.openMeshEditor("study");
  }, d);
  return d;
}

test("live mirror edits source only, supports draft/project history and persists on reload", async ({
  page,
}) => {
  test.setTimeout(90000);
  const source = await load(page);
  await page.locator("#mesh-live-mirror").click();
  await expect(page.locator("#mesh-modifier-status")).toContainText(
    "12 вершин, 20 треугольников",
  );
  expect(await page.evaluate(() => window.lab.getDraft().geometry)).toEqual(
    source.nodes[0].geometry,
  );
  await page.evaluate(() =>
    window.lab.operate({
      action: "setVertex",
      vertex: 6,
      position: [1.2, 1.1, 1],
    }),
  );
  await page.locator("#mesh-live-enabled").uncheck();
  await expect(page.locator("#mesh-modifier-status")).toContainText(
    "выключено",
  );
  await page.locator("#mesh-undo").click();
  await expect(page.locator("#mesh-live-enabled")).toBeChecked();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const result = await page.evaluate(() => window.forge.getDocument());
  expect(result.nodes[0].geometry.positions).toHaveLength(24);
  expect(result.nodes[0].modifiers[0].type).toBe("mirror");
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#redo").click();
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(result);
  await page.evaluate(
    () => (window.lab = window.forge.openMeshEditor("study")),
  );
  expect(await page.evaluate(() => window.lab.getDraft().geometry)).toEqual(
    result.nodes[0].geometry,
  );
  await expect(page.locator("#mesh-modifier-status")).toContainText(
    "20 треугольников",
  );
});

test("derived faces cannot be picked; invalid source edits leave a valid draft and bake enables full editing", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.evaluate(() => {
    window.lab.setLiveMirror({ axis: "x" });
    window.lab.setView("front");
    window.lab.select("face", []);
  });
  const reflected = await page.evaluate(() =>
    window.lab.project([-0.5, 0.4, 1]),
  );
  await page.mouse.click(reflected.x, reflected.y);
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids),
  ).toEqual([]);
  const original = await page.evaluate(() => window.lab.project([0.5, 0.4, 1]));
  await page.mouse.click(original.x, original.y);
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids.length),
  ).toBe(1);
  await page.evaluate(() => window.lab.select("vertex", [6]));
  await page.locator("#mesh-dx").fill("-2");
  const before = await page.evaluate(() => window.lab.getDraft());
  await page.locator("#mesh-translate").click();
  await expect(page.locator("#mesh-error")).toContainText("one half");
  expect(await page.evaluate(() => window.lab.getDraft())).toEqual(before);
  await page.locator("#mesh-bake-modifiers").click();
  expect(await page.evaluate(() => window.lab.getDraft().modifiers)).toEqual(
    [],
  );
  await page.evaluate(() => window.lab.select("face", []));
  await page.mouse.click(reflected.x, reflected.y);
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids[0]),
  ).toBeGreaterThanOrEqual(10);
  await page.locator("#mesh-undo").click();
  await expect(page.locator("#mesh-live-enabled")).toBeChecked();
  await page.locator("#mesh-redo").click();
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const n = await page.evaluate(() => window.forge.getDocument().nodes[0]);
  expect(n.modifiers).toBeUndefined();
  expect(n.geometry.positions).toHaveLength(36);
});

test("GLB contains evaluated mirrored surface with correct winding and leaves source unchanged", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.locator("#mesh-live-mirror").click();
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const { createGLB, disposeScene, geometryFor } = await import(
      "/src/scene.js"
    );
    const { GLTFLoader } = await import(
      "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
    );
    const { auditMesh } = await import("/src/mesh-audit.js");
    const d = window.forge.getDocument(),
      before = JSON.stringify(d);
    const glb = await new GLTFLoader().parseAsync(await createGLB(d), "");
    let report, triangles;
    glb.scene.traverse((o) => {
      if (o.isMesh) {
        const g = o.geometry,
          p = g.attributes.position;
        report = auditMesh({
          positions: Array.from(p.array),
          normals: Array.from(g.attributes.normal.array),
          ...(g.index ? { indices: Array.from(g.index.array) } : {}),
        });
        triangles = Array.from(
          g.index?.array ?? Array.from({ length: p.count }, (_, i) => i),
        ).map((i) => Array.from(p.array.slice(i * 3, i * 3 + 3)));
      }
    });
    const g = geometryFor(d.nodes[0]);
    const expected = Array.from(g.index.array).map((i) =>
      Array.from(g.attributes.position.array.slice(i * 3, i * 3 + 3)),
    );
    g.dispose();
    disposeScene(glb.scene);
    return {
      report,
      triangles,
      expected,
      unchanged: before === JSON.stringify(window.forge.getDocument()),
    };
  });
  expect(result.unchanged).toBe(true);
  expect(result.triangles).toEqual(result.expected);
  for (const key of [
    "boundaryEdges",
    "nonManifoldEdges",
    "windingConflicts",
    "degenerate",
    "normalErrors",
    "inwardNormals",
  ])
    expect(result.report[key], key).toBe(0);
  expect(result.report.triangles).toBe(20);
});
