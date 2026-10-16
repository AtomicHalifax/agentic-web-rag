# agentic-web-rag

**Chat with any website.** Paste a link, and an agent crawls the site, maps it, and answers with citations you can click.

**Zero servers do any ML.** Embeddings, hybrid search, reranking, the agent loop and the LLM (Qwen2.5 on WebGPU) all run in your browser. The whole thing is hosted on GitHub Pages: no API key, no backend, $0 at any traffic.

> Live demo: https://atomichalifax.github.io/agentic-web-rag  ·  Demo GIF: _coming soon_

## What's different

| | Typical "chat with a website" | This project |
|---|---|---|
| Inference | Server key, someone pays per token | LLM, embedder and reranker run on the visitor's device |
| Crawling | Scrape one page | Agent seeds 8 pages, then crawls *more* when the evidence is weak |
| Retrieval | Dense vectors only | Hybrid BM25 + dense, RRF fusion, cross-encoder rerank, small-to-big chunks |
| Trust | Hopes the model behaves | Every sentence must cite a source or the answer becomes "This site doesn't say." |
| Security | Ignores it | Prompt-injection stripping, sources fenced as data, escaped rendering, internal-URL blocking |
| Quality | "Looks good to me" | CI runs the same pipeline on real sites and fails if recall or abstention drops |

## How it works

```
URL ─▶ guard ─▶ Jina Reader (fetch → markdown) ─▶ strip injections ─▶ chunk (boilerplate out, heading-aware, small-to-big)
    ─▶ index in browser (bge-small dense + BM25)

question ─▶ hybrid search ─▶ rerank ─▶ confident? ── no ─▶ read most relevant unvisited pages (≤2 hops) ─┐
                                          │ yes                                                        │
                                          ▼ ◀──────────────────────────────────────────────────────────┘
          Qwen2.5 (WebGPU) ─▶ citation check ─▶ retry once ─▶ answer, or "This site doesn't say."
```

Details in [ARCHITECTURE.md](ARCHITECTURE.md). Security model in [SECURITY.md](SECURITY.md).

## Results

`node evals/run.js` runs the exact browser pipeline in Node against live sites. CI posts the table on every push.

| config | recall@4 | abstain | p50 retrieve |
|---|---|---|---|
| dense only | _tbd_ | _tbd_ | _tbd_ |
| hybrid + rerank | _tbd_ | _tbd_ | _tbd_ |
| + agentic re-crawl | _tbd_ | _tbd_ | _tbd_ |

## Run it

```bash
make dev    # http://localhost:8000 (Chrome/Edge with WebGPU)
make test   # unit tests, no network
make eval   # real crawl + real models
```

## Stack

Vanilla ES modules (no build) · WebLLM (Qwen2.5-3B/1.5B) · transformers.js (bge-small-en-v1.5, ms-marco-MiniLM rerank) · Jina Reader · GitHub Pages + Actions · New Relic Browser

## Known limits

- **Rate limits:** Jina Reader without a key is rate-limited, so big sites index in about a minute. Only one dependency sits outside GitHub, and if it's down, crawling is down.
- **First visit:** the first visit downloads model weights (about 1–2 GB, then cached). The UI needs WebGPU; without it, you get source excerpts instead of generated answers.
- **Small models:** a 3B model is strong on single-hop questions and weaker on multi-page synthesis. The citation check abstains rather than guessing.

Built by [Athrva Raval](https://www.linkedin.com/in/athrva-raval/). MIT license.
