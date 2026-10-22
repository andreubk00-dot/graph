#!/usr/bin/env node
import { importOBJ } from "../src/obj-import.js";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  starterDocument,
  emptyDocument,
  validateDocument,
  applyCommands,
  clipDuration,
} from "../src/document.js";
import { createGLB } from "../src/scene.js";

// GLTFExporter needs FileReader for its binary buffers. No DOM or GPU is needed.
if (!globalThis.FileReader)
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        (result) => {
          this.result = result;
          this.onloadend?.();
        },
        (error) => this.onerror?.(error),
      );
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        (result) => {
          this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
          this.onloadend?.();
        },
        (error) => this.onerror?.(error),
      );
    }
  };
const [command, ...args] = process.argv.slice(2);
const read = async (file) =>
  validateDocument(JSON.parse(await readFile(file, "utf8")));
async function output(file, data) {
  await mkdir(dirname(resolve(file)), { recursive: true });
  await writeFile(file, data);
  console.log(resolve(file));
}
try {
  switch (command) {
    case "audit-model": {
      if (args.length < 1 || args.length > 2)
        throw new Error("Usage: audit-model <project.json> [clip-id]");
      const { auditMeasurements, auditLocomotion } = await import(
          "../src/model-review.js"
        ),
        doc = await read(args[0]),
        measurements = auditMeasurements(doc),
        motion = auditLocomotion(doc, { clip: args[1] }),
        issues = [
          ...measurements.issues,
          ...(motion.available ? motion.issues : []),
        ];
      console.log(JSON.stringify({ measurements, motion, issues }, null, 2));
      if (issues.length) process.exitCode = 2;
      break;
    }
    case "audit-rig": {
      if (args.length < 1 || args.length > 2)
        throw new Error("Usage: audit-rig <project.json> [clip-id]");
      const { auditRig } = await import("../src/rig-audit.js");
      const report = auditRig(await read(args[0]), { clip: args[1] ?? null });
      console.log(JSON.stringify(report, null, 2));
      if (report.issues.length) process.exitCode = 2;
      break;
    }
    case "art-export": {
      const { exportArt } = await import("./art-export.js");
      await exportArt(args);
      break;
    }
    case "sculpt": {
      if (args.length !== 2)
        throw new Error("Usage: sculpt <recipe.json> <output.graph.json>");
      const recipe = JSON.parse(await readFile(args[0], "utf8"));
      const doc = applyCommands(emptyDocument(), [
        {
          op: "sculpt",
          id: "surface",
          name: basename(args[0]),
          position: [0, 0, 0],
          recipe,
        },
      ]);
      await output(args[1], JSON.stringify(doc));
      break;
    }
    case "new":
      if (!args[0]) throw new Error("Usage: new <project.json> [--empty]");
      await output(
        args[0],
        JSON.stringify(
          args.includes("--empty") ? emptyDocument() : starterDocument(),
          null,
          2,
        ),
      );
      break;
    case "validate": {
      if (!args[0]) throw new Error("Usage: validate <project.json>");
      const doc = await read(args[0]);
      console.log(
        `Valid: ${doc.name} · ${doc.nodes.length} objects · ${doc.duration}s · ${doc.fps} FPS`,
      );
      break;
    }
    case "apply": {
      if (args.length !== 3)
        throw new Error(
          "Usage: apply <project.json> <commands.json> <output.json>",
        );
      const doc = applyCommands(
        await read(args[0]),
        JSON.parse(await readFile(args[1], "utf8")),
      );
      await output(args[2], JSON.stringify(doc, null, 2));
      break;
    }
    case "import-obj": {
      if (args.length !== 2)
        throw new Error("Usage: import-obj <model.obj> <output.graph.json>");
      if ((await stat(args[0])).size > 10 * 1024 * 1024)
        throw new Error("OBJ must be at most 10 MB");
      const result = importOBJ(await readFile(args[0], "utf8"), {
        name: basename(args[0]).replace(/\.obj$/i, ""),
      });
      await output(args[1], JSON.stringify(result.document, null, 2));
      for (const warning of result.warnings) console.warn(warning);
      break;
    }
    case "export": {
      if (args.length !== 2)
        throw new Error("Usage: export <project.json> <output.glb>");
      await output(args[1], Buffer.from(await createGLB(await read(args[0]))));
      break;
    }
    case "render": {
      if (args.length < 2)
        throw new Error(
          "Usage: render <project.json> <output.png> [time] [clip-id]",
        );
      const doc = await read(args[0]),
        time = Number(args[2] || 0),
        clip = args[3] ?? null;
      if (!Number.isFinite(time) || time < 0 || time > clipDuration(doc, clip))
        throw new Error("Render time must be inside the animation duration");
      const { chromium } = await import("@playwright/test");
      const { createServer } = await import("vite");
      const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
      const server = await createServer({
        root,
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
        await page.goto(server.resolvedUrls.local[0]);
        await page.waitForFunction(() => window.forge);
        await page.evaluate(
          ({ doc, time, clip }) => {
            window.forge.load(doc);
            window.forge.select(null);
            window.forge.setClip(clip);
            window.forge.seek(time);
            window.forge.focus();
          },
          { doc, time, clip },
        );
        await page.waitForTimeout(150);
        const data = await page.evaluate(() => window.forge.screenshot());
        await output(args[1], Buffer.from(data.split(",")[1], "base64"));
      } finally {
        await browser?.close();
        await server.close();
      }
      break;
    }
    default:
      console.log(
        "Graph Forge\n\n  new <project.json> [--empty]\n  validate <project.json>\n  audit-rig <project.json> [clip-id]\n  audit-model <project.json> [clip-id]\n  apply <project.json> <commands.json> <output.json>\n  sculpt <recipe.json> <output.graph.json>\n  art-export <art.json> <output.png|svg> [frame-number|--atlas]\n  import-obj <model.obj> <output.graph.json>\n  export <project.json> <output.glb>\n  render <project.json> <output.png> [time] [clip-id]",
      );
      if (command) process.exitCode = 1;
  }
} catch (error) {
  console.error(`Forge: ${error.message}`);
  process.exitCode = 1;
}
