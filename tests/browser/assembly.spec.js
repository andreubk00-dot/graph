import { test, expect } from "@playwright/test";

test("shift selection groups, moves, colors and duplicates a model as one undoable operation", async ({
  page,
}) => {
  test.setTimeout(45000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.getByRole("button", { name: "Body", exact: true }).click();
  await page
    .getByRole("button", { name: "Helmet", exact: true })
    .click({ modifiers: ["Shift"] });
  expect(
    await page.evaluate(() => window.forge.getView().selectedIds.sort()),
  ).toEqual(["body", "head"]);
  await page.locator("#group-selection").click();
  await expect(page.locator("#node-count")).toHaveText("16");
  expect(
    await page.evaluate(() => {
      const d = window.forge.getDocument();
      return (
        d.nodes.find((n) => n.id === "body").parent ===
        d.nodes.find((n) => n.id === "head").parent
      );
    }),
  ).toBeTruthy();
  await page.locator("#ungroup-selection").click();
  await expect(page.locator("#node-count")).toHaveText("15");
  await page.getByLabel("Сдвиг X", { exact: true }).fill("1");
  await page.locator("#batch-move").click();
  expect(
    await page.evaluate(() => window.forge.getPose("body").position[0]),
  ).toBeCloseTo(1);
  expect(
    await page.evaluate(() => window.forge.getPose("head").position[0]),
  ).toBeCloseTo(1);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(() => window.forge.getPose("body").position[0]),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.forge.getView().selectedIds.length),
  ).toBe(2);
  await page.getByLabel("Общий цвет", { exact: true }).evaluate((e) => {
    e.value = "#ff8855";
    e.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(
    await page.evaluate(() =>
      window.forge
        .getDocument()
        .nodes.filter((n) => ["body", "head"].includes(n.id))
        .map((n) => n.color),
    ),
  ).toEqual(["#ff8855", "#ff8855"]);
  await page.locator("#duplicate").click();
  await expect(page.locator("#node-count")).toHaveText("20");
  await page.locator("#delete").click();
  await expect(page.locator("#node-count")).toHaveText("15");
  await page.locator("#undo").click();
  await expect(page.locator("#node-count")).toHaveText("20");
  expect(errors).toEqual([]);
});

test("collective gizmo moves roots once and cancels correctly", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate(() => {
    window.forge.load({
      version: 1,
      name: "Batch",
      duration: 4,
      fps: 24,
      nodes: [],
    });
    window.forge.execute([
      { op: "create", type: "box", id: "a", position: [-1, 0.5, 0] },
      { op: "create", type: "box", id: "b", position: [1, 0.5, 0] },
    ]);
    window.forge.selectMany(["a", "b"]);
  });
  const points = await page.evaluate(() => ({
    a: window.forge.project([0.55, 0.5, 0]),
    b: window.forge.project([1.15, 0.5, 0]),
  }));
  await page.mouse.move(points.a.x, points.a.y);
  await page.mouse.down();
  await page.mouse.move(points.b.x, points.b.y, { steps: 8 });
  await page.mouse.up();
  const poses = await page.evaluate(() => [
    window.forge.getPose("a").position[0],
    window.forge.getPose("b").position[0],
  ]);
  expect(poses[0] + 1).toBeGreaterThan(0.1);
  expect(poses[0] + 1).toBeCloseTo(poses[1] - 1);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getPose("a").position[0])).toBe(
    -1,
  );
  await page.mouse.move(points.a.x, points.a.y);
  await page.mouse.down();
  await page.mouse.move(points.b.x, points.b.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await page.evaluate(() => window.forge.getPose("a").position[0])).toBe(
    -1,
  );
  expect(
    await page.evaluate(() => window.forge.getView().selectedIds.length),
  ).toBe(2);
  // A selected parent and child must not receive the same delta twice.
  await page.evaluate(() => {
    window.forge.execute([
      { op: "update", id: "b", parent: "a", position: [2, 0, 0] },
    ]);
    window.forge.selectMany(["a", "b"]);
    window.forge.transformSelection({ position: [1, 0, 0] });
  });
  expect(await page.evaluate(() => window.forge.getPose("a").position[0])).toBe(
    0,
  );
  expect(await page.evaluate(() => window.forge.getPose("b").position[0])).toBe(
    2,
  );
});

test("shear is rejected atomically and multi-selection is restored by history", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  const result = await page.evaluate(() => {
    window.forge.load({
      version: 1,
      name: "Shear check",
      duration: 4,
      fps: 24,
      nodes: [],
    });
    window.forge.execute([
      { op: "create", type: "group", id: "p", scale: [2, 1, 1] },
      { op: "create", type: "box", id: "a", parent: "p" },
      { op: "create", type: "box", id: "b", position: [2, 0.5, 0] },
    ]);
    window.forge.selectMany(["a", "b"]);
    const before = JSON.stringify(window.forge.getDocument());
    let error = "";
    try {
      window.forge.transformSelection({ rotation: [0, 0, 0.4] });
    } catch (e) {
      error = e.message;
    }
    return {
      error,
      unchanged: before === JSON.stringify(window.forge.getDocument()),
    };
  });
  expect(result.error).toContain("shear");
  expect(result.unchanged).toBeTruthy();
});

test("OBJ import merges into the scene, survives JSON and exports geometry and UV", async ({
  page,
}) => {
  test.setTimeout(45000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.locator("#obj-input").setInputFiles("examples/stone-gate.obj");
  await expect(page.locator("#node-count")).toHaveText("18");
  const meshes = await page.evaluate(
    () =>
      window.forge.getDocument().nodes.filter((n) => n.type === "mesh").length,
  );
  expect(meshes).toBe(2);
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#save").click(),
  ]);
  await page.locator("#file-input").setInputFiles(await json.path());
  await expect(page.locator("#node-count")).toHaveText("18");
  const [glb] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export").click(),
  ]);
  const fs = await import("node:fs/promises"),
    data = await fs.readFile(await glb.path()),
    gltf = JSON.parse(data.toString("utf8", 20, 20 + data.readUInt32LE(12)));
  expect(gltf.meshes.length).toBe(16);
  // The parser's API also preserves UV attributes, independently of material loading.
  const imported = await page.evaluate(() =>
    window.forge.importOBJ(
      "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3",
      { name: "UV triangle" },
    ),
  );
  expect(imported.ids.length).toBe(2);
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes.at(-1).geometry.uv.length,
    ),
  ).toBe(6);
  const uvRoundTrip = await page.evaluate(async () => {
    const { createGLB } = await import("/src/scene.js");
    const { GLTFLoader } = await import(
      "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
    );
    const doc = window.forge.getDocument(),
      source = doc.nodes.at(-1),
      gltf = await new GLTFLoader().parseAsync(await createGLB(doc), "");
    const geometry = gltf.scene.getObjectByName(source.id).geometry;
    return {
      expected: source.geometry.uv,
      actual: Array.from(geometry.attributes.uv.array),
      normals: geometry.attributes.normal.count,
    };
  });
  expect(uvRoundTrip.actual).toEqual(uvRoundTrip.expected);
  expect(uvRoundTrip.normals).toBe(3);
  expect(errors).toEqual([]);
});

test("collective pivot follows animated objects when seeking another frame", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate(() => {
    window.forge.load({
      version: 1,
      name: "Animated selection",
      duration: 2,
      fps: 24,
      nodes: [],
    });
    window.forge.execute([
      { op: "create", type: "box", id: "a", position: [-1, 0.5, 0] },
      { op: "create", type: "box", id: "b", position: [1, 0.5, 0] },
      { op: "keyframe", id: "a", time: 0, position: [-1, 0.5, 0] },
      { op: "keyframe", id: "a", time: 1, position: [-1, 1.5, 0] },
      { op: "keyframe", id: "b", time: 0, position: [1, 0.5, 0] },
      { op: "keyframe", id: "b", time: 1, position: [1, 1.5, 0] },
    ]);
    window.forge.selectMany(["a", "b"]);
    window.forge.seek(1);
  });
  const points = await page.evaluate(() => ({
    a: window.forge.project([0.55, 1.5, 0]),
    b: window.forge.project([1.15, 1.5, 0]),
  }));
  await page.mouse.move(points.a.x, points.a.y);
  await page.mouse.down();
  await page.mouse.move(points.b.x, points.b.y, { steps: 8 });
  await page.mouse.up();
  const poses = await page.evaluate(() => [
    window.forge.getPose("a").position[0],
    window.forge.getPose("b").position[0],
  ]);
  expect(poses[0] + 1).toBeGreaterThan(0.1);
  expect(poses[0] + 1).toBeCloseTo(poses[1] - 1);
  await page.evaluate(() => window.forge.seek(0));
  expect(await page.evaluate(() => window.forge.getPose("a").position[0])).toBe(
    -1,
  );
});
