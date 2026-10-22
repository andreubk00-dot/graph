import { sculptGeometry, validateSculptRecipe } from "./sculpt.js";
self.onmessage = (e) => {
  try {
    const recipe = validateSculptRecipe(e.data);
    self.postMessage({ recipe, geometry: sculptGeometry(recipe) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
