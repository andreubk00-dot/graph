import { expandedCreases, physicalCreases } from "./mesh-creases.js";
import {
  evaluateMeshGeometry,
  setModifiers as changeModifiers,
  bakeModifiers as applyModifiers,
} from "./mesh-modifiers.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { geometryFor } from "./scene.js";
import { bakeMeshGeometry } from "./mesh-convert.js";
import {
  editMeshGeometry,
  meshTopology,
  selectedVertices,
} from "./mesh-edit.js";
import { validateReferences } from "./modeling-references.js";

const UI_VERTICES = 20000,
  UI_TRIANGLES = 40000;
function budget(g) {
  if (
    g.positions.length / 3 > UI_VERTICES ||
    (g.indices?.length ?? g.positions.length / 3) / 3 > UI_TRIANGLES
  )
    throw new Error(
      "Интерактивный редактор: до 20 000 вершин и 40 000 треугольников. Для крупных сеток используй meshEdit через API.",
    );
}
const copy = (v) => structuredClone(v);
export function openMeshEditor({ node, references = [], review, onApply }) {
  if (node.skin)
    throw new Error(
      "Сначала сними привязку скиннинга: редактор изменяет базовую сетку.",
    );
  document.querySelector("#mesh-dialog")?.close();
  let geometry = bakeMeshGeometry(node);
  let modifiers = copy(node.modifiers ?? []);
  budget(evaluateMeshGeometry({ type: "mesh", geometry, modifiers }));
  let landmarks = copy(review?.landmarks ?? {});
  let selection = { mode: "vertex", ids: [] },
    operations = [],
    refs = copy(references),
    history = [],
    future = [],
    view = "perspective",
    closed = false,
    drag = null,
    down = null,
    span = 2;
  const dialog = document.createElement("dialog");
  dialog.id = "mesh-dialog";
  dialog.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">MESH WORKSHOP</span><h2>Редактор сетки</h2></div><button id="mesh-close" aria-label="Закрыть редактор сетки">✕</button></div>
  <p>Базовая сетка в локальных координатах объекта, метры. Грани — треугольники. Клик выбирает, Shift добавляет. Перетаскивай стрелки или вводи числа. Применение — один шаг истории проекта.</p>
  <div class="mesh-toolbar"><label>Компоненты<select id="mesh-mode"><option value="vertex">Вершины</option><option value="edge">Рёбра</option><option value="face">Грани</option></select></label><label>Вид<select id="mesh-view"><option value="perspective">Перспектива</option><option value="front">Спереди · XY</option><option value="side">Справа · ZY</option><option value="top">Сверху · XZ</option></select></label><button id="mesh-fit">Вписать</button><label><input id="mesh-xray" type="checkbox"> Выбор насквозь</label><button id="mesh-all">Выбрать всё</button><button id="mesh-clear">Снять выбор</button><button id="mesh-undo">Отмена</button><button id="mesh-redo">Повтор</button></div>
  <div class="mesh-workspace"><div id="mesh-viewport"></div><aside class="mesh-controls"><strong id="mesh-selection"></strong><label>ID компонентов<input id="mesh-ids" placeholder="0, 1, 2" aria-label="ID компонентов сетки"></label><button id="mesh-select-ids">Выбрать по ID</button><p class="muted">Индексы с нуля. Ребро перемещает обе вершины, грань — три. Совпадающие UV-разрывы остаются раздельными вершинами.</p><h3>Смещение, м</h3><div class="mesh-vector">${["x", "y", "z"].map((a) => `<label>${a.toUpperCase()}<input id="mesh-d${a}" type="number" step=".01" value="0" aria-label="Смещение ${a.toUpperCase()}"></label>`).join("")}</div><button id="mesh-translate">Переместить выбранное</button><button id="mesh-extrude">Выдавить выбранные грани</button><button id="mesh-delete-faces">Удалить выбранные грани</button><details><summary>Точная вершина</summary><div class="mesh-vector">${["x", "y", "z"].map((a) => `<label>${a.toUpperCase()}<input id="mesh-v${a}" type="number" step=".01" aria-label="Координата вершины ${a.toUpperCase()}"></label>`).join("")}</div><button id="mesh-set-vertex">Задать координаты</button></details><details id="mesh-topology-panel" open><summary>Разрезы · объединение · фаска</summary><label>Доля ребра (0…1)<input id="mesh-split-fraction" type="number" value=".5" min=".001" max=".999" step=".05"></label><button id="mesh-split-edges">Разрезать выбранные рёбра</button><button id="mesh-dissolve-vertex">Растворить внутреннюю вершину</button><p class="muted">Одна внутренняя вершина плоского выпуклого участка. Контур, UV, цвета и нормали сохраняются; швы и затронутые жёсткие рёбра требуют отдельной обработки.</p><label>Целевая вершина · ID<input id="mesh-merge-target" type="number" min="0" step="1" placeholder="Первая выбранная"></label><label>Положение результата<select id="mesh-merge-placement"><option value="target">В целевую вершину</option><option value="center">В центр выбранных позиций</option></select></label><label>UV и цвета<select id="mesh-attribute-policy"><option value="reject">Отказ при различии атрибутов</option><option value="target">Взять атрибуты целевой вершины</option></select></label><button id="mesh-merge-vertices">Объединить выбранные вершины</button><label>Глубина фаски угла, м<input id="mesh-bevel-width" type="number" min=".00001" step=".01" value=".05"></label><button id="mesh-bevel-vertex">Срезать выпуклый угол</button><h3>Фаска ребра</h3><label>Отступ по соседним граням, м<input id="mesh-edge-bevel-width" type="number" min=".00001" step=".01" value=".05"></label><label>Сегменты (1…16)<input id="mesh-edge-bevel-segments" type="number" min="1" max="16" step="1" value="4"></label><button id="mesh-bevel-edge">Скруглить выбранное ребро</button><p class="muted">Одно выпуклое ребро замкнутой выпуклой сетки. Сними метки жёсткости перед фаской. Отступ измеряется по соседним граням; 1 сегмент даёт плоскую фаску. Исходные вершины на ребре заменяются — при наличии ориентиров включи их перенос.</p><label class="mesh-policy-check"><input id="mesh-remap-landmarks" type="checkbox"> Перенести ориентиры на результат</label><p class="muted">Разрез учитывает обе стороны UV-шва. Фаска — один плоский срез замкнутого выпуклого угла. После изменения топологии номера рёбер и граней обновляются.</p></details><h3>Зеркало половины</h3><label>Ось<select id="mesh-axis"><option>x</option><option>y</option><option>z</option></select></label><label>Исходная сторона<select id="mesh-side"><option value="positive">Положительная</option><option value="negative">Отрицательная</option></select></label><label>Плоскость, м<input id="mesh-plane" type="number" value="0" step=".01"></label><label>Допуск шва, м<input id="mesh-weld" type="number" value=".00001" min="0" max="1" step=".00001"></label><button id="mesh-live-mirror">Создать / обновить живое зеркало</button><label><input id="mesh-live-enabled" type="checkbox" checked> Живое зеркало включено</label><button id="mesh-bake-modifiers">Запечь все модификаторы</button><button id="mesh-remove-modifiers">Убрать живое зеркало</button><p class="muted" id="mesh-modifier-status"></p><button id="mesh-mirror">Однократно отразить и сварить шов</button><p class="muted">Нужна одна половина без крышки на плоскости. Живое зеркало сохраняет исходную половину: редактируй её точки и рёбра; отражённая сторона доступна для выбора после запекания. Новые вершины добавляются в конец; исходные ID сохраняются. UV копируются, новые боковины требуют развёртки.</p><details id="mesh-subdivision-panel" open><summary>Сглаживание · Loop subdivision</summary><label>Уровни (1…3)<input id="mesh-subdivision-levels" type="number" value="1" min="1" max="3" step="1"></label><button id="mesh-subdivision">Добавить / обновить subdivision</button><label><input id="mesh-subdivision-enabled" type="checkbox" checked> Subdivision включён</label><button id="mesh-remove-subdivision">Убрать subdivision</button><label>Порядок вычисления<select id="mesh-modifier-order"><option value="mirror-first">Зеркало → subdivision</option><option value="subdivision-first">Subdivision → зеркало</option></select></label><p class="muted" id="mesh-subdivision-status"></p><h3>Жёсткость рёбер</h3><button id="mesh-set-creases">Пометить выбранные рёбра жёсткими</button><button id="mesh-unset-creases">Снять жёсткость выбранных рёбер</button><button id="mesh-clear-creases">Снять все метки жёсткости</button><p class="muted" id="mesh-crease-stats"></p><p class="muted">Оранжевые рёбра сохраняют чёткую форму при subdivision и разделяют нормали. Жёсткость включена или выключена; плавная степень пока не поддерживается.</p><p class="muted">Редактируется исходный каркас. Loop сглаживает треугольники и уменьшает объём; UV и цвета интерполируются без объединения швов. Для полного выбора результата запеки модификаторы.</p></details><button id="mesh-normals">Пересчитать нормали</button><details id="mesh-reference-panel"><summary>Изображение-референс</summary><p class="muted">Выбери ортографический вид. Изображение хранится в проекте и видно только здесь. PNG/JPEG/WebP до 1 МиБ, до 4096 px на сторону.</p><input id="mesh-reference-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Изображение-референс"><label>Ширина в модели, м<input id="mesh-reference-width" type="number" value="1" min=".001" step=".1"></label><label>Прозрачность<input id="mesh-reference-opacity" type="number" value=".4" min="0" max="1" step=".1"></label><div class="mesh-vector">${["x", "y", "z"].map((a) => `<label>${a.toUpperCase()}<input id="mesh-r${a}" type="number" step=".01" value="0" aria-label="Центр референса ${a.toUpperCase()}"></label>`).join("")}</div><button id="mesh-reference-update">Обновить положение</button><button id="mesh-reference-remove">Убрать референс вида</button><span id="mesh-reference-name"></span></details></aside></div><div id="mesh-error" role="alert"></div><div class="dialog-footer"><span id="mesh-stats"></span><button id="mesh-apply" class="primary">Применить сетку и референсы</button></div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s),
    host = $("#mesh-viewport");
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.autoClear = false;
  renderer.setClearColor("#202a30");
  host.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Редактируемая сетка");
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#728393", 2.6));
  const light = new THREE.DirectionalLight("#ffffff", 3);
  light.position.set(3, 5, 4);
  scene.add(light);
  const grid = new THREE.GridHelper(20, 40, "#66756c", "#35443f");
  scene.add(grid);
  const perspective = new THREE.PerspectiveCamera(40, 1, 0.001, 1000000),
    orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 1000000);
  let camera = perspective,
    orbit,
    transform;
  const pivot = new THREE.Object3D();
  scene.add(pivot);
  const material = new THREE.MeshStandardMaterial({
    color: node.color,
    side: THREE.DoubleSide,
    roughness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    vertexColors: !!geometry.colors,
    flatShading: !(geometry.smooth ?? true),
  });
  const surface = new THREE.Mesh(new THREE.BufferGeometry(), material);
  scene.add(surface);
  const cageSurface = new THREE.Mesh(new THREE.BufferGeometry(), material);
  const subdivided = () =>
    modifiers.some((m) => m.type === "subdivision" && m.enabled !== false);
  const wire = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: "#8fa9a3",
      transparent: true,
      opacity: 0.5,
    }),
  );
  scene.add(wire);
  const hardWire = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#f4995c" }),
  );
  scene.add(hardWire);
  const points = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      color: "#c3dcdf",
      size: 4,
      sizeAttenuation: false,
    }),
  );
  scene.add(points);
  const chosen = new THREE.Group();
  scene.add(chosen);
  const referencePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  referencePlane.renderOrder = -10;
  const referenceScene = new THREE.Scene();
  referenceScene.add(referencePlane);
  const textureCache = new Map();
  let referenceGeneration = 0;
  function error(e) {
    $("#mesh-error").textContent = e.message;
  }
  function render() {
    if (!closed) {
      renderer.clear();
      renderer.render(referenceScene, camera);
      renderer.clearDepth();
      renderer.render(scene, camera);
    }
  }
  function dimensions() {
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h);
    perspective.aspect = w / h;
    perspective.updateProjectionMatrix();
    orthographic.left = (-span * w) / h / 2;
    orthographic.right = (span * w) / h / 2;
    orthographic.top = span / 2;
    orthographic.bottom = -span / 2;
    orthographic.updateProjectionMatrix();
    render();
  }
  function disposeChildren(group) {
    for (const o of [...group.children]) {
      o.geometry?.dispose();
      o.material?.dispose();
      group.remove(o);
    }
  }
  function state() {
    return {
      geometry: copy(geometry),
      modifiers: copy(modifiers),
      operations: copy(operations),
      selection: copy(selection),
      refs: copy(refs),
      landmarks: copy(landmarks),
    };
  }
  function stash(previous) {
    history.push(previous);
    while (
      history.length > 30 ||
      (history.length > 1 &&
        history.reduce(
          (s, h) =>
            s +
            Object.values(h.geometry).reduce(
              (bytes, v) => bytes + (Array.isArray(v) ? v.length * 8 : 0),
              0,
            ) +
            JSON.stringify(h.operations).length * 2 +
            h.selection.ids.length * 8 +
            JSON.stringify(h.refs).length * 2 +
            JSON.stringify(h.landmarks).length * 2,
          0,
        ) >
          32 * 1024 * 1024)
    )
      history.shift();
    future = [];
  }
  function restore(s) {
    $("#mesh-error").textContent = "";
    ({ geometry, modifiers, operations, selection, refs, landmarks } = copy(s));
    $("#mesh-mode").value = selection.mode;
    refresh();
    syncReferenceFields();
    void updateReference();
  }
  function replaceBuffer(object, buffer) {
    object.geometry.dispose();
    object.geometry = buffer;
  }
  function positionsBuffer(values) {
    return new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(values, 3),
    );
  }
  function selectionPoints() {
    return selectedVertices(geometry, selection).map((i) =>
      geometry.positions.slice(i * 3, i * 3 + 3),
    );
  }
  function activeVertices() {
    return [
      ...new Set(
        geometry.indices ??
          Array.from({ length: geometry.positions.length / 3 }, (_, i) => i),
      ),
    ].sort((a, b) => a - b);
  }
  function refresh(movePivot = true) {
    const buffer = geometryFor({ type: "mesh", geometry, modifiers });
    replaceBuffer(surface, buffer);
    replaceBuffer(cageSurface, geometryFor({ type: "mesh", geometry }));
    material.vertexColors = !!geometry.colors;
    material.flatShading = !(geometry.smooth ?? true);
    material.needsUpdate = true;
    const topology = meshTopology(geometry),
      p = (i) => geometry.positions.slice(i * 3, i * 3 + 3);
    replaceBuffer(
      wire,
      positionsBuffer(topology.edges.flatMap((e) => e.flatMap(p))),
    );
    replaceBuffer(
      hardWire,
      positionsBuffer(expandedCreases(geometry).flatMap((e) => e.flatMap(p))),
    );
    replaceBuffer(points, positionsBuffer(activeVertices().flatMap(p)));
    points.visible = selection.mode === "vertex";
    const through = $("#mesh-xray").checked;
    points.material.depthTest = !through;
    hardWire.material.depthTest = !through;
    disposeChildren(chosen);
    if (selection.ids.length) {
      const verts = selectionPoints();
      if (selection.mode === "face") {
        const m = new THREE.Mesh(
          positionsBuffer(
            selection.ids.flatMap((i) => topology.faces[i].flatMap(p)),
          ),
          new THREE.MeshBasicMaterial({
            color: "#efba62",
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
            depthTest: !through,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        );
        chosen.add(m);
      }
      if (selection.mode === "edge")
        chosen.add(
          new THREE.LineSegments(
            positionsBuffer(
              selection.ids.flatMap((i) => topology.edges[i].flatMap(p)),
            ),
            new THREE.LineBasicMaterial({
              color: "#ffd186",
              depthTest: !through,
            }),
          ),
        );
      chosen.add(
        new THREE.Points(
          positionsBuffer(verts.flat()),
          new THREE.PointsMaterial({
            color: "#ffcc73",
            size: 8,
            sizeAttenuation: false,
            depthTest: !through,
          }),
        ),
      );
      if (movePivot) {
        pivot.position.set(0, 0, 0);
        for (const p of verts) pivot.position.add(new THREE.Vector3(...p));
        pivot.position.divideScalar(verts.length);
        transform?.attach(pivot);
      }
      if (selection.mode === "vertex" && selection.ids.length === 1)
        for (let a = 0; a < 3; a++)
          $("#mesh-v" + ["x", "y", "z"][a]).value = p(selection.ids[0])[a];
    } else transform?.detach();
    $("#mesh-selection").textContent = `Выбрано: ${selection.ids.length}`;
    $("#mesh-ids").value = selection.ids.join(", ");
    $("#mesh-stats").textContent =
      `${geometry.positions.length / 3} вершин · ${topology.edges.length} рёбер · ${topology.faces.length} треугольников · локальные метры`;
    const mirror = modifiers.find((m) => m.type === "mirror");
    const subdivision = modifiers.find((m) => m.type === "subdivision");
    $("#mesh-live-enabled").checked = mirror?.enabled !== false;
    $("#mesh-live-enabled").disabled = !mirror;
    $("#mesh-bake-modifiers").disabled = !modifiers.length;
    $("#mesh-remove-modifiers").disabled = !mirror;
    $("#mesh-mirror").disabled = !!mirror;
    $("#mesh-modifier-status").textContent = mirror
      ? `Живое зеркало ${mirror.enabled === false ? "выключено" : "включено"} · результат: ${buffer.attributes.position.count} вершин, ${(buffer.index?.count ?? buffer.attributes.position.count) / 3} треугольников. Выбор — исходная половина.`
      : "Живого зеркала нет.";
    $("#mesh-subdivision-enabled").checked = subdivision?.enabled !== false;
    $("#mesh-subdivision-enabled").disabled = !subdivision;
    $("#mesh-remove-subdivision").disabled = !subdivision;
    $("#mesh-modifier-order").disabled = modifiers.length !== 2;
    $("#mesh-modifier-order").value =
      modifiers[0]?.type === "subdivision"
        ? "subdivision-first"
        : "mirror-first";
    if (subdivision)
      $("#mesh-subdivision-levels").value = subdivision.levels ?? 1;
    $("#mesh-subdivision-status").textContent = subdivision
      ? `Subdivision ${subdivision.enabled === false ? "выключен" : "включён"} · результат стека: ${buffer.attributes.position.count} вершин, ${(buffer.index?.count ?? buffer.attributes.position.count) / 3} треугольников. Выбор — исходный каркас.`
      : "Subdivision не добавлен.";
    if (mirror) {
      $("#mesh-axis").value = mirror.axis ?? "x";
      $("#mesh-side").value = mirror.side ?? "positive";
      $("#mesh-plane").value = mirror.offset ?? 0;
      $("#mesh-weld").value = mirror.tolerance ?? 0.00001;
    }
    $("#mesh-undo").disabled = !history.length;
    $("#mesh-redo").disabled = !future.length;
    $("#mesh-set-creases").disabled =
      selection.mode !== "edge" || !selection.ids.length;
    $("#mesh-unset-creases").disabled = $("#mesh-set-creases").disabled;
    $("#mesh-clear-creases").disabled = !geometry.creases?.length;
    $("#mesh-crease-stats").textContent =
      `Жёстких рёбер: ${physicalCreases(geometry).size}`;
    $("#mesh-extrude").disabled =
      selection.mode !== "face" || !selection.ids.length;
    $("#mesh-delete-faces").disabled = $("#mesh-extrude").disabled;
    $("#mesh-set-vertex").disabled =
      selection.mode !== "vertex" || selection.ids.length !== 1;
    $("#mesh-dissolve-vertex").disabled =
      selection.mode !== "vertex" || selection.ids.length !== 1;
    $("#mesh-split-edges").disabled =
      selection.mode !== "edge" || !selection.ids.length;
    $("#mesh-merge-vertices").disabled =
      selection.mode !== "vertex" || selection.ids.length < 2;
    $("#mesh-bevel-edge").disabled =
      selection.mode !== "edge" || !selection.ids.length;
    $("#mesh-bevel-vertex").disabled =
      selection.mode !== "vertex" || selection.ids.length !== 1;
    render();
  }
  function choose(mode, ids) {
    if (ids.length) selectedVertices(geometry, { mode, ids });
    else if (!["vertex", "edge", "face"].includes(mode))
      throw new Error("Invalid selection mode");
    selection = { mode, ids: [...new Set(ids)] };
    $("#mesh-mode").value = mode;
    refresh();
    return copy(selection);
  }
  function operate(command) {
    if (command.action === "dissolveVertex" && modifiers.some(
      m => m.type === "subdivision" && m.enabled !== false,
    )) throw new Error("Перед растворением запеки или выключи subdivision: его форма зависит от топологии.");
    const previous = state();
    let remap = new Map();
    const candidate = { type: "mesh", geometry, modifiers };
    if (command.op === "setModifiers")
      changeModifiers(candidate, command.modifiers);
    else if (command.op === "bakeModifiers") applyModifiers(candidate);
    else if (command.op) throw new Error("Unsupported workshop command");
    else
      candidate.geometry = editMeshGeometry(geometry, command, {
        onRemap: (map) => (remap = map),
      });
    const next = candidate.geometry,
      nextModifiers = candidate.modifiers ?? [];
    budget(evaluateMeshGeometry(candidate));
    const affected = Object.values(landmarks).filter(
      (a) => a.node === node.id && remap.has(a.vertex),
    );
    if (affected.length && command.landmarkPolicy !== "remap")
      throw new Error(
        "Операция заменяет вершину ориентира. Включи перенос ориентиров или измени критерии.",
      );
    budget(next);
    if (
      JSON.stringify(next) === JSON.stringify(geometry) &&
      JSON.stringify(nextModifiers) === JSON.stringify(modifiers)
    )
      return;
    if (operations.length >= 128)
      throw new Error(
        "Примени текущие изменения перед следующей серией операций.",
      );
    geometry = next;
    modifiers = nextModifiers;
    for (const a of affected) a.vertex = remap.get(a.vertex);
    operations.push(copy(command));
    stash(previous);
    if (command.op === "bakeModifiers" && selection.mode !== "vertex") {
      // Evaluated edge/face IDs have different identities from the source cage.
      selection.ids = [];
    } else if (command.action === "extrude") {
      // Cap face indices stay in their old slots; keep the selection on the cap.
    } else if (
      command.action === "deleteFaces" ||
      command.action === "splitEdges" ||
      command.action === "bevelEdge" ||
      command.action === "dissolveVertex"
    )
      selection.ids = [];
    else if (command.action === "mergeVertices")
      selection = {
        mode: "vertex",
        ids: [command.target ?? previous.selection.ids[0]],
      };
    else if (command.action === "bevelVertex")
      selection = { mode: "vertex", ids: [remap.values().next().value] };
    $("#mesh-error").textContent = "";
    refresh();
    return copy(geometry);
  }
  function delta() {
    return ["x", "y", "z"].map((a) => readNumber("#mesh-d" + a));
  }
  function readNumber(id) {
    const input = $(id);
    if (input.value.trim() === "" || !Number.isFinite(Number(input.value)))
      throw new Error("Введи конечное число.");
    return Number(input.value);
  }
  const safe = (fn) => {
    try {
      return fn();
    } catch (e) {
      error(e);
    }
  };
  function connectCamera() {
    orbit?.dispose();
    if (transform) {
      scene.remove(transform.getHelper());
      transform.dispose();
    }
    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableRotate = view === "perspective";
    orbit.target.copy(pivot.userData.viewTarget ?? new THREE.Vector3());
    orbit.addEventListener("change", render);
    transform = new TransformControls(camera, renderer.domElement);
    transform.setMode("translate");
    transform.setSpace("world");
    scene.add(transform.getHelper());
    transform.addEventListener("dragging-changed", (e) => {
      orbit.enabled = !e.value;
    });
    transform.addEventListener("change", render);
    transform.addEventListener("mouseDown", () => {
      drag = { before: state(), start: pivot.position.clone() };
    });
    transform.addEventListener("objectChange", () => {
      if (!drag) return;
      try {
        const offset = pivot.position.clone().sub(drag.start).toArray();
        const next = editMeshGeometry(drag.before.geometry, {
          action: "translate",
          selection: drag.before.selection,
          delta: offset,
        });
        budget(
          evaluateMeshGeometry({ type: "mesh", geometry: next, modifiers }),
        );
        geometry = next;
        refresh(false);
        $("#mesh-error").textContent = "";
      } catch (e) {
        error(e);
      }
    });
    transform.addEventListener("mouseUp", () => {
      if (!drag) return;
      const previous = drag.before,
        offset = pivot.position.clone().sub(drag.start).toArray();
      drag = null;
      geometry = copy(previous.geometry);
      selection = copy(previous.selection);
      operations = copy(previous.operations);
      safe(() =>
        operate({
          action: "translate",
          selection: copy(selection),
          delta: offset,
        }),
      );
      refresh();
    });
  }
  function fit() {
    surface.geometry.computeBoundingBox();
    const box = surface.geometry.boundingBox.clone();
    if (subdivided()) {
      cageSurface.geometry.computeBoundingBox();
      box.union(cageSurface.geometry.boundingBox);
    }
    const target = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3()),
      radius = Math.max(0.01, size.length() / 2);
    span =
      Math.max(0.1, size.length() * 1.35) *
      Math.max(1, host.clientHeight / Math.max(1, host.clientWidth));
    orthographic.zoom = 1;
    const direction =
      view === "front"
        ? new THREE.Vector3(0, 0, 1)
        : view === "side"
          ? new THREE.Vector3(1, 0, 0)
          : view === "top"
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1.1, 0.8, 1.6).normalize();
    camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
    camera.position
      .copy(target)
      .addScaledVector(direction, Math.max(1, radius * 3.5));
    camera.lookAt(target);
    orbit.target.copy(target);
    pivot.userData.viewTarget = target.clone();
    orbit.update();
    dimensions();
  }
  function setView(next) {
    if (!["perspective", "front", "side", "top"].includes(next))
      throw new Error("Unknown mesh view");
    view = next;
    $("#mesh-view").value = view;
    camera = view === "perspective" ? perspective : orthographic;
    connectCamera();
    refresh();
    fit();
    syncReferenceFields();
    void updateReference();
    return view;
  }
  async function loadTexture(data) {
    if (!textureCache.has(data))
      textureCache.set(
        data,
        new Promise((resolve, reject) =>
          new THREE.TextureLoader().load(
            data,
            (texture) => {
              if (closed) {
                texture.dispose();
                reject(new Error("Редактор закрыт"));
                return;
              }
              if (texture.image.width > 4096 || texture.image.height > 4096) {
                texture.dispose();
                reject(
                  new Error(
                    "Референс должен быть не больше 4096 px на сторону.",
                  ),
                );
                return;
              }
              texture.colorSpace = THREE.SRGBColorSpace;
              resolve(texture);
            },
            undefined,
            () =>
              reject(new Error("Не удалось прочитать изображение-референс.")),
          ),
        ),
      );
    return textureCache.get(data);
  }
  async function updateReference() {
    const retained = new Set(refs.map((r) => r.data));
    for (const [data, pending] of textureCache)
      if (!retained.has(data)) {
        textureCache.delete(data);
        pending.then((texture) => texture.dispose()).catch(() => {});
      }
    const generation = ++referenceGeneration,
      r = refs.find((r) => r.view === view);
    referencePlane.visible = false;
    render();
    if (!r) return;
    try {
      const texture = await loadTexture(r.data);
      if (closed || generation !== referenceGeneration) return;
      referencePlane.material.map = texture;
      referencePlane.material.opacity = r.opacity;
      referencePlane.material.needsUpdate = true;
      referencePlane.position.fromArray(r.center);
      referencePlane.rotation.set(
        view === "top" ? -Math.PI / 2 : 0,
        view === "side" ? Math.PI / 2 : 0,
        0,
      );
      referencePlane.scale.set(
        r.width,
        (r.width * texture.image.height) / texture.image.width,
        1,
      );
      referencePlane.visible = true;
      render();
    } catch (e) {
      if (!closed && generation === referenceGeneration) error(e);
    }
  }
  function syncReferenceFields() {
    const r = refs.find((r) => r.view === view);
    $("#mesh-reference-file").disabled = view === "perspective";
    $("#mesh-reference-update").disabled = !r;
    $("#mesh-reference-remove").disabled = !r;
    $("#mesh-reference-width").value = r?.width ?? 1;
    $("#mesh-reference-opacity").value = r?.opacity ?? 0.4;
    for (let a = 0; a < 3; a++)
      $("#mesh-r" + ["x", "y", "z"][a]).value = r?.center[a] ?? 0;
    $("#mesh-reference-name").textContent =
      r?.name ?? "Для этого вида референс не задан.";
  }
  function referenceFields() {
    return {
      width: readNumber("#mesh-reference-width"),
      opacity: readNumber("#mesh-reference-opacity"),
      center: ["x", "y", "z"].map((a) => readNumber("#mesh-r" + a)),
    };
  }
  function setReferences(next) {
    validateReferences(next);
    if (JSON.stringify(next) === JSON.stringify(refs)) return;
    stash(state());
    refs = copy(next);
    $("#mesh-error").textContent = "";
    refresh();
    syncReferenceFields();
    void updateReference();
  }
  $("#mesh-reference-file").onchange = async (e) => {
    const file = e.target.files[0],
      atView = view;
    if (!file) return;
    try {
      if (atView === "perspective")
        throw new Error("Выбери ортографический вид.");
      if (file.size > 1024 * 1024)
        throw new Error(
          "Изображение больше 1 МиБ. Уменьши его перед импортом.",
        );
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Нужен PNG, JPEG или WebP.");
      const beforeRefs = JSON.stringify(refs);
      const fields = referenceFields(),
        data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      if (closed) return;
      const next = [
        ...refs.filter((r) => r.view !== atView),
        { view: atView, name: file.name, data, ...fields },
      ];
      validateReferences(next);
      await loadTexture(data);
      if (!closed) {
        if (JSON.stringify(refs) !== beforeRefs)
          throw new Error(
            "Референсы изменились во время загрузки. Повтори импорт.",
          );
        setReferences(next);
      }
    } catch (e) {
      error(e);
    } finally {
      if (!closed) e.target.value = "";
    }
  };
  $("#mesh-reference-update").onclick = () =>
    safe(() =>
      setReferences(
        refs.map((r) => (r.view === view ? { ...r, ...referenceFields() } : r)),
      ),
    );
  $("#mesh-reference-remove").onclick = () =>
    safe(() => setReferences(refs.filter((r) => r.view !== view)));
  $("#mesh-view").onchange = (e) => safe(() => setView(e.target.value));
  $("#mesh-fit").onclick = fit;
  $("#mesh-mode").onchange = (e) => choose(e.target.value, []);
  $("#mesh-xray").onchange = () => refresh();
  $("#mesh-select-ids").onclick = () =>
    safe(() =>
      choose(
        selection.mode,
        $("#mesh-ids").value.trim() === ""
          ? []
          : $("#mesh-ids")
              .value.split(",")
              .map((s) => (s.trim() === "" ? NaN : Number(s))),
      ),
    );
  $("#mesh-all").onclick = () => {
    const t = meshTopology(geometry),
      length =
        selection.mode === "vertex"
          ? geometry.positions.length / 3
          : selection.mode === "edge"
            ? t.edges.length
            : t.faces.length;
    choose(
      selection.mode,
      selection.mode === "vertex"
        ? activeVertices()
        : Array.from({ length }, (_, i) => i),
    );
  };
  $("#mesh-clear").onclick = () => choose(selection.mode, []);
  $("#mesh-translate").onclick = () =>
    safe(() =>
      operate({
        action: "translate",
        selection: copy(selection),
        delta: delta(),
      }),
    );
  const landmarkPolicy = () =>
    $("#mesh-remap-landmarks").checked ? "remap" : "reject";
  $("#mesh-dissolve-vertex").onclick = () =>
    safe(() => operate({
      action: "dissolveVertex", selection: copy(selection),
      landmarkPolicy: landmarkPolicy(),
    }));
  $("#mesh-split-edges").onclick = () =>
    safe(() =>
      operate({
        action: "splitEdges",
        selection: copy(selection),
        fraction: readNumber("#mesh-split-fraction"),
      }),
    );
  $("#mesh-merge-vertices").onclick = () =>
    safe(() =>
      operate({
        action: "mergeVertices",
        selection: copy(selection),
        target:
          $("#mesh-merge-target").value.trim() === ""
            ? selection.ids[0]
            : readNumber("#mesh-merge-target"),
        placement: $("#mesh-merge-placement").value,
        attributePolicy: $("#mesh-attribute-policy").value,
        landmarkPolicy: landmarkPolicy(),
      }),
    );
  $("#mesh-bevel-edge").onclick = () =>
    safe(() =>
      operate({
        action: "bevelEdge",
        selection: copy(selection),
        width: readNumber("#mesh-edge-bevel-width"),
        segments: readNumber("#mesh-edge-bevel-segments"),
        landmarkPolicy: $("#mesh-remap-landmarks").checked ? "remap" : "reject",
      }),
    );
  $("#mesh-bevel-vertex").onclick = () =>
    safe(() =>
      operate({
        action: "bevelVertex",
        vertex: selection.ids[0],
        width: readNumber("#mesh-bevel-width"),
        landmarkPolicy: landmarkPolicy(),
      }),
    );
  $("#mesh-extrude").onclick = () =>
    safe(() =>
      operate({
        action: "extrude",
        selection: copy(selection),
        delta: delta(),
      }),
    );
  $("#mesh-delete-faces").onclick = () =>
    safe(() => operate({ action: "deleteFaces", selection: copy(selection) }));
  $("#mesh-set-vertex").onclick = () =>
    safe(() =>
      operate({
        action: "setVertex",
        vertex: selection.ids[0],
        position: ["x", "y", "z"].map((a) => readNumber("#mesh-v" + a)),
      }),
    );
  $("#mesh-mirror").onclick = () =>
    safe(() =>
      operate({
        action: "mirror",
        axis: $("#mesh-axis").value,
        side: $("#mesh-side").value,
        offset: readNumber("#mesh-plane"),
        tolerance: readNumber("#mesh-weld"),
      }),
    );
  function setModifier(type, settings) {
    const next = copy(modifiers),
      index = next.findIndex((m) => m.type === type);
    if (index >= 0) {
      if (settings) next[index] = { ...settings, type };
      else next.splice(index, 1);
    } else if (settings) {
      if (type === "mirror") next.unshift({ ...settings, type });
      else next.push({ ...settings, type });
    }
    return operate({ op: "setModifiers", modifiers: next });
  }
  function setLiveMirror(mirror) {
    return setModifier("mirror", mirror);
  }
  function setSubdivision(settings) {
    return setModifier("subdivision", settings);
  }
  $("#mesh-set-creases").onclick = () =>
    safe(() =>
      operate({
        action: "setCreases",
        selection: copy(selection),
        enabled: true,
      }),
    );
  $("#mesh-unset-creases").onclick = () =>
    safe(() =>
      operate({
        action: "setCreases",
        selection: copy(selection),
        enabled: false,
      }),
    );
  $("#mesh-clear-creases").onclick = () =>
    safe(() => operate({ action: "clearCreases" }));
  $("#mesh-subdivision").onclick = () =>
    safe(() =>
      setSubdivision({
        levels: readNumber("#mesh-subdivision-levels"),
        enabled: true,
      }),
    );
  $("#mesh-subdivision-enabled").onchange = () =>
    safe(() => {
      const current = modifiers.find((m) => m.type === "subdivision");
      try {
        setSubdivision({
          ...current,
          enabled: $("#mesh-subdivision-enabled").checked,
        });
      } finally {
        $("#mesh-subdivision-enabled").checked =
          modifiers.find((m) => m.type === "subdivision")?.enabled !== false;
      }
    });
  $("#mesh-remove-subdivision").onclick = () =>
    safe(() => setSubdivision(null));
  $("#mesh-modifier-order").onchange = () =>
    safe(() => {
      const first =
        $("#mesh-modifier-order").value === "mirror-first"
          ? "mirror"
          : "subdivision";
      try {
        operate({
          op: "setModifiers",
          modifiers: [...modifiers].sort(
            (a, b) => (a.type === first ? -1 : 1) - (b.type === first ? -1 : 1),
          ),
        });
      } finally {
        $("#mesh-modifier-order").value =
          modifiers[0]?.type === "subdivision"
            ? "subdivision-first"
            : "mirror-first";
      }
    });
  $("#mesh-live-mirror").onclick = () =>
    safe(() =>
      setLiveMirror({
        axis: $("#mesh-axis").value,
        side: $("#mesh-side").value,
        offset: readNumber("#mesh-plane"),
        tolerance: readNumber("#mesh-weld"),
        enabled: true,
      }),
    );
  $("#mesh-live-enabled").onchange = () =>
    safe(() => {
      try {
        setLiveMirror({
          ...modifiers.find((m) => m.type === "mirror"),
          enabled: $("#mesh-live-enabled").checked,
        });
      } finally {
        $("#mesh-live-enabled").checked =
          modifiers.find((m) => m.type === "mirror")?.enabled !== false;
      }
    });
  $("#mesh-bake-modifiers").onclick = () =>
    safe(() => operate({ op: "bakeModifiers" }));
  $("#mesh-remove-modifiers").onclick = () => safe(() => setLiveMirror(null));
  $("#mesh-normals").onclick = () =>
    safe(() => operate({ action: "recalculateNormals" }));
  function undo() {
    if (history.length) {
      future.push(state());
      restore(history.pop());
    }
  }
  function redo() {
    if (future.length) {
      history.push(state());
      restore(future.pop());
    }
  }
  $("#mesh-undo").onclick = undo;
  $("#mesh-redo").onclick = redo;
  function project(point) {
    const p = new THREE.Vector3(...point).project(camera),
      rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((p.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - p.y) * rect.height) / 2,
      z: p.z,
    };
  }
  const raycaster = new THREE.Raycaster();
  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect(),
      ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((e.clientY - rect.top) / rect.height) * 2,
      );
    raycaster.setFromCamera(ndc, camera);
    const t = meshTopology(geometry);
    let found = null;
    if (selection.mode === "face") {
      const hit = raycaster.intersectObject(
        subdivided() ? cageSurface : surface,
      )[0];
      if (hit && hit.faceIndex < t.faces.length) found = hit.faceIndex;
    } else {
      const p = (i) => geometry.positions.slice(i * 3, i * 3 + 3),
        candidates =
          selection.mode === "vertex"
            ? activeVertices().map((i) => [i])
            : t.edges;
      let best = 12,
        bestDepth = Infinity;
      for (let i = 0; i < candidates.length; i++) {
        const ids = candidates[i],
          a = project(p(ids[0])),
          b = project(p(ids[1] ?? ids[0]));
        if (a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1) continue;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          ratio = Math.max(
            0,
            Math.min(
              1,
              ((e.clientX - a.x) * dx + (e.clientY - a.y) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          ),
          x = a.x + ratio * dx,
          y = a.y + ratio * dy,
          depth = a.z + ratio * (b.z - a.z),
          distance = Math.hypot(x - e.clientX, y - e.clientY);
        if (
          distance > best + 0.1 ||
          (Math.abs(distance - best) < 0.1 && depth >= bestDepth)
        )
          continue;
        if (!$("#mesh-xray").checked) {
          const world = new THREE.Vector3(...p(ids[0])).lerp(
              new THREE.Vector3(...p(ids[1] ?? ids[0])),
              ratio,
            ),
            screen = world.clone().project(camera);
          const occlusion = new THREE.Raycaster();
          occlusion.setFromCamera(
            new THREE.Vector2(screen.x, screen.y),
            camera,
          );
          const hit = occlusion.intersectObject(
            subdivided() ? cageSurface : surface,
          )[0];
          if (
            hit &&
            hit.distance + Math.max(1e-5, hit.distance * 1e-5) <
              world
                .clone()
                .sub(occlusion.ray.origin)
                .dot(occlusion.ray.direction)
          )
            continue;
        }
        best = distance;
        bestDepth = depth;
        found = selection.mode === "vertex" ? ids[0] : i;
      }
    }
    if (found !== null) {
      const ids = e.shiftKey ? new Set(selection.ids) : new Set();
      if (e.shiftKey && ids.has(found)) ids.delete(found);
      else ids.add(found);
      choose(selection.mode, [...ids]);
    } else if (!e.shiftKey) choose(selection.mode, []);
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    down = {
      x: e.clientX,
      y: e.clientY,
      gizmo: !!transform.axis,
      button: e.button,
    };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (
      down &&
      down.button === 0 &&
      !down.gizmo &&
      Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 &&
      !drag
    )
      pick(e);
    down = null;
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.stopPropagation();
      e.shiftKey ? redo() : undo();
    }
  });
  async function apply() {
    try {
      if (drag) throw new Error("Заверши перемещение перед применением.");
      validateReferences(refs);
      for (const r of refs) await loadTexture(r.data);
      if (closed) return { applied: false, error: "Редактор закрыт" };
      await onApply({
        geometry: copy(geometry),
        operations: copy(operations),
        references: copy(refs),
      });
      dialog.close();
      return { applied: true };
    } catch (e) {
      error(e);
      return { applied: false, error: e.message };
    }
  }
  $("#mesh-apply").onclick = apply;
  $("#mesh-close").onclick = () => dialog.close();
  const observer = new ResizeObserver(dimensions);
  observer.observe(host);
  dialog.addEventListener(
    "close",
    () => {
      closed = true;
      observer.disconnect();
      orbit.dispose();
      transform.dispose();
      for (const pending of textureCache.values())
        pending.then((t) => t.dispose()).catch(() => {});
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material)
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
      });
      cageSurface.geometry.dispose();
      referencePlane.geometry.dispose();
      referencePlane.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      dialog.remove();
    },
    { once: true },
  );
  dialog.showModal();
  setView("perspective");
  return Object.freeze({
    select: choose,
    operate,
    setLiveMirror,
    setSubdivision,
    bakeModifiers: () => operate({ op: "bakeModifiers" }),
    setView,
    fit,
    undo,
    redo,
    getDraft: () => state(),
    project,
    screenshot: () => {
      render();
      return renderer.domElement.toDataURL("image/png");
    },
    apply,
    close: () => dialog.close(),
  });
}
