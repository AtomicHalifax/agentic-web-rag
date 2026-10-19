// Retrieval evals: the exact browser pipeline (crawl + chunk + BM25 + agent).
//   node evals/run.js           replay recorded pages from evals/snapshots/ (deterministic, offline; what CI gates on)
//   node evals/run.js --record  crawl live via Jina and save every response (run by the record-evals workflow)
// recall@4 = answerable questions whose expected page is in the top-4 sources
// abstain  = unanswerable questions where the agent was NOT confident (UI says "This site doesn't say.")
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Site } from "../web/agent.js";

const GATE = { "recall@4": 0.6, abstain: 0.5 };
const RECORD = process.argv.includes("--record");
const DIR = new URL("snapshots/", import.meta.url);
const file = url => new URL(createHash("sha1").update(url).digest("hex").slice(0, 16) + ".json", DIR);

// Same shape as fetch() as far as fetchPage cares: {ok, status, json()}.
async function snapFetch(url, init) {
  if (RECORD) {
    const r = await fetch(url, init), body = await r.text();
    if (r.status !== 429) writeFileSync(file(url), JSON.stringify({ url, status: r.status, body }));
    return { ok: r.ok, status: r.status, json: async () => JSON.parse(body) };
  }
  if (!existsSync(file(url))) return { ok: false, status: 404, json: async () => ({}) }; // never recorded = unreachable
  const { status, body } = JSON.parse(readFileSync(file(url), "utf8"));
  return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) };
}

mkdirSync(DIR, { recursive: true });
const rows = readFileSync(new URL("golden.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map(JSON.parse);
const sites = new Map(), out = [], lat = [];
let hits = 0, nAns = 0, abst = 0, nUn = 0;

for (const r of rows) {
  if (!sites.has(r.site)) { const s = new Site(r.site, null, snapFetch); for await (const _ of s.ingest()); sites.set(r.site, s); }
  let ctx; for await (const e of sites.get(r.site).retrieve(r.q)) if (e.type === "context") ctx = e;
  lat.push(ctx.ms);
  let ok;
  if (r.answerable) { nAns++; ok = ctx.sources.some(s => s.url.includes(r.expect_url)); hits += ok; }
  else { nUn++; ok = !ctx.confident; abst += ok; }
  out.push(`| ${r.q.slice(0, 48)} | ${ok ? "✓" : "✗"} | ${ctx.hops} | ${sites.get(r.site).okCount()} |`);
}

const score = { "recall@4": hits / (nAns || 1), abstain: abst / (nUn || 1) };
console.log(`${RECORD ? "**live (recording)**" : "**replayed snapshots**"}\n\n| question | pass | hops | pages read |\n|---|---|---|---|\n` + out.join("\n"));
console.log(`\n**recall@4 ${score["recall@4"].toFixed(2)} · abstain ${score.abstain.toFixed(2)}**`);
process.exit(RECORD || Object.entries(GATE).every(([k, v]) => score[k] >= v) ? 0 : 1);
