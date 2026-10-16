// Cloudflare Worker: the only server. Runs the three models on Workers AI (free tier) so visitors' laptops don't have to.
//   POST /embed  {texts: string[]}                 -> {vectors: number[][]}   bge-small-en-v1.5 (384-d, normalized)
//   POST /rerank {query, docs: string[]}           -> {scores: number[]}      bge-reranker-base, 0..1, same order as docs
//   POST /chat   {messages}                        -> SSE stream               llama-3.1-8b-instruct-fp8-fast
// The page text and questions pass through but are never stored or logged.
const EMBED = "@cf/baai/bge-small-en-v1.5", RERANK = "@cf/baai/bge-reranker-base", LLM = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const LIMITS = { texts: 64, chars: 2000, docs: 32, messages: 12, msgChars: 8000, perMin: 120 };

const hits = new Map(); // ponytail: per-isolate counter, best effort. Use the Rate Limiting binding if abuse shows up.
function allowed(ip) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.t > 60_000) { hits.set(ip, { t: now, n: 1 }); return true; }
  return ++h.n <= LIMITS.perMin;
}

const sigmoid = x => 1 / (1 + Math.exp(-x));
const bad = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const str = (s, max) => (typeof s === "string" && s.length ? s.slice(0, max) : bad("Expected non-empty text."));

export const routes = {
  async embed(ai, { texts }) {
    if (!Array.isArray(texts) || !texts.length || texts.length > LIMITS.texts) bad(`Send 1-${LIMITS.texts} texts.`);
    const r = await ai.run(EMBED, { text: texts.map(t => str(t, LIMITS.chars))});
    return { vectors: r.data };
  },
  async rerank(ai, { query, docs }) {
    if (!Array.isArray(docs) || !docs.length || docs.length > LIMITS.docs) bad(`Send 1-${LIMITS.docs} docs.`);
    const r = await ai.run(RERANK, { query: str(query, 500), contexts: docs.map(d => ({ text: str(d, LIMITS.chars) })), top_k: docs.length });
    const scores = new Array(docs.length).fill(0);
    for (const { id, score } of r.response) scores[id] = score < 0 || score > 1 ? sigmoid(score) : score;
    return { scores };
  },
  async chat(ai, { messages }) {
    if (!Array.isArray(messages) || !messages.length || messages.length > LIMITS.messages) bad("Bad messages.");
    const clean = messages.map(m => ({ role: ["system", "user", "assistant"].includes(m.role) ? m.role : bad("Bad role."), content: str(m.content, LIMITS.msgChars) }));
    return ai.run(LLM, { messages: clean, stream: true, max_tokens: 320, temperature: 0.2 });
  },
};

export default {
  async fetch(req, env) {
    const origin = req.headers.get("origin") || "";
    const ok = (env.ALLOWED_ORIGINS || "*").split(",").some(o => o === "*" || o === origin);
    const cors = { "access-control-allow-origin": ok ? origin || "*" : "null", "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname.slice(1);
    if (req.method === "GET" && path === "health") return Response.json({ ok: true }, { headers: cors });
    try {
      if (req.method !== "POST" || !routes[path]) bad("Not found.", 404);
      if (!ok) bad("Origin not allowed.", 403);
      if (!allowed(req.headers.get("cf-connecting-ip") || "?")) bad("Too many requests, slow down a little.", 429);
      const out = await routes[path](env.AI, await req.json());
      return out instanceof ReadableStream
        ? new Response(out, { headers: { ...cors, "content-type": "text/event-stream", "cache-control": "no-store" } })
        : Response.json(out, { headers: cors });
    } catch (e) {
      // Workers AI daily free quota exhausted shows up as an error from ai.run.
      const status = e.status || (/quota|neuron|limit/i.test(e.message) ? 429 : 500);
      return Response.json({ error: status === 500 ? "The AI service had a hiccup. Try again." : e.message }, { status, headers: cors });
    }
  },
};
