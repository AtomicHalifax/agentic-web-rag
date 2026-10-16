"""The agent. Code makes the decisions (budgets, retries, stop rules); small models only do narrow steps.

ingest():   sitemap -> seed pages -> index, streaming each page as an event (the UI draws the map from these)
retrieve(): search -> if evidence is weak, crawl the most relevant unvisited pages -> search again -> stop
"""
import time
from dataclasses import dataclass, field

from chunk import boilerplate, chunk_page
from crawl import fetch, rank, same_site, sitemap
from index import Index

SEED_PAGES = 12
MAX_PAGES = 30
HOP_PAGES = 4
MAX_HOPS = 2
CONFIDENT = 0.0  # ms-marco logit; >0 means the reranker thinks the passage answers the query. Tune with evals/.


@dataclass
class Site:
    root: str
    index: Index = field(default_factory=Index)
    pages: dict = field(default_factory=dict)       # url -> {title, links}
    frontier: list = field(default_factory=list)
    _drop: set = field(default_factory=set)
    _raw: list = field(default_factory=list)
    created: float = field(default_factory=time.time)

    def _add(self, url: str):
        if url in self.pages or len(self.pages) >= MAX_PAGES:
            return None
        page = fetch(url)
        self.pages[url] = {"title": page["title"] if page else url, "links": page["links"] if page else [], "ok": bool(page)}
        if not page:
            return None
        self._raw.append(page["md"])
        if len(self._raw) in (3, 8):  # learn boilerplate once there is enough evidence
            self._drop = boilerplate(self._raw)
        self.index.add(chunk_page(page["md"], url, page["title"], self._drop))
        self.frontier += [l for l in page["links"] if l not in self.pages and l not in self.frontier]
        return {"type": "page", "url": url, "title": page["title"], "links": [l for l in page["links"] if l in self.pages][:8],
                "chunks": len(self.index.chunks), "injections_removed": page["dropped"]}

    def ingest(self):
        yield {"type": "step", "text": "Reading sitemap"}
        seeds = [u for u in sitemap(self.root) if same_site(u, self.root)]
        self.frontier = [self.root] + rank(seeds, "about pricing docs features faq")
        yield {"type": "step", "text": f"Found {len(seeds)} pages in sitemap" if seeds else "No sitemap, following links"}
        while self.frontier and sum(p["ok"] for p in self.pages.values()) < SEED_PAGES and len(self.pages) < MAX_PAGES:
            ev = self._add(self.frontier.pop(0))
            if ev:
                yield ev
        n = sum(p["ok"] for p in self.pages.values())
        yield {"type": "done", "pages": n, "chunks": len(self.index.chunks)} if n else {"type": "error", "text": "Couldn't read any pages on that site."}

    def retrieve(self, q: str):
        t0 = time.perf_counter()
        hits = self.index.search(q)
        yield {"type": "search", "hop": 0, "best": hits[0][1] if hits else None, "urls": list({c.url for c, _ in hits})}
        hop = 0
        while (not hits or hits[0][1] < CONFIDENT) and self.frontier and hop < MAX_HOPS and len(self.pages) < MAX_PAGES:
            hop += 1
            self.frontier = rank(self.frontier, q)
            yield {"type": "step", "text": "Not enough on indexed pages, reading more"}
            for _ in range(HOP_PAGES):
                if not self.frontier:
                    break
                ev = self._add(self.frontier.pop(0))
                if ev:
                    yield ev
            hits = self.index.search(q)
            yield {"type": "search", "hop": hop, "best": hits[0][1] if hits else None, "urls": list({c.url for c, _ in hits})}
        yield {
            "type": "context",
            "confident": bool(hits) and hits[0][1] >= CONFIDENT,
            "sources": [{"n": i + 1, "url": c.url, "title": c.title, "path": c.path, "text": c.parent, "score": round(s, 2)}
                        for i, (c, s) in enumerate(hits)],
            "ms": round((time.perf_counter() - t0) * 1000),
            "hops": hop,
        }
