# agentic-web-rag

**Chat with any website.** Paste a link, and an agent crawls the site, maps it live, and answers with citations you can click. The AI runs **in your browser**: no server, no API key, no sign-up, $0.

> Live demo: https://atomichalifax.github.io/agentic-web-rag  ·  Demo GIF: _coming soon_

## What's different

| | Typical "chat with a website" | This project |
|---|---|---|
| Crawling | Scrape one page | Agent seeds 8 pages, then crawls *more* on its own when the evidence is weak |
| Retrieval | Vector DB plus embeddings | BM25 over structure-aware, boilerplate-free chunks; confidence from query-term coverage. Zero model calls to index |
| Trust | Hopes the model behaves | Every sentence must cite a source or the answer becomes "This site doesn't say." |
| Security | Ignores it | Prompt-injection stripping, sources fenced as data, escaped rendering, internal and login-walled URLs refused |
| Cost | Someone's API bill | $0 at any traffic: static files plus an LLM on the visitor's GPU |
| Quality | "Looks good to me" | CI runs the pipeline on live sites and fails the build if recall or abstention drops |

## How it works

```
URL ─▶ guard ─▶ Jina Reader fetch ─▶ strip injections ─▶ chunk ─▶ BM25 index      (all in the browser)

question ─▶ BM25 top-4 ─▶ coverage ≥ 0.6? ── no ─▶ read the most relevant unvisited pages (≤2 hops) ─┐
                               │ yes                                                                  │
                               ▼ ◀────────────────────────────────────────────────────────────────────┘
          Qwen2.5 via WebLLM (Web Worker) ─▶ citation check ─▶ retry once ─▶ answer or "This site doesn't say."
```

Details: [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · decisions in [docs/adr](docs/adr)

## Results

CI replays recorded pages through the exact browser code (`evals/run.js`) and fails the build below recall@4 0.6 or abstain 0.5.

| golden set | recall@4 | abstain |
|---|---|---|
| 6 questions, 2 sites (Python docs, FastAPI), incl. 2 unanswerable | **1.00** | **1.00** |

How it got there. Each step is a bug the eval caught on 19 Oct 2026:

| fix | recall@4 |
|---|---|
| first honest run (an earlier CI step couldn't fail) | 0.00 |
| coverage scored on the passage, not the whole section; read pages whose URL names the topic | 0.25 |
| rank links by **anchor text** + URL, rare words weighted higher | 0.50 |
| stay inside the pasted path; fetch the original URL (trailing slash broke relative links) | **1.00** |

The set is small. The next step is 30+ questions across more site types.

## Run it

```bash
make dev    # http://localhost:8000 (Chrome or Edge for WebGPU)
make test   # unit tests, no network, no dependencies
make eval   # live-site evals
```

## Engineering notes

- **The agent is code, not prompts.** Budgets, hop limits and stop rules are deterministic; the LLM only writes the final answer.
- **Five architecture decisions, each forced by a real constraint**, from a Python server to a single in-browser model. The reasoning is in the [ADRs](docs/adr).
- **Bugs found by live testing are fixed and recorded:** a main-thread freeze, a Chrome crash from three GPU models, translations eating the crawl budget, and duplicate pages from query strings. See the [CHANGELOG](CHANGELOG.md).

## Known limits

- **First visit:** downloads the model (about 1 GB on laptops, 400 MB on phones), then it's cached. No WebGPU (Firefox, many phones) means you get source passages instead of a written answer.
- **Login walls:** X, Instagram, LinkedIn and similar sites are refused upfront.
- **Keyword retrieval:** a question that shares no words with its answer can miss (see ADR 0005).

Built by [Athrva Raval](https://www.linkedin.com/in/athrva-raval/). MIT license.
