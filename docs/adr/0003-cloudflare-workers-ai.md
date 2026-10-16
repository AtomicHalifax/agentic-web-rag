# 0003: Models run on Cloudflare Workers AI, not the visitor's device

**Status:** accepted, 2026-10-16. Supersedes the inference half of 0001 and 0002.

**Context.** Live testing on a normal laptop: running Qwen2.5-1.5B (WebLLM) plus bge-small and a reranker (transformers.js on WebGPU) in one tab made Chrome crash. The first visit also downloaded about 1.5 GB, and the first answer took over a minute. A portfolio demo that crashes a recruiter's browser is worse than no demo.

**Options.**
- **Hugging Face Docker Spaces:** need PRO in 2026.
- **Render / Koyeb free:** 0.1 CPU, too slow to embed.
- **Hosted LLM APIs:** need a key, which needs a server anyway.
- **Cloudflare Workers AI:** a free tier (10k neurons/day), a Worker keeps the token server-side, and it hosts the same bge-small embedder, a reranker and Llama 3.1 8B.

**Decision.** A ~70-line Worker (`worker/index.js`) exposes `/embed`, `/rerank` and `/chat`. The browser keeps the cheap, explainable parts: crawl orchestration, chunking, BM25, RRF fusion, the agent loop, citation checks and UI. Jina Reader still fetches pages.

**Consequences.**
- No device load, nothing to download, and a first answer in seconds.
- A bigger LLM (8B vs 1.5–3B) gives better answers and fewer abstentions.
- A daily quota applies (roughly 30 site crawls plus hundreds of questions a day). When it's hit, the UI shows the top source passages instead of failing.
- Questions and page chunks now pass through Cloudflare; they are not logged or stored by our code.
- Node evals keep using local transformers.js models (ms-marco reranker, logit scale). Each model set carries its own `confident` threshold.
