import { test, expect } from "@playwright/test";
import { emptyDocument, makeNode } from "../../src/document.js";

const sourceDocument = () => {
  const source = emptyDocument();
  source.nodes = [makeNode("mesh", {
    id: "study", geometry: {
      positions: [0,0,0, -1,-1,0, 1,-1,0, 1,1,0, -1,1,0],
      indices: [0,1,2, 0,2,3, 0,3,4, 0,4,1], smooth: false,
    },
  })];
  source.review = { version: 1, landmarks: { center: { node: "study", vertex: 0 } }, measurements: [], symmetry: [] };
  return source;
};

async function open(page) {
  const source = sourceDocument();
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate(source => {
    window.forge.load(source);
    window.lab = window.forge.openMeshEditor("study");
    window.lab.select("vertex", [0]);
  }, source);
  return source;
}

test("dissolve controls protect landmarks and preserve draft/project history through reload", async ({ page }) => {
  const source = await open(page);
  await page.locator("#mesh-dissolve-vertex").click();
  await expect(page.locator("#mesh-error")).toContainText("ориентира");
  expect(await page.evaluate(() => window.lab.getDraft().operations)).toEqual([]);
  await page.locator("#mesh-remap-landmarks").check();
  await page.locator("#mesh-dissolve-vertex").click();
  await expect(page.locator("#mesh-error")).toBeEmpty();
  await expect(page.locator("#mesh-stats")).toContainText("2 треугольников");
  await expect(page.locator("#mesh-dissolve-vertex")).toBeDisabled();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#mesh-undo").click();
  expect(await page.evaluate(() => window.lab.getDraft().geometry.indices.length)).toBe(12);
  await page.locator("#mesh-redo").click();
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const result = await page.evaluate(() => window.forge.getDocument());
  expect(result.review.landmarks.center.vertex).not.toBe(0);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#redo").click();
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(result);
});

test("changed review metadata blocks applying a dissolved draft", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.lab.operate({ action: "dissolveVertex", selection: { mode: "vertex", ids: [0] }, landmarkPolicy: "remap" });
    const review = window.forge.getDocument().review;
    review.landmarks.center.vertex = 2;
    window.forge.execute([{ op: "setReview", review }]);
  });
  expect((await page.evaluate(() => window.lab.apply())).applied).toBe(false);
  await expect(page.locator("#mesh-error")).toContainText("Критерии модели изменились");
});
