# Context for AI agents working on this repo

Read ARCHITECTURE.md first, then docs/RUNBOOK.md when something is broken.

## Layout
- `web/`: the app. **No build step**: plain ES modules served as-is by GitHub Pages. Models are called through `web/models.js`: the Worker in the browser, local transformers.js in Node evals.
- `worker/`: the Cloudflare Worker (`/rerank`, `/chat` on Workers AI; no embeddings, see ADR 0004). Deployed by `deploy.yml`, which also writes its URL into `web/config.js`.
- `web/*.test.js`: node:test, fake models and fetch, no network.
- `evals/`: `golden.jsonl` plus `run.js` (the same modules, real models). CI gate: recall@4 ≥ 0.6, abstain ≥ 0.5.
- The Worker is the only server. Keep it thin; anything bigger needs an ADR. Setup: docs/SETUP.md.

## Commands
`make dev` (localhost:8000) · `make test` · `make eval`

## Conventions
- **Ponytail:** the smallest thing that works. Mark known ceilings with `// ponytail:` and name the upgrade path.
- **Decisions live in code, not the LLM.** The model only writes answers.
- **Telemetry:** numbers only, never question text or page content.
- **Records:** every change gets a CHANGELOG line, and every big decision gets an ADR in `docs/adr/`.
- **Git:** commit as the no-reply address `188597710+AtomicHalifax@users.noreply.github.com` (GitHub email privacy blocks other addresses).

## Gotchas
- **Rerank score:** the scale depends on the model set. Worker bge-reranker is 0..1 (`confident: 0.3`, untuned); local ms-marco is a logit (`confident: 3`; real answers about +5..+10). Tune with evals.
- **Free quota:** Workers AI allows 10k neurons/day (resets 00:00 UTC). When it's hit, `/chat` errors and the UI shows the top passages instead.
- **Jina Reader:** returns `{data:{title, content, links}}` with `Accept: application/json` and `X-With-Links-Summary: true`. Rate-limited without a key.
- **Device load:** don't move models back into the browser; it crashed real laptops (ADR 0003).
