# Changelog

## 0.2.1 (2026-10-16)
- Models run in a Web Worker on WebGPU: no more page freezes during crawls.
- Fetch and embed overlap; translation paths skipped; `CONFIDENT` raised 0 → 3 after measuring real rerank scores.

## 0.2.0 (2026-10-16)
- Moved the whole pipeline into the browser (ADR 0002): transformers.js embeddings and rerank, JS BM25, an in-browser agent, and Jina Reader for fetching. Hosting is GitHub only.
- Removed the Python API and the Hugging Face Space deploy.
- Evals now run the same JS modules in Node. 13 unit tests with fake models and fetch.
- Telemetry switched to New Relic Browser page actions (numbers only).

## 0.1.0 (2026-10-16)
- API: guarded crawl (SSRF, robots.txt, size caps), injection stripping, boilerplate-aware heading chunker with small-to-big retrieval, hybrid BM25 + dense search with RRF and cross-encoder rerank, agentic re-crawl when evidence is weak, NDJSON streaming, per-IP rate limit, optional New Relic traces.
- Web: no-build static site, in-browser Qwen2.5 via WebLLM, live page constellation, citation verification with retry and abstain, source drawer.
- CI: self-checks, unit tests, eval gate. Deploy to GitHub Pages and the Hugging Face Space.
