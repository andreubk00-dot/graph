export const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
export function validateReferences(references) {
  if (!Array.isArray(references) || references.length > 3)
    throw new Error("At most three modeling reference images");
  let bytes = 0;
  const views = new Set();
  for (const r of references) {
    if (!r || !["front", "side", "top"].includes(r.view) || views.has(r.view))
      throw new Error("Reference views must be unique: front, side, top");
    views.add(r.view);
    if (typeof r.name !== "string" || r.name.length > 200)
      throw new Error("Invalid reference name");
    if (
      typeof r.data !== "string" ||
      !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        r.data,
      ) ||
      r.data.split(",")[1].length % 4 !== 0
    )
      throw new Error("Reference must be an embedded PNG, JPEG or WebP image");
    bytes += r.data.length * 2;
    if (bytes > MAX_REFERENCE_BYTES)
      throw new Error(
        "Reference images exceed 4 MiB source budget; resize the images first",
      );
    for (const key of ["width", "opacity"])
      if (
        !Number.isFinite(r[key]) ||
        r[key] < (key === "width" ? 0.001 : 0) ||
        r[key] > (key === "width" ? 100000 : 1)
      )
        throw new Error(`Invalid reference ${key}`);
    if (
      !Array.isArray(r.center) ||
      r.center.length !== 3 ||
      r.center.some((v) => !Number.isFinite(v) || Math.abs(v) > 100000)
    )
      throw new Error("Invalid reference center");
  }
  return references;
}
