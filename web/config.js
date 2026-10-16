// Runs in the visitor's browser via WebGPU. Smaller model on phones.
export const MODEL = matchMedia("(max-width: 720px)").matches
  ? "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
  : "Qwen2.5-3B-Instruct-q4f16_1-MLC";
