# Runbook: when X breaks, check Y

| Symptom | Likely cause | Fix |
|---|---|---|
| "Couldn't read any pages" | Jina Reader down or rate-limited, site blocks bots, or a JS-only site | Open `https://r.jina.ai/<url>` in a tab. 429 → wait a minute. If Jina is down, nothing to do but wait (upgrade path: a Cloudflare Worker fetcher) |
| Answers show only passages plus a note | No WebGPU, or the model failed to load (low GPU memory) | Chrome or Edge on a laptop. Check the console for `LLM unavailable`. Low-memory devices already get the 0.5B model |
| Model download stalls | jsDelivr or Hugging Face weights blocked or slow | Network tab: look for failed `cdn.jsdelivr.net` or `huggingface.co` requests |
| Tab crashes | GPU out of memory | Lower `MODEL` in `web/models.js` to the 0.5B model |
| Answers always "This site doesn't say." | `CONFIDENT` too high, or bad chunks | `make eval`, read the coverage scores in the trace line, lower `agent.CONFIDENT` |
| Slow answers | Integrated GPU, or the first answer waits for the model download | The trace line shows retrieve and generate ms. Expect about 10–30 tok/s on laptops |
| Pages deploy failed | Pages source not set to GitHub Actions | Repo → Settings → Pages → Source: GitHub Actions, then re-run deploy |
| Eval job fails | A live site moved pages, or quality dropped | Read the step summary table. Update `evals/golden.jsonl` if URLs changed |
| No data in New Relic | Snippet missing, or an ad blocker | The Browser snippet must be in `web/index.html` `<head>`; test in a clean profile |

Quick check:
```bash
curl -s -H 'Accept: application/json' 'https://r.jina.ai/https://fastapi.tiangolo.com' | head -c 300
```
