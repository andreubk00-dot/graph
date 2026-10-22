import { DEFAULT_OUTLINE, validateOutline } from "./polygon.js";
import { DEFAULT_PROFILE } from "./document.js";

// The dialog edits an isolated draft. Only Apply touches the project or its undo history.
export function openProfileEditor(initial, onApply, { outline = false } = {}) {
  const existing = document.querySelector("#profile-dialog");
  if (existing) existing.remove();
  let profile = structuredClone(initial),
    selected = 0,
    drag = null,
    domain;
  const dialog = document.createElement("dialog");
  dialog.id = "profile-dialog";
  dialog.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">PROCEDURAL MODELING</span><h2>${outline ? "Контур выдавливания" : "Профиль вращения"}</h2></div><button id="close-profile" aria-label="Закрыть профиль">✕</button></div>
    <p>${outline ? "Замкнутый контур лежит в XY и выдавливается вдоль Z. Пересечения рёбер не допускаются." : "Контур вращается вокруг оси Y. Радиус 0 замыкает торец на оси."} Перетаскивай точки или задай координаты числами.</p>
    <div class="profile-workspace"><svg id="profile-canvas" viewBox="0 0 360 300" aria-label="${outline ? "Контур выдавливания" : "Контур тела вращения"}"></svg><div class="profile-controls"><span class="section-label" id="profile-point-label"></span><label>${outline ? "X" : "Радиус"}, м<input type="number" id="profile-radius" min="${outline ? -100 : 0}" max="100" step="0.01" aria-label="${outline ? "X точки" : "Радиус точки"}"></label><label>Высота, м<input type="number" id="profile-height" min="-100" max="100" step="0.01" aria-label="Высота точки"></label><button id="profile-add" class="wide-button">+ Добавить точку</button><button id="profile-remove" class="wide-button">Удалить точку</button><button id="profile-reset" class="wide-button">Стандартный профиль</button></div></div>
    <div id="profile-error" role="alert"></div><div class="dialog-footer"><span id="profile-count"></span><button id="apply-profile" class="primary">Применить профиль</button></div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s),
    svg = $("#profile-canvas");
  function fit() {
    const ys = profile.map((p) => p[1]);
    domain = {
      left: outline ? Math.min(-0.6, ...profile.map((p) => p[0] - 0.1)) : 0,
      right: Math.max(0.75, ...profile.map((p) => p[0] + 0.1)),
      low: Math.min(-0.6, ...ys.map((y) => y - 0.1)),
      high: Math.max(0.6, ...ys.map((y) => y + 0.1)),
    };
  }
  const project = (p) => [
    40 + ((p[0] - domain.left) / (domain.right - domain.left)) * 290,
    270 - ((p[1] - domain.low) / (domain.high - domain.low)) * 240,
  ];
  function draw() {
    const points = profile.map(project);
    const zero = project([0, 0]);
    svg.innerHTML = `<defs><pattern id="profile-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#344b38" stroke-width=".5"/></pattern></defs><rect x="40" y="30" width="290" height="240" fill="url(#profile-grid)"/><path d="M${zero[0]} 20V280M30 ${zero[1]}H340" fill="none" stroke="#7c9d6a" stroke-dasharray="4 4"/><text x="30" y="16">Y</text><text x="338" y="${Math.max(15, Math.min(290, zero[1] - 7))}">${outline ? "X" : "R"}</text><${outline ? "polygon" : "polyline"} points="${points.map((p) => p.join(",")).join(" ")}" fill="${outline ? "#c3e6a014" : "none"}" stroke="#c3e6a0" stroke-width="2"/>${points.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${selected === i ? 6 : 4}" data-point="${i}" fill="${selected === i ? "#f7d293" : "#c3e6a0"}" stroke="#1b2920" stroke-width="2"/><text x="${p[0] + 8}" y="${p[1] - 8}">${i + 1}</text>`).join("")}`;
    $("#profile-point-label").textContent =
      `ТОЧКА ${selected + 1} / ${profile.length}`;
    $("#profile-radius").value = Number(profile[selected][0].toFixed(3));
    $("#profile-height").value = Number(profile[selected][1].toFixed(3));
    $("#profile-remove").disabled = profile.length <= (outline ? 3 : 2);
    $("#profile-add").disabled = profile.length >= 128;
    $("#profile-count").textContent =
      `${profile.length} точек · отмена применяется ко всему профилю`;
  }
  function readField(index, input) {
    const value = Number(input.value);
    if (
      input.value.trim() === "" ||
      !Number.isFinite(value) ||
      value < (index === 0 && !outline ? 0 : -100) ||
      value > 100
    ) {
      $("#profile-error").textContent = outline
        ? "Координаты должны быть от −100 до 100 м."
        : "Радиус: 0–100 м. Высота: −100–100 м.";
      draw();
      return;
    }
    $("#profile-error").textContent = "";
    profile[selected][index] = value;
    fit();
    draw();
  }
  $("#profile-radius").onchange = (e) => readField(0, e.target);
  $("#profile-height").onchange = (e) => readField(1, e.target);
  svg.addEventListener("pointerdown", (e) => {
    if (!e.target.hasAttribute("data-point")) return;
    selected = Number(e.target.dataset.point);
    drag = e.pointerId;
    svg.setPointerCapture(e.pointerId);
    draw();
  });
  svg.addEventListener("pointermove", (e) => {
    if (drag !== e.pointerId) return;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const local = point.matrixTransform(svg.getScreenCTM().inverse());
    profile[selected] = [
      Math.max(
        outline ? -100 : 0,
        Math.min(
          100,
          domain.left +
            Math.max(0, Math.min(1, (local.x - 40) / 290)) *
              (domain.right - domain.left),
        ),
      ),
      Math.max(
        -100,
        Math.min(
          100,
          domain.low +
            Math.max(0, Math.min(1, (270 - local.y) / 240)) *
              (domain.high - domain.low),
        ),
      ),
    ];
    draw();
  });
  const end = () => {
    drag = null;
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  $("#profile-add").onclick = () => {
    if (profile.length >= 128) return;
    const a = profile[selected],
      b =
        profile[selected + 1] ??
        (outline ? profile[0] : [a[0], Math.min(100, a[1] + 0.1)]);
    profile.splice(selected + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    selected++;
    fit();
    draw();
  };
  $("#profile-remove").onclick = () => {
    if (profile.length <= (outline ? 3 : 2)) return;
    profile.splice(selected, 1);
    selected = Math.min(selected, profile.length - 1);
    fit();
    draw();
  };
  $("#profile-reset").onclick = () => {
    profile = structuredClone(outline ? DEFAULT_OUTLINE : DEFAULT_PROFILE);
    selected = 0;
    fit();
    draw();
  };
  $("#close-profile").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  $("#apply-profile").onclick = () => {
    if (outline) {
      try {
        validateOutline(profile);
      } catch (e) {
        $("#profile-error").textContent = e.message;
        return;
      }
    }
    if (!outline && !profile.some((p) => p[0] > 0)) {
      $("#profile-error").textContent =
        "Нужна хотя бы одна точка с положительным радиусом.";
      return;
    }
    onApply(structuredClone(profile));
    dialog.close();
  };
  fit();
  draw();
  dialog.showModal();
}
