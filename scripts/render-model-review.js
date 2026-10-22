// Reproducible diagnostic artifacts from real transforms and the actual lab UI.
// The scene is a block trajectory bench, deliberately not an artistic character.
import fs from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { motionStudy } from "../src/review-fixture.js";
import { auditMeasurements, auditLocomotion } from "../src/model-review.js";
const out = process.argv[2] ?? "/tmp/graph-model-review";
await fs.mkdir(out, { recursive: true });
const doc = motionStudy();
await fs.writeFile(`${out}/study.graph.json`, JSON.stringify(doc));
await fs.writeFile(
  `${out}/measurements.json`,
  JSON.stringify(auditMeasurements(doc), null, 2),
);
for (const c of doc.clips) {
  const options = { clip: c.id };
  if (c.id === "in-place")
    Object.assign(options, { mode: "inPlace", distance: 1 });
  await fs.writeFile(
    `${out}/${c.id}.json`,
    JSON.stringify(auditLocomotion(doc, options), null, 2),
  );
}
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
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      request((time) => {
        if (!window.__capturePaused) callback(time);
      });
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.forge);
  await page.evaluate((d) => {
    const f = window.forge;
    f.load(d);
    f.select(null);
    f.setClip("travel");
    f.setStage({ groundY: 0 });
    f.setReviewVisible(true);
    f.setView({ camera: [-1.5, 1.3, 2.1], target: [0, 0.1, 0.4], fit: false });
    f.openReview().inspect();
  }, doc);
  await page
    .locator("#model-review-dialog")
    .screenshot({ path: `${out}/lab.png` });
  const chart = await page
    .locator("#review-motion-chart")
    .evaluate((c) => c.toDataURL("image/png"));
  await fs.writeFile(
    `${out}/motion-chart.png`,
    Buffer.from(chart.split(",")[1], "base64"),
  );
  await page.locator("#review-clip").selectOption("sliding");
  await page.locator("#review-run").click();
  await page
    .locator("#model-review-dialog")
    .screenshot({ path: `${out}/sliding-lab.png` });
  await page.locator("#review-close").click();
  await page.addStyleTag({
    content:
      ".viewport{position:fixed!important;inset:0!important;z-index:100;width:100vw;height:100vh}.viewport>:not(canvas){display:none!important}",
  });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.evaluate(() => (window.__capturePaused = true));
  for (const time of [0, 0.7, 1.4]) {
    const png = await page.evaluate((t) => {
      window.forge.seek(t);
      return window.forge.screenshot({ review: true });
    }, time);
    await fs.writeFile(
      `${out}/pose-${time}.png`,
      Buffer.from(png.split(",")[1], "base64"),
    );
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Model review artifacts → ${out}`);
} finally {
  await browser?.close();
  await server.close();
}
