// The only model: an LLM that runs in the visitor's browser (WebLLM on WebGPU) inside a Web Worker,
// so the page never freezes. No server, no key. Weights download once, then come from the browser cache.
const WEB_LLM = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2/+esm";
const small = (navigator.deviceMemory ?? 8) < 8 || matchMedia("(max-width: 720px)").matches;
export const MODEL = small ? "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" : "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

let engine = null;
/** Starts the download once; later calls share it. onProgress(0..1). Resolves to null without WebGPU. */
export function loadLLM(onProgress = () => {}) {
  if (!navigator.gpu) return (engine ??= Promise.resolve(null));
  return (engine ??= import(WEB_LLM).then(({ CreateWebWorkerMLCEngine }) =>
    CreateWebWorkerMLCEngine(new Worker(new URL("./llm.worker.js", import.meta.url), { type: "module" }), MODEL,
      { initProgressCallback: p => onProgress(p.progress) }))
    .catch(e => { console.warn("LLM unavailable:", e); return null; }));
}

/** Streams an answer. onText gets the full text so far. Throws if the browser can't run the model. */
export async function chat(messages, onText) {
  const llm = await loadLLM();
  if (!llm) throw new Error("This browser can't run the AI model (needs WebGPU: Chrome or Edge on a laptop).");
  let out = "";
  for await (const c of await llm.chat.completions.create({ messages, stream: true, temperature: 0.2, max_tokens: 300 })) {
    out += c.choices[0]?.delta?.content || ""; onText(out);
  }
  return out;
}
