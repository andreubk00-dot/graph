import {
  validateArt,
  compositePixels,
  frameSVG,
  atlasLayout,
} from "./art-document.js";
export function renderArtFrame(ctx, input, frame = 0) {
  const d = validateArt(input);
  if (!d.frames[frame]) throw new Error("Frame not found");
  ctx.clearRect(0, 0, d.width, d.height);
  if (d.kind === "pixel") {
    ctx.putImageData(
      new ImageData(compositePixels(d, frame), d.width, d.height),
      0,
      0,
    );
    return;
  }
  for (const l of d.frames[frame].layers)
    if (l.visible)
      for (const p of l.paths) {
        ctx.save();
        ctx.globalAlpha = l.opacity * (p.opacity ?? 1);
        const path = new Path2D();
        for (const [op, ...v] of p.d) {
          if (op === "M") path.moveTo(...v);
          else if (op === "L") path.lineTo(...v);
          else if (op === "C") path.bezierCurveTo(...v);
          else if (op === "Q") path.quadraticCurveTo(...v);
          else path.closePath();
        }
        let fill = p.fill ?? "none";
        if (typeof fill === "object") {
          const g = fill.linear;
          fill = ctx.createLinearGradient(...g.from, ...g.to);
          g.stops.forEach(([t, c]) => fill.addColorStop(t, c));
        }
        if (fill !== "none") {
          ctx.fillStyle = fill;
          ctx.fill(path, p.fillRule ?? "nonzero");
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.strokeWidth ?? 1;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke(path);
        }
        ctx.restore();
      }
}
export function artPNG(input, frame = 0) {
  const doc = validateArt(input),
    canvas = document.createElement("canvas");
  canvas.width = doc.width;
  canvas.height = doc.height;
  renderArtFrame(canvas.getContext("2d"), doc, frame);
  return canvas.toDataURL("image/png");
}
export function artAtlas(input, options) {
  const doc = validateArt(input),
    layout = atlasLayout(doc, options),
    canvas = document.createElement("canvas"),
    frame = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  frame.width = doc.width;
  frame.height = doc.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  for (const [i, r] of layout.frames.entries()) {
    renderArtFrame(frame.getContext("2d"), doc, i);
    ctx.drawImage(frame, r.frame.x, r.frame.y);
  }
  return { png: canvas.toDataURL("image/png"), metadata: layout };
}
export { frameSVG };
