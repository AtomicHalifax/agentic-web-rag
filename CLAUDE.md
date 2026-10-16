# Context for AI agents working on this repo

Read ARCHITECTURE.md first, then docs/RUNBOOK.md when something is broken.

## Layout
- `api/`: FastAPI on a Hugging Face Space. Flat modules, each with a `__main__` self-check: guard, chunk, crawl, index, agent, telemetry, main.
- `web/`: **no build step**. Plain ES modules served as-is by GitHub Pages. WebLLM is imported from jsDelivr at runtime. Don't add a bundler unless something truly needs one.
- `evals/`: `golden.jsonl` plus `run.py`. CI fails if recall@4 < 0.6 or abstain < 0.5.

## Commands
- `make test`: python self-checks plus `node --test web/rag.test.js`
- `make dev`: API on :7860, static web on :8000 (`web/config.js` points at localhost automatically)
- `make eval`: needs the API running

## Conventions
- **Ponytail style:** the smallest thing that works. Mark known ceilings with a `# ponytail:` comment naming the upgrade path.
- **Decisions live in code, not the LLM.** The model only writes answers.
- Never log question text or page content to telemetry.
- Every change gets a line in CHANGELOG.md, and every big decision gets an ADR in `docs/adr/`.

## Gotchas
- The fastembed rerank score is an ms-marco logit, not a probability. `agent.CONFIDENT = 0.0` was tuned by eye; re-tune it with evals.
- HF Spaces sleep after inactivity. The first request after a sleep takes about 30–60 s.
- WebGPU is missing in Firefox stable and many phones. The UI then falls back to showing source excerpts.
