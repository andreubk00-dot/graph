import { test, expect } from "@playwright/test";
import { halfBox } from "../fixtures/mesh-study.js";
import { emptyDocument, makeNode } from "../../src/document.js";
async function load(page, type = "mesh") {
  const d = emptyDocument();
  d.name = "Technical mesh bench";
  d.nodes = [
    makeNode(type, {
      id: "study",
      position: [0, 0, 0],
      color: "#a5d7ce",
      geometry: type === "mesh" ? halfBox() : {},
    }),
  ];
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => window.forge.load(d), d);
  return d;
}
async function open(page) {
  await page.evaluate(() => {
    window.meshLab = window.forge.openMeshEditor("study");
    window.meshLab.setView("front");
  });
  await expect(page.locator("#mesh-dialog")).toBeVisible();
}

test("mesh component picking, exact movement, draft undo and project history persist real geometry", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const source = await load(page);
  await page.locator("#edit-mesh").click();
  await page.locator("#mesh-view").selectOption("front");
  // The inspector and API use the same dialog; reopen to hold its agent controller.
  await page.locator("#mesh-close").click();
  await open(page);
  let p = await page.evaluate(() => window.meshLab.project([1, 0, 1]));
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(() => window.meshLab.getDraft().selection.ids),
  ).toEqual([5]);
  p = await page.evaluate(() => window.meshLab.project([1, 1, 1]));
  await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up("Shift");
  expect(
    (await page.evaluate(() => window.meshLab.getDraft().selection.ids)).sort(),
  ).toEqual([5, 6]);
  await page.locator("#mesh-dz").fill(".1");
  await page.locator("#mesh-translate").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  expect(
    await page.evaluate(() => window.meshLab.getDraft().geometry.positions[17]),
  ).toBe(1.1);
  await page.locator("#mesh-undo").click();
  expect(
    await page.evaluate(() => window.meshLab.getDraft().geometry.positions[17]),
  ).toBe(1);
  await page.locator("#mesh-redo").click();
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes[0].geometry.positions[17],
    ),
  ).toBe(1.1);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.locator("#redo").click();
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes[0].geometry.positions[17],
    ),
  ).toBe(1.1);
  expect(errors).toEqual([]);
});
test("component gizmo drag moves selected vertices along the chosen axis", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await open(page);
  await page.evaluate(() => window.meshLab.select("vertex", [5]));
  const { a, b } = await page.evaluate(() => ({
    a: window.meshLab.project([1.2, 0, 1]),
    b: window.meshLab.project([1.4, 0, 1]),
  }));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  const draft = await page.evaluate(() => window.meshLab.getDraft());
  expect(draft.operations).toHaveLength(1);
  expect(draft.geometry.positions[15]).toBeGreaterThan(1.1);
  expect(draft.geometry.positions[16]).toBeCloseTo(0, 8);
  expect(draft.geometry.positions[17]).toBeCloseTo(1, 8);
  await page.locator("#mesh-close").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes[0].geometry.positions[15],
    ),
  ).toBe(1);
});
test("region extrusion and welded mirror survive GLB round-trip without editor helpers", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await open(page);
  await page.locator("#mesh-mirror").click();
  await expect(page.locator("#mesh-stats")).toContainText("12 вершин");
  await page.locator("#mesh-mode").selectOption("face");
  await page.locator("#mesh-ids").fill("6, 7");
  await page.locator("#mesh-select-ids").click();
  await page.locator("#mesh-dy").fill(".25");
  await page.locator("#mesh-extrude").click();
  await expect(page.locator("#mesh-stats")).toContainText("28 треугольников");
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const { createGLB, disposeScene } = await import("/src/scene.js");
    const { GLTFLoader } = await import(
      "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
    );
    const d = window.forge.getDocument(),
      gltf = await new GLTFLoader().parseAsync(await createGLB(d), "");
    const meshes = [];
    gltf.scene.traverse((o) => {
      if (o.isMesh)
        meshes.push({
          positions: Array.from(o.geometry.attributes.position.array),
          normals: Array.from(o.geometry.attributes.normal.array),
          indices: o.geometry.index
            ? Array.from(o.geometry.index.array)
            : Array.from(
                { length: o.geometry.attributes.position.count },
                (_, i) => i,
              ),
        });
    });
    disposeScene(gltf.scene);
    return { source: d.nodes[0].geometry, meshes };
  });
  expect(result.meshes).toHaveLength(1);
  const exported = result.meshes[0];
  expect(
    exported.indices.flatMap((i) => exported.positions.slice(i * 3, i * 3 + 3)),
  ).toEqual(
    result.source.indices
      .flatMap((i) => result.source.positions.slice(i * 3, i * 3 + 3))
      .map(Math.fround),
  );
  for (let i = 0; i < exported.indices.length; i += 3) {
    const ids = exported.indices.slice(i, i + 3),
      p = (id) => exported.positions.slice(id * 3, id * 3 + 3);
    const [a, b, c] = ids.map(p),
      u = b.map((v, k) => v - a[k]),
      v = c.map((v, k) => v - a[k]);
    const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ],
      length = Math.hypot(...cross);
    for (const id of ids)
      expect(
        cross.reduce(
          (sum, x, k) => sum + (x / length) * exported.normals[id * 3 + k],
          0,
        ),
      ).toBeCloseTo(1, 5);
  }
  for (let i = 0; i < result.meshes[0].normals.length; i += 3)
    expect(Math.hypot(...result.meshes[0].normals.slice(i, i + 3))).toBeCloseTo(
      1,
      5,
    );
});
test("orthographic references render behind the mesh, save with project, and stay outside GLB", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await open(page);
  await page.locator("#mesh-reference-panel").evaluate((e) => (e.open = true));
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 80;
    c.height = 80;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(0, 0, 80, 80);
    return c.toDataURL();
  });
  await page.locator("#mesh-reference-width").fill("4");
  await page.locator("#mesh-reference-opacity").fill("1");
  await page.locator("#mesh-reference-file").setInputFiles({
    name: "calibration.png",
    mimeType: "image/png",
    buffer: Buffer.from(data.split(",")[1], "base64"),
  });
  await expect(page.locator("#mesh-reference-name")).toHaveText(
    "calibration.png",
  );
  await page.waitForFunction(() => window.meshLab.getDraft().refs.length === 1);
  const pixels = await page.evaluate(async () => {
    const image = new Image();
    image.src = window.meshLab.screenshot();
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const sample = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return {
      corner: sample(12, 12),
      center: sample(Math.floor(c.width / 2), Math.floor(c.height / 2)),
    };
  });
  expect(pixels.corner[0]).toBeGreaterThan(220);
  expect(pixels.corner[1]).toBeLessThan(40);
  expect(pixels.corner[2]).toBeGreaterThan(220);
  expect(pixels.center[1]).toBeGreaterThan(80);
  expect(
    await page.evaluate(() => window.forge.getDocument().referenceImages),
  ).toBeUndefined();
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(
    await page.evaluate(
      () => window.forge.getDocument().referenceImages[0].data,
    ),
  ).toBe(data);
  await open(page);
  await page.locator("#mesh-reference-panel").evaluate((e) => (e.open = true));
  await expect(page.locator("#mesh-reference-name")).toHaveText(
    "calibration.png",
  );
  await page.locator("#mesh-reference-remove").click();
  await page.locator("#mesh-close").click();
  expect(
    await page.evaluate(() => window.forge.getDocument().referenceImages),
  ).toHaveLength(1);
  const counts = await page.evaluate(async () => {
    const { createGLB } = await import("/src/scene.js");
    const glb = await createGLB(window.forge.getDocument()),
      v = new DataView(glb);
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(glb, 20, v.getUint32(12, true))),
    );
    return {
      meshes: json.meshes.length,
      images: json.images?.length ?? 0,
      nodes: json.nodes.length,
    };
  });
  expect(counts).toEqual({ meshes: 1, images: 0, nodes: 1 });
});
test("invalid edits and primitive draft cancellation leave source intact; conversion remains undoable", async ({
  page,
}) => {
  test.setTimeout(90000);
  const source = await load(page, "box");
  await open(page);
  await page.locator("#mesh-close").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await open(page);
  await page.locator("#mesh-mirror").click();
  await expect(page.locator("#mesh-error")).toContainText("one half");
  await page.evaluate(() => window.meshLab.select("vertex", [0]));
  await page.locator("#mesh-dx").fill(".1");
  await page.locator("#mesh-translate").click();
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.forge.getDocument().nodes[0].type),
  ).toBe("mesh");
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(source);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const rect = await page.locator("#mesh-dialog").boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.width).toBeLessThanOrEqual(390);
});

test("stale drafts refuse to overwrite external edits and malformed reference images stay out of the source", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  await open(page);
  await page.locator("#mesh-reference-panel").evaluate((e) => (e.open = true));
  await page.locator("#mesh-reference-file").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a PNG"),
  });
  await expect(page.locator("#mesh-error")).toContainText(
    "Не удалось прочитать",
  );
  expect(await page.evaluate(() => window.meshLab.getDraft().refs)).toEqual([]);
  await page.evaluate(() => {
    window.meshLab.select("vertex", [5]);
    window.meshLab.operate({
      action: "translate",
      selection: { mode: "vertex", ids: [5] },
      delta: [0.1, 0, 0],
    });
    window.forge.execute([
      { op: "update", id: "study", name: "External name" },
    ]);
  });
  const result = await page.evaluate(() => window.meshLab.apply());
  expect(result.applied).toBe(false);
  await expect(page.locator("#mesh-error")).toContainText("Проект изменился");
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes[0].geometry.positions[15],
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.forge.getDocument().nodes[0].name),
  ).toBe("External name");
  await page.locator("#mesh-close").click();
});

test("UV-split triangle region extrudes without a wall on its internal diagonal", async ({
  page,
}) => {
  test.setTimeout(90000);
  await load(page);
  const geometry = {
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 3, 4, 5],
    uv: [0, 0, 0.5, 0, 0.5, 1, 0.5, 0, 1, 1, 1, 0],
  };
  await page.evaluate(
    (geometry) =>
      window.forge.execute([{ op: "update", id: "study", geometry }]),
    geometry,
  );
  await open(page);
  await page.locator("#mesh-mode").selectOption("face");
  await page.locator("#mesh-all").click();
  await page.locator("#mesh-dz").fill(".2");
  await page.locator("#mesh-extrude").click();
  await expect(page.locator("#mesh-stats")).toContainText("10 треугольников");
  await page.locator("#mesh-apply").click();
  await expect(page.locator("#mesh-dialog")).toHaveCount(0);
  const output = await page.evaluate(
    () => window.forge.getDocument().nodes[0].geometry,
  );
  expect(output.indices).toHaveLength(30);
  expect(output.uv.slice(0, 12)).toEqual(geometry.uv);
  expect(output.uv.slice(12)).toEqual(geometry.uv);
});
