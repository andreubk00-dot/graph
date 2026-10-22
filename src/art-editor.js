import { openMotionReview } from "./motion-review.js";
import {
  emptyArt,
  validateArt,
  paintLine,
  floodFill,
  frameSVG,
  flipArtHorizontal,
} from "./art-document.js";
import { renderArtFrame, artPNG, artAtlas } from "./art-render.js";
const clone = (v) => structuredClone(v);
function download(name, data, type = "application/json") {
  const a = document.createElement("a");
  a.download = name;
  a.href = data.startsWith("data:")
    ? data
    : URL.createObjectURL(new Blob([data], { type }));
  a.click();
  if (!data.startsWith("data:"))
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function openArtEditor(initial) {
  document.querySelector("#art-dialog")?.close();
  document.querySelector("#art-dialog")?.remove();
  let doc = emptyArt(),
    frame = 0,
    layer = 0,
    selectedColor = 1,
    playing = false,
    history = [],
    future = [],
    historyBytes = 0,
    stroke = null,
    lastTick = 0,
    elapsed = 0,
    raf = 0,
    recovery = null;
  if (initial) doc = validateArt(initial);
  else
    try {
      const saved = localStorage.getItem("graph-forge-art-project");
      if (saved) doc = validateArt(JSON.parse(saved));
    } catch {
      try {
        recovery = localStorage.getItem("graph-forge-art-project");
      } catch {}
    }
  const dialog = document.createElement("dialog");
  dialog.id = "art-dialog";
  dialog.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">GRAPH FORGE · 2D STUDIO</span><h2>Рисунок и пиксельная анимация</h2></div><button id="art-close" aria-label="Закрыть 2D">✕</button></div>
 <div class="art-toolbar"><button id="art-new-pixel">Новый Pixel</button><button id="art-new-vector">Новый 2D</button><button id="art-ranger">Пример: Ranger</button><button id="art-rune">Пример: Rune</button><button id="art-motion">Проверка бега</button><button id="art-flip">Отразить всю анимацию</button><button id="art-open">Открыть JSON / PNG</button><button id="art-save">Сохранить проект</button><button id="art-recovery" hidden>Повреждённая копия</button></div>
 <div class="art-workspace"><aside class="art-controls"><label>Название<input id="art-name" aria-label="Название 2D" maxlength="100"></label><div class="art-tools"><button id="art-undo" title="Ctrl+Z">↶</button><button id="art-redo" title="Ctrl+Shift+Z">↷</button><select id="art-tool" aria-label="Инструмент 2D"><option value="pencil">Перо</option><option value="erase">Ластик Pixel</option><option value="fill">Заливка Pixel</option></select></div><div class="art-tools"><label>Ширина<input id="art-width" type="number" min="1" max="2048" aria-label="Ширина 2D"></label><label>Высота<input id="art-height" type="number" min="1" max="2048" aria-label="Высота 2D"></label></div><button id="art-resize">Размер холста</button><label>Размер кисти<input id="art-size" type="number" min="1" max="64" value="1" aria-label="Размер кисти"></label><label><input id="art-mirror" type="checkbox"> Зеркало Pixel</label><label><input id="art-onion" type="checkbox"> Предыдущий кадр</label><div id="art-palette" class="art-palette"></div><label>Цвет<input id="art-color" type="color" value="#93bac2" aria-label="Цвет кисти"></label><button id="art-add-color">+ В палитру</button><hr><label>Слой<select id="art-layer" aria-label="Слой 2D"></select></label><label>Имя слоя<input id="art-layer-name" maxlength="100" aria-label="Имя слоя 2D"></label><label><input id="art-visible" type="checkbox"> Видимость слоя</label><label>Непрозрачность<input id="art-opacity" type="range" min="0" max="1" step=".05" aria-label="Непрозрачность слоя"></label><div class="art-tools"><button id="art-add-layer">+ Слой</button><button id="art-delete-layer">Удалить</button></div><div class="art-tools"><button id="art-lower">Ниже</button><button id="art-raise">Выше</button></div></aside>
 <div class="art-stage"><canvas id="art-canvas" aria-label="Холст 2D" tabindex="0"></canvas><div id="art-info"></div></div>
 <aside id="art-vector-controls" class="art-vector-controls"><label>Контуры выбранного слоя<textarea id="art-paths" spellcheck="false" aria-label="Векторные контуры"></textarea></label><button id="art-apply-paths">Применить контуры</button><button id="art-delete-path">Удалить последний контур</button><p>M/L/C/Q/Z, fill, stroke, strokeWidth, opacity; fill.linear — градиент.</p></aside></div>
 <div class="art-animation"><button id="art-play">▶ Играть</button><div id="art-frames" class="art-frames"></div><label>Кадр, мс<input id="art-duration" type="number" min="10" max="10000" step="10" aria-label="Длительность кадра"></label><button id="art-add-frame">+ Пустой кадр</button><button id="art-copy-frame">Копия кадра</button><button id="art-delete-frame">Удалить кадр</button></div>
 <div class="dialog-footer"><span id="art-status" role="status"></span><div class="art-tools"><button id="art-png">PNG кадра</button><button id="art-svg">SVG</button><button id="art-atlas" class="primary">PNG атласа</button><button id="art-metadata">JSON атласа</button></div></div><input id="art-file" type="file" accept=".json,.png" hidden>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s),
    canvas = $("#art-canvas"),
    ctx = canvas.getContext("2d");
  const current = () => doc.frames[frame].layers[layer],
    snapshot = () => ({ doc: clone(doc), frame, layer });
  function status(message, error = false) {
    $("#art-status").textContent = message;
    $("#art-status").classList.toggle("error", error);
  }
  function saveLocal() {
    try {
      localStorage.setItem("graph-forge-art-project", JSON.stringify(doc));
      status("Сохранено в браузере · отдельный проект 2D");
    } catch {
      status("Память браузера недоступна — сохрани проект в файл.", true);
    }
  }
  function remember(before) {
    history.push(before);
    historyBytes += JSON.stringify(before).length * 2;
    while (
      history.length > 1 &&
      (history.length > 24 || historyBytes > 33554432)
    )
      historyBytes -= JSON.stringify(history.shift()).length * 2;
    future = [];
  }
  function finish(before) {
    try {
      const next = validateArt(doc);
      if (JSON.stringify(before.doc) !== JSON.stringify(next)) {
        remember(before);
        doc = next;
        saveLocal();
      }
      render();
    } catch (e) {
      doc = before.doc;
      frame = before.frame;
      layer = before.layer;
      render();
      status(e.message, true);
    }
  }
  function edit(fn) {
    stop();
    const before = snapshot();
    try {
      fn();
      finish(before);
    } catch (e) {
      doc = before.doc;
      frame = before.frame;
      layer = before.layer;
      render();
      status(e.message, true);
    }
  }
  function load(input) {
    const next = validateArt(input);
    stop();
    remember(snapshot());
    doc = next;
    frame = layer = 0;
    selectedColor = 1;
    saveLocal();
    render();
    return clone(doc);
  }
  function stop() {
    playing = false;
    elapsed = 0;
    $("#art-play").textContent = "▶ Играть";
  }
  function undo(redo = false) {
    stop();
    const source = redo ? future : history,
      target = redo ? history : future;
    if (!source.length) return;
    target.push(snapshot());
    const s = source.pop();
    doc = s.doc;
    frame = s.frame;
    layer = s.layer;
    historyBytes = history.reduce(
      (n, s) => n + JSON.stringify(s).length * 2,
      0,
    );
    saveLocal();
    render();
  }
  function fitCanvas() {
    const stage = dialog.querySelector(".art-stage");
    const w = Math.max(20, stage.clientWidth - 24),
      h = Math.max(20, stage.clientHeight - 50);
    const scale = Math.min(
      w / doc.width,
      h / doc.height,
      512 / Math.max(doc.width, doc.height),
    );
    canvas.style.width = `${Math.max(1, doc.width * scale)}px`;
    canvas.style.height = `${Math.max(1, doc.height * scale)}px`;
  }
  const stageObserver = new ResizeObserver(fitCanvas);
  stageObserver.observe(dialog.querySelector(".art-stage"));
  function draw() {
    fitCanvas();
    if (canvas.width !== doc.width || canvas.height !== doc.height) {
      canvas.width = doc.width;
      canvas.height = doc.height;
    }
    canvas.style.imageRendering = doc.kind === "pixel" ? "pixelated" : "auto";
    canvas.style.aspectRatio = `${doc.width}/${doc.height}`;
    renderArtFrame(ctx, doc, frame);
    if ($("#art-onion").checked && frame > 0 && !playing) {
      const prev = document.createElement("canvas");
      prev.width = doc.width;
      prev.height = doc.height;
      renderArtFrame(prev.getContext("2d"), doc, frame - 1);
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.globalCompositeOperation = "destination-over";
      ctx.drawImage(prev, 0, 0);
      ctx.restore();
    }
    $("#art-info").textContent =
      `${doc.kind === "pixel" ? "PIXEL" : "VECTOR"} · ${doc.width} × ${doc.height} · ${frame + 1}/${doc.frames.length} · прозрачный фон`;
  }
  function render() {
    layer = Math.min(layer, doc.frames[frame].layers.length - 1);
    selectedColor = Math.min(selectedColor, (doc.palette?.length ?? 2) - 1);
    const l = current();
    draw();
    $("#art-width").value = doc.width;
    $("#art-height").value = doc.height;
    $("#art-name").value = doc.name;
    $("#art-duration").value = doc.frames[frame].duration;
    $("#art-layer").replaceChildren(
      ...doc.frames[frame].layers.map(
        (l, i) =>
          new Option(`${i + 1}. ${l.name}`, i, i === layer, i === layer),
      ),
    );
    $("#art-layer-name").value = l.name;
    $("#art-visible").checked = l.visible;
    $("#art-opacity").value = l.opacity;
    $("#art-vector-controls").hidden = doc.kind !== "vector";
    $("#art-svg").hidden = doc.kind !== "vector";
    $("#art-paths").value = JSON.stringify(l.paths ?? [], null, 2);
    $("#art-tool")
      .querySelectorAll("option")
      .forEach(
        (o) => (o.disabled = doc.kind === "vector" && o.value !== "pencil"),
      );
    if (doc.kind === "vector") $("#art-tool").value = "pencil";
    $("#art-palette").replaceChildren(
      ...(doc.palette ?? []).map((c, i) => {
        const b = document.createElement("button");
        b.title = `${i}: ${c}`;
        b.setAttribute("aria-label", `Цвет ${i}`);
        b.style.background = c;
        b.classList.toggle("active", i === selectedColor);
        b.onclick = () => {
          selectedColor = i;
          $("#art-color").value = c.slice(0, 7);
          render();
        };
        return b;
      }),
    );
    $("#art-frames").replaceChildren(
      ...doc.frames.map((f, i) => {
        const b = document.createElement("button");
        b.textContent = i + 1;
        b.title = `${f.name} · ${f.duration} мс`;
        b.classList.toggle("active", i === frame);
        b.onclick = () => {
          stop();
          frame = i;
          layer = Math.min(layer, f.layers.length - 1);
          render();
        };
        return b;
      }),
    );
    $("#art-undo").disabled = !history.length;
    $("#art-redo").disabled = !future.length;
    $("#art-delete-layer").disabled = doc.frames[frame].layers.length === 1;
    $("#art-delete-frame").disabled = doc.frames.length === 1;
    $("#art-lower").disabled = layer === 0;
    $("#art-raise").disabled = layer === doc.frames[frame].layers.length - 1;
  }
  function point(event) {
    const r = canvas.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(
          doc.width - 1,
          Math.floor(((event.clientX - r.left) * doc.width) / r.width),
        ),
      ),
      Math.max(
        0,
        Math.min(
          doc.height - 1,
          Math.floor(((event.clientY - r.top) * doc.height) / r.height),
        ),
      ),
    ];
  }
  function strokeTo(p) {
    if (doc.motion) doc.motion.sourceEdited = true;
    const tool = $("#art-tool").value,
      l = current();
    if (doc.kind === "pixel") {
      const index = tool === "erase" ? 0 : selectedColor;
      if (tool === "fill")
        floodFill(l.pixels, doc.width, doc.height, ...p, index);
      else
        paintLine(l.pixels, doc.width, doc.height, stroke.last, p, index, {
          size: Number($("#art-size").value),
          mirror: $("#art-mirror").checked,
        });
    } else {
      if (stroke.points.length >= 2048) return;
      stroke.points.push(p);
      const points = stroke.points,
        d = [["M", ...points[0]]];
      for (let i = 1; i < points.length - 1; i++)
        d.push([
          "Q",
          ...points[i],
          (points[i][0] + points[i + 1][0]) / 2,
          (points[i][1] + points[i + 1][1]) / 2,
        ]);
      if (points.length > 1) d.push(["L", ...points.at(-1)]);
      l.paths[stroke.path] = {
        d,
        fill: "none",
        stroke: $("#art-color").value,
        strokeWidth: Number($("#art-size").value),
      };
    }
    stroke.last = p;
    draw();
  }
  canvas.onpointerdown = (e) => {
    if (e.button !== 0 || playing || stroke) return;
    if (!current().visible) {
      status("Включи видимость выбранного слоя.", true);
      return;
    }
    stop();
    stroke = {
      before: snapshot(),
      last: point(e),
      points: [point(e)],
      path: current().paths?.length,
      pointer: e.pointerId,
    };
    canvas.setPointerCapture(e.pointerId);
    try {
      strokeTo(point(e));
    } catch (error) {
      doc = stroke.before.doc;
      stroke = null;
      render();
      status(error.message, true);
    }
  };
  canvas.onpointermove = (e) => {
    if (
      !stroke ||
      stroke.pointer !== e.pointerId ||
      $("#art-tool").value === "fill"
    )
      return;
    strokeTo(point(e));
  };
  canvas.onpointerup = (e) => {
    if (!stroke || stroke.pointer !== e.pointerId) return;
    const before = stroke.before;
    stroke = null;
    finish(before);
  };
  canvas.onpointercancel = () => {
    if (stroke) {
      doc = stroke.before.doc;
      stroke = null;
      render();
    }
  };
  $("#art-tool").onchange = () => {};
  $("#art-onion").onchange = draw;
  $("#art-layer").onchange = (e) => {
    stop();
    layer = Number(e.target.value);
    render();
  };
  $("#art-name").onchange = (e) => edit(() => (doc.name = e.target.value));
  $("#art-layer-name").onchange = (e) =>
    edit(() => (current().name = e.target.value));
  $("#art-visible").onchange = (e) =>
    edit(() => (current().visible = e.target.checked));
  $("#art-opacity").onchange = (e) =>
    edit(() => (current().opacity = Number(e.target.value)));
  $("#art-duration").onchange = (e) =>
    edit(() => (doc.frames[frame].duration = Number(e.target.value)));
  $("#art-add-color").onclick = () =>
    edit(() => {
      if (doc.kind !== "pixel") return;
      if (doc.palette.length >= 256) throw new Error("Палитра заполнена");
      doc.palette.push($("#art-color").value + "ff");
      selectedColor = doc.palette.length - 1;
    });
  $("#art-add-layer").onclick = () =>
    edit(() => {
      doc.frames[frame].layers.push({
        id: crypto.randomUUID(),
        name: `Layer ${doc.frames[frame].layers.length + 1}`,
        visible: true,
        opacity: 1,
        ...(doc.kind === "pixel"
          ? { pixels: Array(doc.width * doc.height).fill(0) }
          : { paths: [] }),
      });
      layer = doc.frames[frame].layers.length - 1;
    });
  $("#art-delete-layer").onclick = () =>
    edit(() => {
      if (doc.frames[frame].layers.length > 1) {
        doc.frames[frame].layers.splice(layer, 1);
        layer = Math.max(0, layer - 1);
      }
    });
  function reorder(offset) {
    edit(() => {
      const ls = doc.frames[frame].layers,
        j = layer + offset;
      if (j >= 0 && j < ls.length) {
        [ls[j], ls[layer]] = [ls[layer], ls[j]];
        layer = j;
      }
    });
  }
  $("#art-lower").onclick = () => reorder(-1);
  $("#art-raise").onclick = () => reorder(1);
  function addFrame(copy) {
    edit(() => {
      const f = clone(doc.frames[frame]);
      f.id = crypto.randomUUID();
      f.name = `Frame ${doc.frames.length + 1}`;
      if (!copy)
        f.layers.forEach((l) => {
          if (doc.kind === "pixel") l.pixels.fill(0);
          else l.paths = [];
        });
      if (doc.motion) {
        for (const foot of doc.motion.feet) {
          foot.points.splice(frame + 1, 0, [...foot.points[frame]]);
          foot.contact.splice(frame + 1, 0, copy ? foot.contact[frame] : false);
        }
        if (!copy) doc.motion.sourceEdited = true;
      }
      doc.frames.splice(frame + 1, 0, f);
      frame++;
    });
  }
  $("#art-add-frame").onclick = () => addFrame(false);
  $("#art-copy-frame").onclick = () => addFrame(true);
  $("#art-delete-frame").onclick = () =>
    edit(() => {
      if (doc.frames.length > 1) {
        if (doc.motion)
          for (const foot of doc.motion.feet) {
            foot.points.splice(frame, 1);
            foot.contact.splice(frame, 1);
          }
        doc.frames.splice(frame, 1);
        frame = Math.max(0, frame - 1);
      }
    });
  $("#art-apply-paths").onclick = () =>
    edit(() => (current().paths = JSON.parse($("#art-paths").value)));
  $("#art-delete-path").onclick = () => edit(() => current().paths.pop());
  $("#art-undo").onclick = () => undo();
  $("#art-redo").onclick = () => undo(true);
  $("#art-play").onclick = () => {
    if (playing) stop();
    else {
      playing = true;
      elapsed = 0;
      lastTick = performance.now();
      $("#art-play").textContent = "❚❚ Пауза";
    }
  };
  function tick(now) {
    if (playing) {
      elapsed += Math.min(now - lastTick, 1000);
      let changes = 0;
      while (elapsed >= doc.frames[frame].duration && changes++ < 100) {
        elapsed -= doc.frames[frame].duration;
        frame = (frame + 1) % doc.frames.length;
      }
      if (changes) render();
    }
    lastTick = now;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  $("#art-resize").onclick = () =>
    edit(() => {
      const w = Number($("#art-width").value),
        h = Number($("#art-height").value),
        limit = doc.kind === "pixel" ? 256 : 2048;
      if (
        !Number.isInteger(w) ||
        !Number.isInteger(h) ||
        w < 1 ||
        h < 1 ||
        w > limit ||
        h > limit
      )
        throw new Error(`Размер холста: 1–${limit}`);
      if (doc.kind === "pixel")
        for (const f of doc.frames)
          for (const l of f.layers) {
            const pixels = Array(w * h).fill(0);
            for (let y = 0; y < Math.min(h, doc.height); y++)
              for (let x = 0; x < Math.min(w, doc.width); x++)
                pixels[y * w + x] = l.pixels[y * doc.width + x];
            l.pixels = pixels;
          }
      if (
        doc.motion &&
        (doc.motion.groundY > h ||
          doc.motion.feet.some((f) =>
            f.points.some((p) => p[0] > w || p[1] > h),
          ))
      )
        delete doc.motion;
      doc.width = w;
      doc.height = h;
    });
  dialog.addEventListener("focusin", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) stop();
  });
  $("#art-new-pixel").onclick = () => load(emptyArt());
  $("#art-new-vector").onclick = () => load(emptyArt("vector", 512, 512));
  for (const [id, name] of [
    ["#art-ranger", "ranger"],
    ["#art-rune", "rune"],
  ])
    $(id).onclick = async () => {
      try {
        const m = await import("./art-examples.js");
        if (!dialog.isConnected) return;
        load(m[name]());
      } catch (e) {
        status(e.message, true);
      }
    };
  $("#art-motion").onclick = () => {
    stop();
    openMotionReview(doc);
  };
  $("#art-flip").onclick = () =>
    edit(() => {
      doc = flipArtHorizontal(doc);
    });
  $("#art-save").onclick = () =>
    download(`${doc.name}.art.json`, JSON.stringify(doc, null, 2));
  const attempt = (fn) => () => {
    try {
      fn();
    } catch (e) {
      status(e.message, true);
    }
  };
  $("#art-png").onclick = attempt(() =>
    download(`${doc.name}-${frame + 1}.png`, artPNG(doc, frame)),
  );
  $("#art-svg").onclick = attempt(() =>
    download(`${doc.name}.svg`, frameSVG(doc, frame), "image/svg+xml"),
  );
  $("#art-atlas").onclick = attempt(() =>
    download(`${doc.name}-atlas.png`, artAtlas(doc).png),
  );
  $("#art-metadata").onclick = attempt(() =>
    download(
      `${doc.name}-atlas.json`,
      JSON.stringify(artAtlas(doc).metadata, null, 2),
    ),
  );
  $("#art-open").onclick = () => $("#art-file").click();
  $("#art-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error("Максимум 16 МБ");
      if (file.name.toLowerCase().endsWith(".png")) {
        const image = await createImageBitmap(file);
        try {
          if (!dialog.isConnected) return;
          if (image.width > 256 || image.height > 256)
            throw new Error("PNG для Pixel: максимум 256 × 256");
          const c = document.createElement("canvas");
          c.width = image.width;
          c.height = image.height;
          const context = c.getContext("2d");
          context.drawImage(image, 0, 0);
          const data = context.getImageData(0, 0, c.width, c.height).data,
            d = emptyArt("pixel", c.width, c.height),
            palette = new Map([["#00000000", 0]]);
          d.palette = ["#00000000"];
          for (let i = 0; i < data.length; i += 4) {
            const color = data[i + 3]
              ? "#" +
                Array.from(data.slice(i, i + 4), (x) =>
                  x.toString(16).padStart(2, "0"),
                ).join("")
              : "#00000000";
            if (!palette.has(color)) {
              if (palette.size >= 256)
                throw new Error(
                  "PNG содержит больше 256 цветов. Для иллюстраций используй векторный источник.",
                );
              palette.set(color, palette.size);
              d.palette.push(color);
            }
            d.frames[0].layers[0].pixels[i / 4] = palette.get(color);
          }
          d.name = file.name.slice(0, -4).slice(0, 100) || "Imported";
          load(d);
        } finally {
          image.close();
        }
      } else {
        const text = await file.text();
        if (dialog.isConnected) load(JSON.parse(text));
      }
    } catch (error) {
      if (dialog.isConnected) status(error.message, true);
    } finally {
      e.target.value = "";
    }
  };
  if (recovery) {
    $("#art-recovery").hidden = false;
    $("#art-recovery").onclick = () => download("recovery.art.json", recovery);
    status("Повреждённое автосохранение: копия доступна для скачивания.", true);
  } else status("2D хранится отдельно от 3D-сцены");
  $("#art-close").onclick = () => dialog.close();
  dialog.addEventListener("keydown", (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === "z" &&
      !["INPUT", "TEXTAREA"].includes(e.target.tagName)
    ) {
      e.preventDefault();
      undo(e.shiftKey);
    }
    if (
      e.key === " " &&
      !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName)
    ) {
      e.preventDefault();
      $("#art-play").click();
    }
  });
  const api = Object.freeze({
    reviewMotion: () => {
      stop();
      return openMotionReview(doc);
    },
    getDocument: () => clone(doc),
    load,
    seek: (i) => {
      if (!Number.isInteger(i) || !doc.frames[i])
        throw new Error("Frame not found");
      stop();
      frame = i;
      render();
    },
    undo: () => undo(),
    redo: () => undo(true),
    exportPNG: () => artPNG(doc, frame),
    exportSVG: () => frameSVG(doc, frame),
    exportAtlas: (options) => artAtlas(doc, options),
  });
  window.forgeArt = api;
  dialog.addEventListener(
    "close",
    () => {
      cancelAnimationFrame(raf);
      stageObserver.disconnect();
      if (window.forgeArt === api) delete window.forgeArt;
      dialog.remove();
    },
    { once: true },
  );
  render();
  dialog.showModal();
  fitCanvas();
  return api;
}
