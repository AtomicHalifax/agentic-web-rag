// Retrieval evals: the exact browser pipeline, run in Node with real models and real crawls.
//   npm i && node evals/run.js
// recall@4 = answerable questions whose expected page is in the top-4 sources
// abstain  = unanswerable questions where the agent was NOT confident (UI says "This site doesn't say.")
import { readFileSync } from "node:fs";
import { Site } from "../web/agent.js";
import { defaultModels } from "../web/search.js";

const GATE = { "recall@4": 0.6, abstain: 0.5 };
const rows = readFileSync(new URL("golden.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map(JSON.parse);
const models = await defaultModels();
const sites = new Map(), out = [], lat = [];
let hits = 0, nAns = 0, abst = 0, nUn = 0;

for (const r of rows) {
  if (!sites.has(r.site)) { const s = new Site(r.site, models); for await (const _ of s.ingest()); sites.set(r.site, s); }
  let ctx; for await (const e of sites.get(r.site).retrieve(r.q)) if (e.type === "context") ctx = e;
  lat.push(ctx.ms);
  let ok;
  if (r.answerable) { nAns++; ok = ctx.sources.some(s => s.url.includes(r.expect_url)); hits += ok; }
  else { nUn++; ok = !ctx.confident; abst += ok; }
  out.push(`| ${r.q.slice(0, 48)} | ${ok ? "✓" : "✗"} | ${ctx.hops} | ${ctx.ms} |`);
}

const score = { "recall@4": hits / (nAns || 1), abstain: abst / (nUn || 1) };
lat.sort((a, b) => a - b);
console.log("| question | pass | hops | ms |\n|---|---|---|---|\n" + out.join("\n"));
console.log(`\n**recall@4 ${score["recall@4"].toFixed(2)} · abstain ${score.abstain.toFixed(2)} · p50 ${lat[lat.length >> 1]} ms**`);
process.exit(Object.entries(GATE).every(([k, v]) => score[k] >= v) ? 0 : 1);
