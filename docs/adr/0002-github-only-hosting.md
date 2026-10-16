# 0002: GitHub-only hosting; retrieval moves into the browser

**Status:** accepted, 2026-10-16. Supersedes the Python API on Hugging Face Spaces.

**Context.** In late 2026, Hugging Face's free tier covers only static Spaces; Docker Spaces need PRO. Render and Koyeb are free but run at 0.1 CPU (too slow to embed a site), Koyeb needs a card hold, Cloud Run needs billing, and Fly.io has no free tier. The owner wants everything on GitHub.

**Decision.**
- Embeddings, BM25, rerank and the agent loop run in the browser via transformers.js, using the same models as before.
- Page fetching uses Jina Reader (CORS-enabled, no account) because browsers can't fetch other origins.
- The Python API is deleted; one implementation beats two. Evals run the same JS modules in Node.

**Consequences.**
- $0 at any traffic, nothing to keep alive, and no secrets to manage.
- One external dependency (Jina), with rate limits and an availability risk. The upgrade path is a Cloudflare Worker fetcher (free, no card).
- SSRF protection for fetches is Jina's responsibility; the client still refuses internal URLs.
