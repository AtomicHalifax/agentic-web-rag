// Guardrails for untrusted input. Page fetching itself happens on Jina's servers, so SSRF is theirs to block;
// we still refuse non-public targets so the app never asks anyone to fetch them.
const ZERO_WIDTH = /[​-‏⁠-⁤﻿]/g;
const INJECTION = /(ignore (all |any )?(previous|prior|above) (instructions|prompts)|disregard .{0,30}instructions|you are now|system prompt|act as (an?|the) |new instructions:|<\s*\/?\s*(system|assistant)\s*>)/i;
const PRIVATE = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|\[?f[cd])/i;
export const MAX_QUESTION = 500;
// Content sits behind a login: any fetcher only sees the sign-in wall.
const WALLED = /(^|\.)(x|twitter|instagram|facebook|linkedin|tiktok|threads|reddit)\.(com|net)$/i;

/** One key per page: no www, no query/hash, no trailing slash. Stops /privacy and /privacy?lang=en becoming two nodes. */
export function norm(u) {
  const x = new URL(u); x.hash = ""; x.search = ""; x.hostname = x.hostname.replace(/^www\./, "");
  return x.href.replace(/\/$/, "");
}

export class Blocked extends Error {}

export function checkUrl(raw) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : "https://" + raw.trim()); }
  catch { throw new Blocked("That doesn't look like a link."); }
  if (!/^https?:$/.test(u.protocol)) throw new Blocked("Only http(s) links work.");
  if (u.port && !["80", "443"].includes(u.port)) throw new Blocked("Only standard web ports work.");
  if (PRIVATE.test(u.hostname) || !u.hostname.includes(".")) throw new Blocked("Private or internal addresses aren't allowed.");
  if (WALLED.test(u.hostname)) throw new Blocked(`${u.hostname.replace(/^www\./, "")} hides its content behind a login, so it can't be read. Try a public site like docs, a blog or a company page.`);
  return norm(u.href);
}

/** Strip invisible chars and lines that try to instruct the model. Returns [clean, linesDropped]. */
export function sanitize(text) {
  let dropped = 0;
  const clean = text.replace(ZERO_WIDTH, "").split("\n").filter(l => (INJECTION.test(l) ? (dropped++, false) : true)).join("\n");
  return [clean, dropped];
}

export function checkQuestion(q) {
  q = (q || "").trim();
  if (!q) throw new Blocked("Ask a question.");
  if (q.length > MAX_QUESTION) throw new Blocked(`Keep questions under ${MAX_QUESTION} characters.`);
  return q;
}
