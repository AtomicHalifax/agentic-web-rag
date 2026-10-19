// The agent. Code makes the decisions (budgets, retries, stop rules); models only do narrow steps.
// ingest():   root -> links -> seed pages -> index, yielding each page so the UI can draw the map
// retrieve(): search -> if evidence is weak, read the most relevant unvisited pages -> search again -> stop
import { checkUrl, norm, sanitize } from "./guard.js";
import { boilerplate, chunkPage } from "./chunk.js";
import { Index, terms, tok } from "./search.js";

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
    // Jina gives {anchor text: url} (or [text, url] pairs). Keep the text: it describes the target far better than its URL.
    const pairs = Array.isArray(data.links) ? data.links.map(l => (Array.isArray(l) ? l : ["", l])) : Object.entries(data.links || {});
    const anchors = new Map();
    for (const [text, l] of pairs) {
      if (typeof l !== "string") continue;
      let u; try { u = norm(new URL(l, url).href); } catch { continue; }
      if (!/^https?:/.test(u) || host(u) !== host(url) || SKIP.test(u) || (!LANG.test(new URL(url).pathname) && LANG.test(new URL(u).pathname))) continue;
      anchors.set(u, `${anchors.get(u) || ""} ${text}`.trim());
    }
    return { url, title: data.title || new URL(url).pathname, md, links: [...anchors.keys()], anchors, dropped };
  } catch { return null; }
}

/** Which of the question's key words a link mentions, in its URL path or its anchor text. Prefix match ("parameter" ~ "params"). */
export function linkWords(u, words, anchors = new Map()) {
  const parts = [...new URL(u).pathname.toLowerCase().split(/[^a-z0-9]+/), ...tok(anchors.get(u) || "")].filter(p => p.length > 2);
  return words.filter(w => parts.some(p => p === w || (p.length > 3 && w.length > 3 && p.slice(0, 5) === w.slice(0, 5))));
}

/** Score links like a tiny search engine: each matched word counts 1/(how many links mention it), so rare words win. */
export function scoreLinks(urls, words, anchors) {
  const hit = new Map(urls.map(u => [u, linkWords(u, words, anchors)])), df = new Map();
  for (const ws of hit.values()) for (const w of ws) df.set(w, (df.get(w) || 0) + 1);
  return new Map([...hit].map(([u, ws]) => [u, ws.reduce((s, w) => s + 1 / df.get(w), 0)]));
}

/** Most relevant unread links first (shallower breaks ties). */
export function rank(frontier, hint, anchors) {
  const sc = scoreLinks(frontier, terms(hint), anchors), depth = u => new URL(u).pathname.split("/").length;
  return [...frontier].sort((a, b) => sc.get(b) - sc.get(a) || depth(a) - depth(b) || a.length - b.length);
}

export class Site {
  constructor(root, _unused, fetchFn = fetch) {
    this.root = checkUrl(root); this.index = new Index(); this.fetchFn = fetchFn;
    this.pages = new Map(); this.anchors = new Map(); this.frontier = [this.root]; this.raw = []; this.drop = new Set();
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
        for (const [l, t] of page.anchors) this.anchors.set(l, `${this.anchors.get(l) || ""} ${t}`.slice(0, 300));
        this.frontier.push(...page.links.filter(l => !this.pages.has(l) && !this.frontier.includes(l)));
        yield { type: "page", url: u, title: page.title, links: page.links.filter(l => this.pages.has(l)).slice(0, 8), chunks: this.index.chunks.length, injectionsRemoved: page.dropped };
      }
    }
  }

  async *ingest() {
    yield { type: "session", root: this.root };
    yield { type: "step", text: "Reading the homepage" };
    yield* this._read(1);
    this.frontier = rank(this.frontier, "about docs guide pricing features faq getting started", this.anchors);
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
    // Read more when the evidence is weak, OR when an unread link (by URL + anchor text) names the topic better than our sources.
    const needMore = () => {
      this.frontier = rank(this.frontier, q, this.anchors);
      const used = [...new Set(hits.map(h => h.chunk.url))];
      const sc = scoreLinks([...this.frontier, ...used], words, this.anchors);
      const best = Math.max(0, ...used.map(u => sc.get(u)));
      return !hits.length || hits[0].score < this.bar() || (this.frontier.length > 0 && sc.get(this.frontier[0]) > best);
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
