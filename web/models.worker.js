// Embedding + rerank run here so the page (and its animations) never freeze.
import { loadModels } from "./models.js";

const ready = loadModels("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm");
onmessage = async ({ data: { id, op, args } }) => {
  try { postMessage({ id, result: await (await ready)[op](...args) }); }
  catch (e) { postMessage({ id, error: String(e) }); }
};
