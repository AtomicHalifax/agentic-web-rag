// Retrieval models. In production they run on Cloudflare Workers AI behind our Worker (see worker/);
// visitors' devices only draw the UI. loadModels() runs the same kind of models locally for offline dev/evals.
import { API } from "./config.js";

async function post(path, body) {
  const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `AI service error (${r.status})`);
  return r;
}

/** Same interface as loadModels(), backed by the Worker. Scores are 0..1. */
export function remoteModels() {
  return {
    confident: 0.3, // bge-reranker sigmoid. Tune with evals.
    embed: async texts => {
      const out = [];
      for (let i = 0; i < texts.length; i += 64) out.push(...(await (await post("/embed", { texts: texts.slice(i, i + 64) })).json()).vectors);
      return out.map(v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); }); // dot product = cosine
    },
    rerank: async (query, docs) => (await (await post("/rerank", { query, docs: docs.slice(0, 32) })).json()).scores,
  };
}

/** Streams the answer from the Worker's LLM. Calls onText with the full text so far; returns the final text. */
export async function chat(messages, onText) {
  const reader = (await post("/chat", { messages })).body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n"); buf = lines.pop();
    for (const l of lines) {
      if (!l.startsWith("data: ") || l === "data: [DONE]") continue;
      try { const t = JSON.parse(l.slice(6)).response; if (t) { out += t; onText(out); } } catch {}
    }
  }
  return out;
}

/** Local transformers.js models (Node evals, offline dev). ms-marco logits, so a different confidence scale. */
export async function loadModels(from) {
  const T = await import(from);
  const id = "Xenova/ms-marco-MiniLM-L-6-v2";
  const [embedder, tk, ce] = await Promise.all([
    T.pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8" }),
    T.AutoTokenizer.from_pretrained(id),
    T.AutoModelForSequenceClassification.from_pretrained(id, { dtype: "q8" }),
  ]);
  return {
    confident: 3,
    embed: async xs => (await embedder(xs, { pooling: "cls", normalize: true })).tolist(),
    rerank: async (q, docs) => (await ce(tk(new Array(docs.length).fill(q), { text_pair: docs, padding: true, truncation: true }))).logits.tolist().map(r => r[0]),
  };
}
