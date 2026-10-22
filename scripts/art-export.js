import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateArt, frameSVG } from "../src/art-document.js";
export async function exportArt(args) {
  const [source, target, mode] = args;
  if (!source || !target)
    throw new Error(
      "Usage: art-export <art.json> <output.png|svg> [frame-number|--atlas]",
    );
  const doc = validateArt(JSON.parse(await readFile(source, "utf8"))),
    atlas = mode === "--atlas",
    frame = atlas ? 0 : Number(mode ?? 0);
  if (!Number.isInteger(frame) || !doc.frames[frame])
    throw new Error("Frame index is outside the animation");
  await mkdir(dirname(resolve(target)), { recursive: true });
  if (extname(target).toLowerCase() === ".svg") {
    if (atlas) throw new Error("Use PNG for an atlas");
    await writeFile(target, frameSVG(doc, frame));
    return;
  }
  if (extname(target).toLowerCase() !== ".png")
    throw new Error("2D export supports PNG and SVG");
  const { createServer } = await import("vite"),
    { chromium } = await import("@playwright/test");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const server = await createServer({
    root,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "art-render-page",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url !== "/__art_render") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              '<!doctype html><script type="module">import {artPNG,artAtlas} from "/src/art-render.js";window.artExporter={artPNG,artAtlas};</script>',
            );
          });
        },
      },
    ],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(server.resolvedUrls.local[0] + "__art_render");
    await page.waitForFunction(() => window.artExporter);
    const result = await page.evaluate(
      ({ doc, atlas, frame }) =>
        atlas
          ? window.artExporter.artAtlas(doc)
          : { png: window.artExporter.artPNG(doc, frame) },
      { doc, atlas, frame },
    );
    await writeFile(target, Buffer.from(result.png.split(",")[1], "base64"));
    if (atlas) {
      result.metadata.meta.image = basename(target);
      await writeFile(
        target.replace(/\.png$/i, ".json"),
        JSON.stringify(result.metadata, null, 2),
      );
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}
