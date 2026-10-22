import { test, expect } from "@playwright/test";

test("editor renders and supports creation, transforms, history, animation and persistence", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await expect(page.locator("#node-count")).toHaveText("15");
  await expect(page.locator(".scene-canvas")).toBeVisible();
  await page.screenshot({ path: "/tmp/graph-forge-desktop.png" });
  await page.locator("#add").click();
  await page.locator('#add-menu [data-primitive="sphere"]').click();
  await expect(page.locator("#node-count")).toHaveText("16");
  await page.getByLabel("position X", { exact: true }).fill("2.5");
  await page.getByLabel("position X", { exact: true }).press("Tab");
  const id = await page.evaluate(
    () => window.forge.getDocument().nodes.at(-1).id,
  );
  expect(
    await page.evaluate((id) => window.forge.getPose(id).position[0], id),
  ).toBe(2.5);
  await page.locator("#undo").click();
  expect(
    await page.evaluate((id) => window.forge.getPose(id).position[0], id),
  ).toBe(0);
  await page.locator("#redo").click();
  expect(
    await page.evaluate((id) => window.forge.getPose(id).position[0], id),
  ).toBe(2.5);
  await page.locator("#add-key").click();
  await page.evaluate(() => window.forge.seek(2));
  await page.getByLabel("position Y", { exact: true }).fill("2");
  await page.getByLabel("position Y", { exact: true }).press("Tab");
  await page.evaluate(() => window.forge.seek(1));
  expect(
    await page.evaluate((id) => window.forge.getPose(id).position[1], id),
  ).toBeCloseTo(1.25);
  await page.locator("#play").click();
  await page.waitForTimeout(200);
  await page.locator("#play").click();
  await page.waitForTimeout(350);
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(
    await page.evaluate(
      (id) =>
        window.forge.getDocument().nodes.find((n) => n.id === id).keys.length,
      id,
    ),
  ).toBe(2);
  expect(errors).toEqual([]);
});

test("agent commands are atomic, export has geometry and animation, project round trips", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  const before = await page.evaluate(() => window.forge.getDocument());
  const result = await page.evaluate(() => {
    try {
      window.forge.execute([
        { op: "create", type: "cone", id: "bad" },
        { op: "update", id: "bad", parent: "bad" },
      ]);
    } catch (e) {
      return e.message;
    }
  });
  expect(result).toContain("cycle");
  expect(await page.evaluate(() => window.forge.getDocument())).toEqual(before);
  await page.locator("#commands").click();
  await page.locator("#run-commands").click();
  expect(
    await page.evaluate(() =>
      window.forge.getDocument().nodes.some((n) => n.id === "halo"),
    ),
  ).toBeTruthy();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export").click(),
  ]);
  const path = await download.path();
  const fs = await import("node:fs/promises");
  const buffer = await fs.readFile(path);
  expect(buffer.toString("ascii", 0, 4)).toBe("glTF");
  const length = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.toString("utf8", 20, 20 + length));
  expect(gltf.meshes.length).toBeGreaterThan(10);
  expect(gltf.animations[0].channels.length).toBe(3);
  expect(gltf.nodes.find((n) => n.name === "halo")).toBeTruthy();
  const [project] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#save").click(),
  ]);
  const projectPath = await project.path();
  await page.evaluate(() =>
    window.forge.load({
      version: 1,
      name: "Empty",
      duration: 4,
      fps: 24,
      nodes: [],
    }),
  );
  await page.locator("#file-input").setInputFiles(projectPath);
  await expect(page.locator("#node-count")).toHaveText("16");
  expect(
    await page.evaluate(() =>
      window.forge.getDocument().nodes.some((n) => n.id === "halo"),
    ),
  ).toBeTruthy();
});

test("hierarchical duplication and deletion preserve a valid scene", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate(() => window.forge.select("head"));
  await page.locator("#duplicate").click();
  expect(
    await page.evaluate(() => window.forge.getDocument().nodes.length),
  ).toBe(19);
  await page.locator("#delete").click();
  expect(
    await page.evaluate(() => window.forge.getDocument().nodes.length),
  ).toBe(15);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(() => window.forge.getDocument().nodes.length),
  ).toBe(19);
});

test("compact layout retains an accessible viewport and inspector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await expect(page.locator(".scene-canvas")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/graph-forge-mobile.png",
    fullPage: true,
  });
});

test("GLB animation round trips and matches editor poses", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  const comparison = await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { GLTFLoader } = await import(
      "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
    );
    const { createGLB } = await import("/src/scene.js");
    window.forge.execute([
      { op: "keyframe", id: "scout", time: 0, rotation: [0, 0, 0] },
      { op: "keyframe", id: "scout", time: 2, rotation: [0.4, 1, 0.2] },
      { op: "update", id: "plinth", visible: false },
    ]);
    const buffer = await createGLB(window.forge.getDocument());
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.setTime(1);
    window.forge.seek(1);
    const pose = window.forge.getPose("scout");
    const actual = gltf.scene.getObjectByName("scout");
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...pose.rotation),
    );
    return {
      error: actual.quaternion.angleTo(q),
      position: actual.position.toArray(),
      expected: pose.position,
      duration: gltf.animations[0].duration,
      hiddenExcluded: !gltf.scene.getObjectByName("plinth"),
    };
  });
  expect(comparison.error).toBeLessThan(0.001);
  expect(comparison.position[1]).toBeCloseTo(comparison.expected[1]);
  expect(comparison.duration).toBe(4);
  expect(comparison.hiddenExcluded).toBeTruthy();
});

test("viewport gizmo moves an object and creates one undo step", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate(() => window.forge.select("body"));
  // Move along the X shaft, away from the center plane handles.
  const { a, b } = await page.evaluate(() => ({
    a: window.forge.project([0.55, 1.5, 0]),
    b: window.forge.project([1.1, 1.5, 0]),
  }));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  const position = await page.evaluate(
    () => window.forge.getPose("body").position,
  );
  expect(Math.abs(position[0])).toBeGreaterThan(0.1);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(() => window.forge.getPose("body").position[0]),
  ).toBe(0);
});

test("geometry controls, hierarchy search and profile editing survive file round trips", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate(() => window.forge.select("body"));
  await page.getByLabel("Скругление", { exact: true }).fill("0.12");
  await page.getByLabel("Скругление", { exact: true }).press("Tab");
  expect(
    await page.evaluate(
      () =>
        window.forge.getDocument().nodes.find((n) => n.id === "body").geometry
          .bevel,
    ),
  ).toBe(0.12);
  await page.locator("#parent").selectOption("");
  expect(
    await page.evaluate(
      () =>
        window.forge.getDocument().nodes.find((n) => n.id === "body").parent,
    ),
  ).toBeNull();
  await page.locator("#undo").click();
  expect(
    await page.evaluate(
      () =>
        window.forge.getDocument().nodes.find((n) => n.id === "body").parent,
    ),
  ).toBe("scout");
  await page.getByLabel("Поиск объектов").fill("Helmet");
  await expect(page.locator(".tree-row")).toHaveCount(2);
  await page.locator("#add").click();
  await page.locator('#add-menu [data-primitive="lathe"]').click();
  await page.locator("#edit-profile").click();
  await page.getByLabel("Радиус точки").fill(".15");
  await page.getByLabel("Радиус точки").press("Tab");
  await page.locator("#profile-add").click();
  await page.locator("#apply-profile").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes.at(-1).geometry.profile.length,
    ),
  ).toBe(8);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#save").click(),
  ]);
  const path = await download.path();
  await page.evaluate(() =>
    window.forge.load({
      version: 1,
      name: "Empty",
      duration: 4,
      fps: 24,
      nodes: [],
    }),
  );
  await page.locator("#file-input").setInputFiles(path);
  await expect(page.locator("#node-count")).toHaveText("16");
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes.at(-1).geometry.profile[0][0],
    ),
  ).toBe(0.15);
});

test("history restores selection and time; saves are immediate; malformed time leaves scene intact", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.evaluate(() => {
    window.forge.select("head");
    window.forge.seek(2);
    window.forge.execute([{ op: "delete", id: "head" }]);
    window.forge.undo();
  });
  const restored = await page.evaluate(() => window.forge.getView());
  expect(restored.selected).toBe("head");
  expect(restored.time).toBe(2);
  const invalid = await page.evaluate(() => {
    try {
      window.forge.seek(NaN);
    } catch (e) {
      return e.message;
    }
  });
  expect(invalid).toBeTruthy();
  expect((await page.evaluate(() => window.forge.getView())).time).toBe(2);
  await page.evaluate(() =>
    window.forge.execute([
      { op: "update", id: "head", name: "Saved immediately" },
    ]),
  );
  await page.reload();
  await page.waitForFunction(() => window.forge);
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes.find((n) => n.id === "head").name,
    ),
  ).toBe("Saved immediately");
  await page.evaluate(() => {
    window.forge.select("body");
    window.forge.seek(2);
    window.forge.load({
      version: 1,
      name: "Empty",
      duration: 4,
      fps: 24,
      nodes: [],
    });
    window.forge.undo();
  });
  expect((await page.evaluate(() => window.forge.getView())).selected).toBe(
    "body",
  );
  expect((await page.evaluate(() => window.forge.getView())).time).toBe(2);
});

test("timeline keys can be retimed and snap/coordinate controls are operable", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.locator("#fps").selectOption("30");
  expect(await page.evaluate(() => window.forge.getDocument().fps)).toBe(30);
  await page.locator("#snap").click();
  await expect(page.locator("#snap")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#space").click();
  await expect(page.locator("#space")).toHaveText("Локально");
  const key = page.locator('.keyframe[data-time="2"]');
  const bounds = await key.boundingBox(),
    lane = await page.locator("#timeline-lane").boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    lane.x + lane.width * 0.25,
    bounds.y + bounds.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  expect(
    await page.evaluate(() =>
      window.forge
        .getDocument()
        .nodes.find((n) => n.id === "scout")
        .keys.map((k) => k.time),
    ),
  ).toEqual([0, 1, 4]);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(() =>
      window.forge
        .getDocument()
        .nodes.find((n) => n.id === "scout")
        .keys.map((k) => k.time),
    ),
  ).toEqual([0, 2, 4]);
});

test("corrupt autosave can be recovered rather than silently discarded", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("seeded")) {
      localStorage.setItem("graph-forge-project", '{"broken":');
      localStorage.setItem("seeded", "yes");
    }
  });
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await expect(page.locator("#recovery")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#recovery").click(),
  ]);
  const fs = await import("node:fs/promises");
  expect(await fs.readFile(await download.path(), "utf8")).toBe('{"broken":');
  await page.evaluate(() =>
    window.forge.execute([{ op: "scene", name: "New safe scene" }]),
  );
  expect(
    await page.evaluate(() => localStorage.getItem("graph-forge-recovery")),
  ).toBe('{"broken":');
});

test("extrusion contour editing is undoable and exports real geometry", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.locator("#add").click();
  await page.locator('#add-menu [data-primitive="extrude"]').click();
  await page.getByLabel("Глубина", { exact: true }).fill(".35");
  await page.getByLabel("Глубина", { exact: true }).press("Tab");
  await page.locator("#edit-profile").click();
  await expect(page.locator("#profile-dialog h2")).toHaveText(
    "Контур выдавливания",
  );
  await page.getByLabel("X точки", { exact: true }).fill("-.3");
  await page.getByLabel("X точки", { exact: true }).press("Tab");
  await page.locator("#profile-add").click();
  await page.locator("#apply-profile").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes.at(-1).geometry.outline.length,
    ),
  ).toBe(6);
  await page.locator("#undo").click();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes.at(-1).geometry.outline,
    ),
  ).toBeUndefined();
  expect(
    await page.evaluate(
      () => window.forge.getDocument().nodes.at(-1).geometry.depth,
    ),
  ).toBe(0.35);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export").click(),
  ]);
  const fs = await import("node:fs/promises"),
    data = await fs.readFile(await download.path());
  const gltf = JSON.parse(
    data.toString("utf8", 20, 20 + data.readUInt32LE(12)),
  );
  expect(gltf.meshes.length).toBe(15);
});

test("named clips edit and retime independently, persist and export as distinct actions", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  await page.locator("#manage-clips").click();
  await page.locator("#create-clip").click();
  await page.getByLabel("Название клипа", { exact: true }).fill("Aim");
  await page.getByLabel("Название клипа", { exact: true }).press("Tab");
  await page.getByLabel("Длительность клипа", { exact: true }).fill("2");
  await page.getByLabel("Длительность клипа", { exact: true }).press("Tab");
  await page.locator("#close-clips").click();
  const clip = await page.evaluate(() => window.forge.getView().activeClip);
  expect(clip).toBeTruthy();
  await page.getByLabel("position Y", { exact: true }).fill("1");
  await page.getByLabel("position Y", { exact: true }).press("Tab");
  await page.evaluate(() => window.forge.seek(1));
  await page.getByLabel("position Y", { exact: true }).fill("2");
  await page.getByLabel("position Y", { exact: true }).press("Tab");
  expect(
    await page.evaluate(() => window.forge.getDocument().nodes[0].position[1]),
  ).toBe(0);
  expect(
    await page.evaluate(() =>
      window.forge.getDocument().nodes[0].keys.map((k) => k.time),
    ),
  ).toEqual([0, 2, 4]);
  const key = await page.locator('.keyframe[data-time="1"]').boundingBox(),
    lane = await page.locator("#timeline-lane").boundingBox();
  await page.mouse.move(key.x + key.width / 2, key.y + key.height / 2);
  await page.mouse.down();
  await page.mouse.move(lane.x + lane.width * 0.25, key.y + key.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  expect(
    await page.evaluate(() =>
      window.forge.getDocument().clips[0].tracks.scout.map((k) => k.time),
    ),
  ).toEqual([0, 0.5]);
  await page.locator("#active-clip").selectOption("");
  expect(
    await page.evaluate(() => window.forge.getPose("scout").position[1]),
  ).toBe(0);
  await expect(page.locator("#duration")).toHaveValue("4");
  await page.locator("#active-clip").selectOption(clip);
  expect(
    await page.evaluate(() => window.forge.getPose("scout").position[1]),
  ).toBe(1);
  await expect(page.locator("#duration")).toHaveValue("2");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export").click(),
  ]);
  const fs = await import("node:fs/promises"),
    data = await fs.readFile(await download.path());
  const gltf = JSON.parse(
    data.toString("utf8", 20, 20 + data.readUInt32LE(12)),
  );
  expect(gltf.animations.map((a) => a.name)).toEqual(["Action", "Aim"]);
  await page.reload();
  await page.waitForFunction(() => window.forge);
  await page.locator("#active-clip").selectOption(clip);
  expect(
    await page.evaluate(() => window.forge.getPose("scout").position[1]),
  ).toBe(1);
});

test("GLB named actions preserve rest poses and match editor rotations", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  const result = await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { GLTFLoader } = await import(
      "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
    );
    const { createGLB } = await import("/src/scene.js");
    window.forge.execute([
      { op: "createClip", id: "wave", name: "Wave", duration: 2 },
      {
        op: "keyframe",
        id: "arm-l",
        clip: "wave",
        time: 0,
        rotation: [0, 0, 0],
      },
      {
        op: "keyframe",
        id: "arm-l",
        clip: "wave",
        time: 2,
        rotation: [0.3, 0.8, 1.2],
      },
    ]);
    window.forge.setClip("wave");
    window.forge.seek(1);
    const expected = window.forge.getPose("arm-l");
    const gltf = await new GLTFLoader().parseAsync(
      await createGLB(window.forge.getDocument()),
      "",
    );
    const action = gltf.animations.find((c) => c.name === "Wave"),
      mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(action).play();
    mixer.setTime(1);
    const arm = gltf.scene.getObjectByName("arm-l"),
      q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...expected.rotation),
      );
    return {
      error: arm.quaternion.angleTo(q),
      duration: action.duration,
      scoutY: gltf.scene.getObjectByName("scout").position.y,
      expectedScoutY: window.forge.getPose("scout").position[1],
    };
  });
  expect(result.error).toBeLessThan(0.001);
  expect(result.duration).toBe(2);
  expect(result.scoutY).toBe(result.expectedScoutY);
});
