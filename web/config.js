// Where the crawl/retrieval API lives. Set after deploying the Hugging Face Space.
export const API_URL = location.hostname === "localhost" ? "http://localhost:7860" : "https://athrva-agentic-web-rag.hf.space";

// Runs in the visitor's browser via WebGPU. Smaller model on phones.
export const MODEL = matchMedia("(max-width: 720px)").matches
  ? "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
  : "Qwen2.5-3B-Instruct-q4f16_1-MLC";
