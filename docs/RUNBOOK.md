# Runbook: when X breaks, check Y

| Symptom | Likely cause | Fix |
|---|---|---|
| "Failed to fetch" on Start | Space asleep or down | Open the Space URL, wait for "Running". Check `/health`. |
| CORS error in the console | `ALLOWED_ORIGINS` doesn't include the Pages origin | Set the Space variable to `https://atomichalifax.github.io` |
| "Couldn't read any pages" | JS-only site, robots.txt disallow, or blocked bot | Try another URL. Long term: Playwright fallback in `crawl.fetch` |
| Answers always "This site doesn't say." | `CONFIDENT` too high, or bad chunks | Run `make eval`, check top scores in the trace line, lower `agent.CONFIDENT` |
| Model never loads | No WebGPU, or not enough GPU memory | Chrome/Edge on a laptop. Phones get the 1.5B model automatically |
| Model loads but is slow | Integrated GPU | Expected: about 5–15 tok/s. Shown in the trace line |
| No traces in New Relic | Secret missing or wrong region | Space secret `NEW_RELIC_LICENSE_KEY` (an ingest license key). EU accounts: set `NEW_RELIC_OTLP_ENDPOINT=https://otlp.eu01.nr-data.net:4318` |
| Deploy job skipped the Space | `HF_SPACE` variable not set | Repo → Settings → Variables: `HF_SPACE=<user>/agentic-web-rag`, Secret `HF_TOKEN` |
| CI eval job fails | Live site changed or the model got worse | Read the step summary table. Update `evals/golden.jsonl` if the site moved pages |

Quick checks:
```bash
curl -s https://<space>.hf.space/health
curl -sN -X POST https://<space>.hf.space/sites -H 'content-type: application/json' -d '{"url":"https://fastapi.tiangolo.com"}' | head
```
