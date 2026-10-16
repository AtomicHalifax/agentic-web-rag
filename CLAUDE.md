# Context for AI agents working on this repo

Read ARCHITECTURE.md first, then docs/RUNBOOK.md when something is broken.

## Layout
- `web/`: the whole app. **No build step**: plain ES modules served as-is by GitHub Pages. WebLLM and transformers.js are imported from jsDelivr at runtime in the browser; in Node, `search.js` imports the npm package instead.
- `web/*.test.js`: node:test, fake models and fetch, no network.
- `evals/`: `golden.jsonl` plus `run.js` (the same modules, real models). CI gate: recall@4 ≥ 0.6, abstain ≥ 0.5.
- There is no server. Don't add one without an ADR.

## Commands
`make dev` (localhost:8000) · `make test` · `make eval`

## Conventions
- **Ponytail:** the smallest thing that works. Mark known ceilings with `// ponytail:` and name the upgrade path.
- **Decisions live in code, not the LLM.** The model only writes answers.
- **Telemetry:** numbers only, never question text or page content.
- **Records:** every change gets a CHANGELOG line, and every big decision gets an ADR in `docs/adr/`.
- **Git:** commit as the no-reply address `188597710+AtomicHalifax@users.noreply.github.com` (GitHub email privacy blocks other addresses).

## Gotchas
- **Rerank score:** it's an ms-marco logit. `agent.CONFIDENT = 0` was set by eye; tune it with evals.
- **Jina Reader:** returns `{data:{title, content, links}}` with `Accept: application/json` and `X-With-Links-Summary: true`. Rate-limited without a key.
- **WebGPU:** missing in Firefox stable and many phones. The UI falls back to source excerpts.
