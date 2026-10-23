# agentic-web-rag

**Chat with any website.** Paste a link, and an agent crawls the site, maps it live, and answers with citations you can click. No server of ours, no API key, no sign-up, $0: retrieval runs in your browser, and a free keyless cloud LLM writes the answer.

> Live demo: https://atomichalifax.github.io/agentic-web-rag

## What's different

| | Typical "chat with a website" | This project |
|---|---|---|
| Crawling | Scrape one page | Agent seeds 8 pages, then crawls *more* on its own when the evidence is weak |
| Retrieval | Vector DB plus embeddings | BM25 over structure-aware, boilerplate-free chunks; confidence from query-term coverage. Zero model calls to index |
| Trust | Hopes the model behaves | Code checks each sentence against the sources: supported ones get a citation, unsupported ones are dropped, and nothing supported means "This site doesn't say." |
| Security | Ignores it | Prompt-injection stripping, sources fenced as data, escaped rendering, internal and login-walled URLs refused |
| Cost | Someone's API bill | $0: static files on GitHub Pages plus a free keyless LLM endpoint |
| Quality | "Looks good to me" | CI runs the pipeline on live sites and fails the build if recall or abstention drops |

## How it works

```
URL ─▶ guard ─▶ Jina Reader fetch ─▶ strip injections ─▶ chunk ─▶ BM25 index      (all in the browser)

question ─▶ BM25 top-4 ─▶ coverage ≥ 0.6? ── no ─▶ read the most relevant unvisited pages (≤2 hops) ─┐
                               │ yes                                                                  │
                               ▼ ◀────────────────────────────────────────────────────────────────────┘
          gpt-oss-20b via Pollinations (streamed) ─▶ code attributes each sentence to a source, drops unsupported ones ─▶ answer or "This site doesn't say."
```

Details: [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · decisions in [docs/adr](docs/adr)

## Results

CI replays recorded pages through the exact browser code (`evals/run.js`) and fails the build below recall@4 0.6 or abstain 0.5.

| golden set | recall@4 | abstain |
|---|---|---|
| **32 questions, 3 docs sites** (Python, FastAPI, Flask), incl. 8 unanswerable | **0.73** | **1.00** |

*recall@4*: is the right page among the 4 sources? *abstain*: for questions the site can't answer, does the agent avoid sounding confident?

How it got there. Each row is a bug the eval caught:

| change | set | recall@4 | abstain |
|---|---|---|---|
| first honest run (an earlier CI step couldn't fail) | 6 q | 0.00 | 1.00 |
| coverage on the passage, not the whole section; read pages whose URL names the topic | 6 q | 0.25 | 1.00 |
| rank links by **anchor text** + URL, rare words weighted | 6 q | 0.50 | 1.00 |
| stay inside the pasted path; fetch the original URL (trailing slash broke links) | 6 q | 1.00 | 1.00 |
| grew the set to 32 questions | 32 q | 0.54 | 0.83 |
| page budget 30 → 60 (it ran out by question 7); IDF-weighted confidence (common site words can't fake an answer) | 32 q | **0.73** | **1.00** |
| *tried:* `sitemap.xml` as an extra agent tool. **Reverted:** hundreds of similar URLs swamped the link ranking | 32 q | 0.65 | 1.00 |

**Still missing (7):** Python `datetime`, `errors`, `unittest`, `threading`; FastAPI `request-files`, `testing`; Flask `deploying`. In each case the page isn't linked from what's been read within 2 hops. Reading `sitemap.xml` made it worse (see table). Next: let the LLM choose which links to read.

## Run it

```bash
make dev    # http://localhost:8000
make test   # unit tests, no network, no dependencies
make eval   # evals on recorded pages (re-record: Actions → record-evals)
```

## Engineering notes

- **The agent is code, not prompts.** Budgets, hop limits and stop rules are deterministic; the LLM only writes the final answer.
- **Six architecture decisions, each forced by a real constraint**, from a Python server to a keyless cloud LLM. The reasoning is in the [ADRs](docs/adr).
- **Bugs found by live testing are fixed and recorded:** a main-thread freeze, a Chrome crash from three GPU models, translations eating the crawl budget, and duplicate pages from query strings. See the [CHANGELOG](CHANGELOG.md).

## Known limits

- **Free AI service:** Pollinations is rate-limited (about 1 question per 15 s per visitor). On errors you get the best source passages instead of a written answer.
- **Login walls:** X, Instagram, LinkedIn and similar sites are refused upfront.
- **Keyword retrieval:** a question that shares no words with its answer can miss (see ADR 0005).

Built by [Athrva Raval](https://www.linkedin.com/in/athrva-raval/). MIT license.
