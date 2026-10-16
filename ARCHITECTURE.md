# Architecture

Everything runs in the visitor's browser. GitHub hosts it, and Jina Reader fetches pages (browsers can't, because of CORS).

| Module | Job |
|---|---|
| `web/guard.js` | Refuse internal URLs, strip prompt injections and zero-width characters, cap question length |
| `web/agent.js` | Fetch via Jina Reader, rank links, ingest, agentic retrieve. Code owns every decision |
| `web/chunk.js` | Remove boilerplate, split on headings, small-to-big chunks |
| `web/search.js` | Dense (bge-small) + BM25, RRF fusion, cross-encoder rerank. Models via transformers.js |
| `web/rag.js` | Prompt building, citation verification, safe HTML rendering |
| `web/app.js` | UI wiring, WebLLM generation, retry and abstain |
| `web/map.js` | Force-directed page constellation |
| `web/telemetry.js` | New Relic Browser page actions, numbers only |

## Agent policy (`web/agent.js`)

Small models (1.5B–3B) are unreliable planners, so the loop lives in code:
- **Ingest:** read the homepage, rank its links by "useful" path words, read until 8 good pages, 3 in parallel.
- **Retrieve:** search. If the top rerank score is below `CONFIDENT` (a logit of 0), re-rank the unvisited links by overlap with the question, read 3 more pages, and search again, for at most 2 hops and 30 pages total.
- **Generate:** the LLM writes the answer, and `rag.verify` requires a valid `[n]` on every claim. It gets one corrective retry, then abstains.

## Chunking (`web/chunk.js`)

1. Paragraphs repeated across pages (nav, footer, cookie text) are dropped. This is learned after page 3 and again after page 8.
2. The text is split on markdown headings. Code fences are never split, and inline links are flattened to their text.
3. A 450-char child is embedded and searched; its parent section (≤2400 chars) is what the LLM reads. Results are deduped by parent.
4. Each child is prefixed with `Title › H2 › H3`, which helps both BM25 and dense matching.

## Why no server

See [docs/adr/0001-browser-inference.md](docs/adr/0001-browser-inference.md) and [0002](docs/adr/0002-github-only-hosting.md).

## Testing

- `web/*.test.js`: fake models and fake fetch, no network, run on every push.
- `evals/run.js`: real crawl and real models in Node (transformers.js runs there too). It gates CI on recall@4 ≥ 0.6 and abstain ≥ 0.5.

## Observability

New Relic Browser (free tier, private to the owner) records `ingest` (pages, chunks, ms) and `answer` (retrieve and generate ms, hops, confident, abstained, question length). **Question text and page content are never sent.**
