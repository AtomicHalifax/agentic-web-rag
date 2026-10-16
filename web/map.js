// Constellation of pages. A tiny force layout (repel + link springs + gravity); CSS springs animate the moves.
export function createMap(el, svg) {
  const nodes = new Map(); // url -> {x, y, el, links}
  let edges = [];

  function layout(iter = 80) {
    const W = el.clientWidth, H = el.clientHeight - 40, all = [...nodes.values()];
    for (let t = 0; t < iter; t++) {
      for (const a of all) {
        let fx = (W / 2 - a.x) * 0.01, fy = (H / 2 - a.y) * 0.01;
        for (const b of all) if (a !== b) {
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 1;
          fx += (dx / d2) * 2200; fy += (dy / d2) * 2200;
        }
        for (const l of a.links) { const b = nodes.get(l); if (b) { fx += (b.x - a.x) * 0.004; fy += (b.y - a.y) * 0.004; } }
        if (!a.root) { a.x = Math.max(90, Math.min(W - 90, a.x + fx)); a.y = Math.max(30, Math.min(H - 20, a.y + fy)); }
      }
    }
    for (const n of all) n.el.style.transform = `translate(${n.x - n.el.offsetWidth / 2}px, ${n.y - n.el.offsetHeight / 2}px)`;
    drawEdges();
  }

  function drawEdges() {
    svg.innerHTML = edges.map(([a, b]) => {
      const p = nodes.get(a), q = nodes.get(b);
      return p && q ? `<line data-a="${a}" data-b="${b}" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>` : "";
    }).join("");
  }

  function add(url, title, links = [], root = false) {
    if (nodes.has(url)) return;
    const d = document.createElement("div");
    d.className = "node" + (root ? " root" : "");
    d.textContent = root ? new URL(url).host : (new URL(url).pathname || "/");
    d.title = title || url;
    el.appendChild(d);
    const W = el.clientWidth, H = el.clientHeight;
    const parent = nodes.get(links[0]) || [...nodes.values()][0];
    const n = { el: d, links, root, x: parent ? parent.x + (Math.random() - .5) * 60 : W / 2, y: parent ? parent.y + (Math.random() - .5) * 60 : H / 2 - 20 };
    nodes.set(url, n);
    const from = root ? null : (links.find(l => nodes.has(l)) || [...nodes.keys()][0]);
    if (from && from !== url) edges.push([from, url]);
    requestAnimationFrame(() => layout());
  }

  function highlight(urls, cls = "hot") {
    const set = new Set(urls);
    for (const [u, n] of nodes) n.el.classList.toggle(cls, set.has(u));
    if (cls === "hot") for (const line of svg.querySelectorAll("line")) line.classList.toggle("hot", set.has(line.dataset.b));
  }

  addEventListener("resize", () => layout(20));
  return { add, highlight, has: u => nodes.has(u), size: () => nodes.size };
}
