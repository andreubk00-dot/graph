// Real editor captures of a technical topology bench, not a character asset.
import fs from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { emptyDocument, makeNode } from "../src/document.js";
import { halfBox } from "../tests/fixtures/mesh-study.js";
import { auditMesh } from "../src/mesh-audit.js";
const out = process.argv[2] ?? "/tmp/graph-mesh-workshop";
await fs.mkdir(out, { recursive: true });
const source = emptyDocument();
source.name = "Mesh workshop · technical topology bench";
source.nodes = [
  makeNode("mesh", {
    id: "study",
    position: [0, 0, 0],
    color: "#9ccdc0",
    geometry: halfBox(),
  }),
];
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
  });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => {
    window.forge.load(d);
    window.lab = window.forge.openMeshEditor("study");
    window.lab.operate({ action: "mirror", axis: "x" });
    window.lab.operate({
      action: "extrude",
      selection: { mode: "face", ids: [6, 7] },
      delta: [0, 0.25, 0],
    });
    window.lab.select("face", [6, 7]);
    window.lab.fit();
  }, source);
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
  // A generated measurement grid provides a deterministic image-alignment test.
  const grid = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 400;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#15222b";
    ctx.fillRect(0, 0, 600, 400);
    ctx.strokeStyle = "#47635d";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 600; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 400);
      ctx.stroke();
    }
    for (let y = 0; y <= 400; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(600, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#d1bd8e";
    ctx.lineWidth = 3;
    ctx.strokeRect(60, 70, 480, 240);
    ctx.fillStyle = "#d1bd8e";
    ctx.font = "16px monospace";
    ctx.fillText("TECHNICAL ALIGNMENT GRID", 80, 45);
    ctx.fillText("2 m", 285, 350);
    return c.toDataURL("image/png");
  });
  await page.evaluate(() => {
    window.lab.setView("front");
    window.lab.select("vertex", []);
  });
  await page.locator("#mesh-reference-panel").evaluate((e) => (e.open = true));
  await page.locator("#mesh-reference-width").fill("2.5");
  await page.locator("#mesh-reference-opacity").fill(".65");
  await page.locator("#mesh-ry").fill(".625");
  await page
    .locator("#mesh-reference-file")
    .setInputFiles({
      name: "alignment-grid.png",
      mimeType: "image/png",
      buffer: Buffer.from(grid.split(",")[1], "base64"),
    });
  await page.waitForFunction(() => window.lab.getDraft().refs.length === 1);
  // Wait for decode/render: the API screenshot forces the actual render.
  const png = await page.evaluate(() => window.lab.screenshot());
  await fs.writeFile(
    `${out}/reference-front.png`,
    Buffer.from(png.split(",")[1], "base64"),
  );
  const applied = await page.evaluate(() => window.lab.apply());
  if (!applied.applied) throw new Error(applied.error);
  const doc = await page.evaluate(() => window.forge.getDocument());
  await fs.writeFile(`${out}/study.graph.json`, JSON.stringify(doc, null, 2));
  await fs.writeFile(
    `${out}/topology.json`,
    JSON.stringify(auditMesh(doc.nodes[0].geometry), null, 2),
  );
  const bytes = await page.evaluate(async () => {
    const { createGLB } = await import("/src/scene.js");
    return Array.from(
      new Uint8Array(await createGLB(window.forge.getDocument())),
    );
  });
  await fs.writeFile(`${out}/study.glb`, Buffer.from(bytes));
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Mesh workshop artifacts → ${out}`);
} finally {
  await browser?.close();
  await server.close();
}
