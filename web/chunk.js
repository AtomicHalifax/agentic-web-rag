// Structure-aware chunking: strip boilerplate, split on headings, small children to search, parent sections to read.
export const CHILD = 450, PARENT = 2400;
const HEADING = /^(#{1,4})\s+(.*)/;
const key = s => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Paragraphs repeated across pages are nav/footer/cookie text. */
export function boilerplate(pages, minPages = 3) {
  if (pages.length < 2) return new Set();
  const seen = new Map();
  for (const md of pages) for (const p of new Set(md.split("\n\n").filter(x => x.trim()).map(key))) seen.set(p, (seen.get(p) || 0) + 1);
  const need = Math.min(minPages, Math.max(2, pages.length));
  return new Set([...seen].filter(([, n]) => n >= need).map(([p]) => p));
}

/** [{path:[h1,h2..], body}] per heading section. Code fences are never split. */
export function sections(md) {
  const out = []; let path = [], buf = [], fence = false;
  for (const line of md.split("\n")) {
    if (line.trim().startsWith("```")) fence = !fence;
    const m = !fence && line.match(HEADING);
    if (m) {
      if (buf.length) out.push({ path: [...path], body: buf.join("\n").trim() });
      path = [...path.slice(0, m[1].length - 1), m[2].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim()]; buf = [];
    } else buf.push(line);
  }
  if (buf.length) out.push({ path: [...path], body: buf.join("\n").trim() });
  return out;
}

/** Split on paragraph boundaries into ~size windows; one oversized paragraph (table/code) stays whole. */
function windows(text, size) {
  const out = []; let cur = "";
  for (const p of text.split("\n\n")) {
    if (cur && cur.length + p.length > size) { out.push(cur); cur = p; } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

const stripLinks = md => md.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

export function chunkPage(md, url, title, drop = new Set()) {
  md = stripLinks(md.split("\n\n").filter(p => !drop.has(key(p))).join("\n\n"));
  const out = [];
  for (const { path, body } of sections(md)) {
    if (body.length < 40) continue;
    const crumb = [title, ...path].join(" › ");
    for (const parent of windows(body, PARENT))
      for (const child of windows(parent, CHILD)) out.push({ text: `${crumb}\n${child}`, parent, url, title, path: crumb });
  }
  return out;
}
