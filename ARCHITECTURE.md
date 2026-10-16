# Architecture

The browser (GitHub Pages) runs the agent, chunking, BM25, fusion and the UI. A Cloudflare Worker (`worker/index.js`) runs two models on Workers AI: `/rerank` (bge-reranker-base, 0..1) and `/chat` (Llama 3.1 8B, streamed). There are no embeddings (ADR 0004). Jina Reader fetches pages (browsers can't, because of CORS).

| Module | Job |
|---|---|
| `web/guard.js` | Refuse internal URLs, strip prompt injections and zero-width characters, cap question length |
| `web/agent.js` | Fetch via Jina Reader, rank links, ingest, agentic retrieve. Code owns every decision |
| `web/chunk.js` | Remove boilerplate, split on headings, small-to-big chunks |
| `web/search.js` | BM25 recall of the top 24, then cross-encoder rerank |
| `web/models.js` | Model clients: the Worker in the browser, local transformers.js for Node evals; each set carries its own `confident` threshold |
| `worker/index.js` | The only server: validates input, origin-locks, rate-limits, calls Workers AI |
| `web/rag.js` | Prompt building, citation verification, safe HTML rendering |
| `web/app.js` | UI wiring, warm-up, progressive unlock, streamed answer, retry and abstain |
| `web/map.js` | Force-directed page constellation |
| `web/telemetry.js` | New Relic Browser page actions, numbers only |

## Agent policy (`web/agent.js`)

Small models (1.5B–3B) are unreliable planners, so the loop lives in code:
- **Ingest:** read the homepage, rank its links by "useful" path words, read until 8 good pages. All fetches in a batch start at once and each page is embedded as it lands. Translation paths (`/de`, `/pt-br`) are skipped.
- **Retrieve:** search. If the top rerank score is below `CONFIDENT` (the model set's `confident`: 0.3 for the Worker's bge-reranker, 3 for local ms-marco logits), re-rank the unvisited links by overlap with the question, read 3 more pages, and search again, for at most 2 hops and 30 pages total.
- **Generate:** the LLM writes the answer, and `rag.verify` requires a valid `[n]` on every claim. It gets one corrective retry, then abstains.

## Chunking (`web/chunk.js`)

1. Paragraphs repeated across pages (nav, footer, cookie text) are dropped. This is learned after page 3 and again after page 8.
2. The text is split on markdown headings. Code fences are never split, and inline links are flattened to their text.
3. A 450-char child is searched; its parent section (≤2400 chars) is what the LLM reads. Results are deduped by parent.
4. Each child is prefixed with `Title › H2 › H3`, which gives BM25 the page and section words.

## Why this split

See the ADRs: [0001](docs/adr/0001-browser-inference.md) → [0002](docs/adr/0002-github-only-hosting.md) → [0003](docs/adr/0003-cloudflare-workers-ai.md). In-browser models crashed real laptops, so the models moved to Cloudflare.

## Testing

- `web/*.test.js`: fake models and fake fetch, no network, run on every push.
- `evals/run.js`: real crawl and real models in Node (transformers.js runs there too). It gates CI on recall@4 ≥ 0.6 and abstain ≥ 0.5.

## Observability

New Relic Browser (free tier, private to the owner) records `ingest` (pages, chunks, ms) and `answer` (retrieve and generate ms, hops, confident, abstained, question length). **Question text and page content are never sent.**
