# agentic-web-rag

**Chat with any website.** Paste a link, and an agent crawls the site, maps it, and answers with citations you can click. The language model runs **in your browser** (WebGPU), so there's no API key and no inference bill.

> Live demo: https://atomichalifax.github.io/agentic-web-rag  ·  Demo GIF: _coming soon_

## What's different

| | Typical "chat with a website" | This project |
|---|---|---|
| Inference | Server key, someone pays per token | Qwen2.5 runs on the visitor's GPU, $0 at any traffic |
| Crawling | Scrape one page | Agent reads the sitemap, then crawls *more* pages when the evidence is weak |
| Retrieval | Dense vectors only | Hybrid BM25 + dense, RRF fusion, cross-encoder rerank, small-to-big chunks |
| Trust | Hopes the model behaves | Every sentence must cite a source or the answer becomes "This site doesn't say." |
| Security | Ignores it | SSRF blocking, robots.txt, prompt-injection stripping, sandboxed rendering |
| Quality | "Looks good to me" | Eval gate in CI: retrieval recall and abstention measured on every PR |

## How it works

```
URL ─▶ guard (SSRF, robots) ─▶ crawl (sitemap → seed pages) ─▶ clean + strip injections
    ─▶ chunk (boilerplate removed, heading-aware, child 450 / parent 2400 chars)
    ─▶ index (bge-small dense + BM25)

question ─▶ hybrid search ─▶ rerank ─▶ confident?  ── no ─▶ crawl most relevant unvisited pages (≤2 hops) ─┐
                                          │ yes                                                              │
                                          ▼  ◀────────────────────────────────────────────────────────────────┘
          Qwen2.5 in browser ─▶ citation check ─▶ retry once ─▶ answer, or "This site doesn't say."
```

Full design notes in [ARCHITECTURE.md](ARCHITECTURE.md).

## Results

Run `python evals/run.py <api-url>`. CI publishes the table on every push.

| config | recall@4 | abstain | p50 retrieve |
|---|---|---|---|
| dense only | _tbd_ | _tbd_ | _tbd_ |
| hybrid + rerank | _tbd_ | _tbd_ | _tbd_ |
| + agentic re-crawl | _tbd_ | _tbd_ | _tbd_ |

## Run it locally

```bash
make dev        # API on :7860 and web on :8000
make test       # self-checks + unit tests
make eval       # evals against the local API
```

You need Python 3.12 and Chrome or Edge with WebGPU.

## Stack

FastAPI · trafilatura · fastembed (bge-small, MiniLM reranker) · rank-bm25 · WebLLM (Qwen2.5-3B / 1.5B) · OpenTelemetry → New Relic · GitHub Pages + Hugging Face Spaces · GitHub Actions

## Known limits

- **JS-only sites:** pages that render entirely client-side return little text. Adding Playwright is on the roadmap.
- **Small models:** a 3B model handles single-hop questions well. Multi-page synthesis is weaker, so the citation check abstains rather than guessing.
- **Session lifetime:** sessions are in-memory and expire after 1 hour.

Built by [Athrva Raval](https://www.linkedin.com/in/athrva-raval/). MIT license.
