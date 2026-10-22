// Reproducible captures from the real editor API, with no manual camera gestures.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { ranger } from "../src/art-examples.js";
const output = process.argv[2] || "/tmp/graph-quality";
await fs.mkdir(output, { recursive: true });
const server = await createServer({
  root: process.cwd(),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
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
  const page = await browser.newPage({ viewport: { width: 960, height: 900 } });
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
  await page.evaluate(() => (window.__capturePaused = true));
  await page.addStyleTag({
    content:
      ".viewport{position:fixed!important;inset:0!important;z-index:100;width:100vw;height:100vh}.viewport>:not(canvas){display:none!important}",
  });
  const doc = JSON.parse(
    await fs.readFile("examples/asterion.graph.json", "utf8"),
  );
  const views = await page.evaluate((d) => {
    const f = window.forge;
    f.load(d);
    f.select(null);
    f.setStage({ fit: true });
    if (document.querySelector("#grid").classList.contains("active"))
      document.querySelector("#grid").click();
    return [
      ...f.captureViews(),
      ...f
        .captureViews({ presets: ["front"], surface: "silhouette" })
        .map((v) => ({ ...v, preset: "silhouette" })),
    ];
  }, doc);
  for (const v of views)
    await fs.writeFile(
      `${output}/asterion-${v.preset}.png`,
      Buffer.from(v.png.split(",")[1], "base64"),
    );
  await fs.writeFile(
    `${output}/mesh-report.json`,
    JSON.stringify(await page.evaluate(() => window.forge.inspect()), null, 2),
  );
  console.log("Asterion: 4 views + silhouette");
  await page.evaluate((d) => {
    window.forge.openArt(d);
    window.__review = window.forgeArt.reviewMotion();
  }, ranger());
  await fs.mkdir(`${output}/ranger-motion`, { recursive: true });
  for (let i = 0; i < 80; i++) {
    const data = await page.evaluate(
      (t) => {
        window.__review.seek(t);
        return window.__review.capture();
      },
      1280 + i * 80,
    );
    await fs.writeFile(
      `${output}/ranger-motion/${String(i).padStart(3, "0")}.png`,
      Buffer.from(data.split(",")[1], "base64"),
    );
  }
  const frames = await page.evaluate(async (d) => {
    const { artPNG } = await import("/src/art-render.js");
    return d.frames.map((_, i) => artPNG(d, i));
  }, ranger());
  await fs.mkdir(`${output}/ranger-frames`, { recursive: true });
  for (let i = 0; i < frames.length; i++)
    await fs.writeFile(
      `${output}/ranger-frames/${i}.png`,
      Buffer.from(frames[i].split(",")[1], "base64"),
    );
  await fs.writeFile(
    `${output}/motion-report.json`,
    JSON.stringify(await page.evaluate(() => window.__review.report), null, 2),
  );
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Ranger: 80 review frames + 8 source frames → ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
