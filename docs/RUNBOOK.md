# Runbook: when X breaks, check Y

| Symptom | Likely cause | Fix |
|---|---|---|
| "Couldn't read any pages" | Jina Reader down or rate-limited, site blocks bots, or a JS-only site | Open `https://r.jina.ai/<url>` in a tab. 429 → wait a minute. If Jina is down, nothing to do but wait (upgrade path: a Cloudflare Worker fetcher) |
| "The AI backend isn't deployed yet" | Cloudflare secrets missing, so the worker job was skipped | Follow docs/SETUP.md, then Actions → deploy → Run workflow |
| Answers show only passages plus an error note | Workers AI daily free quota used up | Wait for the 00:00 UTC reset. Check usage in Cloudflare → Workers AI |
| CORS / "Origin not allowed" | Site served from an origin not in `ALLOWED_ORIGINS` | Edit `worker/wrangler.toml` [vars] and redeploy |
| Answers always "This site doesn't say." | `CONFIDENT` too high, or bad chunks | `make eval`, read the top scores in the trace line, lower `agent.CONFIDENT` |
| Slow answers | Workers AI cold start or load | The trace line shows retrieve and generate ms. Check Cloudflare → Workers → Metrics |
| Pages deploy failed | Pages source not set to GitHub Actions | Repo → Settings → Pages → Source: GitHub Actions, then re-run deploy |
| Eval job fails | A live site moved pages, or quality dropped | Read the step summary table. Update `evals/golden.jsonl` if URLs changed |
| No data in New Relic | Snippet missing, or an ad blocker | The Browser snippet must be in `web/index.html` `<head>`; test in a clean profile |

Quick check:
```bash
curl -s -H 'Accept: application/json' 'https://r.jina.ai/https://fastapi.tiangolo.com' | head -c 300
```
