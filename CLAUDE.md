# Context for AI agents working on this repo

Read ARCHITECTURE.md first, then docs/RUNBOOK.md when something is broken.

## Layout
- `web/`: the whole app. **No build step, no dependencies**: plain ES modules served as-is by GitHub Pages. The only model is the LLM in `web/models.js` + `llm.worker.js` (WebLLM, imported from jsDelivr).
- `web/*.test.js`: node:test, fake fetch, no network.
- `evals/`: `golden.jsonl` plus `run.js` (the same modules, live sites). CI gate: recall@4 ≥ 0.6, abstain ≥ 0.5.
- There is no server. Adding one needs an ADR (see 0003 and 0005 for why it was removed).

## Commands
`make dev` (localhost:8000) · `make test` · `make eval`

## Conventions
- **Ponytail:** the smallest thing that works. Mark known ceilings with `// ponytail:` and name the upgrade path.
- **Decisions live in code, not the LLM.** The model only writes answers.
- **Telemetry:** numbers only, never question text or page content.
- **Records:** every change gets a CHANGELOG line, and every big decision gets an ADR in `docs/adr/`.
- **Git:** commit as the no-reply address `188597710+AtomicHalifax@users.noreply.github.com` (GitHub email privacy blocks other addresses).

## Gotchas
- **Confidence:** `agent.CONFIDENT = 0.6` is the share of the question's key words in the best passage (`search.js`). Untuned; tune with evals.
- **Jina Reader:** returns `{data:{title, content, links}}` with `Accept: application/json` and `X-With-Links-Summary: true`. Rate-limited without a key.
- **GPU load:** exactly one model in the browser. Three at once crashed Chrome (ADR 0003). Don't add an in-browser embedder or reranker without measuring.
