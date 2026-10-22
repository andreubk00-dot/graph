import { validateMotion } from "./locomotion.js";
// Portable 2D source format. Palette pixels are exact integer cells; vectors are explicit paths.
const clone = (v) => structuredClone(v),
  hex = (c) => typeof c === "string" && /^#[a-f\d]{6}([a-f\d]{2})?$/i.test(c);
const number = (x, a, b) =>
  typeof x === "number" && Number.isFinite(x) && x >= a && x <= b;
const integer = (x, a, b) => Number.isInteger(x) && number(x, a, b);
const label = (s) => typeof s === "string" && s.length > 0 && s.length <= 100;
function color(c) {
  if (c === "none" || hex(c)) return;
  if (
    !c ||
    !c.linear ||
    !Array.isArray(c.linear.from) ||
    !Array.isArray(c.linear.to) ||
    ![c.linear.from, c.linear.to].every(
      (p) => p.length === 2 && p.every((x) => number(x, -8192, 8192)),
    ) ||
    !Array.isArray(c.linear.stops) ||
    c.linear.stops.length < 2 ||
    c.linear.stops.length > 16
  )
    throw new Error("Invalid 2D fill");
  let last = -1;
  for (const s of c.linear.stops) {
    if (
      !Array.isArray(s) ||
      s.length !== 2 ||
      !number(s[0], 0, 1) ||
      s[0] < last ||
      !hex(s[1])
    )
      throw new Error("Invalid gradient stop");
    last = s[0];
  }
}
export function validateArt(input) {
  const d = clone(input);
  if (
    !d ||
    d.version !== 1 ||
    !["pixel", "vector"].includes(d.kind) ||
    !label(d.name) ||
    !integer(d.width, 1, d.kind === "pixel" ? 256 : 2048) ||
    !integer(d.height, 1, d.kind === "pixel" ? 256 : 2048)
  )
    throw new Error("Invalid 2D document or dimensions");
  if (!Array.isArray(d.frames) || !d.frames.length || d.frames.length > 64)
    throw new Error("2D animation needs 1–64 frames");
  if (
    d.kind === "pixel" &&
    (!Array.isArray(d.palette) ||
      d.palette.length < 2 ||
      d.palette.length > 256 ||
      !d.palette.every(hex) ||
      d.palette[0].toLowerCase() !== "#00000000")
  )
    throw new Error("Palette index 0 must be transparent #00000000");
  let cells = 0,
    paths = 0,
    commands = 0;
  const frameIds = new Set();
  for (const f of d.frames) {
    if (
      !label(f.id) ||
      frameIds.has(f.id) ||
      !label(f.name) ||
      !integer(f.duration, 10, 10000) ||
      !Array.isArray(f.layers) ||
      !f.layers.length ||
      f.layers.length > 16
    )
      throw new Error("Invalid 2D frame");
    frameIds.add(f.id);
    const ids = new Set();
    for (const l of f.layers) {
      if (
        !label(l.id) ||
        ids.has(l.id) ||
        !label(l.name) ||
        typeof l.visible !== "boolean" ||
        !number(l.opacity, 0, 1)
      )
        throw new Error("Invalid 2D layer");
      ids.add(l.id);
      if (d.kind === "pixel") {
        if (
          !Array.isArray(l.pixels) ||
          l.pixels.length !== d.width * d.height ||
          !l.pixels.every((x) => integer(x, 0, d.palette.length - 1))
        )
          throw new Error("Invalid palette pixels");
        cells += l.pixels.length;
        if (cells > 4194304)
          throw new Error("2D project exceeds 4 million pixel cells");
      } else {
        if (!Array.isArray(l.paths)) throw new Error("Invalid vector paths");
        paths += l.paths.length;
        for (const p of l.paths) {
          if (!p || !Array.isArray(p.d) || !p.d.length || p.d[0][0] !== "M")
            throw new Error("Vector path must begin with M");
          color(p.fill ?? "none");
          if (p.stroke !== undefined && !hex(p.stroke))
            throw new Error("Invalid vector stroke");
          if (p.strokeWidth !== undefined && !number(p.strokeWidth, 0.01, 256))
            throw new Error("Invalid stroke width");
          if (p.opacity !== undefined && !number(p.opacity, 0, 1))
            throw new Error("Invalid path opacity");
          if (
            p.fillRule !== undefined &&
            !["nonzero", "evenodd"].includes(p.fillRule)
          )
            throw new Error("Invalid path fill rule");
          for (const c of p.d) {
            const sizes = { M: 3, L: 3, C: 7, Q: 5, Z: 1 };
            if (
              !Array.isArray(c) ||
              c.length !== sizes[c[0]] ||
              !c.slice(1).every((x) => number(x, -8192, 8192))
            )
              throw new Error("Invalid vector path command");
          }
          commands += p.d.length;
        }
      }
    }
  }
  if (paths > 4096 || commands > 65536)
    throw new Error("Vector document exceeds path budget");
  validateMotion(d.motion, d);
  return d;
}
export function emptyArt(kind = "pixel", width = 64, height = 64) {
  const limit = kind === "pixel" ? 256 : 2048;
  if (
    !["pixel", "vector"].includes(kind) ||
    !integer(width, 1, limit) ||
    !integer(height, 1, limit)
  )
    throw new Error("Invalid 2D canvas dimensions");
  return validateArt({
    version: 1,
    kind,
    name: kind === "pixel" ? "Pixel asset" : "Vector asset",
    width,
    height,
    palette:
      kind === "pixel"
        ? [
            "#00000000",
            "#18202fff",
            "#526383ff",
            "#93bac2ff",
            "#e7f4e4ff",
            "#efb84aff",
            "#bb6439ff",
            "#743d52ff",
          ]
        : undefined,
    frames: [
      {
        id: "frame-1",
        name: "Frame 1",
        duration: 100,
        layers: [
          {
            id: "layer-1",
            name: "Artwork",
            visible: true,
            opacity: 1,
            ...(kind === "pixel"
              ? { pixels: Array(width * height).fill(0) }
              : { paths: [] }),
          },
        ],
      },
    ],
  });
}
export function rgba(c) {
  const h = c.slice(1);
  return [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16))
    .concat(h.length === 8 ? parseInt(h.slice(6), 16) : 255);
}
export function compositePixels(doc, frame = 0) {
  const d = validateArt(doc);
  if (d.kind !== "pixel" || !d.frames[frame])
    throw new Error("Expected a pixel frame");
  const out = new Uint8ClampedArray(d.width * d.height * 4),
    palette = d.palette.map(rgba);
  for (const l of d.frames[frame].layers)
    if (l.visible && l.opacity)
      for (let i = 0; i < l.pixels.length; i++) {
        const c = palette[l.pixels[i]],
          a = (c[3] / 255) * l.opacity,
          b = out[i * 4 + 3] / 255,
          alpha = a + b * (1 - a);
        if (!a) continue;
        for (let k = 0; k < 3; k++)
          out[i * 4 + k] = (c[k] * a + out[i * 4 + k] * b * (1 - a)) / alpha;
        out[i * 4 + 3] = alpha * 255;
      }
  return out;
}
export function paintLine(
  pixels,
  width,
  height,
  from,
  to,
  index,
  { size = 1, mirror = false } = {},
) {
  if (
    !Array.isArray(pixels) ||
    pixels.length !== width * height ||
    ![...from, ...to].every((x) =>
      integer(x, 0, Math.max(width, height) - 1),
    ) ||
    from[0] >= width ||
    to[0] >= width ||
    from[1] >= height ||
    to[1] >= height ||
    !integer(index, 0, 255) ||
    !integer(size, 1, 64)
  )
    throw new Error("Invalid pixel stroke");
  let [x, y] = from;
  const [tx, ty] = to,
    dx = Math.abs(tx - x),
    dy = -Math.abs(ty - y),
    sx = x < tx ? 1 : -1,
    sy = y < ty ? 1 : -1;
  let error = dx + dy;
  const dot = (x, y) => {
    for (
      let j = -Math.floor((size - 1) / 2);
      j <= Math.ceil((size - 1) / 2);
      j++
    )
      for (
        let i = -Math.floor((size - 1) / 2);
        i <= Math.ceil((size - 1) / 2);
        i++
      ) {
        const a = x + i,
          b = y + j;
        if (a >= 0 && b >= 0 && a < width && b < height) {
          pixels[b * width + a] = index;
          if (mirror) pixels[b * width + (width - 1 - a)] = index;
        }
      }
  };
  for (;;) {
    dot(x, y);
    if (x === tx && y === ty) break;
    const e = error * 2;
    if (e >= dy) {
      error += dy;
      x += sx;
    }
    if (e <= dx) {
      error += dx;
      y += sy;
    }
  }
}
export function floodFill(pixels, width, height, x, y, index) {
  if (
    !integer(x, 0, width - 1) ||
    !integer(y, 0, height - 1) ||
    pixels.length !== width * height ||
    !integer(index, 0, 255)
  )
    throw new Error("Invalid pixel fill");
  const source = pixels[y * width + x];
  if (source === index) return;
  const queue = [y * width + x];
  pixels[queue[0]] = index;
  for (let q = 0; q < queue.length; q++) {
    const a = queue[q],
      px = a % width,
      py = Math.floor(a / width);
    for (const n of [
      px > 0 ? a - 1 : -1,
      px < width - 1 ? a + 1 : -1,
      py > 0 ? a - width : -1,
      py < height - 1 ? a + width : -1,
    ])
      if (n >= 0 && pixels[n] === source) {
        pixels[n] = index;
        queue.push(n);
      }
  }
}
const escape = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export function frameSVG(input, frame = 0) {
  const d = validateArt(input);
  if (d.kind !== "vector" || !d.frames[frame])
    throw new Error("Expected a vector frame");
  let defs = "",
    serial = 0;
  const body = d.frames[frame].layers
    .filter((l) => l.visible)
    .map(
      (l) =>
        `<g opacity="${l.opacity}">${l.paths
          .map((p) => {
            let fill = p.fill ?? "none";
            if (typeof fill === "object") {
              const id = `gradient-${serial++}`,
                g = fill.linear;
              defs += `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${g.from[0]}" y1="${g.from[1]}" x2="${g.to[0]}" y2="${g.to[1]}">${g.stops.map(([t, c]) => `<stop offset="${t}" stop-color="${c}"/>`).join("")}</linearGradient>`;
              fill = `url(#${id})`;
            }
            return `<path d="${p.d.map((c) => c.join(" ")).join(" ")}" fill="${fill}" stroke="${p.stroke ?? "none"}" stroke-width="${p.strokeWidth ?? 1}" opacity="${p.opacity ?? 1}" fill-rule="${p.fillRule ?? "nonzero"}" stroke-linejoin="round" stroke-linecap="round"/>`;
          })
          .join("")}</g>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}"><title>${escape(d.name)}</title><defs>${defs}</defs>${body}</svg>`;
}
export function atlasLayout(input, { columns = 8, padding = 1 } = {}) {
  const d = validateArt(input);
  if (!integer(columns, 1, 64) || !integer(padding, 0, 32))
    throw new Error("Invalid atlas layout");
  columns = Math.min(columns, d.frames.length);
  const rows = Math.ceil(d.frames.length / columns),
    width = columns * (d.width + padding * 2),
    height = rows * (d.height + padding * 2);
  if (width > 8192 || height > 8192)
    throw new Error("Atlas exceeds 8192 pixels");
  return {
    width,
    height,
    frames: d.frames.map((f, i) => ({
      filename: `${f.name}-${i}.png`,
      frame: {
        x: (i % columns) * (d.width + padding * 2) + padding,
        y: Math.floor(i / columns) * (d.height + padding * 2) + padding,
        w: d.width,
        h: d.height,
      },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: d.width, h: d.height },
      sourceSize: { w: d.width, h: d.height },
      duration: f.duration,
    })),
    meta: {
      ...(d.motion ? { motion: clone(d.motion) } : {}),
      app: "Graph Forge",
      version: "1",
      image: `${d.name}-atlas.png`,
      format: "RGBA8888",
      size: { w: width, h: height },
      scale: "1",
      frameTags: [
        {
          name: "Animation",
          from: 0,
          to: d.frames.length - 1,
          direction: "forward",
        },
      ],
      kind: d.kind,
      padding,
      origin: "top-left",
    },
  };
}

export function flipArtHorizontal(input) {
  const d = validateArt(input);
  for (const f of d.frames)
    for (const l of f.layers) {
      if (d.kind === "pixel") {
        for (let y = 0; y < d.height; y++) {
          const row = l.pixels.slice(y * d.width, (y + 1) * d.width).reverse();
          l.pixels.splice(y * d.width, d.width, ...row);
        }
      } else
        for (const p of l.paths) {
          p.d = p.d.map(([op, ...v]) => [
            op,
            ...v.map((x, i) => (i % 2 ? x : d.width - x)),
          ]);
          if (p.fill?.linear) {
            p.fill.linear.from[0] = d.width - p.fill.linear.from[0];
            p.fill.linear.to[0] = d.width - p.fill.linear.to[0];
          }
        }
    }
  if (d.motion) {
    d.motion.facing = d.motion.facing === "right" ? "left" : "right";
    for (const f of d.motion.feet)
      f.points = f.points.map(([x, y]) => [
        d.width - (d.kind === "pixel" ? 1 : 0) - x,
        y,
      ]);
  }
  return validateArt(d);
}
