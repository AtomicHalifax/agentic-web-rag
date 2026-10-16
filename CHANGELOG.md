# Changelog

## 0.1.0 (2026-10-16)
- API: guarded crawl (SSRF, robots.txt, size caps), injection stripping, boilerplate-aware heading chunker with small-to-big retrieval, hybrid BM25 + dense search with RRF and cross-encoder rerank, agentic re-crawl when evidence is weak, NDJSON streaming, per-IP rate limit, optional New Relic traces.
- Web: no-build static site, in-browser Qwen2.5 via WebLLM, live page constellation, citation verification with retry and abstain, source drawer.
- CI: self-checks, unit tests, eval gate. Deploy to GitHub Pages and the Hugging Face Space.
