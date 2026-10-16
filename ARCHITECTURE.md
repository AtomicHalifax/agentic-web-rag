# Architecture

## Pieces and where they run

| Piece | Where | Code |
|---|---|---|
| UI + LLM (WebLLM, Qwen2.5) | Visitor's browser, served by GitHub Pages | `web/` |
| Crawl, chunk, index, agent | Hugging Face Space (Docker, free CPU) | `api/` |
| Traces | New Relic via OTLP (private account) | `api/telemetry.py` |
| Tests, evals, deploys | GitHub Actions | `.github/workflows/` |

**Why the split:** browsers can't fetch arbitrary sites because of CORS, so crawling needs a server. Generation doesn't, so it runs on the visitor's GPU and costs nothing.

## Request flow

1. `POST /sites {url}` streams NDJSON: `session`, `step`, `page`×N, `done`. Each `page` event adds a node to the UI map.
2. `POST /sites/{id}/retrieve {q}` streams `search` and, when it re-crawls, `step` and `page`, then a final `context` with sources, scores, hops and latency.
3. The browser builds the prompt (`web/rag.js`), streams the answer from WebLLM, checks citations, retries once, and otherwise abstains.

## Agent policy (`api/agent.py`)

Code makes the decisions and the model never loops on its own. This is deliberate: 1.5B–3B models are unreliable planners but fine at a single constrained step.

- **Ingest:** root page plus sitemap URLs ranked by "useful" path words, up to 12 good pages.
- **Retrieve:** search. If the best rerank score is below `CONFIDENT`, rank unvisited links by overlap with the question, read 4 more pages, and search again, for at most 2 hops and 30 pages total.

## Chunking (`api/chunk.py`)

1. **Boilerplate:** paragraphs that repeat across pages (nav, footer, cookie text) are removed. This is learned after 3 and again after 8 pages.
2. **Sections:** text is split on markdown headings. Code fences are never split.
3. **Small-to-big:** a 450-char child is embedded and searched, and its parent section (≤2400 chars) is what the LLM reads. Results are deduped by parent.
4. **Context header:** each child is prefixed with `Title › H2 › H3`, which improves both BM25 and dense matching.

## Retrieval (`api/index.py`)

Dense (bge-small-en-v1.5) and BM25 scores are fused with reciprocal rank fusion (k=60). The top 16 go to the MiniLM cross-encoder rerank, and the top 4 parents are returned.

## Guardrails

See [SECURITY.md](SECURITY.md).

## Observability

Spans: `ingest`, `retrieve`, plus FastAPI auto-instrumentation. Attributes are numbers only (`rag.pages`, `rag.chunks`, `rag.ms`, `rag.hops`, `rag.confident`, `rag.q_len`). **No question text or page content leaves the server.** Telemetry is disabled when `NEW_RELIC_LICENSE_KEY` is unset.

## Decisions

See `docs/adr/`.
