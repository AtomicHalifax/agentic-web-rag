import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { routes } from "./index.js";

const fakeAI = { run: async (model, input) => {
  if (model.includes("bge-small")) return { data: input.text.map(() => [0.1, 0.2]) };
  if (model.includes("reranker")) return { response: input.contexts.map((_, id) => ({ id, score: id === 1 ? 4 : -4 })).reverse() };
  return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"response":"hi"}\n\n')); c.close(); } });
} };
const call = (path, body, origin = "https://atomichalifax.github.io") =>
  worker.fetch(new Request("https://w.dev/" + path, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }), { AI: fakeAI, ALLOWED_ORIGINS: "https://atomichalifax.github.io" });

test("rerank returns scores in doc order, squashed to 0..1", async () => {
  const { scores } = await routes.rerank(fakeAI, { query: "q", docs: ["a", "b", "c"] });
  assert.equal(scores.length, 3); assert.ok(scores[1] > 0.9 && scores[0] < 0.1);
});
test("embed validates input", async () => {
  assert.equal((await (await call("embed", { texts: ["x", "y"] })).json()).vectors.length, 2);
  assert.equal((await call("embed", { texts: [] })).status, 400);
});
test("chat streams SSE and rejects odd roles", async () => {
  const r = await call("chat", { messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.headers.get("content-type"), "text/event-stream");
  assert.equal((await call("chat", { messages: [{ role: "tool", content: "x" }] })).status, 400);
});
test("other origins are refused", async () => {
  assert.equal((await call("embed", { texts: ["x"] }, "https://evil.example")).status, 403);
});
