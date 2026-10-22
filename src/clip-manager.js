import { getClip } from "./document.js";
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function openClipManager({ getDocument, getActive, execute, setClip }) {
  document.querySelector("#clips-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "clips-dialog";
  document.body.append(dialog);
  let message = "";
  function run(fn) {
    try {
      message = "";
      fn();
    } catch (e) {
      message = e.message;
    }
    render();
  }
  function unique(base) {
    const used = new Set([
      "Action",
      ...(getDocument().clips ?? []).map((c) => c.name),
    ]);
    let name = base,
      i = 2;
    while (used.has(name)) name = `${base} ${i++}`;
    return name;
  }
  function render() {
    const doc = getDocument(),
      id = getActive(),
      clip = getClip(doc, id);
    dialog.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">ANIMATION LIBRARY</span><h2>Клипы анимации</h2></div><button id="close-clips" aria-label="Закрыть клипы">✕</button></div><p>Каждый клип имеет собственные ключи и длительность. Все непустые клипы экспортируются в GLB.</p><div class="clip-list">${[{ id: "", name: "Action", duration: doc.duration }, ...(doc.clips ?? [])].map((c) => `<button data-clip="${esc(c.id)}" class="${(id ?? "") === c.id ? "active" : ""}"><span>${esc(c.name)}</span><small>${c.duration.toFixed(2)} с</small></button>`).join("")}</div><div class="clip-fields"><label>Название<input id="clip-name" aria-label="Название клипа" value="${esc(clip?.name ?? "Action")}" maxlength="100" ${clip ? "" : "disabled"}></label><label>Длительность, с<input id="clip-length" aria-label="Длительность клипа" type="number" min=".1" max="600" step=".1" value="${clip?.duration ?? doc.duration}"></label></div><label class="clip-loop-field"><input id="clip-loop" type="checkbox" aria-label="Зациклить клип" ${(clip?.loop ?? true) ? "checked" : ""} ${clip ? "" : "disabled"}> Зациклить воспроизведение</label><div class="clip-manager-actions"><button id="create-clip" class="primary">+ Новый клип</button><button id="duplicate-clip" class="wide-button">Дублировать</button><button id="delete-clip" class="wide-button" ${clip ? "" : "disabled"}>Удалить клип</button></div><div class="clip-error" role="alert">${esc(message)}</div>`;
    dialog.querySelector("#close-clips").onclick = () => dialog.close();
    dialog
      .querySelectorAll("[data-clip]")
      .forEach(
        (b) => (b.onclick = () => run(() => setClip(b.dataset.clip || null))),
      );
    dialog.querySelector("#clip-name").onchange = (e) => {
      const name = e.target.value;
      run(() => execute([{ op: "updateClip", id, name }]));
    };
    dialog.querySelector("#clip-length").onchange = (e) => {
      const duration = Number(e.target.value);
      run(() =>
        execute([
          clip ? { op: "updateClip", id, duration } : { op: "scene", duration },
        ]),
      );
    };
    dialog.querySelector("#clip-loop").onchange = (e) =>
      run(() => execute([{ op: "updateClip", id, loop: e.target.checked }]));
    dialog.querySelector("#create-clip").onclick = () =>
      run(() => {
        const next = crypto.randomUUID();
        execute([
          {
            op: "createClip",
            id: next,
            name: unique("New clip"),
            duration: clip?.duration ?? doc.duration,
          },
        ]);
        setClip(next);
      });
    dialog.querySelector("#duplicate-clip").onclick = () =>
      run(() => {
        const next = crypto.randomUUID();
        execute([
          {
            op: "duplicateClip",
            id: next,
            source: id,
            name: unique(`${clip?.name ?? "Action"} copy`),
          },
        ]);
        setClip(next);
      });
    dialog.querySelector("#delete-clip").onclick = () =>
      run(() => {
        execute([{ op: "deleteClip", id }]);
        setClip(null);
      });
  }
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  render();
  dialog.showModal();
}
