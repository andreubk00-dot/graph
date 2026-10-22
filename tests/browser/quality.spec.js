import { test, expect } from "@playwright/test";
import { ranger } from "../../src/art-examples.js";
import { emptyDocument, makeNode } from "../../src/document.js";

test("motion review and whole-animation flipping survive undo and frame edits", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => window.forge.openArt(d), ranger());
  const review = await page.evaluate(() => {
    const c = window.forgeArt.reviewMotion();
    c.seek(160);
    return { report: c.report, png: c.capture() };
  });
  expect(review.report.issues).toEqual([]);
  expect(review.png.startsWith("data:image/png")).toBe(true);
  await page.locator("#motion-close").click();
  await page.locator("#art-flip").click();
  expect(
    await page.evaluate(() => window.forgeArt.getDocument().motion.facing),
  ).toBe("left");
  await page.locator("#art-undo").click();
  expect(await page.evaluate(() => window.forgeArt.getDocument())).toEqual(
    ranger(),
  );
  await page.locator("#art-copy-frame").click();
  expect(
    await page.evaluate(
      () => window.forgeArt.getDocument().motion.feet[0].points.length,
    ),
  ).toBe(9);
  await page.locator("#art-delete-frame").click();
  expect(
    await page.evaluate(
      () => window.forgeArt.getDocument().motion.feet[0].points.length,
    ),
  ).toBe(8);
  const meta = await page.evaluate(
    () => window.forgeArt.exportAtlas().metadata.meta.motion,
  );
  expect(meta.facing).toBe("right");
  expect(meta.feet[0].points.length).toBe(8);
});

test("precision model review restores camera and source materials and exposes valid mesh statistics", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.locator("#asterion-demo").click();
  await expect
    .poll(() => page.evaluate(() => window.forge.getDocument().name))
    .toContain("ASTERION");
  const result = await page.evaluate(() => {
    const f = window.forge;
    f.select(null);
    f.setStage({ fit: true });
    const d = f.getDocument();
    f.setView({ preset: "front" });
    f.setShading("normals");
    const before = f.getView(),
      images = f.captureViews({
        presets: ["front", "right"],
        surface: "silhouette",
      }),
      after = f.getView(),
      stats = f.inspect();
    f.setShading("material");
    return {
      before,
      after,
      stats,
      unchanged: JSON.stringify(d) === JSON.stringify(f.getDocument()),
      images: images.map((i) => i.png.length),
      different: images[0].png !== images[1].png,
    };
  });
  expect(result.unchanged).toBe(true);
  expect(result.before.shading).toBe(result.after.shading);
  for (const k of ["camera", "target"])
    result.before[k].forEach((v, i) =>
      expect(result.after[k][i]).toBeCloseTo(v, 6),
    );
  expect(result.different).toBe(true);
  expect(result.images.every((n) => n > 1000)).toBe(true);
  expect(
    result.stats.every(
      (s) => s.boundaryEdges === 0 && s.windingConflicts === 0,
    ),
  ).toBe(true);
  await page.locator("#review-mesh").click();
  await expect(page.locator("#review-ground")).toBeVisible();
  await page.locator("#review-zero-ground").click();
  expect(await page.evaluate(() => window.forge.getView().groundY)).toBe(0);
  await page.locator("#review-fit-ground").click();
  expect(
    await page.evaluate(() => window.forge.getView().groundY),
  ).toBeLessThan(-0.2);
  const invalid = await page.evaluate(() => {
    let count = 0;
    for (const arg of [
      null,
      { preset: "toString" },
      { camera: [0, 0, 0], target: [0, 0, 0] },
      { fov: NaN },
    ])
      try {
        window.forge.setView(arg);
      } catch {
        count++;
      }
    return count;
  });
  expect(invalid).toBe(4);
});

test("nonloop root motion stops at its end instead of teleporting to the beginning", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  const d = emptyDocument();
  d.duration = 0.15;
  d.nodes = [makeNode("group", { id: "root", name: "root" })];
  d.clips = [
    {
      id: "travel",
      name: "Travel",
      duration: 0.15,
      loop: false,
      tracks: {
        root: [
          {
            time: 0,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          {
            time: 0.15,
            position: [0, 0, 2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        ],
      },
    },
  ];
  await page.evaluate((d) => {
    window.forge.load(d);
    window.forge.setClip("travel");
  }, d);
  await page.locator("#play").click();
  await expect
    .poll(() => page.evaluate(() => window.forge.getView().playing))
    .toBe(false);
  expect(
    await page.evaluate(() => window.forge.getPose("root").position[2]),
  ).toBeCloseTo(2, 6);
  expect(await page.evaluate(() => window.forge.getView().time)).toBe(0.15);
});
