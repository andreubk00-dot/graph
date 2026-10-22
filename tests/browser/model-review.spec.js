import { test, expect } from "@playwright/test";
import { motionStudy } from "../../src/review-fixture.js";
async function load(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => {
    window.forge.load(d);
    window.forge.setClip("travel");
    window.forge.setStage({ groundY: 0 });
    window.forge.setView({ preset: "threeQuarter" });
  }, motionStudy());
}

test("measurement lab displays ratios, motion graphs and independent diagnostic failures", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await load(page);
  await page.locator("#review-model").click();
  await expect(page.locator("#review-distance")).toBeDisabled();
  await page.locator("#review-run").click();
  await expect(page.locator("#review-results")).toContainText("0.6667");
  await expect(page.locator("#review-motion-summary")).toContainText(
    "Продвижение 1.000 м",
  );
  await expect(page.locator("#review-motion-chart")).toBeVisible();
  const pixels = await page
    .locator("#review-motion-chart")
    .evaluate(
      (c) =>
        Array.from(
          c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ).filter((v, i) => i % 4 === 0 && v > 100).length,
    );
  expect(pixels).toBeGreaterThan(100);
  const rising = await page.locator("#review-motion-chart").evaluate((c) => {
    const p = c.getContext("2d").getImageData(55, 40, 325, 85).data;
    let count = 0;
    for (let i = 0; i < p.length; i += 4)
      if (p[i + 1] > p[i] + 25 && p[i + 2] > 130) count++;
    return count;
  });
  expect(rising).toBeGreaterThan(100);

  await page.locator("#review-clip").selectOption("backwards");
  await page.locator("#review-run").click();
  await expect(page.locator("#review-results")).toContainText(
    "движение корня назад",
  );
  await page.locator("#review-clip").selectOption("wrong-facing");
  await page.locator("#review-run").click();
  await expect(page.locator("#review-results")).toContainText(
    "Направление взгляда",
  );
  await page.locator("#review-clip").selectOption("in-place");
  await page.locator("#review-motion-mode").selectOption("inPlace");
  await expect(page.locator("#review-distance")).toBeEnabled();
  await page.locator("#review-distance").fill("1");
  await page.locator("#review-run").click();
  await expect(page.locator("#review-motion-summary")).toContainText(
    "виртуальное продвижение",
  );
  expect(errors).toEqual([]);
});

test("criteria edits are atomic, reversible and persistent; invalid JSON never keeps a stale passing report", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.locator("#review-model").click();
  const source = motionStudy().review;
  source.measurements[0].range = [0.4, 0.5];
  await page.locator("#review-json").fill(JSON.stringify(source));
  await page.locator("#review-run").click();
  await expect(page.locator("#review-results")).toContainText(
    "вне заданного диапазона",
  );
  await page.locator("#review-apply").click();
  await page.locator("#review-close").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().review.measurements[0].range,
    ),
  ).toEqual([0.4, 0.5]);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().review.measurements[0].range,
    ),
  ).toEqual([0.299, 0.301]);
  await page.locator("#redo").click();
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(
    await page.evaluate(
      () => window.forge.getDocument().review.measurements[0].range,
    ),
  ).toEqual([0.4, 0.5]);
  await page.locator("#review-model").click();
  await page.locator("#review-json").fill("{broken");
  await page.locator("#review-run").click();
  await expect(page.locator("#review-status")).toHaveClass(/error/);
  await expect(page.locator("#review-results")).toBeEmpty();
  await page.locator("#review-apply").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().review.measurements[0].range,
    ),
  ).toEqual([0.4, 0.5]);
});

test("landmarks and measurement lines stay out of clean captures and GLB, while overlays show the actual pose", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  const result = await page.evaluate(async () => {
    const f = window.forge,
      before = JSON.stringify(f.getDocument());
    f.select(null);
    f.setReviewVisible(true);
    f.seek(0.35);
    const withOverlay = f.screenshot({ review: true }),
      clean = f.screenshot();
    f.setReviewVisible(false);
    const hidden = f.screenshot(),
      { createGLB } = await import("/src/scene.js"),
      buffer = await createGLB(f.getDocument()),
      bytes = new Uint8Array(buffer),
      view = new DataView(buffer),
      gltf = JSON.parse(
        new TextDecoder().decode(
          bytes.slice(20, 20 + view.getUint32(12, true)),
        ),
      );
    return {
      different: withOverlay !== clean,
      clean: clean === hidden,
      unchanged: before === JSON.stringify(f.getDocument()),
      nodeNames: gltf.nodes.map((n) => n.name),
      review: JSON.stringify(gltf).includes("editor-review"),
    };
  });
  expect(result.different).toBe(true);
  expect(result.clean).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.review).toBe(false);
  expect(result.nodeNames.length).toBe(5);
});

test("report navigates to a sliding foot and the technical bench is available through the lab", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.locator("#review-model").click();
  await page.locator("#review-clip").selectOption("sliding");
  await page.locator("#review-run").click();
  await page.locator('[data-review-foot="0"]').click();
  const view = await page.evaluate(() => window.forge.getView());
  expect(view.activeClip).toBe("sliding");
  expect(view.selected).toBe("left-sole");
  expect(view.time).toBeGreaterThan(0.4);
  await page.locator("#review-model").click();
  await page.locator("#review-load-bench").click();
  await expect
    .poll(() => page.evaluate(() => window.forge.getDocument().name))
    .toBe("Стенд измерений и 3D-опоры");
  await expect
    .poll(() => page.evaluate(() => window.forge.getView().reviewVisible))
    .toBe(true);
  await page.locator("#review-model").click();
  await page.locator("#review-run").click();
  await page.screenshot({ path: "/tmp/graph-model-review.png" });
});

test("a landmark can be drafted from selection and saved without overwriting existing IDs", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await page.evaluate(() => window.forge.select("left-sole"));
  await page.locator("#review-model").click();
  await page.locator("#review-landmark-id").fill("local-pivot");
  await page.locator("#review-add-landmark").click();
  await page.locator("#review-apply").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().review.landmarks["local-pivot"],
    ),
  ).toEqual({ node: "left-sole", point: [0, 0, 0] });
  await page.locator("#review-add-landmark").click();
  await expect(page.locator("#review-status")).toHaveClass(/error/);
});
