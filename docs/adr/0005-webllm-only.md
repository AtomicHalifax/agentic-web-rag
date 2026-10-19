# 0005: One in-browser LLM, no server, no reranker

**Status:** accepted, 2026-10-19. Supersedes 0003 (Cloudflare Worker) and the reranker half of 0004.

**Context.** The owner wants no API keys, no accounts and no pricing anywhere, including for themselves. Cloudflare needed an account plus a correctly scoped API token, and the first deploy failed on permissions. In-browser inference was dropped earlier (0003) because Chrome crashed. But that tab ran **three** models on the GPU (an LLM, an embedder and a reranker). After 0004 the embedder is gone.

**Decision.**
- **One model:** Qwen2.5-1.5B on WebLLM (0.5B on phones or devices with under 8 GB RAM), in a Web Worker so the page never freezes.
- **No reranker:** BM25 ranks, and the agent's confidence is **query-term coverage**: the share of the question's key words found in the best passage. It's deterministic, explainable and free.
- **The whole app is static files on GitHub Pages.** Evals run the exact same code in Node with zero dependencies.
- **Model loading starts as soon as you click into the URL box**, and the crawl never waits for it.

**Consequences.**
- $0 at any traffic, with nothing to deploy except Pages.
- First visit downloads about 1 GB (0.5B: about 400 MB), cached afterwards. Without WebGPU (Firefox, many phones), answers fall back to the top source passages.
- Coverage is cruder than a cross-encoder: a paraphrased question may trigger an unnecessary re-crawl, or rank a passage that shares words but not meaning. The citation check and abstention catch the worst case.
- Upgrade path, if needed: a reranker or a server-side LLM can return behind `web/models.js` without touching the agent.
