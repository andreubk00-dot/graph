import { openMeshEditor } from "./mesh-editor.js";
import { bakeMeshGeometry } from "./mesh-convert.js";
import { meshTopology } from "./mesh-edit.js";
import { auditMeasurements, auditLocomotion } from "./model-review.js";
import { openModelReview } from "./review-editor.js";
import { makeReviewOverlay } from "./review-overlay.js";
import { auditRig, sampleRig } from "./rig-audit.js";
import { openRigReview } from "./rig-review.js";
import asterionURL from "../examples/asterion.graph.json?url";
import { auditMesh } from "./mesh-audit.js";
import { advanceClipTime } from "./locomotion.js";
import wardenURL from "../examples/warden.graph.json?url";
import { openArtEditor } from "./art-editor.js";
import { openSculptEditor } from "./sculpt-editor.js";
import cinderURL from "../examples/cinder-demon.graph.json?url";
import { selectionRoots, poseMatrix, matrixPose } from "./operations.js";
import { importOBJ as parseOBJ } from "./obj-import.js";
import { DEFAULT_OUTLINE } from "./polygon.js";
import { openClipManager } from "./clip-manager.js";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/jetbrains-mono/400.css";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  buildContent,
  createGLB,
  geometryFor,
  updateSkinnedBounds,
} from "./scene.js";
import {
  TYPES,
  emptyDocument,
  starterDocument,
  validateDocument,
  applyCommands,
  getClip,
  clipDuration,
  keysFor,
  poseFor,
  DEFAULT_PROFILE,
} from "./document.js";
import { openProfileEditor } from "./profile-editor.js";
import "./style.css";

const paths = {
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  move: '<path d="M12 3v18M3 12h18m-6-6-3-3-3 3m6 12-3 3-3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
  rotate: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  scale: '<path d="M14 3h7v7m0-7-9 9M3 14h7v7H3z"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hidden:
    '<path d="m3 3 18 18M9 5.5A12 12 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.7M6 6C3.5 8.2 2 12 2 12s3.5 7 10 7a12 12 0 0 0 5-1"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  folder: '<path d="M3 7V4h6l3 3h9v13H3V7Z"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h11a7 7 0 0 1 7 7v4"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H10a7 7 0 0 0-7 7v4"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  focus:
    '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  key: '<path d="m12 3 8 9-8 9-8-9 8-9Z"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  skip: '<path d="M5 5v14M19 5 8 12l11 7V5Z"/>',
  new: '<path d="M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 15h8m-4-4v8"/>',
};
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.cube}</svg>`;
const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (id, name, title, text = "") =>
  `<button id="${id}" title="${title}" aria-label="${title}">${icon(name)}${text ? `<span>${text}</span>` : ""}</button>`;
const primitiveNames = {
  group: "Группа",
  bone: "Кость",
  box: "Куб",
  sphere: "Сфера",
  cylinder: "Цилиндр",
  cone: "Конус",
  torus: "Тор",
  plane: "Плоскость",
  capsule: "Капсула",
  lathe: "Тело вращения",
  extrude: "Выдавливание",
  mesh: "Импортированная сетка",
};
$("#app").innerHTML = `
<header class="topbar"><a class="brand" href="#" aria-label="Graph Forge">${icon("cube", 27)}<strong>GRAPH<span>FORGE</span></strong><small>3D STUDIO</small></a><div class="project-heading"><span class="project-dot"></span><input id="project-name" aria-label="Название проекта" maxlength="200"><span id="save-state">Сохранено локально</span></div><div class="top-actions">${button("open", "folder", "Открыть проект")}${button("save", "save", "Сохранить проект (Ctrl+S)")}${button("recovery", "download", "Скачать повреждённый проект для восстановления")}${button("commands", "code", "Программные команды", "Команды")}<button id="export" class="primary">${icon("download")} Экспорт GLB</button></div></header>
<nav class="workspace-bar"><div class="asset-workspaces"><button id="open-art">2D / Pixel</button><button id="review-model">Контроль модели</button><button id="new-sculpt">Органическая сетка</button></div><div class="workspace-tabs"><span class="active">Моделирование</span><span class="tab-note">Объекты · материалы · анимация</span></div><div class="history"><button id="space" title="Система координат манипулятора">Мир</button><button id="snap" aria-pressed="false" title="Привязка: 0.25 м / 15° / 0.1">Привязка</button><span class="separator"></span>${button("undo", "undo", "Отменить (Ctrl+Z)")}${button("redo", "redo", "Повторить (Ctrl+Shift+Z)")}<span class="separator"></span>${button("help", "help", "Справка и горячие клавиши")}</div></nav>
<main class="editor-layout">
<aside class="left-panel"><div class="panel-title"><span>СЦЕНА</span><span id="node-count" class="count"></span></div><div class="scene-actions">${button("add", "plus", "Добавить объект", "Добавить")}${button("new", "new", "Новая пустая сцена")}</div><div id="add-menu" class="popover" hidden>${TYPES.filter(
  (t) => t !== "mesh",
)
  .map(
    (t) =>
      `<button data-primitive="${t}">${icon("cube")} ${primitiveNames[t]}</button>`,
  )
  .join(
    "",
  )}</div><button id="import-obj" class="import-obj" title="Импортировать геометрию OBJ">${icon("folder", 14)} Импорт OBJ</button><div class="scene-search"><input id="scene-search" type="search" placeholder="Найти объект…" aria-label="Поиск объектов"></div><div class="selection-actions"><button id="group-selection" title="Группировать (Ctrl+G)">Группа</button><button id="ungroup-selection" title="Разгруппировать (Ctrl+Shift+G)">Разобрать</button></div><div class="tree-header">${icon("chevron", 13)} ${icon("folder", 15)} <span>Коллекция сцены</span></div><div id="tree" class="tree" role="tree" aria-multiselectable="true" aria-label="Объекты сцены"></div><div class="left-bottom"><div class="section-label">БИБЛИОТЕКА ПРИМИТИВОВ</div><div class="primitive-library">${["box", "sphere", "cylinder", "cone"].map((t) => `<button data-primitive="${t}" title="Добавить: ${primitiveNames[t]}"><span class="primitive-shape ${t}"></span><span>${primitiveNames[t]}</span></button>`).join("")}</div><button id="cinder-demo" class="wide-button" title="Открыть пример: горящий демон с анимацией бега">CINDER · Горящий демон</button><button id="warden-demo" class="wide-button">Warden · Цельная сетка</button><button id="rig-study" class="wide-button">Стенд скиннинга</button><button id="review-rig" class="wide-button">Проверка рига</button><button id="asterion-demo" class="wide-button">Asterion · Точная модель</button><div class="local-note"><span class="status-dot"></span> Локальная рабочая среда</div></div></aside>
<section class="viewport" id="viewport" aria-label="3D-сцена"><div class="viewport-top"><div class="view-label">ПЕРСПЕКТИВА <span>·</span> <span id="view-mode">Материалы</span></div><div class="viewport-toggles"><select id="shading-mode" aria-label="Отображение поверхности"><option value="material">Материал</option><option value="silhouette">Силуэт</option><option value="normals">Нормали</option><option value="weights">Веса</option></select>${button("rig-overlay", "key", "Показать кости")}<button id="review-mesh" title="Проверка сетки" aria-label="Проверка сетки">✓</button>${button("grid", "grid", "Показать или скрыть сетку")}${button("wireframe", "cube", "Каркас объектов")}${button("capture", "image", "Сохранить PNG")}</div></div><div class="tool-rail">${button("translate", "move", "Перемещение (W)")}${button("rotate", "rotate", "Вращение (E)")}${button("scale", "scale", "Масштаб (R)")}<span class="rail-divider"></span>${button("focus", "focus", "Сфокусировать (F)")}</div><div class="axis-widget"><button data-view="top" class="axis-y" title="Вид сверху">Y</button><button data-view="front" class="axis-z" title="Вид спереди">Z</button><button data-view="right" class="axis-x" title="Вид справа">X</button><i></i></div><div class="viewport-bottom"><span id="selection-label">Scout</span><span>ЛКМ — выбор <b>·</b> Перетаскивание — орбита <b>·</b> Колесо — масштаб</span></div><div class="scene-caption"><span>01 / CHARACTER STUDY</span><h1>Meet Scout.</h1><p>Твоя первая сцена. Дальше — что угодно.</p></div></section>
<aside class="right-panel"><div class="panel-title"><span>СВОЙСТВА</span>${icon("sun", 15)}</div><div id="inspector"></div></aside>
<section class="timeline"><div class="timeline-header"><div class="timeline-title">${icon("key", 15)}<select id="active-clip" aria-label="Активный клип"><option value="">Action</option></select><button id="manage-clips" title="Управление клипами" aria-label="Управление клипами">…</button><span class="count" id="key-count">3 ключа</span></div><div class="playback">${button("rewind", "skip", "В начало")}${button("prev-key", "chevron", "Предыдущий ключ ([)")}${button("play", "play", "Воспроизведение (Пробел)")}${button("next-key", "chevron", "Следующий ключ (])")}<span id="time-label">0.00 <small>/ 4.00 с</small></span></div><div class="timeline-actions"><label><input id="duration" type="number" min="0.1" max="600" step="0.1" aria-label="Длительность"> с</label><select id="fps" class="fps" aria-label="Частота кадров"><option value="24">24 FPS</option><option value="30">30 FPS</option><option value="60">60 FPS</option></select><button id="add-key">${icon("plus", 14)} Ключ</button>${button("remove-key", "trash", "Удалить ключ в текущем кадре")}</div></div><div class="timeline-body"><div class="track-label">${icon("cube", 15)}<span id="track-name">Scout</span>${icon("key", 12)}</div><div class="timeline-lane" id="timeline-lane"><div id="ruler" class="ruler"></div><div id="keyframes" class="keyframes"></div><div id="playhead" class="playhead"><i></i></div><input id="scrubber" type="range" min="0" max="4" step="0.0416667" value="0" aria-label="Время анимации"></div></div></section>
</main><footer class="statusbar"><span><i></i> GRAPH ENGINE <b>v0.14</b></span><span id="scene-stats"></span><span>Y UP <b>·</b> METERS <b>·</b> WEBGL</span></footer><div id="toast" role="status"></div><input type="file" id="file-input" accept=".json,.graph" hidden><input type="file" id="obj-input" accept=".obj" hidden>
<dialog id="command-dialog"><div class="dialog-header"><div><span class="eyebrow">AGENT WORKSPACE</span><h2>Сцена как код</h2></div><button data-close aria-label="Закрыть">${icon("close")}</button></div><p>Пакет JSON-команд применяется целиком. Ошибка не изменит сцену. Координаты — метры, вращение — радианы.</p><textarea id="command-input" spellcheck="false" aria-label="JSON-команды"></textarea><div id="command-error" role="alert"></div><div class="dialog-footer"><span>API: <code>window.forge.execute(commands)</code></span><button id="run-commands" class="primary">Применить команды ${icon("chevron", 15)}</button></div></dialog>
<dialog id="help-dialog"><div class="dialog-header"><div><span class="eyebrow">GRAPH FORGE</span><h2>Рабочее пространство</h2></div><button data-close aria-label="Закрыть">${icon("close")}</button></div><p>Создавай модели из примитивов, выбирай родителя в свойствах и анимируй трансформации ключевыми кадрами.</p><div class="shortcut-grid"><span>Перемещение / вращение / масштаб</span><kbd>W / E / R</kbd><span>Фокус на объекте</span><kbd>F</kbd><span>Воспроизведение / пауза</span><kbd>Пробел</kbd><span>Дублировать</span><kbd>Shift D</kbd><span>Добавить в выделение</span><kbd>Shift + клик</kbd><span>Группа / разгруппировать</span><kbd>Ctrl G / Ctrl Shift G</kbd><span>Удалить объект с дочерними</span><kbd>Delete</kbd><span>Отменить / повторить</span><kbd>Ctrl Z / Ctrl Shift Z</kbd><span>Сохранить проект</span><kbd>Ctrl S</kbd><span>Панорамирование</span><kbd>ПКМ + движение</kbd></div><p>«Ключ» сохраняет положение, вращение и масштаб выбранного объекта. У уже анимированных объектов правки автоматически записываются ключом в текущем кадре. Дочерние объекты наследуют трансформации родителя.</p><p>JSON-проект сохраняет редактируемую сцену. GLB экспортирует модели, материалы, иерархию и анимацию для игровых движков. Сетка и студийный свет в экспорт не входят.</p><p class="muted">Цельные органические поверхности доступны по рецептам SDF. 2D / Pixel открывает мастерскую рисунка и покадровой анимации. Кости и скиннинг доступны через стенд и API; автоматического рига, кистей весов и редактора UV пока нет. Выдавливание, скругления, капсулы и тела вращения доступны в меню добавления и свойствах. Меню клипов позволяет создавать независимые действия. Ключи можно перетаскивать; [ / ] переключают ключи. Полная спецификация API — в README проекта.</p></dialog>`;

let doc = starterDocument(),
  recoveryProject = null;
try {
  recoveryProject = localStorage.getItem("graph-forge-recovery");
  const saved = localStorage.getItem("graph-forge-project");
  if (saved) {
    try {
      doc = validateDocument(JSON.parse(saved));
    } catch {
      recoveryProject = saved;
      localStorage.setItem("graph-forge-recovery", saved);
    }
  }
} catch {
  /* Browser storage is optional; file import/export still works. */
}
$("#recovery").hidden = !recoveryProject;
let activeClip = null;
const duration = () => clipDuration(doc, activeClip);
const track = (node) => (node ? keysFor(doc, node, activeClip) : []);
let selected = doc.nodes.some((n) => n.id === "scout")
  ? "scout"
  : (doc.nodes[0]?.id ?? null);
let selectedIds = new Set(selected ? [selected] : []);
let dragState = null;
let time = 0,
  playing = false,
  wireframe = false,
  dirtyBeforeDrag = null;
let history = [],
  future = [],
  objects = new Map();
let toastTimer;
const collapsed = new Set();
let snapping = false;
const viewport = $("#viewport");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
} catch (error) {
  viewport.innerHTML =
    '<div class="webgl-error"><h2>WebGL недоступен</h2><p>Открой редактор в браузере с аппаратным ускорением или поддержкой WebGL 2.</p></div>';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.domElement.className = "scene-canvas";
renderer.domElement.setAttribute("aria-label", "Интерактивная 3D-сцена");
viewport.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#242b2e");
scene.fog = new THREE.Fog("#242b2e", 22, 65);
// Procedural studio reflections make PBR metals readable without network assets.
const studio = new RoomEnvironment(),
  pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studio, 0.04).texture;
scene.environmentIntensity = 0.65;
studio.dispose();
pmrem.dispose();
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
camera.position.set(5.4, 4.2, 7);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.2, 0);
orbit.enableDamping = true;
orbit.minDistance = 0.2;
orbit.maxDistance = 200;
const ambient = new THREE.HemisphereLight("#d9e8ff", "#68706a", 2.3);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight("#fff3dd", 4.5);
keyLight.position.set(4, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -10;
keyLight.shadow.normalBias = 0.025;
scene.add(keyLight);
const rim = new THREE.DirectionalLight("#acc9ff", 2);
rim.position.set(-5, 4, -3);
scene.add(rim);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: "#30383b", roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(100, 100, "#697877", "#485353");
grid.position.y = 0.005;
grid.material.transparent = true;
grid.material.opacity = 0.32;
scene.add(grid);
let shading = "material";
const materialCache = new Map(),
  shadingMaterials = {
    silhouette: new THREE.MeshBasicMaterial({
      color: "#d3e8de",
      side: THREE.DoubleSide,
    }),
    weights: new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    normals: new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }),
  };
const weightGeometryCache = new Map();
function restoreSurfaceMaterials() {
  for (const [mesh, geometry] of weightGeometryCache) {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }
  weightGeometryCache.clear();
  content.traverse((o) => {
    if (materialCache.has(o)) {
      o.material = materialCache.get(o);
      o.material.wireframe = wireframe;
    }
  });
  materialCache.clear();
}
function applyShading() {
  if (shading === "material") return;
  const material = shadingMaterials[shading];
  material.wireframe = wireframe;
  content.traverse((o) => {
    if (o.isMesh) {
      materialCache.set(o, o.material);
      o.material = material;
      if (shading === "weights") {
        const n = doc.nodes.find((n) => n.id === o.userData.nodeId);
        const colors = new Float32Array(
          o.geometry.attributes.position.count * 3,
        );
        weightGeometryCache.set(o, o.geometry);
        o.geometry = o.geometry.clone();
        for (let v = 0; v < colors.length / 3; v++) {
          let weight = 0;
          if (n?.skin)
            for (let j = 0; j < 4; j++) {
              if (n.skin.joints[n.skin.indices[v * 4 + j]] === selected)
                weight += n.skin.weights[v * 4 + j];
            }
          colors.set(
            [
              0.04 + 0.96 * weight,
              0.12 + 0.18 * weight,
              0.65 * (1 - weight) + 0.03 * weight,
            ],
            v * 3,
          );
        }
        o.geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3),
        );
      }
    }
  });
}
function setShading(mode) {
  if (!["material", "silhouette", "normals", "weights"].includes(mode))
    throw new Error("Unknown surface view");
  restoreSurfaceMaterials();
  shading = mode;
  applyShading();
  $("#shading-mode").value = mode;
  renderer.render(scene, camera);
}
const content = new THREE.Group();
scene.add(content);
let reviewOverlay = null,
  reviewVisible = false;
function refreshReviewOverlay() {
  if (reviewOverlay) {
    scene.remove(reviewOverlay.group);
    reviewOverlay.dispose();
  }
  reviewOverlay = makeReviewOverlay(doc.review, objects);
  reviewOverlay.group.visible = reviewVisible;
  scene.add(reviewOverlay.group);
  reviewOverlay.update();
}
function setReviewVisible(value) {
  if (typeof value !== "boolean")
    throw new Error("Review visibility must be boolean");
  reviewVisible = value;
  if (reviewOverlay) {
    reviewOverlay.group.visible = value;
    reviewOverlay.update();
  }
  renderer.render(scene, camera);
}
function showMeshEditor(id = selected) {
  const n = doc.nodes.find((n) => n.id === id);
  if (!n || ["group", "bone"].includes(n.type))
    throw new Error("Выбери объект с поверхностью.");
  pause();
  const source = structuredClone(n);
  const originalReferences = JSON.stringify(doc.referenceImages ?? []);
  const originalReview = JSON.stringify(doc.review ?? null);
  return openMeshEditor({
    node: source,
    references: doc.referenceImages ?? [],
    review: doc.review,
    onApply: ({ operations, references }) => {
      if (
        operations.some((c) =>
          ["mergeVertices", "bevelVertex", "bevelEdge", "dissolveVertex"].includes(c.action),
        ) &&
        JSON.stringify(doc.review ?? null) !== originalReview
      )
        throw new Error("Критерии модели изменились. Открой черновик заново.");
      if (
        JSON.stringify(doc.nodes.find((n) => n.id === id)) !==
          JSON.stringify(source) ||
        JSON.stringify(doc.referenceImages ?? []) !== originalReferences
      )
        throw new Error(
          "Проект изменился после открытия редактора. Закрой черновик и открой его заново.",
        );
      const commands = [];
      if (operations.length && source.type !== "mesh")
        commands.push({
          op: "convertMesh",
          id,
          geometry: bakeMeshGeometry(source),
        });
      commands.push(
        ...operations.map((c) => ({ ...c, op: c.op ?? "meshEdit", id })),
      );
      if (JSON.stringify(references) !== originalReferences)
        commands.push({ op: "setReferenceImages", references });
      if (commands.length) execute(commands);
    },
  });
}
function showModelReview() {
  pause();
  return openModelReview({
    getDocument: () => structuredClone(doc),
    getView: () => ({ selected, activeClip, time, reviewVisible }),
    apply: (review) => execute([{ op: "setReview", review }]),
    setOverlay: setReviewVisible,
    onNavigate: (clip, at, id) => {
      setClip(clip);
      seek(at);
      select(id);
    },
    onBench: async () => {
      try {
        const { motionStudy } = await import("./review-fixture.js");
        commit(motionStudy(), doc, {
          selected: null,
          activeClip: "travel",
          time: 0,
        });
        setReviewVisible(true);
        setShading("material");
        setStage({ groundY: 0 });
        setCameraView({ camera: [-2, 1.6, 2.5], target: [0, 0.15, 0] });
        toast("Стенд проверяет траектории блоков, не анатомию персонажа.");
      } catch (e) {
        toast(e.message, true);
      }
    },
  });
}

let rigOverlay = null,
  rigVisible = false;
function refreshRigOverlay() {
  if (rigOverlay) {
    scene.remove(rigOverlay);
    rigOverlay.dispose();
  }
  rigOverlay = new THREE.SkeletonHelper(content);
  rigOverlay.visible = rigVisible;
  rigOverlay.material.depthTest = false;
  rigOverlay.material.transparent = true;
  rigOverlay.renderOrder = 10;
  scene.add(rigOverlay);
}
function setRigVisible(value) {
  if (typeof value !== "boolean")
    throw new Error("Rig visibility must be boolean");
  rigVisible = value;
  if (rigOverlay) rigOverlay.visible = value;
  $("#rig-overlay").classList.toggle("active", value);
  $("#rig-overlay").setAttribute("aria-pressed", String(value));
  renderer.render(scene, camera);
}
const transform = new TransformControls(camera, renderer.domElement);
transform.setSize(0.8);
scene.add(transform.getHelper());
const box = new THREE.BoxHelper(new THREE.Object3D(), "#c0e79a");
box.visible = false;
scene.add(box);
const multiBox = new THREE.Box3Helper(new THREE.Box3(), "#c0e79a");
multiBox.visible = false;
scene.add(multiBox);
const selectionPivot = new THREE.Object3D();
scene.add(selectionPivot);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 3500);
}
function persist() {
  try {
    localStorage.setItem("graph-forge-project", JSON.stringify(doc));
    $("#save-state").textContent = "Сохранено локально";
  } catch {
    $("#save-state").textContent = "Не сохранено · скачай JSON";
    toast(
      "Локальное хранилище недоступно. Скачай проект для сохранения.",
      true,
    );
  }
}
function snapshot(document = doc) {
  const bytes =
    JSON.stringify(document.referenceImages ?? []).length * 2 +
    JSON.stringify(document.review ?? {}).length * 2 +
    document.nodes.reduce(
      (sum, n) =>
        sum +
        2000 +
        n.keys.length * 120 +
        (n.skin
          ? (n.skin.indices.length + n.skin.weights.length) * 8 +
            n.skin.joints.length * 160
          : 0) +
        Object.values(n.geometry).reduce(
          (n, v) => n + (Array.isArray(v) ? v.length * 8 : 0),
          0,
        ),
      0,
    ) +
    (document.clips ?? []).reduce(
      (sum, c) =>
        sum +
        Object.values(c.tracks).reduce((n, keys) => n + keys.length * 120, 0),
      0,
    );
  return {
    document: structuredClone(document),
    bytes,
    selected,
    selectedIds: [...selectedIds],
    time,
    activeClip,
  };
}
function trimHistory(stack) {
  let bytes = stack.reduce((sum, s) => sum + (s.bytes ?? 0), 0);
  while (stack.length > 1 && (stack.length > 80 || bytes > 64 * 1024 * 1024))
    bytes -= stack.shift().bytes ?? 0;
}
function stopPlayback() {
  playing = false;
  $("#play").innerHTML = icon("play");
  $("#play").setAttribute("aria-label", "Воспроизведение (Пробел)");
}
function commit(next, previous = doc, view = {}) {
  const valid = validateDocument(next);
  if (JSON.stringify(valid) === JSON.stringify(doc)) {
    if (Object.keys(view).length) {
      stopPlayback();
      if (Object.hasOwn(view, "activeClip")) activeClip = view.activeClip;
      time = Math.min(view.time ?? time, duration());
      syncSelection(view);
      rebuild();
    }
    return;
  }
  stopPlayback();
  history.push(snapshot(previous));
  trimHistory(history);
  future = [];
  doc = valid;
  if (Object.hasOwn(view, "activeClip")) activeClip = view.activeClip;
  if (activeClip && !doc.clips?.some((c) => c.id === activeClip))
    activeClip = null;
  time = Math.min(view.time ?? time, duration());
  syncSelection(view);
  syncSelection();
  rebuild();
  persist();
}
function execute(commands) {
  commit(applyCommands(doc, commands));
  return structuredClone(doc);
}
function disposeContent() {
  restoreSurfaceMaterials();
  content.traverse((o) => {
    o.skeleton?.dispose();
    o.geometry?.dispose();
    if (o.material) o.material.dispose();
  });
  content.clear();
}
function rebuild() {
  transform.detach();
  disposeContent();
  objects.clear();
  buildContent(content, doc, objects);
  refreshRigOverlay();
  refreshReviewOverlay();
  content.traverse((o) => {
    if (o.material) o.material.wireframe = wireframe;
  });
  applyShading();
  syncSelection();
  applyPose();
  renderTree();
  renderInspector();
  renderTimeline();
  $("#project-name").value = doc.name;
  $("#node-count").textContent = doc.nodes.length;
  $("#undo").disabled = !history.length;
  $("#redo").disabled = !future.length;
  $("#duration").value = duration();
  $("#fps").innerHTML = [...new Set([24, 30, 60, doc.fps])]
    .sort((a, b) => a - b)
    .map(
      (f) =>
        `<option value="${f}" ${f === doc.fps ? "selected" : ""}>${f} FPS</option>`,
    )
    .join("");
  $(".scene-caption").hidden = doc.name !== "Scout · character study";
  let vertices = 0;
  content.traverse((o) => {
    vertices += o.geometry?.attributes.position.count || 0;
  });
  $("#scene-stats").textContent =
    `${doc.nodes.length} объектов  ·  ${vertices.toLocaleString("ru-RU")} вершин`;
  refreshSelection(false);
}
function applyPose() {
  renderer.shadowMap.needsUpdate = true;
  for (const n of doc.nodes) {
    const o = objects.get(n.id),
      p = poseFor(doc, n, time, activeClip);
    o.position.fromArray(p.position);
    o.rotation.set(...p.rotation);
    o.scale.fromArray(p.scale);
  }
  updateSkinnedBounds(content);
  reviewOverlay?.update();
  updateSelectionBox();
}
function syncSelection(view = {}) {
  if (Object.hasOwn(view, "selectedIds"))
    selectedIds = new Set(view.selectedIds);
  else if (Object.hasOwn(view, "selected"))
    selectedIds = new Set(view.selected ? [view.selected] : []);
  if (Object.hasOwn(view, "selected")) selected = view.selected;
  selectedIds = new Set(
    [...selectedIds].filter((id) => doc.nodes.some((n) => n.id === id)),
  );
  if (!selectedIds.has(selected)) selected = [...selectedIds].at(-1) ?? null;
}
function selectMany(ids, { primary = ids.at(-1), refresh = true } = {}) {
  if (ids.length) selectionRoots(doc, ids);
  selectedIds = new Set(ids);
  selected = selectedIds.has(primary)
    ? primary
    : ([...selectedIds].at(-1) ?? null);
  if (shading === "weights") {
    restoreSurfaceMaterials();
    applyShading();
  }
  refreshSelection(refresh);
}
function select(id, refresh = true) {
  selectMany(objects.has(id) ? [id] : [], { primary: id, refresh });
}
function toggleSelect(id) {
  if (!id) return;
  const next = new Set(selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectMany([...next], { primary: next.has(id) ? id : [...next].at(-1) });
}
function selectionBounds() {
  const bounds = new THREE.Box3();
  for (const id of selectedIds.size
    ? selectionRoots(doc, [...selectedIds])
    : []) {
    const root = objects.get(id);
    if (!root || !isVisible(root)) continue;
    root.traverseVisible((o) => {
      if (o.isMesh) {
        if (o.isSkinnedMesh) {
          if (!o.boundingBox) o.computeBoundingBox();
          bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
          return;
        }
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        bounds.union(
          o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld),
        );
      }
    });
  }
  return bounds;
}
function updateSelectionBox() {
  if (selectedIds.size > 1) {
    multiBox.box.copy(selectionBounds());
    multiBox.visible = !multiBox.box.isEmpty();
  } else if (box.visible) box.update();
}
function refreshSelection(refresh = true) {
  transform.detach();
  box.visible = false;
  multiBox.visible = false;
  if (selectedIds.size > 1) {
    const bounds = selectionBounds(),
      roots = selectionRoots(doc, [...selectedIds]);
    const center = bounds.isEmpty()
      ? roots
          .reduce(
            (sum, id) =>
              sum.add(objects.get(id).getWorldPosition(new THREE.Vector3())),
            new THREE.Vector3(),
          )
          .divideScalar(roots.length)
      : bounds.getCenter(new THREE.Vector3());
    selectionPivot.position.copy(center);
    selectionPivot.rotation.set(0, 0, 0);
    selectionPivot.scale.set(1, 1, 1);
    selectionPivot.updateMatrixWorld(true);
    if (
      !playing &&
      !roots.some((id) => doc.nodes.find((n) => n.id === id).skin)
    )
      transform.attach(selectionPivot);
    updateSelectionBox();
  } else {
    const o = objects.get(selected);
    if (o && isVisible(o)) {
      if (!playing && !o.isSkinnedMesh) transform.attach(o);
      box.setFromObject(o);
      box.visible = !selectionBounds().isEmpty();
    }
  }
  if (refresh) {
    for (const id of selectedIds) {
      let ancestor = doc.nodes.find((n) => n.id === id);
      while (ancestor?.parent) {
        collapsed.delete(ancestor.parent);
        ancestor = doc.nodes.find((n) => n.id === ancestor.parent);
      }
    }
    renderTree();
    renderInspector();
    renderTimeline();
  }
  $("#selection-label").textContent =
    selectedIds.size > 1
      ? `Выбрано: ${selectedIds.size}`
      : doc.nodes.find((n) => n.id === selected)?.name || "Нет выделения";
  $("#group-selection").disabled = !selectedIds.size || playing;
  $("#ungroup-selection").disabled =
    !selectedIds.size ||
    playing ||
    selectionRoots(doc, [...selectedIds]).some(
      (id) => doc.nodes.find((n) => n.id === id).type !== "group",
    );
}
function isVisible(o) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}
function renderTree() {
  const tree = $("#tree");
  tree.innerHTML = "";
  const query = $("#scene-search").value.trim().toLocaleLowerCase();
  const byParent = new Map(),
    byId = new Map(doc.nodes.map((n) => [n.id, n])),
    included = new Set();
  for (const n of doc.nodes) {
    if (!byParent.has(n.parent)) byParent.set(n.parent, []);
    byParent.get(n.parent).push(n);
    if (query && n.name.toLocaleLowerCase().includes(query)) {
      let ancestor = n;
      while (ancestor) {
        included.add(ancestor.id);
        ancestor = byId.get(ancestor.parent);
      }
    }
  }
  function add(parent, depth = 0) {
    for (const n of byParent.get(parent) || []) {
      if (query && !included.has(n.id)) continue;
      const children = byParent.has(n.id),
        closed = !query && collapsed.has(n.id);
      const row = document.createElement("div");
      row.className = `tree-row ${selectedIds.has(n.id) ? "selected" : ""} ${!isVisible(objects.get(n.id)) ? "is-hidden" : ""}`;
      row.style.paddingLeft = `${5 + depth * 12}px`;
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-level", depth + 1);
      row.setAttribute("aria-selected", String(selectedIds.has(n.id)));
      if (children) row.setAttribute("aria-expanded", String(!closed));
      row.innerHTML = `<button class="disclosure ${closed ? "closed" : ""}" ${children ? "" : "disabled"} aria-label="${closed ? "Развернуть" : "Свернуть"}: ${esc(n.name)}">${children ? icon("chevron", 11) : ""}</button>${icon(n.type === "group" ? "folder" : n.type === "bone" ? "key" : "cube", 15)}<button class="node-name" title="${esc(n.name)}">${esc(n.name)}</button>${track(n).length ? '<span class="animated-dot"></span>' : ""}<button class="visibility" aria-label="Видимость: ${esc(n.name)}" aria-pressed="${n.visible}">${icon(n.visible ? "eye" : "hidden", 14)}</button>`;
      row.querySelector(".node-name").onclick = (e) =>
        e.shiftKey || e.ctrlKey || e.metaKey
          ? toggleSelect(n.id)
          : select(n.id);
      row.querySelector(".disclosure").onclick = () => {
        if (collapsed.has(n.id)) collapsed.delete(n.id);
        else collapsed.add(n.id);
        renderTree();
      };
      row.querySelector(".visibility").onclick = () =>
        safe(() => execute([{ op: "update", id: n.id, visible: !n.visible }]));
      row.querySelector(".node-name").onkeydown = (e) => {
        const buttons = [...tree.querySelectorAll(".node-name")],
          i = buttons.indexOf(e.currentTarget);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          buttons[
            Math.max(
              0,
              Math.min(
                buttons.length - 1,
                i + (e.key === "ArrowDown" ? 1 : -1),
              ),
            )
          ]?.focus();
        }
      };
      tree.append(row);
      if (!closed) add(n.id, depth + 1);
    }
  }
  add(null);
  if (!tree.children.length)
    tree.innerHTML = `<div class="empty-tree">${query ? "Ничего не найдено." : "Пока пусто.<br>Добавь первый объект."}</div>`;
}
function renderInspector() {
  if (selectedIds.size > 1) {
    renderMultiInspector();
    return;
  }
  const n = doc.nodes.find((n) => n.id === selected),
    el = $("#inspector");
  if (!n) {
    el.innerHTML =
      '<div class="empty-inspector">' +
      icon("cube", 38) +
      "<h3>Создай что-нибудь.</h3><p>Выбери объект, чтобы настроить его трансформацию и материал.</p></div>";
    return;
  }
  const p = poseFor(doc, n, time, activeClip);
  el.innerHTML = `<div class="object-heading"><div class="object-icon">${icon(n.type === "group" ? "folder" : n.type === "bone" ? "key" : "cube", 24)}</div><div><input id="object-name" value="${esc(n.name)}" maxlength="200" aria-label="Имя объекта"><span>${primitiveNames[n.type]} <b>·</b> ${n.parent ? "Дочерний объект" : "Корень сцены"}</span></div></div>
  <div class="inspector-section"><div class="section-heading"><span>Трансформация</span><span class="subtle">Локальная</span></div>${["position", "rotation", "scale"].map((prop, i) => `<label class="property-label">${["Положение", "Вращение", "Масштаб"][i]} <span>${["m", "°", ""][i]}</span></label><div class="vector-fields">${["X", "Y", "Z"].map((axis, j) => `<label class="axis-field ${axis.toLowerCase()}"><span>${axis}</span><input type="number" data-prop="${prop}" data-axis="${j}" aria-label="${prop} ${axis}" value="${(prop === "rotation" ? THREE.MathUtils.radToDeg(p[prop][j]) : p[prop][j]).toFixed(2)}" step="${prop === "rotation" ? 1 : 0.1}" ${prop === "scale" ? 'min="0.001"' : ""}></label>`).join("")}</div>`).join("")}<button class="wide-button" id="key-inspector">${icon("key", 14)} Добавить ключевой кадр</button></div>
  ${!["group", "bone"].includes(n.type) ? `<div class="inspector-section"><button id="edit-mesh" class="wide-button" ${n.skin ? "disabled" : ""}>Вершины · рёбра · грани</button><p class="multi-note">${n.type === "mesh" ? "Редактирование базовой сетки" : "Преобразование в сетку при применении правок"}</p></div>` : ""}
  ${geometryPanel(n)}${n.skin ? `<div class="inspector-section"><p class="multi-note">Скиннинг: ${n.skin.joints.length} костей, до 4 влияний на вершину. Для перемещения выбери общий корень рига; для позы — кость. Привязка и точная правка весов доступны через команды bindSkin / setSkinWeights.</p></div>` : ""}
  ${n.sculpt ? '<div class="inspector-section"><button id="edit-sculpt" class="wide-button">Изменить органическую сетку</button></div>' : ""}
  ${!["group", "bone"].includes(n.type) ? `<div class="inspector-section"><div class="section-heading"><span>Материал</span><span class="material-dot" style="background:${n.color}"></span></div><label class="material-color"><span>Основной цвет</span><div><input id="color" type="color" value="${n.color}" aria-label="Цвет материала"><code>${n.color.toUpperCase()}</code></div></label><label class="material-color"><span>Цвет свечения</span><input id="emissive" type="color" value="${n.emissive}" aria-label="Цвет свечения"></label><label class="range-property"><span>Сила свечения<b>${n.emissiveIntensity.toFixed(2)}</b></span><input id="emissiveIntensity" type="range" min="0" max="20" step="0.1" value="${n.emissiveIntensity}" aria-label="Сила свечения"></label>${["roughness", "metalness"].map((prop, i) => `<label class="range-property"><span>${["Шероховатость", "Металличность"][i]}<b>${n[prop].toFixed(2)}</b></span><input type="range" id="${prop}" min="0" max="1" step="0.01" value="${n[prop]}" aria-label="${prop}"></label>`).join("")}</div>` : ""}
  <div class="inspector-section"><div class="section-heading"><span>Объект</span></div><label class="parent-field">Родитель <small>Локальная поза сохраняется</small><select id="parent" aria-label="Родитель объекта"><option value="">Корень сцены</option>${parentOptions(n)}</select></label><div class="object-details"><span>ID</span><code title="${esc(n.id)}">${esc(n.id.length > 20 ? n.id.slice(0, 18) + "…" : n.id)}</code><span>Ключевые кадры</span><span>${track(n).length}</span></div><div class="object-actions">${button("duplicate", "copy", "Дублировать (Shift+D)", "Копия")}${button("delete", "trash", "Удалить (Delete)")}</div></div>`;
  if ($("#edit-mesh"))
    $("#edit-mesh").onclick = () => safe(() => showMeshEditor(n.id));
  if ($("#edit-sculpt"))
    $("#edit-sculpt").onclick = () =>
      openSculptEditor(n.sculpt, (recipe, geometry) =>
        execute([{ op: "update", id: n.id, geometry, sculpt: recipe }]),
      );
  if (n.skin) {
    el.querySelectorAll("[data-prop]").forEach(
      (input) => (input.disabled = true),
    );
    $("#parent").disabled = true;
    $("#key-inspector").disabled = true;
  }
  if ($("#apply-joint-limit"))
    $("#apply-joint-limit").onclick = () =>
      safe(() => {
        const axis = $("#joint-axis").value;
        const jointLimit =
          axis === "none"
            ? undefined
            : {
                axis,
                min: Number($("#joint-min").value),
                max: Number($("#joint-max").value),
                swing: Number($("#joint-swing").value),
              };
        if (
          axis !== "none" &&
          ["joint-min", "joint-max", "joint-swing"].some(
            (id) => !$("#" + id).value.trim(),
          )
        )
          throw new Error("Укажи числовые ограничения");
        execute([{ op: "update", id: n.id, jointLimit }]);
      });
  $("#object-name").onchange = (e) =>
    safe(() => execute([{ op: "update", id: n.id, name: e.target.value }]));
  el.querySelectorAll("[data-prop]").forEach(
    (input) =>
      (input.onchange = () =>
        safe(() => {
          const property = input.dataset.prop,
            index = Number(input.dataset.axis),
            value = Number(input.value);
          if (input.value.trim() === "" || !Number.isFinite(value))
            throw new Error("Укажи число");
          const pose = poseFromObject(objects.get(n.id));
          pose[property][index] =
            property === "rotation" ? THREE.MathUtils.degToRad(value) : value;
          saveTransform(pose);
        })),
  );
  $("#key-inspector").onclick = addKey;
  if (!["group", "bone"].includes(n.type))
    for (const prop of [
      "color",
      "roughness",
      "metalness",
      "emissive",
      "emissiveIntensity",
    ])
      $("#" + prop).onchange = (e) =>
        safe(() =>
          execute([
            {
              op: "update",
              id: n.id,
              [prop]: ["color", "emissive"].includes(prop)
                ? e.target.value
                : Number(e.target.value),
            },
          ]),
        );
  $("#duplicate").onclick = duplicate;
  $("#delete").onclick = deleteSelected;
  $("#parent").onchange = (e) =>
    safe(() =>
      execute([{ op: "update", id: n.id, parent: e.target.value || null }]),
    );
  el.querySelectorAll("[data-geometry]").forEach(
    (input) =>
      (input.onchange = () =>
        safe(() => {
          if (input.type !== "checkbox" && input.value.trim() === "")
            throw new Error("Укажи число");
          execute([
            {
              op: "update",
              id: n.id,
              geometry: {
                ...n.geometry,
                [input.dataset.geometry]:
                  input.type === "checkbox"
                    ? input.checked
                    : Number(input.value),
              },
            },
          ]);
        })),
  );
  if ($("#edit-profile"))
    $("#edit-profile").onclick = () => {
      const outline = n.type === "extrude",
        key = outline ? "outline" : "profile";
      openProfileEditor(
        n.geometry[key] ?? (outline ? DEFAULT_OUTLINE : DEFAULT_PROFILE),
        (points) =>
          execute([
            {
              op: "update",
              id: n.id,
              geometry: { ...n.geometry, [key]: points },
            },
          ]),
        { outline },
      );
    };
  if (playing)
    el.querySelectorAll("input,select,button").forEach(
      (control) => (control.disabled = true),
    );
}
function renderMultiInspector() {
  const el = $("#inspector"),
    count = selectedIds.size;
  el.innerHTML = `<div class="object-heading"><div class="object-icon">${icon("cube", 24)}</div><div><strong>${count} объектов</strong><span>Shift + клик — добавить или убрать</span></div></div><div class="inspector-section"><div class="section-heading"><span>Общее преобразование</span></div><p class="multi-note">Манипулятор работает вокруг общего центра. Родитель с выбранными потомками преобразуется один раз.</p><label class="property-label">Сдвиг в мировых осях <span>м</span></label><div class="vector-fields">${["X", "Y", "Z"].map((axis) => `<label class="axis-field ${axis.toLowerCase()}"><span>${axis}</span><input id="batch-${axis}" type="number" value="0" step=".1" aria-label="Сдвиг ${axis}"></label>`).join("")}</div><button class="wide-button" id="batch-move">Применить сдвиг</button><button class="wide-button" id="key-inspector">${icon("key", 14)} Ключи для выделения</button></div><div class="inspector-section"><div class="section-heading"><span>Общий материал</span></div><label class="material-color"><span>Цвет выбранных сеток</span><input id="batch-color" type="color" value="${doc.nodes.find((n) => selectedIds.has(n.id) && n.type !== "group")?.color ?? "#b8e986"}" aria-label="Общий цвет"></label><p class="multi-note">Меняет только явно выбранные сетки, без скрытого применения к потомкам групп.</p></div><div class="inspector-section"><div class="object-actions">${button("duplicate", "copy", "Дублировать выделение", "Копии")}${button("delete", "trash", "Удалить выделение")}</div></div>`;
  $("#batch-move").onclick = () =>
    safe(() => {
      const position = ["X", "Y", "Z"].map((axis) => {
        const input = $("#batch-" + axis);
        if (!input.value.trim()) throw new Error("Укажи число");
        return Number(input.value);
      });
      transformSelection({ position });
    });
  $("#batch-color").onchange = (e) =>
    safe(() =>
      execute(
        doc.nodes
          .filter((n) => selectedIds.has(n.id) && n.type !== "group")
          .map((n) => ({ op: "update", id: n.id, color: e.target.value })),
      ),
    );
  $("#key-inspector").onclick = addKey;
  $("#duplicate").onclick = duplicate;
  $("#delete").onclick = deleteSelected;
  if (playing)
    el.querySelectorAll("input,button").forEach(
      (control) => (control.disabled = true),
    );
}
function groupSelected() {
  pause();
  safe(() => {
    const id = crypto.randomUUID();
    execute([{ op: "group", id, ids: [...selectedIds], name: "Group" }]);
    select(id);
  });
}
function ungroupSelected() {
  pause();
  safe(() => {
    const roots = selectionRoots(doc, [...selectedIds]),
      children = doc.nodes
        .filter((n) => roots.includes(n.parent))
        .map((n) => n.id);
    execute(roots.map((id) => ({ op: "ungroup", id })));
    selectMany(children);
  });
}
function savePoses(poses, before = doc) {
  const commands = [];
  for (const [id, pose] of poses) {
    const n = doc.nodes.find((n) => n.id === id);
    if (n.skin)
      throw new Error(
        "Выбери корень рига или кость вместо трансформации сетки со скиннингом",
      );
    commands.push(
      activeClip || track(n).length
        ? { op: "keyframe", id, clip: activeClip, time, ...pose }
        : { op: "update", id, ...pose },
    );
  }
  commit(applyCommands(doc, commands), before);
}
function transformSelection({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) {
  for (const v of [position, rotation, scale])
    if (
      !Array.isArray(v) ||
      v.length !== 3 ||
      v.some((n) => typeof n !== "number" || !Number.isFinite(n))
    )
      throw new Error("Invalid transform vector");
  if (scale.some((n) => n < 0.001)) throw new Error("Scale must be positive");
  pause();
  const roots = selectionRoots(doc, [...selectedIds]),
    bounds = selectionBounds(),
    center = bounds.isEmpty()
      ? new THREE.Vector3()
      : bounds.getCenter(new THREE.Vector3());
  const delta = new THREE.Matrix4()
    .makeTranslation(...center.toArray())
    .multiply(poseMatrix({ position, rotation, scale }))
    .multiply(
      new THREE.Matrix4().makeTranslation(...center.clone().negate().toArray()),
    );
  const poses = roots.map((id) => {
    const o = objects.get(id);
    return [
      id,
      matrixPose(
        o.parent.matrixWorld
          .clone()
          .invert()
          .multiply(delta)
          .multiply(o.matrixWorld),
      ),
    ];
  });
  savePoses(poses);
}
function parentOptions(node) {
  const excluded = new Set([node.id]);
  let count = -1;
  while (count !== excluded.size) {
    count = excluded.size;
    for (const n of doc.nodes) if (excluded.has(n.parent)) excluded.add(n.id);
  }
  return doc.nodes
    .filter((n) => !excluded.has(n.id))
    .map(
      (n) =>
        `<option value="${esc(n.id)}" ${n.id === node.parent ? "selected" : ""}>${esc(n.name)}</option>`,
    )
    .join("");
}
function geometryPanel(n) {
  if (n.type === "bone") {
    const l = n.jointLimit ?? { axis: "none", min: 0, max: 135, swing: 5 };
    return `<div class="inspector-section"><div class="section-heading"><span>Ограничение шарнира</span></div><label>Ось относительно базовой позы<select id="joint-axis" aria-label="Ось шарнира">${["none", "x", "y", "z"].map((axis) => `<option value="${axis}" ${axis === l.axis ? "selected" : ""}>${axis === "none" ? "Не задано" : axis.toUpperCase()}</option>`).join("")}</select></label>${[
      ["min", "Минимальный угол"],
      ["max", "Максимальный угол"],
      ["swing", "Допуск вне оси"],
    ]
      .map(
        ([id, label]) =>
          `<label>${label}, ° <input id="joint-${id}" type="number" min="${id === "swing" ? 0 : -180}" max="180" value="${l[id]}" aria-label="${label} шарнира"></label>`,
      )
      .join(
        "",
      )}<button id="apply-joint-limit" class="wide-button">Применить ограничение</button><p class="multi-note">Ограничение проверяется для всего клипа. Оно не исправляет позу автоматически. Для сложных суставов одной оси недостаточно.</p></div>`;
  }
  if (n.type === "group" || n.type === "plane") return "";
  if (n.type === "mesh")
    return `<div class="inspector-section"><div class="section-heading"><span>Геометрия сетки</span></div><div class="object-details"><span>Исходные вершины</span><span>${n.geometry.positions.length / 3}</span><span>Треугольники</span><span>${(n.geometry.indices?.length ?? n.geometry.positions.length / 3) / 3}</span><span>UV</span><span>${n.geometry.uv ? "Есть" : "Нет"}</span><span>Метки жёсткости</span><span>${n.geometry.creases?.length ?? 0}</span>${n.modifiers?.length ? `<span>Модификаторы</span><span>${n.modifiers.map((m) => `${m.type}${m.enabled === false ? " (выкл.)" : ""}`).join(" → ")}</span>` : ""}</div><label class="smooth-field"><span>Сглаживание</span><input type="checkbox" data-geometry="smooth" aria-label="Плавное сглаживание" ${(n.geometry.smooth ?? true) ? "checked" : ""}></label></div>`;
  const field = (key, label, value, min, max, step = 1) =>
    `<label class="geometry-field"><span>${label}</span><input data-geometry="${key}" type="number" aria-label="${label}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  return `<div class="inspector-section"><div class="section-heading"><span>Геометрия</span><span class="subtle">Параметры</span></div>
    ${n.type === "box" ? field("bevel", "Скругление", n.geometry.bevel ?? 0, 0, 0.49, 0.01) + field("bevelSegments", "Сегменты скругления", n.geometry.bevelSegments ?? 3, 1, 8) : n.type === "extrude" ? field("depth", "Глубина", n.geometry.depth ?? 0.2, 0.001, 100, 0.05) : field("segments", "Сегменты", n.geometry.segments ?? 32, 3, 96)}
    ${n.type === "torus" ? field("tube", "Радиус трубки", n.geometry.tube ?? 0.15, 0.01, 1, 0.01) : ""}
    ${["lathe", "extrude"].includes(n.type) ? '<button class="wide-button" id="edit-profile">' + icon("code", 14) + (n.type === "extrude" ? " Редактировать контур</button>" : " Редактировать профиль</button>") : ""}
    <label class="smooth-field"><span>Плавное сглаживание</span><input type="checkbox" data-geometry="smooth" aria-label="Плавное сглаживание" ${(n.geometry.smooth ?? (["sphere", "capsule", "lathe"].includes(n.type) || (n.type === "box" && n.geometry.bevel > 0))) ? "checked" : ""}></label></div>`;
}
function poseFromObject(o) {
  return {
    position: o.position.toArray(),
    rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
    scale: o.scale.toArray(),
  };
}
function saveTransform(pose, before) {
  const n = doc.nodes.find((n) => n.id === selected);
  if (!n) return;
  const cmds =
    activeClip || track(n).length ? [] : [{ op: "update", id: n.id, ...pose }];
  if (activeClip || track(n).length)
    cmds.push({ op: "keyframe", id: n.id, clip: activeClip, time, ...pose });
  commit(applyCommands(doc, cmds), before ?? doc);
}
function safe(fn) {
  try {
    return fn();
  } catch (e) {
    toast(e.message, true);
    rebuild();
  }
}
function addKey() {
  pause();
  safe(() => {
    if (!selectedIds.size) throw new Error("Сначала выбери объект");
    execute(
      [...selectedIds].map((id) => ({
        op: "keyframe",
        clip: activeClip,
        id,
        time,
        ...poseFromObject(objects.get(id)),
      })),
    );
    toast(`Ключи добавлены · ${time.toFixed(2)} с`);
  });
}
function deleteSelected() {
  if (selectedIds.size)
    safe(() =>
      execute(
        selectionRoots(doc, [...selectedIds]).map((id) => ({
          op: "delete",
          id,
        })),
      ),
    );
}
function duplicate() {
  pause();
  safe(() => {
    const roots = selectionRoots(doc, [...selectedIds]),
      all = new Set(roots);
    let count = -1;
    while (count !== all.size) {
      count = all.size;
      for (const n of doc.nodes) if (all.has(n.parent)) all.add(n.id);
    }
    const idMap = Object.fromEntries(
      [...all].map((id) => [id, crypto.randomUUID()]),
    );
    execute([{ op: "duplicate", ids: [...selectedIds], idMap }]);
    selectMany(roots.map((id) => idMap[id]));
    toast("Выделение скопировано");
  });
}
function addPrimitive(type) {
  safe(() => {
    pause();
    $("#scene-search").value = "";
    const id = crypto.randomUUID();
    execute([
      {
        op: "create",
        type,
        id,
        name: primitiveNames[type],
        position: [0, type === "group" ? 0 : 0.5, 0],
      },
    ]);
    select(id);
    $("#add-menu").hidden = true;
  });
}
function undo(redo = false) {
  const source = redo ? future : history,
    dest = redo ? history : future;
  if (!source.length) return;
  stopPlayback();
  dest.push(snapshot());
  trimHistory(dest);
  const state = source.pop();
  doc = state.document;
  selected = state.selected;
  selectedIds = new Set(state.selectedIds ?? (selected ? [selected] : []));
  time = state.time;
  activeClip = state.activeClip ?? null;
  rebuild();
  persist();
}
function renderTimeline() {
  $("#active-clip").innerHTML = [
    { id: "", name: "Action" },
    ...(doc.clips ?? []),
  ]
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${c.id === (activeClip ?? "") ? "selected" : ""}>${esc(c.name)}</option>`,
    )
    .join("");
  const n = doc.nodes.find((n) => n.id === selected);
  $("#track-name").textContent = n?.name || "Нет объекта";
  $("#key-count").textContent = `${track(n).length} ключей`;
  $("#ruler").innerHTML = Array.from(
    { length: 9 },
    (_, i) =>
      `<span style="left:${i * 12.5}%">${((duration() * i) / 8).toFixed(duration() < 8 ? 1 : 0)}<i></i></span>`,
  ).join("");
  $("#keyframes").innerHTML = track(n)
    .map(
      (k) =>
        `<button class="keyframe ${Math.abs(k.time - time) < 0.001 ? "current" : ""}" style="left:${(k.time / duration()) * 100}%" data-time="${k.time}" title="Ключ ${k.time.toFixed(2)} с" aria-label="Ключ ${k.time.toFixed(2)} с"></button>`,
    )
    .join("");
  $("#keyframes")
    .querySelectorAll("button")
    .forEach((b) => {
      let start = null;
      b.onclick = (e) => {
        if (e.detail === 0) {
          pause();
          seek(Number(b.dataset.time));
        }
      };
      b.onpointerdown = (e) => {
        if (e.button !== 0) return;
        if (playing) {
          stopPlayback();
          refreshSelection(false);
          renderInspector();
        }
        start = {
          x: e.clientX,
          time: Number(b.dataset.time),
          next: Number(b.dataset.time),
        };
        b.setPointerCapture(e.pointerId);
        e.preventDefault();
      };
      b.onpointermove = (e) => {
        if (!start) return;
        const rect = $("#timeline-lane").getBoundingClientRect();
        start.next = Math.max(
          0,
          Math.min(
            duration(),
            Math.round(
              ((e.clientX - rect.left) / rect.width) * duration() * doc.fps,
            ) / doc.fps,
          ),
        );
        b.style.left = `${(start.next / duration()) * 100}%`;
        b.title = `${start.next.toFixed(2)} с`;
      };
      b.onpointerup = (e) => {
        if (!start) return;
        const move = start;
        start = null;
        if (Math.abs(e.clientX - move.x) < 3) {
          seek(move.time);
          return;
        }
        safe(() => {
          execute([
            {
              op: "moveKeyframe",
              clip: activeClip,
              id: selected,
              from: move.time,
              time: move.next,
            },
          ]);
          seek(move.next);
        });
      };
      b.onpointercancel = () => {
        start = null;
        renderTimeline();
      };
    });
  $("#scrubber").max = duration();
  $("#scrubber").step = 1 / doc.fps;
  updateTimeUI();
}
function updateTimeUI() {
  $("#time-label").innerHTML =
    `${time.toFixed(2)} <small>/ ${duration().toFixed(2)} с</small>`;
  $("#playhead").style.left = `${(time / duration()) * 100}%`;
  $("#scrubber").value = time;
  document
    .querySelectorAll(".keyframe")
    .forEach((k) =>
      k.classList.toggle(
        "current",
        Math.abs(Number(k.dataset.time) - time) < 0.0001,
      ),
    );
  $("#remove-key").disabled = !track(
    doc.nodes.find((n) => n.id === selected),
  ).some((k) => Math.abs(k.time - time) < 0.0001);
}
function seek(value) {
  if (!Number.isFinite(value))
    throw new Error("Время должно быть конечным числом");
  time = Math.max(0, Math.min(duration(), value));
  applyPose();
  updateTimeUI();
  if (!playing) {
    refreshSelection(false);
    renderInspector();
    renderTimeline();
  }
}
function pause() {
  const wasPlaying = playing;
  stopPlayback();
  if (wasPlaying) refreshSelection();
}
function togglePlay() {
  if (playing) {
    pause();
    return;
  }
  playing = true;
  if (time >= duration()) time = 0;
  transform.detach();
  $("#play").innerHTML = icon("pause");
  $("#play").setAttribute("aria-label", "Пауза (Пробел)");
  renderInspector();
}
function focus() {
  const bounds = selectedIds.size
    ? selectionBounds()
    : new THREE.Box3().setFromObject(content);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3()),
    radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  const halfAngle = Math.atan(
    Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
      Math.min(1, camera.aspect),
  );
  const distance = Math.max(0.5, (radius / Math.sin(halfAngle)) * 1.15);
  const direction = camera.position.clone().sub(orbit.target).normalize();
  orbit.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  orbit.update();
}
function setCameraView(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new Error("Invalid camera view");
  const presets = {
    front: [0, 0, 1],
    back: [0, 0, -1],
    right: [1, 0, 0],
    left: [-1, 0, 0],
    top: [0, 1, 0.0001],
    threeQuarter: [0.65, 0.28, 1],
  };
  const check = (v) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((x) => Number.isFinite(x) && Math.abs(x) <= 100000);
  if (
    (options.preset && !Object.hasOwn(presets, options.preset)) ||
    (options.camera !== undefined && !check(options.camera)) ||
    (options.target !== undefined && !check(options.target)) ||
    (options.fov !== undefined &&
      (!Number.isFinite(options.fov) ||
        options.fov < 10 ||
        options.fov > 100)) ||
    (options.preset && options.camera)
  )
    throw new Error("Invalid camera view");
  const target = options.target
      ? new THREE.Vector3(...options.target)
      : orbit.target.clone(),
    position = options.camera
      ? new THREE.Vector3(...options.camera)
      : camera.position.clone();
  if (options.camera && position.distanceTo(target) < 0.001)
    throw new Error("Camera and target must differ");
  const damping = orbit.enableDamping;
  orbit.enableDamping = false;
  orbit.update();
  try {
    if (options.fov !== undefined) {
      camera.fov = options.fov;
      camera.updateProjectionMatrix();
    }
    orbit.target.copy(target);
    camera.position.copy(position);
    if (options.preset) {
      const dir = new THREE.Vector3(...presets[options.preset]).normalize(),
        distance = Math.max(0.5, camera.position.distanceTo(orbit.target));
      camera.position.copy(orbit.target).addScaledVector(dir, distance);
    }
    orbit.update();
    if (options.fit !== false) focus();
    renderer.render(scene, camera);
  } finally {
    orbit.enableDamping = damping;
  }
  return {
    camera: camera.position.toArray(),
    target: orbit.target.toArray(),
    fov: camera.fov,
  };
}
function captureViews({
  presets = ["front", "right", "back", "threeQuarter"],
  surface = shading,
} = {}) {
  if (
    !Array.isArray(presets) ||
    presets.length > 8 ||
    !presets.length ||
    !presets.every((p) =>
      ["front", "right", "back", "left", "top", "threeQuarter"].includes(p),
    )
  )
    throw new Error("Invalid review views");
  const before = {
      camera: camera.position.toArray(),
      target: orbit.target.toArray(),
      fov: camera.fov,
    },
    beforeShading = shading;
  try {
    setShading(surface);
    return presets.map((preset) => ({
      preset,
      ...setCameraView({ preset }),
      png: screenshot(),
    }));
  } finally {
    setShading(beforeShading);
    setCameraView({ ...before, fit: false });
  }
}
function setStage({ groundY = ground.position.y, fit = false } = {}) {
  if (typeof fit !== "boolean") throw new Error("Invalid floor fitting");
  if (fit) {
    const bounds = new THREE.Box3().setFromObject(content);
    if (bounds.isEmpty()) throw new Error("Scene has no model bounds");
    groundY = bounds.min.y - 0.002;
  }
  if (!Number.isFinite(groundY) || Math.abs(groundY) > 100000)
    throw new Error("Invalid ground level");
  ground.position.y = groundY;
  grid.position.y = groundY + 0.005;
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  return { groundY };
}
function inspectMeshes() {
  return doc.nodes
    .filter((n) => !["group", "bone"].includes(n.type))
    .map((n) => {
      const g = geometryFor(n);
      try {
        return {
          id: n.id,
          name: n.name,
          ...auditMesh({
            positions: Array.from(g.attributes.position.array),
            normals: Array.from(g.attributes.normal.array),
            ...(g.index ? { indices: Array.from(g.index.array) } : {}),
          }),
        };
      } finally {
        g.dispose();
      }
    });
}
function reviewMeshes() {
  const reports = inspectMeshes();
  const dialog = document.createElement("dialog");
  dialog.id = "mesh-review-dialog";
  dialog.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">SURFACE INSPECTION</span><h2>Проверка геометрии</h2></div><button id="mesh-review-close" aria-label="Закрыть проверку сетки">✕</button></div><p>Границы и ориентация проверяются после объединения совпадающих позиций. Швы UV и жёстких нормалей учитываются как одна вершина. Симметрия — локально по X; открытые плоскости и асимметричные детали могут быть намеренными.</p><div class="mesh-review-table"><table><thead><tr><th>Сетка</th><th>Треугольники</th><th>Открытые рёбра</th><th>Ошибки рёбер</th><th>Нормали</th><th>Симметрия X</th></tr></thead><tbody>${reports.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.triangles}</td><td>${r.boundaryEdges}</td><td>${r.nonManifoldEdges + r.windingConflicts + r.degenerate}</td><td>${r.normalErrors + r.inwardNormals}</td><td>${(r.mirrorMatch * 100).toFixed(1)}%</td></tr>`).join("")}</tbody></table></div><div class="dialog-footer"><label>Пол студии, Y <input id="review-ground" type="number" step=".01" value="${ground.position.y}" aria-label="Уровень пола"></label><button id="review-zero-ground">Мир Y = 0</button><button id="review-fit-ground">Пол под моделью</button></div>`;
  document.body.append(dialog);
  const groundInput = dialog.querySelector("#review-ground");
  groundInput.onchange = () =>
    safe(() => setStage({ groundY: Number(groundInput.value) }));
  dialog.querySelector("#review-zero-ground").onclick = () => {
    setStage({ groundY: 0 });
    groundInput.value = 0;
  };
  dialog.querySelector("#review-fit-ground").onclick = () =>
    safe(() => {
      groundInput.value = setStage({ fit: true }).groundY;
    });
  dialog.querySelector("#mesh-review-close").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  return reports;
}
function setMode(mode) {
  transform.setMode(mode);
  for (const key of ["translate", "rotate", "scale"])
    $("#" + key).classList.toggle("active", mode === key);
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const filename = () =>
  doc.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "scene";
function save() {
  download(
    new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
    `${filename()}.graph.json`,
  );
  toast("Редактируемый проект сохранён");
}
async function exportGLB() {
  const buffer = await createGLB(doc);
  download(
    new Blob([buffer], { type: "model/gltf-binary" }),
    `${filename()}.glb`,
  );
  toast("GLB экспортирован: геометрия, материалы, анимация");
  return buffer;
}

transform.addEventListener("dragging-changed", (event) => {
  orbit.enabled = !event.value;
});
transform.addEventListener("mouseDown", () => {
  dirtyBeforeDrag = structuredClone(doc);
  dragState = null;
  if (selectedIds.size > 1) {
    content.updateMatrixWorld(true);
    selectionPivot.updateMatrixWorld(true);
    const roots = selectionRoots(doc, [...selectedIds]);
    dragState = {
      start: selectionPivot.matrixWorld.clone(),
      roots,
      world: new Map(
        roots.map((id) => [id, objects.get(id).matrixWorld.clone()]),
      ),
      parent: new Map(
        roots.map((id) => [id, objects.get(id).parent.matrixWorld.clone()]),
      ),
      error: null,
    };
  }
});
transform.addEventListener("objectChange", () => {
  renderer.shadowMap.needsUpdate = true;
  if (dragState && transform.dragging) {
    try {
      selectionPivot.updateMatrixWorld(true);
      const delta = selectionPivot.matrixWorld
        .clone()
        .multiply(dragState.start.clone().invert());
      const poses = dragState.roots.map((id) => [
        id,
        matrixPose(
          dragState.parent
            .get(id)
            .clone()
            .invert()
            .multiply(delta)
            .multiply(dragState.world.get(id)),
        ),
      ]);
      for (const [id, p] of poses) {
        const o = objects.get(id);
        o.position.fromArray(p.position);
        o.rotation.set(...p.rotation);
        o.scale.fromArray(p.scale);
      }
      content.updateMatrixWorld(true);
      dragState.error = null;
    } catch (e) {
      dragState.error = e.message;
      applyPose();
    }
  }
  updateSkinnedBounds(content);
  reviewOverlay?.update();
  updateSelectionBox();
});
transform.addEventListener("mouseUp", () => {
  if (!dirtyBeforeDrag) return;
  const before = dirtyBeforeDrag,
    state = dragState;
  dirtyBeforeDrag = null;
  dragState = null;
  safe(() => {
    if (state?.error) throw new Error(state.error);
    if (state)
      savePoses(
        state.roots.map((id) => [id, poseFromObject(objects.get(id))]),
        before,
      );
    else saveTransform(poseFromObject(objects.get(selected)), before);
  });
});
let clickStart;
renderer.domElement.addEventListener("pointerdown", (e) => {
  clickStart = {
    x: e.clientX,
    y: e.clientY,
    axis: transform.axis,
    button: e.button,
  };
});
renderer.domElement.addEventListener("pointerup", (e) => {
  if (
    !clickStart ||
    clickStart.button !== 0 ||
    clickStart.axis ||
    transform.dragging ||
    Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y) > 4
  )
    return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    (-(e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster
    .intersectObjects(content.children, true)
    .filter((h) => {
      let o = h.object;
      while (o !== content) {
        if (!o.visible) return false;
        o = o.parent;
      }
      return true;
    });
  const id = hits[0]?.object.userData.nodeId ?? null;
  if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSelect(id);
  else select(id);
});
renderer.domElement.addEventListener("dblclick", focus);
$("#add").onclick = () => ($("#add-menu").hidden = !$("#add-menu").hidden);
document
  .querySelectorAll("[data-primitive]")
  .forEach((b) => (b.onclick = () => addPrimitive(b.dataset.primitive)));
for (const mode of ["translate", "rotate", "scale"])
  $("#" + mode).onclick = () => setMode(mode);
$("#scene-search").oninput = renderTree;
$("#group-selection").onclick = groupSelected;
$("#ungroup-selection").onclick = ungroupSelected;
$("#import-obj").onclick = () => $("#obj-input").click();
function importOBJ(text, { name = "Imported OBJ" } = {}) {
  const result = parseOBJ(text, { name }),
    root = result.document.nodes[0].id;
  const next = validateDocument({
    ...doc,
    nodes: [...doc.nodes, ...result.document.nodes],
    name: doc.nodes.length ? doc.name : result.document.name,
  });
  commit(next, doc, { selected: root });
  focus();
  return {
    ids: result.document.nodes.map((n) => n.id),
    warnings: result.warnings,
  };
}
$("#obj-input").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("OBJ не должен превышать 10 МБ");
    const result = importOBJ(await file.text(), {
      name: file.name.replace(/\.obj$/i, ""),
    });
    const notes = {
      "MTL materials and textures are not loaded":
        "MTL и текстуры не загружены.",
      "Lines, points and extra vertex attributes are omitted":
        "Линии, точки и цвета вершин пропущены.",
      "Missing normals were computed from faces and smoothing groups":
        "Недостающие нормали вычислены.",
      "Incomplete UV coordinates were omitted from parts with missing UVs":
        "Неполные UV пропущены в затронутых сетках.",
    };
    toast(
      `Импортировано сеток: ${result.ids.length - 1}. ${result.warnings.map((w) => notes[w] ?? w).join(" ")}`,
    );
  } catch (error) {
    toast(error.message, true);
  } finally {
    e.target.value = "";
  }
};
$("#recovery").onclick = () =>
  download(
    new Blob([recoveryProject], { type: "application/json" }),
    "recovery.graph.json",
  );
$("#space").onclick = () => {
  transform.setSpace(transform.space === "world" ? "local" : "world");
  $("#space").textContent = transform.space === "world" ? "Мир" : "Локально";
};
$("#snap").onclick = () => {
  snapping = !snapping;
  transform.setTranslationSnap(snapping ? 0.25 : null);
  transform.setRotationSnap(snapping ? Math.PI / 12 : null);
  transform.setScaleSnap(snapping ? 0.1 : null);
  $("#snap").classList.toggle("active", snapping);
  $("#snap").setAttribute("aria-pressed", String(snapping));
};
function jumpKey(direction) {
  pause();
  const keys = track(doc.nodes.find((n) => n.id === selected));
  const key =
    direction > 0
      ? keys.find((k) => k.time > time + 0.0001)
      : keys.findLast((k) => k.time < time - 0.0001);
  if (key) seek(key.time);
}
$("#prev-key").onclick = () => jumpKey(-1);
$("#next-key").onclick = () => jumpKey(1);
$("#focus").onclick = focus;
$("#undo").onclick = () => undo();
$("#redo").onclick = () => undo(true);
$("#grid").classList.add("active");
$("#grid").onclick = () => {
  $("#grid").classList.toggle("active", (grid.visible = !grid.visible));
};
$("#wireframe").onclick = () => {
  wireframe = !wireframe;
  content.traverse((o) => {
    if (o.material) o.material.wireframe = wireframe;
  });
  $("#wireframe").classList.toggle("active", wireframe);
  $("#view-mode").textContent = wireframe ? "Каркас" : "Материалы";
};
function screenshot({ rig = false, review = false } = {}) {
  const previousReview = reviewOverlay?.group.visible;
  if (reviewOverlay) reviewOverlay.group.visible = review && reviewVisible;
  const previousRig = rigOverlay?.visible;
  if (rigOverlay) rigOverlay.visible = rig && rigVisible;
  const helper = transform.getHelper(),
    showHelper = helper.visible,
    showBox = box.visible,
    showMultiBox = multiBox.visible;
  try {
    helper.visible = false;
    box.visible = false;
    multiBox.visible = false;
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    if (reviewOverlay) reviewOverlay.group.visible = previousReview;
    if (rigOverlay) rigOverlay.visible = previousRig;
    helper.visible = showHelper;
    box.visible = showBox;
    multiBox.visible = showMultiBox;
    renderer.render(scene, camera);
  }
}
$("#capture").onclick = () => {
  const a = document.createElement("a");
  a.download = `${filename()}.png`;
  a.href = screenshot();
  a.click();
};
$("#save").onclick = save;
$("#review-model").onclick = showModelReview;
$("#rig-overlay").onclick = () => setRigVisible(!rigVisible);
$("#review-rig").onclick = () =>
  safe(() =>
    openRigReview(auditRig(doc, { clip: activeClip }), (id, at) => {
      pause();
      select(id);
      if (at !== null) seek(at);
    }),
  );
$("#rig-study").onclick = async () => {
  const button = $("#rig-study");
  button.disabled = true;
  try {
    const { deformationStudy } = await import("./rig-fixture.js");
    commit(deformationStudy(), doc, {
      selected: null,
      activeClip: "bend",
      time: 0,
    });
    setRigVisible(true);
    setStage({ groundY: -0.01 });
    setCameraView({ preset: "front" });
    select("joint-hinge");
    toast(
      "Технический стенд: сгибание 90° и клип с намеренным превышением ограничения.",
    );
  } catch (e) {
    toast(e.message, true);
  } finally {
    button.disabled = false;
  }
};
$("#shading-mode").onchange = (e) => setShading(e.target.value);
$("#review-mesh").onclick = () => safe(reviewMeshes);
$("#asterion-demo").onclick = async () => {
  const button = $("#asterion-demo");
  button.disabled = true;
  try {
    const response = await fetch(asterionURL);
    if (!response.ok) throw new Error("Не удалось открыть Asterion");
    commit(validateDocument(await response.json()), doc, {
      time: 0,
      selected: null,
      activeClip: null,
    });
    setCameraView({ preset: "threeQuarter" });
    setStage({ fit: true });
    toast("Asterion: проверка симметрии и поверхностей доступна кнопкой ✓.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
};
$("#warden-demo").onclick = async () => {
  const button = $("#warden-demo");
  button.disabled = true;
  try {
    const response = await fetch(wardenURL);
    if (!response.ok) throw new Error("Не удалось загрузить Warden");
    const next = validateDocument(await response.json());
    commit(next, doc, { time: 0, selected: null, activeClip: null });
    focus();
    toast(
      "Warden: цельная поверхность с окраской вершин. Исходный рецепт — в свойствах сетки.",
    );
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
};
$("#open-art").onclick = () => {
  pause();
  openArtEditor();
};
$("#new-sculpt").onclick = () => {
  pause();
  openSculptEditor(null, (recipe, geometry) => {
    const id = crypto.randomUUID();
    execute([
      {
        op: "create",
        type: "mesh",
        id,
        name: "Organic surface",
        position: [0, 1, 0],
        color: "#ffffff",
        geometry,
        sculpt: recipe,
      },
    ]);
    select(id);
    focus();
  });
};
$("#open").onclick = () => $("#file-input").click();
$("#cinder-demo").onclick = async () => {
  const button = $("#cinder-demo");
  button.disabled = true;
  try {
    const response = await fetch(cinderURL);
    if (!response.ok) throw new Error("Не удалось загрузить пример CINDER");
    const next = validateDocument(await response.json());
    commit(next, doc, { time: 0, selected: null, activeClip: "run" });
    focus();
    setStage({ groundY: 0 });
    togglePlay();
    toast(
      "CINDER: зацикленный бег. Пробел — пауза. Предыдущая сцена в истории отмены.",
    );
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
};
$("#file-input").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Максимальный размер проекта — 10 МБ");
    const next = validateDocument(JSON.parse(await file.text()));
    commit(next, doc, {
      time: 0,
      selected: next.nodes[0]?.id ?? null,
      activeClip: null,
    });
    focus();
    toast("Проект открыт");
  } catch (error) {
    toast(error.message, true);
  } finally {
    e.target.value = "";
  }
};
$("#new").onclick = () => {
  if (
    !doc.nodes.length ||
    confirm("Создать пустую сцену? Текущий проект останется в истории отмены.")
  ) {
    commit(emptyDocument(), doc, { time: 0, selected: null, activeClip: null });
  }
};
$("#project-name").onchange = (e) =>
  safe(() => execute([{ op: "scene", name: e.target.value }]));
$("#export").onclick = () => exportGLB().catch((e) => toast(e.message, true));
$("#play").onclick = togglePlay;
$("#rewind").onclick = () => {
  pause();
  seek(0);
};
$("#scrubber").oninput = (e) => {
  pause();
  seek(Math.round(Number(e.target.value) * doc.fps) / doc.fps);
};
$("#add-key").onclick = addKey;
$("#remove-key").onclick = () =>
  safe(() =>
    execute([{ op: "removeKeyframe", id: selected, clip: activeClip, time }]),
  );
function setClip(id) {
  getClip(doc, id);
  pause();
  activeClip = id === "default" ? null : id;
  time = 0;
  rebuild();
}
$("#active-clip").onchange = (e) => safe(() => setClip(e.target.value || null));
$("#manage-clips").onclick = () => {
  pause();
  openClipManager({
    getDocument: () => doc,
    getActive: () => activeClip,
    execute,
    setClip,
  });
};
$("#fps").onchange = (e) =>
  safe(() => execute([{ op: "scene", fps: Number(e.target.value) }]));
$("#duration").onchange = (e) =>
  safe(() => {
    const value = Number(e.target.value);
    if (doc.nodes.some((n) => track(n).some((k) => k.time > value)))
      throw new Error("Сначала удали ключи за новой границей анимации");
    execute([
      activeClip
        ? { op: "updateClip", id: activeClip, duration: value }
        : { op: "scene", duration: value },
    ]);
  });
for (const name of ["help", "commands"])
  $("#" + name).onclick = () => {
    pause();
    $("#" + (name === "help" ? "help" : "command") + "-dialog").showModal();
  };
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
$("#command-input").value = JSON.stringify(
  [
    {
      op: "create",
      type: "torus",
      id: "halo",
      name: "Halo",
      parent: "scout",
      position: [0, 3.05, 0],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1.4, 1.4, 1.4],
      color: "#ffb86b",
    },
  ],
  null,
  2,
);
$("#run-commands").onclick = () => {
  try {
    const cmds = JSON.parse($("#command-input").value);
    execute(cmds);
    $("#command-error").textContent = "";
    $("#command-dialog").close();
    toast(`Применено команд: ${cmds.length}`);
  } catch (e) {
    $("#command-error").textContent = e.message;
  }
};
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      const offset = {
        top: [0, 10, 0.001],
        front: [0, 0, 10],
        right: [10, 0, 0],
      }[b.dataset.view];
      camera.position.copy(orbit.target).add(new THREE.Vector3(...offset));
      orbit.update();
    }),
);
document.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
    document.querySelector("dialog[open]")
  )
    return;
  const ctrl = e.ctrlKey || e.metaKey,
    key = e.key.toLowerCase();
  if (ctrl && key === "s") {
    e.preventDefault();
    save();
    return;
  }
  if (ctrl && key === "z") {
    e.preventDefault();
    undo(e.shiftKey);
    return;
  }
  if (ctrl && key === "y") {
    e.preventDefault();
    undo(true);
    return;
  }
  if (ctrl && key === "g") {
    e.preventDefault();
    if (e.shiftKey) ungroupSelected();
    else groupSelected();
    return;
  }
  if (ctrl && key === "a") {
    e.preventDefault();
    selectMany(
      doc.nodes.filter((n) => isVisible(objects.get(n.id))).map((n) => n.id),
    );
    return;
  }
  if (ctrl) return;
  if (key === " ") {
    e.preventDefault();
    togglePlay();
  } else if (key === "w") setMode("translate");
  else if (key === "e") setMode("rotate");
  else if (key === "r") setMode("scale");
  else if (key === "f") focus();
  else if (key === "delete" || key === "backspace") {
    e.preventDefault();
    deleteSelected();
  } else if (key === "d" && e.shiftKey) duplicate();
  else if (key === "escape") {
    if (transform.dragging && dirtyBeforeDrag) {
      const previous = dirtyBeforeDrag;
      dirtyBeforeDrag = null;
      dragState = null;
      transform.reset();
      transform.dragging = false;
      doc = previous;
      rebuild();
    } else select(null);
  } else if (key === "[") jumpKey(-1);
  else if (key === "]") jumpKey(1);
});
const observer = new ResizeObserver(() => {
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
observer.observe(viewport);
let last = performance.now();
renderer.setAnimationLoop((now) => {
  if (
    document.querySelector(
      "#art-dialog[open], #sculpt-dialog[open], #model-review-dialog[open], #mesh-dialog[open]",
    )
  ) {
    last = now;
    return;
  }
  const delta = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (playing) {
    const next = advanceClipTime(
      time,
      delta,
      duration(),
      getClip(doc, activeClip)?.loop ?? true,
    );
    time = next.time;
    applyPose();
    updateTimeUI();
    if (next.ended) pause();
  }
  orbit.update();
  updateSelectionBox();
  renderer.render(scene, camera);
});
window.forge = Object.freeze({
  getDocument: () => structuredClone(doc),
  openArt: (input) => {
    pause();
    return openArtEditor(input);
  },
  openSculpt: (recipe) => {
    pause();
    openSculptEditor(recipe, (sculpt, geometry) => {
      const id = crypto.randomUUID();
      execute([
        {
          op: "create",
          type: "mesh",
          id,
          position: [0, 0, 0],
          color: "#ffffff",
          geometry,
          sculpt,
        },
      ]);
      select(id);
    });
  },
  execute,
  setClip,
  selectMany,
  transformSelection,
  importOBJ,
  setStage,
  setRigVisible,
  setReviewVisible,
  openMeshEditor: showMeshEditor,
  meshTopology: (id = selected) => {
    const node = doc.nodes.find((n) => n.id === id);
    if (!node || node.type !== "mesh") throw new Error("Choose a mesh");
    return meshTopology(node.geometry);
  },
  convertToMesh: (id = selected) => {
    const node = doc.nodes.find((n) => n.id === id);
    const geometry = bakeMeshGeometry(node);
    if (node.type !== "mesh") execute([{ op: "convertMesh", id, geometry }]);
    return structuredClone(doc);
  },
  openReview: showModelReview,
  auditMeasurements: (options) => auditMeasurements(doc, options),
  auditLocomotion: (options) => auditLocomotion(doc, options),
  auditRig: (options = {}) => auditRig(doc, { clip: activeClip, ...options }),
  sampleRig: (options = {}) =>
    sampleRig(doc, { clip: activeClip, time, ...options }),
  setView: setCameraView,
  setShading,
  captureViews,
  inspect: inspectMeshes,
  getView: () => ({
    shading,
    rigVisible,
    reviewVisible,
    groundY: ground.position.y,
    fov: camera.fov,
    camera: camera.position.toArray(),
    target: orbit.target.toArray(),
    selected,
    selectedIds: [...selectedIds],
    time,
    playing,
    activeClip,
  }),
  project: (point) => {
    const p = new THREE.Vector3(...point).project(camera),
      rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((p.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - p.y) * rect.height) / 2,
    };
  },
  load: (input) => {
    const next = validateDocument(input);
    commit(next, doc, {
      time: 0,
      selected: next.nodes[0]?.id ?? null,
      activeClip: null,
    });
    return structuredClone(doc);
  },
  select: (id) => select(id),
  seek: (value) => {
    if (!Number.isFinite(value))
      throw new Error("Время должно быть конечным числом");
    pause();
    seek(value);
  },
  getPose: (id) => {
    const o = objects.get(id);
    if (!o) throw new Error("Object not found");
    return poseFromObject(o);
  },
  exportGLB,
  focus,
  undo: () => undo(),
  redo: () => undo(true),
  screenshot,
});
rebuild();
setMode("translate");
if (recoveryProject)
  toast(
    "Найдена повреждённая копия. Скачай её кнопкой восстановления вверху.",
    true,
  );
