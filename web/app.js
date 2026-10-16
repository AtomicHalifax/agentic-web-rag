import { createMap } from "./map.js";
import { chat } from "./models.js";
import { API } from "./config.js";
import { buildMessages, render, verify, NOT_FOUND } from "./rag.js";
import { Site } from "./agent.js";
import { checkQuestion } from "./guard.js";
import { defaultModels } from "./search.js";
import { track } from "./telemetry.js";

const $ = id => document.getElementById(id);
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
  else if (ev.type === "page") { map.add(ev.url, ev.title, ev.links); map.highlight([ev.url], "reading"); }
  else if (ev.type === "done") { step(`${ev.pages} pages indexed`); map.highlight([], "reading"); }
  else if (ev.type === "error") throw new Error(ev.text);
}

// ---------- models run on Cloudflare; warming just wakes the Worker so the first real call is fast ----------
let warm = null;
const warmUp = () => (warm ??= defaultModels().then(async m => { m.embed(["warm up"]).catch(() => {}); return m; }));
for (const ev of ["focus", "input"]) $("url").addEventListener(ev, warmUp, { once: true });
for (const b of document.querySelectorAll(".examples button")) b.addEventListener("pointerenter", warmUp, { once: true });

function unlockChat() {
  if (!$("q").disabled) return;
  $("hint").textContent = "Ask anything. I'll keep reading the site while you do.";
  $("q").disabled = false; $("askForm").querySelector("button").disabled = false; $("q").focus();
}

// ---------- start: chat unlocks after the homepage; the rest of the crawl keeps going in the background ----------
async function start(url) {
  $("startErr").textContent = "";
  if (!API) { $("startErr").textContent = "The AI backend isn't deployed yet. See docs/SETUP.md."; return; }
  let s;
  try { s = new Site(url, null); } catch (e) { $("startErr").textContent = e.message; return; }
  document.body.dataset.view = "work"; $("work").hidden = false;
  $("sitePill").hidden = false; $("sitePill").textContent = s.root.replace(/^https?:\/\//, "");
  step("Waking up the search models", true);
  const t0 = performance.now();
  try {
    s.index.m = await warmUp(); site = s;
    for await (const ev of site.ingest()) { onEvent(ev); if (ev.type === "page") unlockChat(); }
    track("ingest", { pages: site.okCount(), chunks: site.index.chunks.length, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    if (site?.okCount()) step(e.message); // partial crawl still usable
    else { document.body.dataset.view = "home"; $("work").hidden = true; $("startErr").textContent = e.message; }
  }
}

$("startForm").addEventListener("submit", e => { e.preventDefault(); start($("url").value.trim()); });
for (const b of document.querySelectorAll(".examples button")) b.addEventListener("click", () => { $("url").value = b.dataset.url; start(b.dataset.url); });

// ---------- ask ----------
// One answer at a time; the input stays usable so you can type the next question meanwhile.
let busy = false;
const send = () => $("askForm").querySelector("button");
const scrollDown = () => $("thread").scrollTo({ top: $("thread").scrollHeight, behavior: "smooth" });

$("askForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (busy || !site) return;
  let q; try { q = checkQuestion($("q").value); } catch { return; }
  busy = true; send().disabled = true; $("q").value = "";
  const bubble = Object.assign(document.createElement("div"), { className: "q", textContent: q });
  const ans = Object.assign(document.createElement("div"), { className: "a" });
  ans.innerHTML = `<div class="status"><span class="dots"><i></i><i></i><i></i></span><span class="status-text">Searching the site</span></div><div class="body"></div>`;
  const status = t => (ans.querySelector(".status-text").textContent = t);
  const body = ans.querySelector(".body");
  $("hint")?.remove(); $("thread").append(bubble, ans); scrollDown();

  try {
    let ctx;
    for await (const ev of site.retrieve(q)) {
      if (ev.type === "context") ctx = ev; else onEvent(ev);
      if (ev.type === "search") { step(`Searched ${ev.urls.length} pages`, true); map.highlight(ev.urls); }
      if (ev.type === "step") status("Reading more pages");
    }
    step(ctx.hops ? `Read more pages (${ctx.hops} hop${ctx.hops > 1 ? "s" : ""})` : "Found it in the index");
    map.highlight(ctx.sources.map(s => s.url));

    // Sources show up immediately, so there's something real to look at while the model writes.
    ans.dataset.sources = JSON.stringify(ctx.sources);
    ans.insertAdjacentHTML("beforeend", `<div class="sources"><h3>SOURCES</h3>${ctx.sources.map((s, i) =>
      `<button class="src" style="animation-delay:${i * 70}ms" data-n="${s.n}"><span>${s.n} · ${escapeHtml(s.title)}</span><span>${escapeHtml(new URL(s.url).pathname)}</span></button>`).join("")}</div>`);
    scrollDown();

    const t0 = performance.now();
    status("Writing the answer");
    const msgs = buildMessages(q, ctx.sources, history);
    const show = t => { ans.classList.add("streaming"); body.innerHTML = render(t); };
    try {
      let out = await chat(msgs, show);
      let check = verify(out, ctx.sources.length);
      if (!check.ok) { // one corrective retry, then abstain rather than show uncited claims
        status("Double-checking citations"); ans.classList.remove("streaming");
        out = await chat([...msgs, { role: "assistant", content: out }, { role: "user", content: "Rewrite: every sentence must end with a source number like [1]. If the sources don't say, reply exactly: " + NOT_FOUND }], show);
        check = verify(out, ctx.sources.length);
        if (!check.ok) out = NOT_FOUND;
      }
      body.innerHTML = render(out);
      history.push({ role: "user", content: q }, { role: "assistant", content: out });
      if (check.cited?.length) map.highlight(ctx.sources.filter(s => check.cited.includes(s.n)).map(s => s.url));
    } catch (err) { // e.g. daily free quota used up: still show the best passages
      body.innerHTML = `<p class="note">${escapeHtml(err.message)} Here's what the site says:</p>` + render(ctx.sources.slice(0, 2).map(s => `${s.text.slice(0, 280)}… [${s.n}]`).join("\n\n"));
    }
    ans.insertAdjacentHTML("beforeend", `<div class="trace">retrieve ${ctx.ms} ms · generate ${Math.round(performance.now() - t0)} ms · ${ctx.hops} hop(s) · top score ${ctx.sources[0]?.score ?? "n/a"}</div>`);
    track("answer", { retrieveMs: ctx.ms, generateMs: Math.round(performance.now() - t0), hops: ctx.hops, confident: ctx.confident, abstained: body.textContent.startsWith(NOT_FOUND), qLen: q.length });
  } catch (err) {
    body.textContent = err.message;
  }
  ans.querySelector(".status")?.remove(); ans.classList.remove("streaming");
  busy = false; send().disabled = false;
  scrollDown();
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
