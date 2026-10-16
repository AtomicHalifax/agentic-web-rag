# Runbook: when X breaks, check Y

| Symptom | Likely cause | Fix |
|---|---|---|
| "Couldn't read any pages" | Jina Reader down or rate-limited, site blocks bots, or a JS-only site | Open `https://r.jina.ai/<url>` in a tab. 429 → wait a minute. If Jina is down, nothing to do but wait (upgrade path: a Cloudflare Worker fetcher) |
| Stuck on "Loading search models" | jsDelivr or Hugging Face model download blocked or slow | Check the console network tab for failed `huggingface.co` or `cdn.jsdelivr.net` requests |
| Answers always "This site doesn't say." | `CONFIDENT` too high, or bad chunks | `make eval`, read the top scores in the trace line, lower `agent.CONFIDENT` |
| Model never loads | No WebGPU, or not enough GPU memory | Chrome/Edge on a laptop. Phones get the 1.5B model automatically |
| Slow answers | Integrated GPU | Expected: about 5–15 tok/s. Shown in the trace line |
| Pages deploy failed | Pages source not set to GitHub Actions | Repo → Settings → Pages → Source: GitHub Actions, then re-run deploy |
| Eval job fails | A live site moved pages, or quality dropped | Read the step summary table. Update `evals/golden.jsonl` if URLs changed |
| No data in New Relic | Snippet missing, or an ad blocker | The Browser snippet must be in `web/index.html` `<head>`; test in a clean profile |

Quick check:
```bash
curl -s -H 'Accept: application/json' 'https://r.jina.ai/https://fastapi.tiangolo.com' | head -c 300
```
