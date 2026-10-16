// URL of the Cloudflare Worker. The deploy workflow rewrites this line with the real workers.dev URL.
export const API = typeof location !== "undefined" && location.hostname === "localhost" ? "http://localhost:8787" : "";
