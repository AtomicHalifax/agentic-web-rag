// Hybrid index in the browser: dense (bge-small) + BM25, fused with RRF, then cross-encoder rerank.
// Models run via transformers.js (WASM/WebGPU) — same models the old Python API used.
const TRANSFORMERS = typeof window === "undefined" ? "@huggingface/transformers" : "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm";
export const tok = s => s.toLowerCase().match(/[a-z0-9]+/g) || [];

let _embed, _rerank;
export async function defaultModels() {
  const T = await import(TRANSFORMERS);
  _embed ??= await T.pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8" });
  if (!_rerank) {
    const id = "Xenova/ms-marco-MiniLM-L-6-v2";
    const [tk, m] = await Promise.all([T.AutoTokenizer.from_pretrained(id), T.AutoModelForSequenceClassification.from_pretrained(id, { dtype: "q8" })]);
    _rerank = async (q, docs) => (await m(tk(new Array(docs.length).fill(q), { text_pair: docs, padding: true, truncation: true }))).logits.tolist().map(r => r[0]);
  }
  return {
    embed: async xs => (await _embed(xs, { pooling: "cls", normalize: true })).tolist(),
    rerank: _rerank,
  };
}

class BM25 {
  constructor(docs, k1 = 1.5, b = 0.75) {
    this.docs = docs.map(tok); this.k1 = k1; this.b = b;
    this.avg = this.docs.reduce((s, d) => s + d.length, 0) / (this.docs.length || 1);
    this.df = new Map();
    for (const d of this.docs) for (const t of new Set(d)) this.df.set(t, (this.df.get(t) || 0) + 1);
    this.tf = this.docs.map(d => d.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map()));
  }
  scores(q) {
    const N = this.docs.length, qt = tok(q);
    return this.tf.map((tf, i) => qt.reduce((s, t) => {
      const f = tf.get(t); if (!f) return s;
      const idf = Math.log(1 + (N - this.df.get(t) + 0.5) / (this.df.get(t) + 0.5));
      return s + idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.docs[i].length / this.avg));
    }, 0));
  }
}

const rrf = xs => { const r = new Array(xs.length); xs.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).forEach(([, i], rank) => (r[i] = 1 / (60 + rank))); return r; };
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

export class Index {
  constructor(models) { this.m = models; this.chunks = []; this.vecs = []; this.bm25 = null; }

  async add(chunks) {
    if (!chunks.length) return;
    for (let i = 0; i < chunks.length; i += 32) this.vecs.push(...(await this.m.embed(chunks.slice(i, i + 32).map(c => c.text))));
    this.chunks.push(...chunks);
    this.bm25 = new BM25(this.chunks.map(c => c.text)); // ponytail: full rebuild, fine below ~10k chunks
  }

  /** [{chunk, score}] best first, one per parent section. */
  async search(q, k = 4, pool = 16) {
    if (!this.chunks.length) return [];
    const [qv] = await this.m.embed([q]);
    const dense = rrf(this.vecs.map(v => dot(v, qv))), sparse = rrf(this.bm25.scores(q));
    const cand = dense.map((d, i) => [d + sparse[i], i]).sort((a, b) => b[0] - a[0]).slice(0, pool).map(([, i]) => this.chunks[i]);
    const scores = await this.m.rerank(q, cand.map(c => c.text));
    const out = [], seen = new Set();
    for (const i of scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a])) {
      if (seen.has(cand[i].parent)) continue;
      seen.add(cand[i].parent); out.push({ chunk: cand[i], score: scores[i] });
      if (out.length === k) break;
    }
    return out;
  }
}
