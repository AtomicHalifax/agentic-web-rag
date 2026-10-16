# agentic-web-rag

**Chat with any website.** Paste a link, and an agent crawls the site, maps it live, and answers with citations you can click. Free, with no API key and no sign-up for users.

> Live demo: https://atomichalifax.github.io/agentic-web-rag  ·  Demo GIF: _coming soon_

## What's different

| | Typical "chat with a website" | This project |
|---|---|---|
| Crawling | Scrape one page | Agent seeds 8 pages, then crawls *more* on its own when the evidence is weak |
| Retrieval | Dense vectors only | Hybrid BM25 + dense, RRF fusion, cross-encoder rerank, small-to-big chunks, boilerplate removal |
| Trust | Hopes the model behaves | Every sentence must cite a source or the answer becomes "This site doesn't say." |
| Security | Ignores it | Prompt-injection stripping, sources fenced as data, escaped rendering, origin-locked API, input caps |
| Cost | Someone's API bill | $0: GitHub Pages plus Cloudflare Workers AI free tier |
| Quality | "Looks good to me" | CI runs the pipeline on live sites and fails the build if recall or abstention drops |

## How it works

```
Browser (GitHub Pages)                                         Cloudflare Worker (Workers AI)
───────────────────────                                        ──────────────────────────────
URL ─▶ guard ─▶ Jina Reader fetch ─▶ strip injections ─▶ chunk
                                                        └───────▶ /embed   bge-small
question ─▶ BM25 + dense ─▶ RRF ─────────────────────────────────▶ /rerank  bge-reranker
        ─▶ confident? no ─▶ read more pages (≤2 hops), repeat
        ─▶ prompt with fenced sources ───────────────────────────▶ /chat    Llama 3.1 8B (streamed)
        ─▶ citation check ─▶ retry once ─▶ answer or "This site doesn't say."
```

Details: [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · decisions in [docs/adr](docs/adr) · setup in [docs/SETUP.md](docs/SETUP.md)

## Results

CI runs `evals/run.js` (same pipeline, local models) on live sites and posts the table on every push.

| config | recall@4 | abstain | p50 retrieve |
|---|---|---|---|
| dense only | _tbd_ | _tbd_ | _tbd_ |
| hybrid + rerank | _tbd_ | _tbd_ | _tbd_ |
| + agentic re-crawl | _tbd_ | _tbd_ | _tbd_ |

## Run it

```bash
make test                        # 19 unit tests, no network
cd worker && npx wrangler dev    # API on :8787 (needs a Cloudflare login)
make dev                         # site on :8000, auto-points at :8787
make eval                        # real crawl + local models
```

## Engineering notes

- **The agent is code, not prompts.** Small and mid-size LLMs plan unreliably, so budgets, hop limits and stop rules are deterministic; the LLM only writes the final answer.
- **It has been through 3 hosting designs** (Python on HF Spaces, then fully in-browser, then the Cloudflare Worker), each forced by a real constraint. The reasoning is in the ADRs.
- **Bugs found by live testing are fixed and recorded:** a main-thread freeze, translations eating the crawl budget, a miscalibrated confidence threshold, and duplicate pages from query strings. See the [CHANGELOG](CHANGELOG.md).

## Known limits

- **Login walls:** X, Instagram, LinkedIn and similar sites hide content behind a login, so the app refuses them upfront.
- **JS-only sites:** apps that render entirely in the browser may index poorly.
- **Free tier:** about 30 site crawls a day. Past that, answers fall back to showing the top source passages.

Built by [Athrva Raval](https://www.linkedin.com/in/athrva-raval/). MIT license.
