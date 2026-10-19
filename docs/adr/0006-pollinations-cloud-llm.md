# 0006: Answer model in the cloud via Pollinations (keyless)

**Status:** accepted, 2026-10-19. Supersedes the in-browser LLM of 0005; retrieval stays in the browser.

**Context.** WebLLM still crashed Chrome on the owner's laptop (1.5B at full window width), and the first word took 9–27 s. Cloudflare needs an account plus a scoped token. The owner wants no keys, no accounts and no device load.

**Decision.** `web/models.js` streams from `text.pollinations.ai/openai`: free, no key, CORS-enabled, OpenAI-compatible SSE (`gpt-oss-20b`). Tested live: first token under 1 s. Everything else is unchanged (BM25, agent, code-side attribution).

**Consequences.**
- Zero device load, zero accounts and zero servers: still GitHub Pages only.
- A third-party free service: anonymous rate limits (about 1 request per 15 s per visitor) and it can change terms. On any error, the UI shows the top passages with citations, so the demo never breaks.
- Questions and passages go to Pollinations. That's noted in SECURITY.md.
- Upgrade path: `chat()` is the only seam. Cloudflare Workers AI (ADR 0003 code in git history) or any OpenAI-compatible endpoint drops in.
