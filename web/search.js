// Index in the browser: BM25 ranks, query-term coverage says how sure we are. No models, no network.
export const tok = s => s.toLowerCase().match(/[a-z0-9]+/g) || [];
const STOP = new Set("the and for are but not you all any can how what when where which who why with this that from your does into about have has was were will would should could there their them they its our out use using get".split(" "));
export const stem = t => (t.length > 4 && !t.endsWith("ss") ? t.replace(/(es|s)$/, "") : t); // ponytail: plural-only stemmer, enough for "costs"/"cost"
export const terms = q => [...new Set(tok(q).filter(t => t.length > 2 && !STOP.has(t)).map(stem))];

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

export class Index {
  constructor() { this.chunks = []; this.bm25 = null; }

  async add(chunks) {
    if (!chunks.length) return;
    this.chunks.push(...chunks);
    this.bm25 = new BM25(this.chunks.map(c => c.text)); // ponytail: full rebuild, fine below ~10k chunks
  }

  /** [{chunk, score}] best first, one per parent section. score = share of the question's key words found (0..1). */
  async search(q, k = 4) {
    if (!this.chunks.length) return [];
    const want = terms(q), bm = this.bm25.scores(q), out = [], seen = new Set();
    for (const i of bm.map((_, i) => i).sort((a, b) => bm[b] - bm[a])) {
      if (!bm[i] || out.length === k) break;
      const c = this.chunks[i]; if (seen.has(c.parent)) continue;
      const have = new Set(tok(c.text).map(stem)); // the small passage: overview pages that merely list topic names don't count
      seen.add(c.parent); out.push({ chunk: c, score: want.length ? want.filter(t => have.has(t)).length / want.length : 0 });
    }
    return out.sort((a, b) => b.score - a.score);
  }
}
