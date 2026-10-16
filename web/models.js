// The two retrieval models. Shared by the browser worker and the Node evals.
export async function loadModels(from) {
  const T = await import(from);
  const id = "Xenova/ms-marco-MiniLM-L-6-v2";
  // GPU is ~10x faster than WASM for embedding a whole site; fp32 on GPU, int8 on CPU.
  const gpu = typeof navigator !== "undefined" && !!(await navigator.gpu?.requestAdapter?.().catch(() => null));
  const opt = gpu ? { device: "webgpu", dtype: "fp32" } : { dtype: "q8" };
  const [embedder, tk, ce] = await Promise.all([
    T.pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", opt),
    T.AutoTokenizer.from_pretrained(id),
    T.AutoModelForSequenceClassification.from_pretrained(id, opt),
  ]);
  return {
    embed: async xs => (await embedder(xs, { pooling: "cls", normalize: true })).tolist(),
    rerank: async (q, docs) => (await ce(tk(new Array(docs.length).fill(q), { text_pair: docs, padding: true, truncation: true }))).logits.tolist().map(r => r[0]),
  };
}

/** Browser: same interface, but every call goes to a Web Worker. */
export function workerModels() {
  const w = new Worker(new URL("./models.worker.js", import.meta.url), { type: "module" });
  const pending = new Map(); let n = 0;
  w.onmessage = ({ data: { id, result, error } }) => { const p = pending.get(id); pending.delete(id); error ? p.reject(new Error(error)) : p.resolve(result); };
  const call = op => (...args) => new Promise((resolve, reject) => { pending.set(++n, { resolve, reject }); w.postMessage({ id: n, op, args }); });
  return { embed: call("embed"), rerank: call("rerank") };
}
