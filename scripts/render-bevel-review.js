// Real browser captures of a technical fixture; requires Chromium and localhost.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const out = resolve(process.argv[2] ?? "/tmp/graph-bevel-review");
await mkdir(out, { recursive: true });
const source = JSON.parse(await readFile(`${out}/source.graph.json`, "utf8"));
const commands = JSON.parse(await readFile(`${out}/commands.json`, "utf8"));
const expected = JSON.parse(await readFile(`${out}/study.graph.json`, "utf8"));
const server = await createServer({
  root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.forge);
  await page.evaluate(({ source, selection }) => {
    window.forge.load(source);
    window.lab = window.forge.openMeshEditor("study");
    window.lab.select(selection.mode, selection.ids);
    window.lab.setView("perspective");
  }, { source, selection: commands[0].selection });
  const savePNG = async (name, png) => writeFile(`${out}/${name}.png`, Buffer.from(png.split(",")[1], "base64"));
  await savePNG("before", await page.evaluate(() => window.lab.screenshot()));
  await page.locator("#mesh-edge-bevel-width").fill(String(commands[0].width));
  await page.locator("#mesh-edge-bevel-segments").fill(String(commands[0].segments));
  await page.locator("#mesh-remap-landmarks").check();
  await page.locator("#mesh-bevel-edge").click();
  assert.equal(await page.locator("#mesh-error").innerText(), "");
  await page.locator("#mesh-dialog").screenshot({ path: `${out}/workshop.png` });
  for (const view of ["front", "side", "top", "perspective"]) {
    const png = await page.evaluate(view => {
      window.lab.setView(view);
      return window.lab.screenshot();
    }, view);
    await savePNG(view, png);
  }
  const applied = await page.evaluate(() => window.lab.apply());
  assert.equal(applied.applied, true, applied.error);
  assert.deepEqual(await page.evaluate(() => window.forge.getDocument()), expected);
  const history = await page.evaluate(() => {
    window.forge.undo();
    const undo = window.forge.getDocument();
    window.forge.redo();
    return { undo, redo: window.forge.getDocument() };
  });
  assert.deepEqual(history.undo, source);
  assert.deepEqual(history.redo, expected);
  await page.addStyleTag({ content: "#viewport { position: fixed; inset: 0; z-index: 10000; width: 100vw; height: 100vh; } #viewport > :not(canvas) { display: none; }" });
  const captures = await page.evaluate(async () => {
    window.forge.select(null);
    window.forge.setStage({ fit: true });
    return window.forge.captureViews();
  });
  for (const capture of captures) await savePNG(`clean-${capture.preset}`, capture.png);
  assert.deepEqual(errors, []);
  await writeFile(`${out}/browser-checks.json`, JSON.stringify({
    uiMatchesCommandBatch: true, undoRedo: true, pageErrors: errors,
    captures: captures.map(capture => capture.preset),
  }, null, 2) + "\n");
  console.log(`Bevel browser review artifacts → ${out}`);
} finally {
  await browser?.close();
  await server.close();
}
