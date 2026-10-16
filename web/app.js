import { MODEL } from "./config.js";
import { createMap } from "./map.js";
import { buildMessages, render, verify, NOT_FOUND } from "./rag.js";
import { Site } from "./agent.js";
import { checkQuestion } from "./guard.js";
import { defaultModels } from "./search.js";
import { track } from "./telemetry.js";

const $ = id => document.getElementById(id);
const map = createMap($("map"), $("edges"));
let site = null, engine = null, enginePromise = null, history = [];

function step(text, live = false) {
  for (const li of $("steps").querySelectorAll(".live")) { li.classList.remove("live"); li.textContent = "✓ " + li.textContent.replace(/^● /, ""); }
  const li = document.createElement("li");
  li.textContent = (live ? "● " : "✓ ") + text; if (live) li.className = "live";
  $("steps").appendChild(li);
  while ($("steps").children.length > 4) $("steps").firstChild.remove();
}

function onEvent(ev) {
  if (ev.type === "session") map.add(ev.root, ev.root, [], true);
  else if (ev.type === "step") step(ev.text, true);
  else if (ev.type === "page") { map.add(ev.url, ev.title, ev.links); map.highlight([ev.url], "reading"); }
  else if (ev.type === "done") { step(`${ev.pages} pages indexed`); map.highlight([], "reading"); }
  else if (ev.type === "error") throw new Error(ev.text);
}

// ---------- in-browser LLM ----------
function loadModel() {
  if (enginePromise) return enginePromise;
  if (!navigator.gpu) { $("model").textContent = "This browser has no WebGPU. Try Chrome or Edge on a laptop."; return (enginePromise = Promise.resolve(null)); }
  $("model").innerHTML = `Loading ${MODEL.split("-q")[0]} on your device… <span class="bar"><i id="mbar" style="width:0"></i></span>`;
  enginePromise = import("https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2/+esm").then(({ CreateMLCEngine }) =>
    CreateMLCEngine(MODEL, { initProgressCallback: p => { const b = $("mbar"); if (b) b.style.width = `${Math.round(p.progress * 100)}%`; } })
  ).then(e => { engine = e; $("model").textContent = `${MODEL.split("-q")[0]} · on-device · no API key`; return e; })
   .catch(err => { $("model").textContent = "Couldn't load the model: " + err.message; return null; });
  return enginePromise;
}

async function generate(messages, onToken) {
  let out = "";
  const chunks = await engine.chat.completions.create({ messages, stream: true, temperature: 0.2, max_tokens: 320 });
  for await (const c of chunks) { out += c.choices[0]?.delta?.content || ""; onToken(out); }
  return out;
}

// ---------- start ----------
async function start(url) {
  $("startErr").textContent = "";
  document.body.dataset.view = "work"; $("work").hidden = false;
  $("sitePill").hidden = false; $("sitePill").textContent = url.replace(/^https?:\/\//, "");
  step("Loading search models", true);
  loadModel();
  const t0 = performance.now();
  try {
    site = new Site(url, await defaultModels());
    for await (const ev of site.ingest()) onEvent(ev);
    track("ingest", { pages: site.okCount(), chunks: site.index.chunks.length, ms: Math.round(performance.now() - t0) });
    $("hint").textContent = "Ask anything about this site.";
    $("q").disabled = false; $("askForm").querySelector("button").disabled = false; $("q").focus();
  } catch (e) {
    document.body.dataset.view = "home"; $("work").hidden = true; $("startErr").textContent = e.message;
  }
}

$("startForm").addEventListener("submit", e => { e.preventDefault(); start($("url").value.trim()); });
for (const b of document.querySelectorAll(".examples button")) b.addEventListener("click", () => { $("url").value = b.dataset.url; start(b.dataset.url); });

// ---------- ask ----------
$("askForm").addEventListener("submit", async e => {
  e.preventDefault();
  let q; try { q = checkQuestion($("q").value); } catch { return; }
  if (!site) return;
  $("q").value = ""; $("q").disabled = true;
  const bubble = Object.assign(document.createElement("div"), { className: "q", textContent: q });
  const ans = Object.assign(document.createElement("div"), { className: "a", textContent: "…" });
  $("hint")?.remove(); $("thread").append(bubble, ans);

  try {
    let ctx;
    for await (const ev of site.retrieve(q)) {
      if (ev.type === "context") ctx = ev; else onEvent(ev);
      if (ev.type === "search") { step(`Searched ${ev.urls.length} pages`, true); map.highlight(ev.urls); }
    }
    step(ctx.hops ? `Read more pages (${ctx.hops} hop${ctx.hops > 1 ? "s" : ""})` : "Found it in the index");
    map.highlight(ctx.sources.map(s => s.url));

    const t0 = performance.now();
    if (!(await loadModel())) { ans.innerHTML = render(ctx.sources.slice(0, 2).map(s => `${s.text.slice(0, 280)}… [${s.n}]`).join("\n\n")); }
    else {
      const msgs = buildMessages(q, ctx.sources, history);
      let out = await generate(msgs, t => (ans.innerHTML = render(t)));
      let check = verify(out, ctx.sources.length);
      if (!check.ok) { // one corrective retry, then abstain rather than show uncited claims
        out = await generate([...msgs, { role: "assistant", content: out }, { role: "user", content: "Rewrite: every sentence must end with a source number like [1]. If the sources don't say, reply exactly: " + NOT_FOUND }], t => (ans.innerHTML = render(t)));
        check = verify(out, ctx.sources.length);
        if (!check.ok) out = NOT_FOUND;
      }
      ans.innerHTML = render(out);
      history.push({ role: "user", content: q }, { role: "assistant", content: out });
      if (check.cited?.length) map.highlight(ctx.sources.filter(s => check.cited.includes(s.n)).map(s => s.url));
    }

    ans.insertAdjacentHTML("beforeend", `<div class="sources"><h3>SOURCES</h3>${ctx.sources.map(s =>
      `<button class="src" data-n="${s.n}"><span>${s.n} · ${escapeHtml(s.title)}</span><span>${escapeHtml(new URL(s.url).pathname)}</span></button>`).join("")}</div>
      <div class="trace">retrieve ${ctx.ms} ms · generate ${Math.round(performance.now() - t0)} ms · ${ctx.hops} hop(s) · top score ${ctx.sources[0]?.score ?? "n/a"}</div>`);
    ans.dataset.sources = JSON.stringify(ctx.sources);
    track("answer", { retrieveMs: ctx.ms, generateMs: Math.round(performance.now() - t0), hops: ctx.hops, confident: ctx.confident, abstained: ans.textContent.startsWith(NOT_FOUND), qLen: q.length });
  } catch (err) {
    ans.textContent = err.message;
  }
  $("q").disabled = false; $("q").focus();
  $("thread").scrollTop = $("thread").scrollHeight;
});

// ---------- citations open the source, passage highlighted ----------
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
$("thread").addEventListener("click", e => {
  const b = e.target.closest("[data-n]"); if (!b) return;
  const s = JSON.parse(b.closest(".a").dataset.sources || "[]").find(x => x.n === +b.dataset.n); if (!s) return;
  $("drawerPath").textContent = s.path;
  $("drawerText").innerHTML = `<mark>${escapeHtml(s.text)}</mark>`;
  $("drawerLink").href = s.url;
  $("drawer").hidden = false;
  map.highlight([s.url]);
});
$("drawerClose").addEventListener("click", () => ($("drawer").hidden = true));
addEventListener("keydown", e => { if (e.key === "Escape") $("drawer").hidden = true; });
