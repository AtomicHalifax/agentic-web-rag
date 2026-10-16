# Security model

Every website is untrusted input. The guardrails, by trust boundary:

| Boundary | Threat | Guard | Code |
|---|---|---|---|
| URL from user | SSRF into cloud metadata or internal hosts | http(s) only, ports 80/443, every resolved IP must be public | `guard.check_url` |
| Crawling | Abuse, ignoring site owners | robots.txt respected, 30-page cap, 2 MB per page, identifying User-Agent | `guard.robots_allows`, `crawl.py` |
| Page text | Prompt injection ("ignore previous instructions…"), zero-width tricks | Invisible chars stripped, instruction-like lines dropped, count logged | `guard.sanitize` |
| Prompt | Injection that survives sanitizing | Sources wrapped in `<source>` tags, and the system prompt says they are data | `web/rag.js` |
| Model output | XSS via generated HTML | Output escaped first; only `code`, bullets and citation buttons allowed | `rag.render` |
| Model output | Hallucination | Every claim must cite an existing source; one retry, then abstain | `rag.verify` |
| API | Flooding | Per-IP token bucket (20/min), 500-char question cap, 50 live sessions | `main.py` |
| Telemetry | Leaking user data | Numbers only, never question or page text | `telemetry.py` |

**Known gap:** DNS rebinding between the check and the fetch. The fix is to pin the resolved IP in the HTTP transport.

To report an issue, open a private security advisory on GitHub.
