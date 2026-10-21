// The answer model runs in the cloud via Pollinations: free, keyless, CORS-enabled, OpenAI-compatible streaming.
// The visitor's device does no ML. If the service fails or rate-limits (~1 req / 15 s per visitor), the UI shows the best passages.
const ENDPOINT = "https://text.pollinations.ai/openai";
export const MODEL = "gpt-oss-20b via Pollinations";

/** Streams an answer. onText gets the full text so far. */
export async function chat(messages, onText, temperature = 0.2) {
  const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "openai", messages, stream: true, temperature, max_tokens: 400 }) });
  if (!r.ok) throw new Error(r.status === 429 ? "The free AI service is busy. Wait a few seconds and ask again." : `AI service error (${r.status}).`);
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return out;
    buf += value;
    const lines = buf.split("\n"); buf = lines.pop();
    for (const l of lines) {
      if (!l.startsWith("data: ") || l === "data: [DONE]") continue;
      try { const t = JSON.parse(l.slice(6)).choices?.[0]?.delta?.content; if (t) { out += t; onText(out); } } catch {} // skips reasoning deltas
    }
  }
}
