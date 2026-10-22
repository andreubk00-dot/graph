import wardenRecipe from "../examples/warden.sculpt.json";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { geometryFor } from "./scene.js";
export function openSculptEditor(initial, onApply) {
  document.querySelector("#sculpt-dialog")?.close();
  const dialog = document.createElement("dialog");
  dialog.id = "sculpt-dialog";
  dialog.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">CONTINUOUS SURFACE · SDF</span><h2>Цельная органическая сетка</h2></div><button id="sculpt-close" aria-label="Закрыть органическую сетку">✕</button></div><p>Плавное объединение и вырезание объёмов. Результат — индексированная поверхность с нормалями и цветом вершин. Исходный рецепт остаётся редактируемым.</p><div class="sculpt-workspace"><textarea id="sculpt-source" aria-label="Рецепт органической сетки" spellcheck="false"></textarea><div id="sculpt-preview" aria-label="Предпросмотр органической сетки"></div></div><div id="sculpt-error" role="alert"></div><div class="dialog-footer"><span id="sculpt-stats"></span><div class="art-tools"><button id="sculpt-example">Пример Warden</button><button id="sculpt-build">Обновить предпросмотр</button><button id="sculpt-apply" class="primary" disabled>Добавить сетку</button></div></div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  $("#sculpt-source").value = JSON.stringify(initial ?? wardenRecipe, null, 2);
  let worker = null,
    mesh = null,
    result = null,
    source = "",
    disposed = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#20282c");
  scene.add(new THREE.HemisphereLight("#e1f4ff", "#35443e", 3));
  const light = new THREE.DirectionalLight("#ffefdb", 3);
  light.position.set(3, 4, 5);
  scene.add(light);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (error) {
    dialog.remove();
    throw error;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(420, 400);
  $("#sculpt-preview").append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000),
    orbit = new OrbitControls(camera, renderer.domElement);
  camera.position.set(3, 2, 5);
  orbit.update();
  const observer = new ResizeObserver(() => {
    const w = $("#sculpt-preview").clientWidth,
      h = $("#sculpt-preview").clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  });
  observer.observe($("#sculpt-preview"));
  orbit.addEventListener("change", () => renderer.render(scene, camera));
  function cleanup() {
    if (disposed) return;
    disposed = true;
    worker?.terminate();
    observer.disconnect();
    orbit.dispose();
    mesh?.geometry.dispose();
    mesh?.material.dispose();
    renderer.dispose();
    dialog.remove();
  }
  function build() {
    worker?.terminate();
    worker = null;
    result = null;
    source = $("#sculpt-source").value;
    $("#sculpt-apply").disabled = true;
    $("#sculpt-error").textContent = "";
    $("#sculpt-stats").textContent = "Генерирую поверхность…";
    try {
      const recipe = JSON.parse(source);
      worker = new Worker(new URL("./sculpt-worker.js", import.meta.url), {
        type: "module",
      });
      const job = worker;
      worker.onmessage = (e) => {
        if (disposed || worker !== job) return;
        job.terminate();
        worker = null;
        if (e.data.error) {
          $("#sculpt-error").textContent = e.data.error;
          $("#sculpt-stats").textContent = "";
          return;
        }
        result = e.data;
        if (mesh) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
        mesh = new THREE.Mesh(
          geometryFor({ type: "mesh", geometry: result.geometry }),
          new THREE.MeshStandardMaterial({
            color: "#ffffff",
            vertexColors: true,
            roughness: 0.7,
          }),
        );
        scene.add(mesh);
        const box = new THREE.Box3().setFromObject(mesh),
          center = box.getCenter(new THREE.Vector3()),
          radius = box.getBoundingSphere(new THREE.Sphere()).radius;
        orbit.target.copy(center);
        camera.position
          .copy(center)
          .add(
            new THREE.Vector3(0.6, 0.3, 1)
              .normalize()
              .multiplyScalar(
                (radius / Math.sin(THREE.MathUtils.degToRad(17.5))) * 1.2,
              ),
          );
        orbit.update();
        renderer.render(scene, camera);
        $("#sculpt-stats").textContent =
          `${result.geometry.positions.length / 3} вершин · ${result.geometry.indices.length / 3} треугольников`;
        $("#sculpt-apply").disabled = $("#sculpt-source").value !== source;
      };
      worker.onerror = (e) => {
        if (disposed || worker !== job) return;
        $("#sculpt-error").textContent = e.message;
        worker?.terminate();
        worker = null;
      };
      worker.postMessage(recipe);
    } catch (error) {
      $("#sculpt-error").textContent = error.message;
      $("#sculpt-stats").textContent = "";
    }
  }
  $("#sculpt-example").onclick = async () => {
    try {
      const m = await import("../examples/warden.sculpt.json");
      $("#sculpt-source").value = JSON.stringify(m.default, null, 2);
      build();
    } catch (error) {
      $("#sculpt-error").textContent = error.message;
    }
  };
  $("#sculpt-source").oninput = () =>
    ($("#sculpt-apply").disabled =
      !result || $("#sculpt-source").value !== source);
  $("#sculpt-build").onclick = build;
  $("#sculpt-apply").onclick = () => {
    if (!result || $("#sculpt-source").value !== source) return;
    try {
      onApply(result.recipe, result.geometry);
      dialog.close();
    } catch (error) {
      $("#sculpt-error").textContent = error.message;
    }
  };
  $("#sculpt-close").onclick = () => dialog.close();
  dialog.addEventListener("close", cleanup, { once: true });
  dialog.showModal();
  build();
}
