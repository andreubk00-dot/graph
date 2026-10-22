import { test, expect } from "@playwright/test";
async function bench(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.locator("#rig-study").click();
  await expect
    .poll(() => page.evaluate(() => window.forge.getDocument().name))
    .toContain("Стенд деформации");
}

test("technical bench deforms the actual surface, shows bone weights and keeps all helpers out of clean captures", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await bench(page);
  expect(await page.evaluate(() => window.forge.getView().selected)).toBe(
    "joint-hinge",
  );
  await expect(page.locator("#joint-axis")).toHaveValue("z");
  await expect(page.locator("#color")).toHaveCount(0);
  await page.locator("#shading-mode").selectOption("weights");
  const result = await page.evaluate(() => {
    const f = window.forge;
    f.seek(1);
    const doc = JSON.stringify(f.getDocument()),
      sample = f.sampleRig({ mesh: "deformation-mesh", vertices: [0] }),
      withRig = f.screenshot({ rig: true }),
      clean = f.screenshot();
    f.setRigVisible(false);
    const hidden = f.screenshot();
    f.select("joint-root");
    const rootWeights = f.screenshot();
    f.setShading("material");
    return {
      unchanged: doc === JSON.stringify(f.getDocument()),
      sample,
      helpersDiffer: withRig !== clean,
      cleanIdentical: clean === hidden,
      weightsDiffer: clean !== rootWeights,
      report: f.auditRig(),
    };
  });
  expect(result.unchanged).toBe(true);
  expect(result.sample.vertices[0][0]).toBeCloseTo(-0.9, 5);
  expect(result.sample.vertices[0][1]).toBeCloseTo(0.9, 5);
  expect(result.helpersDiffer).toBe(true);
  expect(result.cleanIdentical).toBe(true);
  expect(result.weightsDiffer).toBe(true);
  expect(result.report.issues).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/graph-rig-bench.png" });
});

test("joint limits are edited atomically and diagnostics navigate to an offending pose", async ({
  page,
}) => {
  test.setTimeout(90000);
  await bench(page);
  await page.locator("#joint-max").fill("80");
  await page.locator("#apply-joint-limit").click();
  expect(
    await page.evaluate(() => window.forge.auditRig().issues.length),
  ).toBeGreaterThan(0);
  await page.locator("#review-rig").click();
  await expect(page.locator("#rig-issues")).toContainText("ограничения");
  await page.locator('[data-rig-bone="1"]').click();
  expect(await page.evaluate(() => window.forge.getView().selected)).toBe(
    "joint-hinge",
  );
  expect(
    await page.evaluate(() => window.forge.getView().time),
  ).toBeGreaterThan(0.8);
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.auditRig().issues)).toEqual([]);
  expect(await page.locator("#joint-max").inputValue()).toBe("135");
  await page.locator("#joint-max").fill("-20");
  await page.locator("#apply-joint-limit").click();
  await expect(page.locator("#toast")).toHaveClass(/error/);
  expect(
    await page.evaluate(
      () =>
        window.forge.getDocument().nodes.find((n) => n.id === "joint-hinge")
          .jointLimit.max,
    ),
  ).toBe(135);
  await page.locator("#active-clip").selectOption("overbend");
  expect(
    await page.evaluate(() => window.forge.auditRig().issues.length),
  ).toBeGreaterThan(0);
});

test("precise weights survive history and recovery; skin transform edits cannot silently detach the body", async ({
  page,
}) => {
  test.setTimeout(90000);
  await bench(page);
  await page.evaluate(() =>
    window.forge.execute([
      {
        op: "setSkinWeights",
        id: "deformation-mesh",
        vertices: [0, 1],
        influences: [{ joint: "joint-root", weight: 1 }],
      },
    ]),
  );
  expect(
    await page.evaluate(
      () =>
        window.forge.getDocument().nodes.find((n) => n.skin).skin.weights[0],
    ),
  ).toBe(1);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(
      () =>
        window.forge.getDocument().nodes.find((n) => n.skin).skin.weights[0],
    ),
  ).toBe(0);
  await page.locator("#redo").click();
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(
    await page.evaluate(
      () =>
        window.forge.getDocument().nodes.find((n) => n.skin).skin.weights[0],
    ),
  ).toBe(1);
  await page.evaluate(() => window.forge.select("deformation-mesh"));
  expect(
    await page.locator('[data-prop="position"]').first().isDisabled(),
  ).toBe(true);
  const result = await page.evaluate(() => {
    const f = window.forge,
      before = JSON.stringify(f.getDocument());
    let failures = 0;
    for (const command of [
      { op: "delete", id: "joint-hinge" },
      { op: "update", id: "deformation-mesh", position: [2, 0, 0] },
      { op: "duplicate", ids: ["deformation-mesh"] },
    ])
      try {
        f.execute([command]);
      } catch {
        failures++;
      }
    return { failures, unchanged: before === JSON.stringify(f.getDocument()) };
  });
  expect(result).toEqual({ failures: 3, unchanged: true });
});

test("browser GLB roundtrip preserves bone animation and deformed vertices in weight display mode", async ({
  page,
}) => {
  test.setTimeout(90000);
  await bench(page);
  const result = await page.evaluate(async () => {
    const f = window.forge;
    f.setShading("weights");
    f.seek(0.73);
    const before = f.getDocument(),
      expected = f.sampleRig({
        mesh: "deformation-mesh",
        vertices: [0, 20, 200],
      }),
      { createGLB, disposeScene } = await import("/src/scene.js"),
      { GLTFLoader } = await import(
        "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
      ),
      THREE = await import("/node_modules/three/build/three.module.js"),
      gltf = await new GLTFLoader().parseAsync(await createGLB(before), ""),
      mesh = gltf.scene.getObjectByName("deformation-mesh"),
      mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.setTime(0.73);
    gltf.scene.updateMatrixWorld(true);
    const points = [0, 20, 200].map((i) =>
        mesh
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(mesh.matrixWorld)
          .toArray(),
      ),
      out = {
        points,
        expected: expected.vertices,
        skinned: mesh.isSkinnedMesh,
        colors: !!mesh.geometry.attributes.color,
        objects: [],
      };
    gltf.scene.traverse((o) => out.objects.push(o.name));
    disposeScene(gltf.scene);
    return out;
  });
  expect(result.skinned).toBe(true);
  expect(result.colors).toBe(false);
  result.points.forEach((v, i) =>
    v.forEach((x, j) => expect(x).toBeCloseTo(result.expected[i][j], 5)),
  );
  expect(result.objects.filter((s) => s.includes("Helper"))).toEqual([]);
});

test("weight colors remain visible across repeated surface switches and capture calls", async ({
  page,
}) => {
  test.setTimeout(90000);
  await bench(page);
  const counts = await page.evaluate(async () => {
    const f = window.forge;
    f.seek(1);
    f.select("joint-hinge");
    const snapshots = [];
    for (const surface of ["material", "normals", "material", "silhouette"]) {
      f.setShading(surface);
      f.screenshot();
      f.seek(1);
      f.setView({ preset: "front" });
      f.setShading("weights");
      snapshots.push(f.screenshot());
    }
    const counts = [];
    for (const png of snapshots) {
      const im = new Image();
      im.src = png;
      await im.decode();
      const c = document.createElement("canvas");
      c.width = im.width;
      c.height = im.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(im, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      let blue = 0,
        orange = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i],
          g = pixels[i + 1],
          b = pixels[i + 2];
        blue += b > 100 && b > r * 1.5 ? 1 : 0;
        orange += r > 150 && g > 70 && r > b * 1.5 ? 1 : 0;
      }
      counts.push({ blue, orange });
    }
    return counts;
  });
  for (const c of counts) {
    expect(c.blue).toBeGreaterThan(1000);
    expect(c.orange).toBeGreaterThan(1000);
  }
});
