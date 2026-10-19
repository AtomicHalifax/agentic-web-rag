# Runbook: when X breaks, check Y

| Symptom | Likely cause | Fix |
|---|---|---|
| "Couldn't read any pages" | Jina Reader down or rate-limited, site blocks bots, or a JS-only site | Open `https://r.jina.ai/<url>` in a tab. 429 → wait a minute. If Jina is down, nothing to do but wait (upgrade path: a Cloudflare Worker fetcher) |
| Answers show only passages plus a note | Pollinations down or rate-limited (429) | Wait about 15 s. If it persists, swap the endpoint in `web/models.js` (ADR 0006 upgrade path) |
| Answers always "This site doesn't say." | `CONFIDENT` too high, or bad chunks | `make eval`, read the coverage scores in the trace line, lower `agent.CONFIDENT` |
| Slow answers | Pollinations load | The trace line shows retrieve and generate ms |
| Pages deploy failed | Pages source not set to GitHub Actions | Repo → Settings → Pages → Source: GitHub Actions, then re-run deploy |
| Eval job fails | Quality dropped, or the snapshots are stale for new crawl logic | Read the step summary table. Re-run **Actions → record-evals**, then re-run CI |
| No data in New Relic | Snippet missing, or an ad blocker | The Browser snippet must be in `web/index.html` `<head>`; test in a clean profile |

Quick check:
```bash
curl -s -H 'Accept: application/json' 'https://r.jina.ai/https://fastapi.tiangolo.com' | head -c 300
```
