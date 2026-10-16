# 0001: Run the LLM in the visitor's browser

**Status:** accepted, 2026-10-16

**Context.** Users must chat without an API key, and the project has a $0 budget. Server options were Oracle's free tier (cut to 2 OCPU / 12 GB in 2026, with capacity errors and idle reclaim), HF Spaces free CPU (too slow for a 3B model), or paid GPUs.

**Decision.** Use WebLLM with Qwen2.5-3B (1.5B on phones) on WebGPU. The server only crawls and retrieves.

**Consequences.**
- Inference is free at any traffic, and question text never needs to hit a model server.
- It needs WebGPU. Without it, the UI shows source excerpts instead of a generated answer.
- The first visit downloads about 1–2 GB of weights, cached afterwards.
- Small models are weak planners, so the agent loop lives in server code (see ARCHITECTURE.md).
