// Capture actual Graph Forge frames, with a fixed camera across the whole run cycle.
import fs from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
const doc = JSON.parse(
  await fs.readFile("examples/cinder-demon.graph.json", "utf8"),
);
const server = await createServer({
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(60000);
  // Pause only the editor's continuous RAF during deterministic frame capture.
  // forge.seek and forge.screenshot still run the actual pose and renderer code.
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      request((time) => {
        if (!window.__forgeCapturePaused) callback(time);
      });
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.forge);
  await page.evaluate((doc) => {
    window.forge.load(doc);
    window.forge.setClip("run");
    window.forge.select(null);
    window.forge.seek(0.08);
    window.forge.focus();
  }, doc);
  await page.waitForTimeout(200);
  await page.screenshot({ path: "examples/cinder-demon-editor.png" });
  await page.setViewportSize({ width: 768, height: 864 });
  await page.addStyleTag({
    content:
      ".viewport {position:fixed!important;inset:0!important;z-index:100;width:100vw;height:100vh} .viewport > :not(canvas){display:none!important}",
  });
  await page.evaluate(() => document.querySelector("#grid").click());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.forge.focus());
  // +Z projects to the right from this camera, matching the model's facing.
  await page.evaluate(() => {
    window.forge.setStage({ groundY: 0 });
    window.forge.setView({ camera: [-6, 3.1, 5], target: [0, 1.6, 0] });
  });
  const view = await page.evaluate(() => window.forge.getView());
  console.log(
    "Camera",
    JSON.stringify({ camera: view.camera, target: view.target }),
  );
  await page.evaluate(() => {
    window.__forgeCapturePaused = true;
  });
  await page.waitForTimeout(200);
  await fs.mkdir("/tmp/cinder-frames", { recursive: true });
  for (let i = 0; i < 32; i++) {
    await page.evaluate((t) => window.forge.seek(t), (0.88 * i) / 32);
    const data = await page.evaluate(() => window.forge.screenshot());
    const bytes = Buffer.from(data.split(",")[1], "base64");
    await fs.writeFile(
      `/tmp/cinder-frames/${String(i).padStart(3, "0")}.png`,
      bytes,
    );
    if (i === 3) await fs.writeFile("examples/cinder-demon.png", bytes);
    if (i % 8 === 0) console.log(`Rendered ${i + 1}/32`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Saved editor screenshot, clean preview and 32 animation frames.",
  );
} finally {
  await browser?.close();
  await server.close();
}
