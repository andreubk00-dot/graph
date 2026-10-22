import { test, expect } from "@playwright/test";
import { emptyDocument, makeNode } from "../../src/document.js";
import { halfBox } from "../fixtures/mesh-study.js";
async function load(page) {
  const d = emptyDocument();
  d.name = "Subdivision · technical study";
  d.nodes = [
    makeNode("mesh", {
      id: "study",
      position: [0, 0, 0],
      geometry: { ...halfBox(), smooth: true },
    }),
  ];
  d.review = {
    version: 1,
    landmarks: { tip: { node: "study", vertex: 6 } },
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

test("ordered modifier controls preserve source, toggle/remove independently and persist one undoable draft", async ({
  page,
}) => {
  test.setTimeout(90000);
  const source = await load(page);
  await page.locator("#mesh-live-mirror").click();
  await page.locator("#mesh-subdivision-levels").fill("2");
  await page.locator("#mesh-subdivision").click();
  await expect(page.locator("#mesh-subdivision-status")).toContainText(
    "162 вершин, 320 треугольников",
  );
  const geometry = await page.evaluate(async () => {
    const { evaluateMeshGeometry } = await import("/src/mesh-modifiers.js");
    const d = window.lab.getDraft();
    return evaluateMeshGeometry({ type: "mesh", ...d }).positions;
  });
  await page.locator("#mesh-modifier-order").selectOption("subdivision-first");
  const reordered = await page.evaluate(async () => {
    const { evaluateMeshGeometry } = await import("/src/mesh-modifiers.js");
    const d = window.lab.getDraft();
    return evaluateMeshGeometry({ type: "mesh", ...d }).positions;
  });
  expect(reordered).not.toEqual(geometry);
  await page.locator("#mesh-subdivision-enabled").uncheck();
  await expect(page.locator("#mesh-subdivision-enabled")).not.toBeChecked();
  await expect(page.locator("#mesh-subdivision-status")).toContainText(
    "20 треугольников",
  );
  await page.locator("#mesh-undo").click();
  await expect(page.locator("#mesh-subdivision-enabled")).toBeChecked();
  await page.locator("#mesh-remove-modifiers").click();
  expect(
    await page.evaluate(() =>
      window.lab.getDraft().modifiers.map((m) => m.type),
    ),
  ).toEqual(["subdivision"]);
  await page.locator("#mesh-undo").click();
  expect(await page.evaluate(() => window.lab.getDraft().geometry)).toEqual(
    source.nodes[0].geometry,
  );
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const output = await page.evaluate(() => window.forge.getDocument());
  expect(output.nodes[0].modifiers.map((m) => m.type)).toEqual([
    "subdivision",
    "mirror",
  ]);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#redo").click();
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(output);
  await page.evaluate(
    () => (window.lab = window.forge.openMeshEditor("study")),
  );
  expect(await page.evaluate(() => window.lab.getDraft().geometry)).toEqual(
    source.nodes[0].geometry,
  );
  await expect(page.locator("#mesh-modifier-order")).toHaveValue(
    "subdivision-first",
  );
});

test("subdivided face picking uses canonical cage IDs and invalid levels leave draft untouched", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.evaluate(() => {
    window.lab.setLiveMirror({});
    window.lab.setSubdivision({ levels: 2 });
    window.lab.setView("front");
    window.lab.select("face", []);
  });
  const p = await page.evaluate(() => window.lab.project([0.25, 0.8, 1]));
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids),
  ).toEqual([3]);
  const reflected = await page.evaluate(() =>
    window.lab.project([-0.25, 0.8, 1]),
  );
  await page.mouse.click(reflected.x, reflected.y);
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids),
  ).toEqual([]);
  const before = await page.evaluate(() => window.lab.getDraft());
  await page.locator("#mesh-subdivision-levels").fill("4");
  await page.locator("#mesh-subdivision").click();
  await expect(page.locator("#mesh-error")).toContainText("1 to 3");
  expect(await page.evaluate(() => window.lab.getDraft())).toEqual(before);
  await page.evaluate(() => {
    window.lab.select("face", [3]);
    window.lab.bakeModifiers();
  });
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids),
  ).toEqual([]);
  await page.locator("#mesh-undo").click();
  expect(
    await page.evaluate(() => window.lab.getDraft().selection.ids),
  ).toEqual([3]);
  await expect(page.locator("#mesh-subdivision-enabled")).toBeChecked();
  await page.locator("#mesh-close").click();
  expect(
    await page.evaluate(() => window.forge.getDocument().nodes[0].modifiers),
  ).toBeUndefined();
});

test("subdivision GLB round-trip matches evaluated positions/normals and baking preserves posed landmark identity", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.evaluate(() => {
    window.lab.setLiveMirror({});
    window.lab.setSubdivision({ levels: 2 });
  });
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const report = await page.evaluate(async () => {
    const { createGLB, disposeScene, geometryFor } = await import(
      "/src/scene.js"
    );
    const { GLTFLoader } = await import(
      "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
    );
    const { auditMesh } = await import("/src/mesh-audit.js");
    const { auditMeasurements } = await import("/src/model-review.js");
    const d = window.forge.getDocument(),
      before = JSON.stringify(d),
      expected = geometryFor(d.nodes[0]);
    const loaded = await new GLTFLoader().parseAsync(await createGLB(d), "");
    let actual, audit;
    loaded.scene.traverse((o) => {
      if (o.isMesh) {
        actual = {
          positions: Array.from(o.geometry.attributes.position.array),
          normals: Array.from(o.geometry.attributes.normal.array),
          indices: Array.from(o.geometry.index.array),
        };
        audit = auditMesh(actual);
      }
    });
    const match =
      JSON.stringify(actual) ===
      JSON.stringify({
        positions: Array.from(expected.attributes.position.array),
        normals: Array.from(expected.attributes.normal.array),
        indices: Array.from(expected.index.array),
      });
    expected.dispose();
    disposeScene(loaded.scene);
    const point = auditMeasurements(d).landmarks[0].point;
    const unchanged = before === JSON.stringify(window.forge.getDocument());
    window.lab = window.forge.openMeshEditor("study");
    window.lab.bakeModifiers();
    return { audit, match, unchanged, point };
  });
  expect(report.match).toBe(true);
  expect(report.unchanged).toBe(true);
  expect(report.audit.triangles).toBe(320);
  for (const key of [
    "boundaryEdges",
    "nonManifoldEdges",
    "windingConflicts",
    "degenerate",
    "normalErrors",
    "inwardNormals",
  ])
    expect(report.audit[key], key).toBe(0);
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const baked = await page.evaluate(async () => {
    const { auditMeasurements } = await import("/src/model-review.js");
    const d = window.forge.getDocument();
    return {
      node: d.nodes[0],
      anchor: d.review.landmarks.tip,
      point: auditMeasurements(d).landmarks[0].point,
    };
  });
  expect(baked.node.modifiers).toBeUndefined();
  expect(baked.node.geometry.indices).toHaveLength(960);
  expect(baked.anchor.vertex).toBe(6);
  expect(baked.point).toEqual(report.point);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes[0].geometry.positions,
    ),
  ).toHaveLength(24);
});
