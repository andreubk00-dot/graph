// Real viewport captures of the engineering bench; no artistic character assets.
import fs from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
const out = process.argv[2] ?? "/tmp/graph-rig-review";
await fs.mkdir(out, { recursive: true });
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
    viewport: { width: 1440, height: 960 },
  });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      request((time) => {
        if (!window.__capturePaused) callback(time);
      });
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.forge);
  await page.locator("#rig-study").click();
  await page.waitForFunction(() =>
    window.forge.getDocument().name.startsWith("Стенд"),
  );
  await page.evaluate(() => {
    window.__capturePaused = true;
    window.forge.seek(1);
    window.forge.setShading("weights");
  });
  await page.screenshot({ path: `${out}/editor.png` });
  await page.addStyleTag({
    content:
      ".viewport{position:fixed!important;inset:0!important;z-index:100;width:100vw;height:100vh}.viewport>:not(canvas){display:none!important}",
  });
  await page.setViewportSize({ width: 800, height: 800 });
  const frames = await page.evaluate(() => {
    const f = window.forge;
    f.select(null);
    f.seek(0);
    f.setView({ preset: "front" });
    const view = f.getView();
    f.select("joint-hinge");
    const result = [];
    for (const [label, time, surface] of [
      ["rest", 0, "material"],
      ["bend", 1, "material"],
      ["weights", 1, "weights"],
    ]) {
      f.seek(time);
      f.setView({
        camera: view.camera,
        target: view.target,
        fov: view.fov,
        fit: false,
      });
      f.setShading(surface);
      result.push({ label, png: f.screenshot({ rig: label === "weights" }) });
    }
    return { frames: result, report: f.auditRig(), source: f.getDocument() };
  });
  for (const f of frames.frames)
    await fs.writeFile(
      `${out}/${f.label}.png`,
      Buffer.from(f.png.split(",")[1], "base64"),
    );
  await fs.writeFile(
    `${out}/report.json`,
    JSON.stringify(frames.report, null, 2),
  );
  await fs.writeFile(`${out}/bench.graph.json`, JSON.stringify(frames.source));
  const failed = await page.evaluate(() => {
    window.forge.setClip("overbend");
    return window.forge.auditRig();
  });
  await fs.writeFile(
    `${out}/intentional-violation.json`,
    JSON.stringify(failed, null, 2),
  );
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Rig review → ${out}`);
} finally {
  await browser?.close();
  await server.close();
}
