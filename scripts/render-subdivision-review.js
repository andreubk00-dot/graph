// Actual editor/GLB review of a mirror/Loop stack, not an artistic character asset.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { emptyDocument, makeNode } from "../src/document.js";
import { halfBox } from "../tests/fixtures/mesh-study.js";
import { evaluateMeshGeometry } from "../src/mesh-modifiers.js";
import { auditMesh } from "../src/mesh-audit.js";
const out = process.argv[2] ?? "/tmp/graph-subdivision-review";
await fs.mkdir(out, { recursive: true });
const source = emptyDocument();
source.name = "Loop subdivision · technical study";
source.nodes = [
  makeNode("mesh", {
    id: "study",
    position: [0, 0, 0],
    color: "#a5d7ce",
    geometry: { ...halfBox(), smooth: true },
  }),
];
source.review = {
  version: 1,
  landmarks: { tip: { node: "study", vertex: 6 } },
  measurements: [],
  symmetry: [],
};
const server = await createServer({
  root: process.cwd(),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
    }),
    errors = [];
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => {
    window.forge.load(d);
    const lab = (window.lab = window.forge.openMeshEditor("study"));
    lab.setLiveMirror({
      axis: "x",
      side: "positive",
      offset: 0,
      tolerance: 0.00001,
    });
    for (const [vertex, position] of [
      [2, [0.65, 1.2, 0.15]],
      [3, [0, 1.2, 0.15]],
      [6, [0.65, 1.2, 0.85]],
      [7, [0, 1.2, 0.85]],
    ])
      lab.operate({ action: "setVertex", vertex, position });
    lab.select("vertex", [6]);
    lab.setView("front");
  }, source);
  async function savePng(name) {
    const png = await page.evaluate(() => window.lab.screenshot());
    await fs.writeFile(
      `${out}/${name}.png`,
      Buffer.from(png.split(",")[1], "base64"),
    );
  }
  await savePng("mirror-front");
  await page.evaluate(() => window.lab.setSubdivision({ levels: 2 }));
  await savePng("front");
  await page.evaluate(() =>
    window.lab.operate({
      op: "setModifiers",
      modifiers: window.lab
        .getDraft()
        .modifiers.map((m) => ({ ...m, enabled: false })),
    }),
  );
  await savePng("source-front");
  await page.evaluate(() => window.lab.undo());
  for (const view of ["perspective", "side", "top"]) {
    await page.evaluate((view) => window.lab.setView(view), view);
    await savePng(view);
  }
  await page.evaluate(() => window.lab.setView("perspective"));
  await page.locator("#mesh-subdivision").scrollIntoViewIfNeeded();
  await page
    .locator("#mesh-dialog")
    .screenshot({ path: `${out}/workshop.png` });
  const applied = await page.evaluate(() => window.lab.apply());
  assert.equal(applied.applied, true, applied.error);
  const result = await page.evaluate(() => window.forge.getDocument());
  await fs.writeFile(
    `${out}/study.graph.json`,
    JSON.stringify(result, null, 2),
  );
  await fs.writeFile(
    `${out}/topology.json`,
    JSON.stringify(auditMesh(evaluateMeshGeometry(result.nodes[0])), null, 2),
  );
  const bytes = await page.evaluate(async () => {
    const { createGLB } = await import("/src/scene.js");
    return Array.from(
      new Uint8Array(await createGLB(window.forge.getDocument())),
    );
  });
  await fs.writeFile(`${out}/study.glb`, Buffer.from(bytes));
  const history = await page.evaluate(() => {
    const after = window.forge.getDocument().review.landmarks.tip.vertex;
    window.forge.undo();
    const undo = window.forge.getDocument();
    window.forge.redo();
    return { after, undo, redo: window.forge.getDocument() };
  });
  assert.deepEqual(history.undo, source);
  assert.deepEqual(history.redo, result);
  assert.ok(result.nodes[0].geometry.indices.includes(history.after));
  assert.equal(result.nodes[0].geometry.positions.length, 24);
  assert.equal(result.nodes[0].modifiers[0].type, "mirror");
  assert.equal(result.nodes[0].modifiers[1].type, "subdivision");
  const audit = auditMesh(evaluateMeshGeometry(result.nodes[0]));
  for (const key of [
    "boundaryEdges",
    "nonManifoldEdges",
    "windingConflicts",
    "degenerate",
    "normalErrors",
    "inwardNormals",
  ])
    assert.equal(audit[key], 0, key);
  assert.equal(audit.triangles, 320);
  assert.equal(audit.mirrorMatch, 1);
  await page.addStyleTag({
    content:
      ".viewport{position:fixed!important;inset:0!important;z-index:100;width:100vw;height:100vh}.viewport>:not(canvas){display:none!important}",
  });
  const views = await page.evaluate(() => {
    window.forge.select(null);
    window.forge.setStage({ fit: true });
    return window.forge.captureViews();
  });
  for (const v of views)
    await fs.writeFile(
      `${out}/clean-${v.preset}.png`,
      Buffer.from(v.png.split(",")[1], "base64"),
    );
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Subdivision review artifacts → ${out}`);
} finally {
  await browser?.close();
  await server.close();
}
