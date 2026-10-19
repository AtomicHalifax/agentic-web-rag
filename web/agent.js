// The agent. Code makes the decisions (budgets, retries, stop rules); models only do narrow steps.
// ingest():   root -> links -> seed pages -> index, yielding each page so the UI can draw the map
// retrieve(): search -> if evidence is weak, read the most relevant unvisited pages -> search again -> stop
import { checkUrl, norm, sanitize } from "./guard.js";
import { boilerplate, chunkPage } from "./chunk.js";
import { Index, terms } from "./search.js";

export const SEED_PAGES = 8, MAX_PAGES = 30, HOP_PAGES = 3, MAX_HOPS = 2;
// Share of the question's key words found in the best passage (0..1). Below this, read more pages. Tune with evals/.
export const CONFIDENT = 0.6;
const LANG = /^\/[a-z]{2}(-[a-z]{2,4})?(\/|$)/i; // /de, /pt-br, /zh-hant: translations of pages we already have
const READER = "https://r.jina.ai/";
const SKIP = /\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|xml|json)$|\/(login|signin|signup|cart|checkout|account)\b/i;
const host = u => new URL(u).hostname.replace(/^www\./, "");

/** One page via Jina Reader -> {url, title, md, links, dropped} or null. */
export async function fetchPage(url, fetchFn = fetch, wait = ms => new Promise(r => setTimeout(r, ms))) {
  try {
    let r;
    for (let tries = 0; ; tries++) { // Jina rate-limits keyless callers: back off on 429 instead of losing the page
      r = await fetchFn(READER + url, { headers: { Accept: "application/json", "X-With-Links-Summary": "true", "X-Retain-Images": "none" } });
      if (r.status !== 429 || tries === 3) break;
      await wait(2000 * 2 ** tries);
    }
    if (!r.ok) return null;
    const { data } = await r.json();
    if (!data?.content || data.content.length < 80) return null;
    const [md, dropped] = sanitize(data.content);
    const raw = Array.isArray(data.links) ? data.links.map(l => l[1] ?? l) : Object.values(data.links || {});
    const links = [...new Set(raw.filter(l => typeof l === "string").map(l => { try { return norm(new URL(l, url).href); } catch { return null; } }))]
      .filter(l => l && /^https?:/.test(l) && host(l) === host(url) && !SKIP.test(l) && (LANG.test(new URL(url).pathname) || !LANG.test(new URL(l).pathname)));
    return { url, title: data.title || new URL(url).pathname, md, links, dropped };
  } catch { return null; }
}

/** How many of the question's key words a URL path mentions. Prefix match, so "parameter" hits "path-params". */
export function urlMatch(u, words) {
  const parts = new URL(u).pathname.toLowerCase().split(/[^a-z0-9]+/).filter(p => p.length > 2);
  return words.filter(w => parts.some(p => p === w || (p.length > 3 && w.length > 3 && p.slice(0, 5) === w.slice(0, 5)))).length;
}

/** Cheap relevance: question words in the URL path, shallower first. */
export function rank(frontier, hint) {
  const words = terms(hint);
  const score = u => { const p = new URL(u).pathname; return [-urlMatch(u, words), p.split("/").length, p.length]; };
  return [...frontier].sort((a, b) => { const x = score(a), y = score(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
}

export class Site {
  constructor(root, _unused, fetchFn = fetch) {
    this.root = checkUrl(root); this.index = new Index(); this.fetchFn = fetchFn;
    this.pages = new Map(); this.frontier = [this.root]; this.raw = []; this.drop = new Set();
  }
  bar() { return CONFIDENT; }
  okCount() { return [...this.pages.values()].filter(p => p.ok).length; }

  async *_read(n) {
    const batch = [];
    while (batch.length < n && this.frontier.length && this.pages.size + batch.length < MAX_PAGES) {
      const u = this.frontier.shift(); if (!this.pages.has(u) && !batch.includes(u)) batch.push(u);
    }
    // All fetches start at once; each page is indexed as soon as it lands.
    const inflight = new Map(batch.map(u => [u, fetchPage(u, this.fetchFn).then(page => ({ u, page }))]));
    while (inflight.size) {
      const { u, page } = await Promise.race(inflight.values());
      inflight.delete(u);
      {
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
    const words = terms(q);
    // Read more when the evidence is weak, OR when an unread page's URL names the topic better than anything we used.
    const needMore = () => {
      this.frontier = rank(this.frontier, q);
      const best = Math.max(0, ...hits.map(h => urlMatch(h.chunk.url, words)));
      return !hits.length || hits[0].score < this.bar() || (this.frontier.length > 0 && urlMatch(this.frontier[0], words) > best);
    };
    while (this.frontier.length && hop < MAX_HOPS && this.pages.size < MAX_PAGES && needMore()) {
      hop++;
      yield { type: "step", text: "Not enough on indexed pages, reading more" };
      yield* this._read(HOP_PAGES);
      hits = await this.index.search(q);
      yield { type: "search", hop, best: hits[0]?.score ?? null, urls: [...new Set(hits.map(h => h.chunk.url))] };
    }
    yield {
      type: "context", hops: hop, ms: Math.round(performance.now() - t0),
      confident: !!hits.length && hits[0].score >= this.bar(),
      sources: hits.map(({ chunk: c, score }, i) => ({ n: i + 1, url: c.url, title: c.title, path: c.path, text: c.parent, score: +score.toFixed(2) })),
    };
  }
}
