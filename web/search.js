// Index in the browser: BM25 recall, then cross-encoder rerank (on Cloudflare in prod).
// Models live in models.js: Cloudflare Workers AI in the browser, local transformers.js in Node evals.
import { loadModels, remoteModels } from "./models.js";
export const tok = s => s.toLowerCase().match(/[a-z0-9]+/g) || [];

let _models;
export function defaultModels() {
  return (_models ??= typeof window === "undefined" ? loadModels("@huggingface/transformers") : Promise.resolve(remoteModels()));
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

// No embeddings: BM25 recalls a wide pool for free, the cross-encoder reranks it semantically.
// Indexing is now instant (no model calls while crawling); the model runs once per question.
// ponytail: pure-synonym queries (no shared words) can miss; add dense recall back if evals show it.
export class Index {
  constructor(models) { this.m = models; this.chunks = []; this.bm25 = null; }

  async add(chunks) {
    if (!chunks.length) return;
    this.chunks.push(...chunks);
    this.bm25 = new BM25(this.chunks.map(c => c.text)); // ponytail: full rebuild, fine below ~10k chunks
  }

  /** [{chunk, score}] best first, one per parent section. */
  async search(q, k = 4, pool = 24) {
    if (!this.chunks.length) return [];
    const cand = this.bm25.scores(q).map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).slice(0, pool).map(([, i]) => this.chunks[i]);
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
