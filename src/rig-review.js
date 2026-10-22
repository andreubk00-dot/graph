const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function openRigReview(report, onSelect) {
  document.querySelector("#rig-review-dialog")?.close();
  const d = document.createElement("dialog");
  d.id = "rig-review-dialog";
  d.innerHTML = `<div class="dialog-header"><div><span class="eyebrow">RIG DIAGNOSTICS</span><h2>Проверка рига и суставов</h2></div><button id="rig-review-close" aria-label="Закрыть проверку рига">✕</button></div><p>${report.bones.length} костей · ${report.skins.length} сеток со скиннингом · ${report.samples} моментов времени. Углы — относительно базовой позы.</p><p id="rig-issues" role="status">${esc(report.issues.length ? report.issues.join(" · ") : report.bones.length ? "Нарушений заданных ограничений и длин сегментов не обнаружено." : "В сцене нет костей. Открой технический стенд скиннинга.")}</p><div class="mesh-review-table"><table><thead><tr><th>Кость / переход</th><th>Длина сегмента</th><th>Изменение длины</th><th>Поворот</th><th>Ограничения</th><th>Нарушения</th></tr></thead><tbody>${report.bones.map((b, i) => `<tr><td><button data-rig-bone="${i}">${esc(b.name)}</button></td><td>${b.restLength === null ? "корень" : b.restLength.toFixed(3) + " м"}</td><td>${(b.maxLengthDrift * 1000).toFixed(3)} мм</td><td>${b.limit ? b.minTwist.toFixed(1) + "…" + b.maxTwist.toFixed(1) + "°" : "не заданы"}</td><td>${b.limit ? esc(b.limit.axis.toUpperCase()) + ": " + b.limit.min + "…" + b.limit.max + "°; вне оси ≤ " + b.limit.swing + "°" : "—"}</td><td>${b.violations}</td></tr>`).join("")}</tbody></table></div><p>Кнопка кости выбирает её; при нарушении открывает первый найденный проблемный момент. Режим «Веса» показывает влияние выбранной кости: синий — 0, оранжевый — 1. Кости включаются отдельной кнопкой в окне сцены.</p><p class="muted">${esc(report.scope)} Для плеч, таза и других сложных суставов одной оси шарнира недостаточно. Ограничения задаёт автор рига.</p>`;
  document.body.append(d);
  d.querySelector("#rig-review-close").onclick = () => d.close();
  d.querySelectorAll("[data-rig-bone]").forEach(
    (b) =>
      (b.onclick = () => {
        const bone = report.bones[Number(b.dataset.rigBone)];
        d.close();
        onSelect(bone.id, bone.worstTime);
      }),
  );
  d.addEventListener("close", () => d.remove(), { once: true });
  d.showModal();
}
