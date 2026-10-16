# Security model

Every website is untrusted input.

| Boundary | Threat | Guard | Code |
|---|---|---|---|
| URL from user | Using the app to probe internal hosts | Only public http(s) on ports 80/443; localhost and private ranges refused. The fetch itself runs on Jina's infrastructure, never on ours | `guard.checkUrl` |
| Crawling | Runaway crawls | 30-page cap, 3 parallel requests, same-site links only, auth and cart paths skipped | `agent.js` |
| Page text | Prompt injection ("ignore previous instructions…"), zero-width tricks | Invisible characters stripped, instruction-like lines dropped and counted | `guard.sanitize` |
| Prompt | Injection that survives sanitizing | Sources fenced in `<source>` tags; the system prompt says they are data | `rag.buildMessages` |
| Model output | XSS via generated HTML | Escaped first; only `code`, bullets and citation buttons allowed | `rag.render` |
| Model output | Hallucination | Every claim must cite an existing source; one retry, then abstain | `rag.verify` |
| Telemetry | Leaking user data | Numbers only, never question or page text | `telemetry.js` |

**Trust note:** page URLs are sent to Jina Reader so it can fetch them. Questions never leave the browser.

To report an issue, open a private security advisory on GitHub.
