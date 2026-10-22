// Actual editor/GLB review of technical topology operations, not a character asset.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { emptyDocument, makeNode } from "../src/document.js";
import { closedBox } from "../tests/fixtures/mesh-study.js";
import { auditMesh } from "../src/mesh-audit.js";
const out = process.argv[2] ?? "/tmp/graph-topology-review";
await fs.mkdir(out, { recursive: true });
const source = emptyDocument();
source.name = "Topology operations · technical study";
source.nodes = [
  makeNode("mesh", {
    id: "study",
    position: [0, 0, 0],
    color: "#a5d7ce",
    geometry: closedBox(),
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
    lab.operate({
      action: "bevelVertex",
      vertex: 6,
      width: 0.2,
      landmarkPolicy: "remap",
    });
    lab.operate({
      action: "splitEdges",
      selection: { mode: "edge", ids: [0] },
      fraction: 0.35,
    });
    const midpoint = lab.getDraft().geometry.positions.length / 3 - 1;
    lab.operate({
      action: "mergeVertices",
      selection: { mode: "vertex", ids: [0, midpoint] },
      target: 0,
    });
    lab.select("vertex", [lab.getDraft().landmarks.tip.vertex]);
    lab.setView("perspective");
  }, source);
  await page.locator("#mesh-bevel-width").fill(".2");
  await page.locator("#mesh-remap-landmarks").check();
  await page.locator("#mesh-bevel-vertex").scrollIntoViewIfNeeded();
  await page
    .locator("#mesh-dialog")
    .screenshot({ path: `${out}/workshop.png` });
  for (const view of ["perspective", "front", "side", "top"]) {
    const png = await page.evaluate((view) => {
      window.lab.setView(view);
      return window.lab.screenshot();
    }, view);
    await fs.writeFile(
      `${out}/${view}.png`,
      Buffer.from(png.split(",")[1], "base64"),
    );
  }
  const applied = await page.evaluate(() => window.lab.apply());
  assert.equal(applied.applied, true, applied.error);
  const result = await page.evaluate(() => window.forge.getDocument());
  await fs.writeFile(
    `${out}/study.graph.json`,
    JSON.stringify(result, null, 2),
  );
  await fs.writeFile(
    `${out}/topology.json`,
    JSON.stringify(auditMesh(result.nodes[0].geometry), null, 2),
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
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Topology review artifacts → ${out}`);
} finally {
  await browser?.close();
  await server.close();
}
