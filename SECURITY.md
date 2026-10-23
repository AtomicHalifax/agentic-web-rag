# Security model

Every website is untrusted input.

| Boundary | Threat | Guard | Code |
|---|---|---|---|
| URL from user | Using the app to probe internal hosts | Only public http(s) on ports 80/443; localhost and private ranges refused. The fetch itself runs on Jina's infrastructure, never on ours | `guard.checkUrl` |
| Crawling | Runaway crawls | 60-page cap, batches of at most 8 fetches, same-site links only, auth and cart paths skipped | `agent.js` |
| Page text | Prompt injection ("ignore previous instructions…"), zero-width tricks | Invisible characters stripped, instruction-like lines dropped and counted | `guard.sanitize` |
| Prompt | Injection that survives sanitizing | Sources fenced in `<source>` tags; the system prompt says they are data | `rag.buildMessages` |
| Model output | XSS via generated HTML | Escaped first; only `code`, bullets and citation buttons allowed | `rag.render` |
| Model output | Hallucination | Each sentence must be supported by a source (≥ half its key words), or it's dropped; nothing supported means abstain. Phantom citations are stripped | `rag.attribute` |
| Browser | XSS or a compromised dependency calling home | Content-Security-Policy: scripts only from our origin, network only to `r.jina.ai` and `text.pollinations.ai`, no plugins, no `<base>` or form hijacking. Zero npm dependencies | `index.html` |
| Page map | Malicious URLs from crawled pages injected into SVG markup | Every URL attribute escaped | `map.js` |
| Privacy | Leaking the visitor's page to third parties | `Referrer-Policy: no-referrer` | `index.html` |
| Secrets | API keys committed to the repo | None exist (no server, no keys). gitleaks scans every push and the full history | `security.yml` |
| Code | Unsafe DOM or injection patterns | CodeQL (security-extended) on every push and weekly | `security.yml` |
| CI | A compromised workflow abusing the token | Workflows get read-only tokens; only deploy can write Pages | `.github/workflows/` |
| Telemetry | Leaking user data | Numbers only, never question or page text | `telemetry.js` |

**Trust note:** page URLs go to Jina Reader so it can fetch them. Questions and the top passages go to Pollinations to write the answer; we store nothing, and there are no secrets to leak.

To report an issue, open a private security advisory on GitHub.
