import { createMap } from "./map.js";
import { chat } from "./models.js";
import { attribute, buildMessages, render, NOT_FOUND, PROMPT_SOURCES } from "./rag.js";
import { Site } from "./agent.js";
import { checkQuestion } from "./guard.js";
import { track } from "./telemetry.js";

const $ = id => document.getElementById(id);
const send = () => $("askForm").querySelector("button");
const map = createMap($("map"), $("edges"));
let site = null, history = [];

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
  else if (ev.type === "page") { map.add(ev.url, ev.title, ev.links); map.highlight([ev.url], "reading"); pill(); }
  else if (ev.type === "done") { step(`${ev.pages} pages indexed`); map.highlight([], "reading"); }
  else if (ev.type === "error") throw new Error(ev.text);
}

// Crawl lifecycle, on <body data-crawl>: reading -> ready (first page in, chat open, crawl continues) -> done.
// A crawl that reads nothing goes back to the home view. CSS, tests and agents read the attribute; nothing else holds this state.
function setCrawl(state) {
  const was = document.body.dataset.crawl;
  document.body.dataset.crawl = state;
  pill();
  if (was === "reading" && state !== "reading") { // first page landed: open the chat once
    if ($("hint")) $("hint").textContent = "Ask anything. I'll keep reading the site while you do.";
    $("q").disabled = false; send().disabled = false; $("q").focus();
  }
}

// Site pill shows crawl progress: "ex.com · reading · 5 pages" -> "ex.com · 34 pages".
function pill() {
  if (!site) return;
  const n = site.okCount(), live = document.body.dataset.crawl !== "done";
  $("sitePill").textContent = `${site.root.replace(/^https?:\/\//, "")} · ${live ? "reading · " : ""}${n} page${n === 1 ? "" : "s"}`;
}

// ---------- start: chat unlocks after the homepage; the rest of the crawl keeps going in the background ----------
async function start(url) {
  $("startErr").textContent = "";
  let s;
  try { s = new Site(url, null); } catch (e) { $("startErr").textContent = e.message; return; }
  document.body.dataset.view = "work"; $("work").hidden = false; setCrawl("reading");
  site = s; $("sitePill").hidden = false; pill();
  const t0 = performance.now();
  try {
    for await (const ev of site.ingest()) { onEvent(ev); if (ev.type === "page" && document.body.dataset.crawl === "reading") setCrawl("ready"); }
    setCrawl("done");
    track("ingest", { pages: site.okCount(), chunks: site.index.chunks.length, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    if (site?.okCount()) { step(e.message); setCrawl("done"); } // partial crawl still usable
    else { delete document.body.dataset.crawl; document.body.dataset.view = "home"; $("work").hidden = true; $("startErr").textContent = e.message; }
  }
}

$("startForm").addEventListener("submit", e => { e.preventDefault(); start($("url").value.trim()); });
for (const b of document.querySelectorAll(".examples button")) b.addEventListener("click", () => { $("url").value = b.dataset.url; start(b.dataset.url); });

// ---------- ask ----------
// Answer lifecycle, on each answer's data-phase: searching -> reading (more pages) -> writing -> done | fallback | error.
// One answer at a time: Send is disabled while the latest answer is in a live phase; the input stays usable meanwhile.
const LIVE = { searching: "Searching the site", reading: "Reading more pages", writing: "Writing the answer" };
let current = null;
const busy = () => current?.dataset.phase in LIVE;
function setPhase(ans, phase) {
  ans.dataset.phase = phase;
  if (phase in LIVE) ans.querySelector(".status-text").textContent = LIVE[phase];
  else ans.querySelector(".status")?.remove();
  if (phase === "fallback" || phase === "error") ans.insertAdjacentHTML("beforeend", `<button class="retry" type="button">Ask again</button>`);
  send().disabled = phase in LIVE;
}
const scrollDown = () => $("thread").scrollTo({ top: $("thread").scrollHeight, behavior: "smooth" });

$("askForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (busy() || !site) return;
  let q; try { q = checkQuestion($("q").value); } catch { return; }
  $("q").value = "";
  const bubble = Object.assign(document.createElement("div"), { className: "q", textContent: q });
  const ans = Object.assign(document.createElement("div"), { className: "a" });
  ans.innerHTML = `<div class="status"><span class="dots"><i></i><i></i><i></i></span><span class="status-text"></span></div><div class="body"></div>`;
  ans.dataset.q = q; current = ans; setPhase(ans, "searching");
  const body = ans.querySelector(".body");
  $("hint")?.remove(); $("thread").append(bubble, ans); scrollDown();

  try {
    let ctx;
    for await (const ev of site.retrieve(q)) {
      if (ev.type === "context") ctx = ev; else onEvent(ev);
      if (ev.type === "search") { step(`Searched ${ev.urls.length} pages`, true); map.highlight(ev.urls); }
      if (ev.type === "step") setPhase(ans, "reading");
    }
    step(ctx.hops ? `Read more pages (${ctx.hops} hop${ctx.hops > 1 ? "s" : ""})` : "Found it in the index");
    map.highlight(ctx.sources.map(s => s.url));

    // Sources show up immediately, so there's something real to look at while the model writes.
    ans.dataset.sources = JSON.stringify(ctx.sources);
    ans.insertAdjacentHTML("beforeend", `<div class="sources"><h3>SOURCES</h3>${ctx.sources.map((s, i) =>
      `<button class="src" style="animation-delay:${i * 70}ms" data-n="${s.n}"><span>${s.n} · ${escapeHtml(s.title)}</span><span>${escapeHtml(new URL(s.url).pathname)}</span></button>`).join("")}</div>`);
    scrollDown();

    const t0 = performance.now();
    setPhase(ans, "writing");
    const msgs = buildMessages(q, ctx.sources, history);
    const show = t => (body.innerHTML = render(t));
    try {
      // Code grounds the answer: cites each sentence's supporting source, drops what no source supports. No second model pass.
      const { text: out, cited } = attribute(await chat(msgs, show, +$("temp").value), ctx.sources.slice(0, PROMPT_SOURCES));
      body.innerHTML = render(out);
      history.push({ role: "user", content: q }, { role: "assistant", content: out });
      if (cited.length) map.highlight(ctx.sources.filter(s => cited.includes(s.n)).map(s => s.url));
      setPhase(ans, "done");
    } catch (err) { // AI service down or rate-limited: still show the best passages
      body.innerHTML = `<p class="note">${escapeHtml(err.message)} Here's what the site says:</p>` + render(ctx.sources.slice(0, 2).map(s => `${s.text.slice(0, 280)}… [${s.n}]`).join("\n\n"));
      setPhase(ans, "fallback");
    }
    ans.insertAdjacentHTML("beforeend", `<div class="trace">retrieve ${ctx.ms} ms · generate ${Math.round(performance.now() - t0)} ms · ${ctx.hops} hop(s) · top score ${ctx.sources[0]?.score ?? "n/a"}</div>`);
    track("answer", { retrieveMs: ctx.ms, generateMs: Math.round(performance.now() - t0), hops: ctx.hops, confident: ctx.confident, abstained: body.textContent.startsWith(NOT_FOUND), qLen: q.length });
  } catch (err) {
    body.textContent = err.message;
    setPhase(ans, "error");
  }
  scrollDown();
});

// ---------- citations open the source, passage highlighted ----------
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
$("thread").addEventListener("click", e => {
  const retry = e.target.closest(".retry");
  if (retry) { if (busy()) return; $("q").value = retry.closest(".a").dataset.q; retry.remove(); $("askForm").requestSubmit(); return; }
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

$("temp").addEventListener("input", e => ($("tempv").value = e.target.value));
