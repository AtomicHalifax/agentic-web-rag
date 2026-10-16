# 0004: No embeddings; BM25 recall + cross-encoder rerank

**Status:** accepted, 2026-10-16

**Context.** The goals are $0 and fast. Embedding every chunk while crawling was the slowest step (one model round-trip per batch of chunks, roughly 300 chunks per site) and the biggest user of the free Workers AI quota.

**Decision.** Drop dense retrieval. BM25 runs in the browser over all chunks and keeps the top 24. The bge-reranker cross-encoder (one call per question) reorders them semantically.

**Consequences.**
- Indexing makes no model calls: crawl time is just page download time. Chat unlocks after the homepage.
- Quota per question is about 1 neuron for the rerank plus about 16 for the LLM, roughly 580 questions a day free. Crawling is free.
- It can miss a question that shares no words with its answer, because BM25 never recalls it. Chunk crumbs (`Title › H2 › H3`) and the agent's re-crawl soften this. If evals show misses, add dense recall back for the question only (embed the query plus BM25's top 100, not the whole site).
