# Changelog

## 0.8.3 (2026-10-21)
- Temperature slider (0–1, default 0.2) next to the chat box, passed to the model.

## 0.8.2 (2026-10-21)
- Deploy also mirrors the site to a free Hugging Face Static Space when the `HF_TOKEN` secret is set.

## 0.8.1 (2026-10-19)
- Code blocks in answers are no longer annotated with a citation on every line.

## 0.8.0 (2026-10-19)
- The answer model moved to Pollinations (gpt-oss-20b, keyless, streamed; ADR 0006). WebLLM is removed: it still crashed Chrome on a real laptop. The visitor's device now does no ML, the first token arrives in about 1 s, and it's still GitHub Pages only.

## 0.7.2 (2026-10-19)
- Deploys stamp every module, worker and stylesheet URL with the commit ID. Found live: GitHub Pages caching mixed old and new modules after a deploy, so stale code ran.

## 0.7.1 (2026-10-19)
- GPU warm-up (shader compile, about 27 s on the test laptop) now happens right after the model loads, during the crawl, instead of on the first question. Answers are capped at 160 tokens.

## 0.7.0 (2026-10-19)
- Live test: the first word took about 30 s, and small models often skip `[n]`, which forced a second full pass. Now the prompt carries 3 sources × 700 chars, and `rag.attribute` grounds the answer in code (cite the supporting source, drop unsupported sentences, abstain if none). The retry is removed.

## 0.6.5 (2026-10-19)
- Fixed: pasting a URL with a trailing slash (`docs.python.org/3/`) broke every relative link, because the normalized URL was what got fetched. Now the normalized URL is only the dedupe key and the original URL is fetched.

## 0.6.4 (2026-10-19)
- Evals replay recorded pages (`evals/snapshots/`, refreshed by the `record-evals` workflow). Live crawls from CI were rate-limited by Jina, so the gate measured Jina's availability instead of retrieval quality.

## 0.6.3 (2026-10-19)
- The crawl stays inside the pasted path (`docs.python.org/3` no longer reads `/2.7`, `/3.4`… copies), and http and https count as one page. Found by the eval on Python docs.

## 0.6.2 (2026-10-19)
- The agent ranks unread links by URL path **and anchor text** (from Jina's link summary), weighting rare words higher, so "virtual environment" finds `/venv` and "CORS middleware" prefers `/cors`.

## 0.6.1 (2026-10-19)
- Fixed by the now-working eval gate (recall was 0): coverage is scored on the 450-char passage, so overview pages listing topic names no longer look confident. The agent also reads an unvisited page whose URL names the topic better than its current sources. Jina 429s are retried with backoff.

## 0.6.0 (2026-10-19)
- No server at all (ADR 0005). The Cloudflare Worker, its reranker and the deploy secrets are removed. One LLM (Qwen2.5 1.5B, or 0.5B on phones) runs in the browser via WebLLM in a Web Worker.
- Agent confidence is now query-term coverage (with plural stemming) instead of a reranker score.
- Zero dependencies: evals and tests run with plain Node. CI eval now fails the job properly (pipefail).

## 0.5.0 (2026-10-16)
- Removed embeddings (ADR 0004). BM25 recalls the top 24 and the cross-encoder reranks them. Indexing makes zero model calls, so it's as fast as the downloads. Each question costs about 17 free-tier neurons, about 580 a day.

## 0.4.0 (2026-10-16)
- Models moved to Cloudflare Workers AI behind a thin Worker (ADR 0003): in-browser models crashed Chrome on a real laptop. No downloads, a bigger LLM (Llama 3.1 8B), and a first answer in seconds.
- One deploy workflow ships the Worker and then Pages, wiring the Worker URL in automatically.
- When the quota is exhausted, the UI falls back to source passages. 19 tests, including the Worker's validation and origin lock.

## 0.3.0 (2026-10-16)
- Speed: models start downloading when you focus the URL box; chat unlocks after the homepage while the crawl continues in the background.
- Answer UX: status shimmer, sources slide in first, streaming caret; input stays usable while an answer streams.
- One node per page: URLs normalized (no www, query, trailing slash). Login-walled sites (X, Instagram, LinkedIn…) refused with a clear message.
- LLM context trimmed to 1200 chars per source for faster first token.

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
