import { test, expect } from "@playwright/test";
import { emptyArt } from "../../src/art-document.js";
import { ranger, rune } from "../../src/art-examples.js";

test("organic modeling previews in a worker, applies one mesh, preserves source and cancels invalid edits", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.locator("#new-sculpt").click();
  await expect(page.locator("#sculpt-apply")).toBeEnabled({ timeout: 30000 });
  await expect(page.locator("#sculpt-stats")).toContainText("треугольников");
  await page.screenshot({ path: "/tmp/graph-forge-organic.png" });
  await page.locator("#sculpt-apply").click();
  const node = await page.evaluate(() =>
    window.forge.getDocument().nodes.at(-1),
  );
  expect(node.type).toBe("mesh");
  expect(node.sculpt).toBeTruthy();
  expect(node.geometry.colors.length).toBe(node.geometry.positions.length);
  await page.locator("#edit-sculpt").click();
  await expect(page.locator("#sculpt-apply")).toBeEnabled({ timeout: 30000 });
  await page.locator("#sculpt-source").fill('{"resolution":1000}');
  await page.locator("#sculpt-build").click();
  await expect(page.locator("#sculpt-error")).not.toHaveText("");
  await expect(page.locator("#sculpt-apply")).toBeDisabled();
  await page.locator("#sculpt-close").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes.at(-1).geometry.positions.length,
    ),
  ).toBe(node.geometry.positions.length);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(() => window.forge.getDocument().nodes.length),
  ).toBe(15);
  await page.locator("#warden-demo").click();
  await expect
    .poll(() => page.evaluate(() => window.forge.getDocument().name))
    .toContain("Warden");
  const exported = await page.evaluate(async () => {
    const { createGLB } = await import("/src/scene.js");
    const { GLTFLoader } = await import(
      "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
    );
    const doc = window.forge.getDocument(),
      gltf = await new GLTFLoader().parseAsync(await createGLB(doc), "");
    const body = gltf.scene.getObjectByName("warden");
    return {
      count: body.geometry.attributes.color.count,
      expected: doc.nodes[0].geometry.positions.length / 3,
      vertexColors: body.material.vertexColors,
    };
  });
  expect(exported.count).toBe(exported.expected);
  expect(exported.vertexColors).toBe(true);
  expect(errors).toEqual([]);
});

test("pixel painting, layers, history, resizing and game atlas export preserve exact cells", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => window.forge.openArt(d), emptyArt("pixel", 8, 8));
  const canvas = page.locator("#art-canvas"),
    bounds = await canvas.boundingBox();
  await page.locator("#art-mirror").check();
  await page.mouse.move(
    bounds.x + bounds.width * 0.15,
    bounds.y + bounds.height * 0.3,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.45,
    bounds.y + bounds.height * 0.6,
    { steps: 8 },
  );
  await page.mouse.up();
  const painted = await page.evaluate(
    () => window.forgeArt.getDocument().frames[0].layers[0].pixels,
  );
  expect(painted.filter((x) => x === 1).length).toBeGreaterThan(4);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      expect(painted[y * 8 + x]).toBe(painted[y * 8 + 7 - x]);
  await page.locator("#art-undo").click();
  expect(
    await page.evaluate(() =>
      window.forgeArt
        .getDocument()
        .frames[0].layers[0].pixels.every((x) => x === 0),
    ),
  ).toBe(true);
  await page.locator("#art-redo").click();
  await page.locator("#art-add-layer").click();
  await page.locator("#art-tool").selectOption("fill");
  await canvas.click({ position: { x: 10, y: 10 } });
  expect(
    await page.evaluate(() =>
      window.forgeArt
        .getDocument()
        .frames[0].layers[1].pixels.every((x) => x === 1),
    ),
  ).toBe(true);
  await page.locator("#art-width").fill("10");
  await page.locator("#art-height").fill("12");
  await page.locator("#art-resize").click();
  expect(
    await page.evaluate(() => [
      window.forgeArt.getDocument().width,
      window.forgeArt.getDocument().height,
    ]),
  ).toEqual([10, 12]);
  await page.locator("#art-undo").click();
  await page.locator("#art-copy-frame").click();
  await expect(page.locator("#art-frames button")).toHaveCount(2);
  await page.locator("#art-play").click();
  await page.waitForTimeout(240);
  await page.locator("#art-play").click();
  await page.evaluate((d) => window.forgeArt.load(d), ranger());
  const atlas = await page.evaluate(async () => {
    const result = window.forgeArt.exportAtlas({ columns: 4, padding: 2 }),
      img = new Image();
    img.src = result.png;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const p = ctx.getImageData(0, 0, c.width, c.height).data;
    return {
      metadata: result.metadata,
      paddingAlpha: p[3],
      opaque: p.filter((_, i) => i % 4 === 3).filter((a) => a > 0).length,
    };
  });
  expect(atlas.metadata.frames.length).toBe(8);
  expect(atlas.metadata.width).toBe(272);
  expect(atlas.metadata.frames[4].frame).toEqual({ x: 2, y: 70, w: 64, h: 64 });
  expect(atlas.metadata.frames[0].duration).toBe(80);
  expect(atlas.paddingAlpha).toBe(0);
  expect(atlas.opaque).toBeGreaterThan(1000);
  await page.screenshot({ path: "/tmp/graph-forge-pixel.png" });
  await page.locator("#art-close").click();
  expect(
    await page.evaluate(() => window.forge.getDocument().nodes.length),
  ).toBe(15);
});

test("vector artwork supports editable paths, safe SVG and transparent PNG, with independent recovery", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => window.forge.openArt(d), rune());
  await expect(page.locator("#art-vector-controls")).toBeVisible();
  const stats = await page.evaluate(async () => {
    const png = window.forgeArt.exportPNG(),
      img = new Image();
    img.src = png;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const p = ctx.getImageData(0, 0, c.width, c.height).data;
    return {
      svg: window.forgeArt.exportSVG(),
      width: img.width,
      corner: p[3],
      pixels: p.filter((_, i) => i % 4 === 3).filter((x) => x > 0).length,
    };
  });
  expect(stats.width).toBe(512);
  expect(stats.corner).toBe(0);
  expect(stats.pixels).toBeGreaterThan(15000);
  expect(stats.svg).toContain("linearGradient");
  await page.locator("#art-layer").selectOption("1");
  await page
    .locator("#art-paths")
    .fill('[{"d":[["M",0,0],["L",1,1]],"fill":"url(https://invalid.test)"}]');
  await page.locator("#art-apply-paths").click();
  await expect(page.locator("#art-status")).toHaveClass(/error/);
  expect(
    await page.evaluate(
      () => window.forgeArt.getDocument().frames[0].layers[1].paths.length,
    ),
  ).toBeGreaterThan(1);
  await page.locator("#art-name").fill("My illustration");
  await page.locator("#art-name").press("Tab");
  await page.screenshot({ path: "/tmp/graph-forge-2d.png" });
  await page.locator("#art-close").click();
  await page.locator("#open-art").click();
  expect(await page.evaluate(() => window.forgeArt.getDocument().name)).toBe(
    "My illustration",
  );
  expect(errors).toEqual([]);
});

test("PNG import preserves source RGBA and rejects excess colors without changing the project", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.locator("#open-art").click();
  await page.locator("#art-file").setInputFiles("examples/ranger.png");
  await expect
    .poll(() => page.evaluate(() => window.forgeArt.getDocument().name))
    .toBe("ranger");
  const equal = await page.evaluate(async () => {
    async function pixels(url) {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    }
    const a = await pixels("/examples/ranger.png"),
      b = await pixels(window.forgeArt.exportPNG());
    return a.length === b.length && a.every((x, i) => x === b[i]);
  });
  expect(equal).toBe(true);
  const bad = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 17;
    const ctx = c.getContext("2d"),
      image = ctx.createImageData(17, 17);
    for (let i = 0; i < 289; i++)
      image.data.set([i & 255, i >> 8, 17, 255], i * 4);
    ctx.putImageData(image, 0, 0);
    return c.toDataURL().split(",")[1];
  });
  await page.locator("#art-file").setInputFiles({
    name: "too-many-colors.png",
    mimeType: "image/png",
    buffer: Buffer.from(bad, "base64"),
  });
  await expect(page.locator("#art-status")).toHaveClass(/error/);
  expect(await page.evaluate(() => window.forgeArt.getDocument().name)).toBe(
    "ranger",
  );
});
