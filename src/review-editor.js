import { auditMeasurements, auditLocomotion } from "./model-review.js";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (v, d = 4) => (v === null ? "не определено" : Number(v).toFixed(d));
export function openModelReview({
  getDocument,
  getView,
  apply,
  onNavigate,
  setOverlay,
  onBench,
}) {
  document.querySelector("#model-review-dialog")?.close();
  const d = document.createElement("dialog");
  d.id = "model-review-dialog";
  const doc = getDocument(),
    view = getView(),
    draft = doc.review ?? {
      version: 1,
      landmarks: {},
      measurements: [],
      symmetry: [],
    };
  d.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">REFERENCE & MOTION LAB</span><h2>Контроль формы и движения</h2></div><button id="review-close" aria-label="Закрыть контроль модели">✕</button></div><p>Измерения опираются на выбранный референс. Пустой диапазон — только измерение. Координаты мира в метрах, интервалы опоры в долях цикла. Автоматического распознавания анатомии нет.</p><div class="review-columns"><section><label>Ориентиры и критерии · JSON<textarea id="review-json" spellcheck="false" aria-label="Настройки контроля модели"></textarea></label><div class="review-controls"><input id="review-landmark-id" placeholder="ID ориентира" aria-label="ID ориентира"><input id="review-vertex" type="number" min="0" step="1" placeholder="Вершина сетки" aria-label="Вершина ориентира"><button id="review-add-landmark">Из выделения</button></div><p class="muted">Кость/жёсткий объект: локальный ноль. Поверхность сетки: номер вершины. Точное смещение точки можно задать в JSON.</p><div class="review-controls"><button id="review-load-bench">Технический стенд опоры</button><button id="review-apply" class="primary">Сохранить критерии</button><button id="review-remove">Убрать критерии</button><label><input id="review-show" type="checkbox" ${view.reviewVisible ? "checked" : ""}> Ориентиры в сцене</label></div></section><section><div class="review-controls"><label>Измерения<select id="review-pose"><option value="rest">Базовая поза</option><option value="clip">Кадр клипа</option></select></label><label>Клип<select id="review-clip" aria-label="Клип контроля">${[{ id: "default", name: "Action" }, ...(doc.clips ?? [])].map((c) => `<option value="${esc(c.id)}" ${c.id === (view.activeClip ?? draft.motion?.clip ?? "default") ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label><label>Время, с<input id="review-time" type="number" min="0" step=".01" value="${view.time}" aria-label="Время измерений"></label></div><div class="review-controls"><label>Движение<select id="review-motion-mode"><option value="root">Движение корня</option><option value="inPlace" ${draft.motion?.mode === "inPlace" ? "selected" : ""}>На месте + виртуальный шаг</option></select></label><label>Виртуальный шаг, м<input id="review-distance" type="number" min=".001" step=".1" value="${draft.motion?.distance ?? 1}" aria-label="Дистанция виртуального цикла"></label><button id="review-run">Проверить черновик</button></div><p class="muted">Параметры справа относятся к текущей проверке. Сохраняются критерии из JSON слева.</p><div id="review-status" role="status"></div><div id="review-results"></div></section></div>`;
  document.body.append(d);
  const $ = (s) => d.querySelector(s);
  $("#review-json").value = JSON.stringify(draft, null, 2);
  const syncDistance = () => {
    $("#review-distance").disabled =
      $("#review-motion-mode").value !== "inPlace";
  };
  $("#review-motion-mode").onchange = syncDistance;
  syncDistance();
  function error(e) {
    $("#review-status").textContent = e.message;
    $("#review-status").className = "error";
  }
  function parsed() {
    return JSON.parse($("#review-json").value);
  }
  function inspect() {
    $("#review-results").replaceChildren();
    try {
      const current = getDocument();
      current.review = parsed();
      const clip =
          $("#review-clip").value === "default"
            ? null
            : $("#review-clip").value,
        pose = $("#review-pose").value,
        time = Number($("#review-time").value),
        mode = $("#review-motion-mode").value,
        distance = Number($("#review-distance").value),
        measure = auditMeasurements(current, { pose, clip, time }),
        motion = auditLocomotion(current, { clip, mode, distance });
      $("#review-status").className = "";
      $("#review-status").textContent =
        "Результаты черновика. Сохрани критерии, чтобы включить их в проект.";
      const issues = [
        ...measure.issues,
        ...(motion.available ? motion.issues : []),
      ];
      $("#review-results").innerHTML =
        `<h3>Измерения · ${pose === "rest" ? "базовая поза" : fmt(time, 2) + " с"}</h3><p>${Object.keys(current.review.landmarks).length ? (issues.length ? esc(issues.join(" · ")) : measure.measurements.some((m) => m.range) || measure.symmetry.length || motion.available ? "Заданные критерии пройдены." : "Диапазоны проверки не заданы; доступны только измерения.") : "Ориентиры ещё не заданы."}</p><div class="mesh-review-table"><table><thead><tr><th>Критерий</th><th>Значение</th><th>Диапазон</th><th>Результат</th></tr></thead><tbody>${measure.measurements.map((m) => `<tr><td>${esc(m.label)}</td><td>${fmt(m.value)} ${m.unit === "m" ? "м" : "отношение"}</td><td>${m.range ? m.range.map((v) => fmt(v)).join("…") : "не задан"}</td><td>${m.pass === null ? "измерение" : m.pass ? "✓" : "выход за диапазон"}</td></tr>`).join("")}${measure.symmetry.map((s) => `<tr><td>${esc(s.label)}</td><td>${fmt(s.maxError * 1000, 3)} мм</td><td>≤ ${fmt(s.tolerance * 1000, 3)} мм</td><td>${s.pass ? "✓" : "асимметрия"}</td></tr>`).join("")}</tbody></table></div>${motion.available ? `<h3>Движение · ${esc(clip ?? "Action")}</h3><canvas id="review-motion-chart" width="800" height="260" aria-label="Графики продвижения и высоты опоры"></canvas><p id="review-motion-summary">Продвижение ${fmt(motion.forwardDistance, 3)} м · скорость ${fmt(motion.averageSpeed, 3)} м/с · ход назад ${fmt(motion.reverseDistance, 3)} м · отклонение траектории ${fmt(motion.travelAngle, 1)}° · отклонение взгляда ${fmt(motion.maxFacingAngle, 1)}° · полёт ${motion.airborne ? "есть" : "не найден"}. ${mode === "inPlace" ? "Добавлено виртуальное продвижение; исходная сцена не изменена." : ""}</p><table><thead><tr><th>Опора / переход</th><th>Скольжение</th><th>Ошибка высоты</th><th>Ниже земли</th></tr></thead><tbody>${motion.feet.map((f, i) => `<tr><td><button data-review-foot="${i}">${esc(f.label)}</button></td><td>${fmt(f.maxSlip * 1000, 3)} мм</td><td>${fmt(f.maxGroundError * 1000, 3)} мм</td><td>${fmt(f.maxPenetration * 1000, 3)} мм</td></tr>`).join("")}</tbody></table><p>${esc(motion.scope)}</p>` : `<p>${esc(motion.issues.join(" "))}</p>`}<p class="muted">${esc(measure.scope)}</p>`;
      if (motion.available) drawMotionChart($("#review-motion-chart"), motion);
      d.querySelectorAll("[data-review-foot]").forEach(
        (b) =>
          (b.onclick = () => {
            const i = Number(b.dataset.reviewFoot),
              foot = motion.feet[i],
              id = current.review.motion.feet[i].sole[0],
              node = current.review.landmarks[id].node;
            d.close();
            onNavigate(clip, foot.worstTime ?? 0, node);
          }),
      );
    } catch (e) {
      error(e);
    }
  }
  $("#review-load-bench").onclick = () => {
    d.close();
    onBench();
  };
  $("#review-run").onclick = inspect;
  $("#review-apply").onclick = () => {
    try {
      apply(parsed());
      inspect();
      $("#review-status").textContent =
        "Критерии сохранены в проекте одним шагом истории.";
    } catch (e) {
      error(e);
    }
  };
  $("#review-remove").onclick = () => {
    try {
      apply(null);
      d.close();
    } catch (e) {
      error(e);
    }
  };
  $("#review-show").onchange = (e) => setOverlay(e.target.checked);
  $("#review-add-landmark").onclick = () => {
    try {
      const r = parsed(),
        selection = getView().selected,
        n = getDocument().nodes.find((n) => n.id === selection),
        id = $("#review-landmark-id").value.trim();
      if (!n)
        throw new Error(
          "Выдели объект или кость в дереве перед открытием контроля",
        );
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || Object.hasOwn(r.landmarks, id))
        throw new Error("Укажи новый ID: буквы, цифры, _ или -");
      let anchor = { node: n.id, point: [0, 0, 0] };
      if (n.type === "mesh" && $("#review-vertex").value.trim() !== "") {
        const v = Number($("#review-vertex").value);
        if (
          !Number.isInteger(v) ||
          v < 0 ||
          v >= n.geometry.positions.length / 3
        )
          throw new Error("Вершина вне сетки");
        anchor = { node: n.id, vertex: v };
      } else if (n.skin)
        throw new Error("Для деформируемой поверхности укажи номер вершины");
      Object.defineProperty(r.landmarks, id, {
        value: anchor,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      $("#review-json").value = JSON.stringify(r, null, 2);
      $("#review-status").textContent =
        "Ориентир добавлен в черновик; сохрани критерии.";
    } catch (e) {
      error(e);
    }
  };
  $("#review-close").onclick = () => d.close();
  d.addEventListener("close", () => d.remove(), { once: true });
  d.showModal();
  return { inspect };
}

function drawMotionChart(canvas, r) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#172027";
  ctx.fillRect(0, 0, 800, 260);
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#d4dfd7";
  ctx.fillText("Продвижение корня, м", 15, 18);
  ctx.fillText("Высота первого ориентира подошвы, м", 415, 18);
  const origin = r.rootTrail[0].point,
    progress = r.rootTrail.map((p) =>
      p.point.reduce((s, v, i) => s + (v - origin[i]) * r.forward[i], 0),
    ),
    heights = r.feet.flatMap((f) => f.trail.map((p) => p.point[1] - r.groundY));
  function plot(panel, min, max, series) {
    const left = panel * 400 + 42,
      top = 34,
      width = 340,
      height = 187,
      range = Math.max(0.01, max - min),
      y = (v) => top + height - ((v - min) / range) * height;
    ctx.strokeStyle = "#53655e";
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + height);
    ctx.lineTo(left + width, top + height);
    ctx.stroke();
    ctx.fillStyle = "#bacdc2";
    ctx.fillText(max.toFixed(2), panel * 400 + 4, top + 5);
    ctx.fillText(min.toFixed(2), panel * 400 + 4, top + height);
    ctx.fillText("0", left, top + height + 19);
    ctx.fillText(
      r.duration.toFixed(2) + " с",
      left + width - 36,
      top + height + 19,
    );
    ctx.strokeStyle = "#7c8c81";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(left, y(0));
    ctx.lineTo(left + width, y(0));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [index, s] of series.entries()) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ["#79e4db", "#e5a66d", "#a6adf1", "#e5758c"][index % 4];
      ctx.beginPath();
      s.forEach((p, i) => {
        const x = left + (p.time / r.duration) * width;
        if (i) ctx.lineTo(x, y(p.value));
        else ctx.moveTo(x, y(p.value));
      });
      ctx.stroke();
      for (const p of s)
        if (p.contact) {
          ctx.fillStyle = "#b7e795";
          ctx.fillRect(
            left + (p.time / r.duration) * width - 1,
            y(p.value) - 2,
            3,
            4,
          );
        }
    }
  }
  plot(0, Math.min(0, ...progress), Math.max(0.1, ...progress), [
    r.rootTrail.map((p, i) => ({ time: p.time, value: progress[i] })),
  ]);
  plot(
    1,
    Math.min(-0.01, ...heights),
    Math.max(0.05, ...heights),
    r.feet.map((f) =>
      f.trail.map((p) => ({
        time: p.time,
        value: p.point[1] - r.groundY,
        contact: p.contact,
      })),
    ),
  );
  ctx.fillStyle = "#b7e795";
  ctx.fillText("Зелёные точки — заданная фаза опоры", 415, 254);
}
