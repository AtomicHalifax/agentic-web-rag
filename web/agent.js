// The agent. Code makes the decisions (budgets, retries, stop rules); models only do narrow steps.
// ingest():   root -> links -> seed pages -> index, yielding each page so the UI can draw the map
// retrieve(): search -> if evidence is weak, read the most relevant unvisited pages -> search again -> stop
import { checkUrl, sanitize } from "./guard.js";
import { boilerplate, chunkPage } from "./chunk.js";
import { Index } from "./search.js";

export const SEED_PAGES = 8, MAX_PAGES = 30, HOP_PAGES = 3, MAX_HOPS = 2, PARALLEL = 3;
export const CONFIDENT = 0; // ms-marco logit; >0 = reranker thinks the passage answers. Tune with evals/.
const READER = "https://r.jina.ai/";
const SKIP = /\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|xml|json)$|\/(login|signin|signup|cart|checkout|account)\b/i;
const host = u => new URL(u).hostname.replace(/^www\./, "");

/** One page via Jina Reader -> {url, title, md, links, dropped} or null. */
export async function fetchPage(url, fetchFn = fetch) {
  try {
    const r = await fetchFn(READER + url, { headers: { Accept: "application/json", "X-With-Links-Summary": "true", "X-Retain-Images": "none" } });
    if (!r.ok) return null;
    const { data } = await r.json();
    if (!data?.content || data.content.length < 80) return null;
    const [md, dropped] = sanitize(data.content);
    const raw = Array.isArray(data.links) ? data.links.map(l => l[1] ?? l) : Object.values(data.links || {});
    const links = [...new Set(raw.filter(l => typeof l === "string").map(l => { try { const u = new URL(l, url); u.hash = ""; return u.href.replace(/\/$/, ""); } catch { return null; } }))]
      .filter(l => l && /^https?:/.test(l) && host(l) === host(url) && !SKIP.test(l));
    return { url, title: data.title || new URL(url).pathname, md, links, dropped };
  } catch { return null; }
}

/** Cheap relevance: question words in the URL path, shallower first. */
export function rank(frontier, hint) {
  const words = new Set(hint.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const score = u => { const p = new URL(u).pathname.toLowerCase(); return [-[...words].filter(w => p.includes(w)).length, p.split("/").length, p.length]; };
  return [...frontier].sort((a, b) => { const x = score(a), y = score(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
}

export class Site {
  constructor(root, models, fetchFn = fetch) {
    this.root = checkUrl(root); this.index = new Index(models); this.fetchFn = fetchFn;
    this.pages = new Map(); this.frontier = [this.root]; this.raw = []; this.drop = new Set();
  }
  okCount() { return [...this.pages.values()].filter(p => p.ok).length; }

  async *_read(n) {
    const batch = [];
    while (batch.length < n && this.frontier.length && this.pages.size + batch.length < MAX_PAGES) {
      const u = this.frontier.shift(); if (!this.pages.has(u) && !batch.includes(u)) batch.push(u);
    }
    for (let i = 0; i < batch.length; i += PARALLEL) {
      const got = await Promise.all(batch.slice(i, i + PARALLEL).map(u => fetchPage(u, this.fetchFn)));
      for (const [j, page] of got.entries()) {
        const u = batch[i + j];
        this.pages.set(u, { ok: !!page, title: page?.title || u });
        if (!page) continue;
        this.raw.push(page.md);
        if (this.raw.length === 3 || this.raw.length === 8) this.drop = boilerplate(this.raw); // learn nav/footer once there's evidence
        await this.index.add(chunkPage(page.md, u, page.title, this.drop));
        this.frontier.push(...page.links.filter(l => !this.pages.has(l) && !this.frontier.includes(l)));
        yield { type: "page", url: u, title: page.title, links: page.links.filter(l => this.pages.has(l)).slice(0, 8), chunks: this.index.chunks.length, injectionsRemoved: page.dropped };
      }
    }
  }

  async *ingest() {
    yield { type: "session", root: this.root };
    yield { type: "step", text: "Reading the homepage" };
    yield* this._read(1);
    this.frontier = rank(this.frontier, "about docs guide pricing features faq getting started");
    yield { type: "step", text: `Found ${this.frontier.length} links, reading the most useful` };
    while (this.okCount() < SEED_PAGES && this.frontier.length && this.pages.size < MAX_PAGES) yield* this._read(SEED_PAGES - this.okCount());
    const n = this.okCount();
    yield n ? { type: "done", pages: n, chunks: this.index.chunks.length } : { type: "error", text: "Couldn't read any pages on that site." };
  }

  async *retrieve(q) {
    const t0 = performance.now();
    let hits = await this.index.search(q), hop = 0;
    yield { type: "search", hop, best: hits[0]?.score ?? null, urls: [...new Set(hits.map(h => h.chunk.url))] };
    while ((!hits.length || hits[0].score < CONFIDENT) && this.frontier.length && hop < MAX_HOPS && this.pages.size < MAX_PAGES) {
      hop++;
      this.frontier = rank(this.frontier, q);
      yield { type: "step", text: "Not enough on indexed pages, reading more" };
      yield* this._read(HOP_PAGES);
      hits = await this.index.search(q);
      yield { type: "search", hop, best: hits[0]?.score ?? null, urls: [...new Set(hits.map(h => h.chunk.url))] };
    }
    yield {
      type: "context", hops: hop, ms: Math.round(performance.now() - t0),
      confident: !!hits.length && hits[0].score >= CONFIDENT,
      sources: hits.map(({ chunk: c, score }, i) => ({ n: i + 1, url: c.url, title: c.title, path: c.path, text: c.parent, score: +score.toFixed(2) })),
    };
  }
}
