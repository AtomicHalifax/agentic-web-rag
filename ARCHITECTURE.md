# Architecture

Everything runs in the visitor's browser, served as static files by GitHub Pages. There is no server and no API key. Jina Reader fetches pages (browsers can't, because of CORS). One LLM (Qwen2.5 on WebLLM, in a Web Worker) writes answers.

| Module | Job |
|---|---|
| `web/guard.js` | Refuse internal and login-walled URLs, normalize URLs, strip prompt injections and zero-width characters, cap question length |
| `web/agent.js` | Fetch via Jina Reader, rank links, ingest, agentic retrieve. Code owns every decision |
| `web/chunk.js` | Remove boilerplate, split on headings, small-to-big chunks |
| `web/search.js` | BM25 ranking; confidence = share of the question's key words found (0..1) |
| `web/models.js` + `llm.worker.js` | WebLLM loader and streaming chat; 1.5B on laptops, 0.5B on phones |
| `web/rag.js` | Prompt building, citation verification, safe HTML rendering |
| `web/app.js` | UI wiring, early model download, progressive unlock, streamed answer, retry and abstain |
| `web/map.js` | Force-directed page constellation |
| `web/telemetry.js` | New Relic Browser page actions, numbers only |

## Agent policy (`web/agent.js`)

Small LLMs plan unreliably, so the loop lives in code:
- **Ingest:** read the homepage, rank its links by "useful" words, and read until 8 good pages. Fetches in a batch run in parallel and each page is indexed as it lands. Translation paths (`/de`, `/pt-br`) are skipped, and the crawl stays inside the pasted path (`/3/` never reads `/2.7/`). Chat unlocks after the first page.
- **Retrieve:** run BM25 and take the top 4 sections. Coverage is measured on the 450-char passage. If it is below `CONFIDENT` (0.6), or an unread link names the topic better than every source, re-rank unvisited links and read the best, read 3 more pages, and search again, for at most 2 hops and 30 pages total.
- **Generate:** the LLM writes the answer, and `rag.verify` requires a valid `[n]` on every claim. It gets one corrective retry, then abstains. Without WebGPU, the UI shows the top passages instead.

**Link ranking** (`scoreLinks`): each link is scored by the question's key words found in its URL path **and its anchor text** ("Creation of virtual environments" → `/venv`), with each word weighted 1/(number of links mentioning it), so a rare word like "cors" beats a common one like "middleware".

## Chunking (`web/chunk.js`)

1. Paragraphs repeated across pages (nav, footer, cookie text) are dropped. This is learned after page 3 and again after page 8.
2. The text is split on markdown headings. Code fences are never split, and inline links are flattened to their text.
3. A 450-char child is searched; its parent section (≤2400 chars) is what the LLM reads. Results are deduped by parent.
4. Each child is prefixed with `Title › H2 › H3`, which gives BM25 the page and section words.

## How it got here

ADRs [0001](docs/adr/0001-browser-inference.md) → [0002](docs/adr/0002-github-only-hosting.md) → [0003](docs/adr/0003-cloudflare-workers-ai.md) → [0004](docs/adr/0004-no-embeddings.md) → [0005](docs/adr/0005-webllm-only.md): Python server, then in-browser with three models (crashed), then Cloudflare (needed an account), then no embeddings, and finally one in-browser model with no server.

## Testing

- `web/*.test.js`: fake fetch, no network, run on every push.
- `evals/run.js`: the same modules, replaying pages recorded once by the `record-evals` workflow (live crawls from CI got rate-limited, which made the gate flaky). Zero dependencies. It gates CI on recall@4 ≥ 0.6 and abstain ≥ 0.5.

## Observability

New Relic Browser (free, private to the owner) records `ingest` (pages, chunks, ms) and `answer` (retrieve and generate ms, hops, confident, abstained, question length). **Question text and page content are never sent.**
