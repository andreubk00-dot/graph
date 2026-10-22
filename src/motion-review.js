import { validateArt } from "./art-document.js";
import { auditMotion } from "./locomotion.js";
import { renderArtFrame } from "./art-render.js";
export function openMotionReview(input) {
  const doc = validateArt(input),
    report = auditMotion(doc);
  document.querySelector("#motion-dialog")?.close();
  const dialog = document.createElement("dialog");
  dialog.id = "motion-dialog";
  dialog.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">LOCOMOTION REVIEW</span><h2>Направление и опора</h2></div><button id="motion-close" aria-label="Закрыть проверку бега">✕</button></div><p id="motion-summary"></p><canvas id="motion-canvas" width="1000" height="360" aria-label="Проверка направления бега"></canvas><div id="motion-issues" role="status"></div><div class="dialog-footer"><span id="motion-frame"></span><div class="art-tools"><button id="motion-back">← Кадр</button><button id="motion-play">Пауза</button><button id="motion-next">Кадр →</button></div></div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s),
    canvas = $("#motion-canvas"),
    ctx = canvas.getContext("2d"),
    sprite = document.createElement("canvas");
  sprite.width = doc.width;
  sprite.height = doc.height;
  const total = doc.frames.reduce((s, f) => s + f.duration, 0),
    times = [];
  let elapsed = 0;
  for (const f of doc.frames) {
    times.push(elapsed);
    elapsed += f.duration;
  }
  let playing = true,
    time = total * 2,
    last = performance.now(),
    raf,
    spriteFrame = -1;
  $("#motion-summary").textContent = report.available
    ? `Взгляд: ${report.facing === "right" ? "вправо →" : "← влево"}. Скорость: ${report.speed.toFixed(2)} px/с. Слева — бег на месте и движущаяся земля. Справа — перемещение по неподвижной земле.`
    : "Добавь опорные точки и направление в motion; сейчас доступен только просмотр кадров.";
  $("#motion-issues").textContent = report.available
    ? report.issues.length
      ? report.issues.join(" · ")
      : `Опора проверена: отклонение от неподвижной точки ≤ ${Math.max(...report.feet.map((f) => f.maxSlip)).toFixed(2)} px; фаза полёта есть.`
    : report.issues.join(" ");
  const frameAt = (t) => {
    let i = doc.frames.length - 1;
    for (let j = 0; j < times.length; j++) if (t >= times[j]) i = j;
    return i;
  };
  function draw() {
    const phase = (time % total) / total,
      index = frameAt(time % total),
      sign = doc.motion?.facing === "left" ? -1 : 1,
      ground = doc.motion?.groundY ?? doc.height,
      scale = Math.min(4, 260 / doc.height),
      distance = doc.motion?.distance ?? 0;
    if (index !== spriteFrame) {
      renderArtFrame(sprite.getContext("2d"), doc, index);
      spriteFrame = index;
    }
    ctx.clearRect(0, 0, 1000, 360);
    ctx.fillStyle = "#172027";
    ctx.fillRect(0, 0, 1000, 360);
    ctx.imageSmoothingEnabled = doc.kind !== "pixel";
    for (let panel = 0; panel < 2; panel++) {
      const left = panel * 500,
        floor = 300;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left + 8, 0, 484, 360);
      ctx.clip();
      ctx.fillStyle = "#263942";
      ctx.fillRect(left, floor, 500, 60);
      ctx.strokeStyle = "#82938a";
      ctx.beginPath();
      ctx.moveTo(left, floor);
      ctx.lineTo(left + 500, floor);
      ctx.stroke();
      const offset =
        panel === 0 ? -sign * distance * (time / total) * scale : 0;
      for (let x = -100; x < 600; x += 32) {
        const px = left + x + (offset % 32);
        ctx.strokeStyle = "#52676b";
        ctx.beginPath();
        ctx.moveTo(px, floor + 5);
        ctx.lineTo(px - 12, floor + 17);
        ctx.stroke();
      }
      let origin = left + (500 - doc.width * scale) / 2;
      if (panel === 1 && report.available) {
        const span =
            Math.ceil(
              (500 + doc.width * scale) / Math.max(1, distance * scale),
            ) * Math.max(1, distance * scale),
          travel = ((time / 1000) * (report.speed ?? 0) * scale) % span;
        origin =
          sign > 0 ? left - doc.width * scale + travel : left + 500 - travel;
      }
      const top = floor - ground * scale;
      ctx.drawImage(sprite, origin, top, doc.width * scale, doc.height * scale);
      if (doc.motion)
        for (const foot of doc.motion.feet) {
          const p = foot.points[index];
          ctx.fillStyle = foot.contact[index] ? "#b7e795" : "#e8b569";
          ctx.fillRect(origin + p[0] * scale - 3, top + p[1] * scale - 2, 6, 4);
        }
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#d2dfd8";
      ctx.fillText(panel === 0 ? "НА МЕСТЕ" : "С ПЕРЕМЕЩЕНИЕМ", left + 20, 26);
      ctx.fillStyle = "#b7e795";
      ctx.fillText(sign > 0 ? "НАПРАВЛЕНИЕ →" : "← НАПРАВЛЕНИЕ", left + 20, 50);
      ctx.restore();
    }
    ctx.strokeStyle = "#52676b";
    ctx.beginPath();
    ctx.moveTo(500, 0);
    ctx.lineTo(500, 360);
    ctx.stroke();
    $("#motion-frame").textContent =
      `Кадр ${index + 1}/${doc.frames.length} · зелёный — опора, оранжевый — перенос`;
  }
  function tick(now) {
    if (playing) time += Math.min(now - last, 100);
    last = now;
    draw();
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  function step(delta) {
    playing = false;
    $("#motion-play").textContent = "Играть";
    const i = frameAt(time % total);
    time =
      total * 2 + times[(i + delta + doc.frames.length) % doc.frames.length];
    draw();
  }
  $("#motion-back").onclick = () => step(-1);
  $("#motion-next").onclick = () => step(1);
  $("#motion-play").onclick = () => {
    $("#motion-play").textContent = (playing = !playing) ? "Пауза" : "Играть";
  };
  $("#motion-close").onclick = () => dialog.close();
  dialog.addEventListener(
    "close",
    () => {
      cancelAnimationFrame(raf);
      dialog.remove();
    },
    { once: true },
  );
  dialog.showModal();
  draw();
  return Object.freeze({
    report,
    seek(ms) {
      if (!Number.isFinite(ms) || ms < 0)
        throw new Error("Invalid review time");
      playing = false;
      time = ms;
      $("#motion-play").textContent = "Играть";
      draw();
    },
    capture: () => canvas.toDataURL("image/png"),
  });
}
