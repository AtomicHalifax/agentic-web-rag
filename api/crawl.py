"""Fetch pages politely, turn them into clean markdown, and rank which links to follow next."""
import re
from urllib.parse import urljoin, urldefrag, urlparse

import httpx
import trafilatura

from guard import Blocked, check_url, robots_allows, sanitize

MAX_BYTES = 2_000_000
UA = {"User-Agent": "agentic-web-rag/0.1 (+https://github.com/AtomicHalifax/agentic-web-rag)"}
SKIP = re.compile(r"\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|xml)$|/(login|signin|signup|cart|checkout|account)\b", re.I)
_client = httpx.Client(headers=UA, timeout=10, follow_redirects=True)


def _get(url: str) -> str | None:
    try:
        r = _client.get(url)
    except httpx.HTTPError:
        return None
    if r.status_code != 200 or "text/html" not in r.headers.get("content-type", "text/html") or len(r.content) > MAX_BYTES:
        return None
    return r.text


def _get_text(url: str) -> str | None:
    try:
        r = _client.get(url)
        return r.text if r.status_code == 200 else None
    except httpx.HTTPError:
        return None


def same_site(a: str, b: str) -> bool:
    return urlparse(a).netloc.removeprefix("www.") == urlparse(b).netloc.removeprefix("www.")


def links(html: str, base: str) -> list[str]:
    out = []
    for href in re.findall(r'href=["\']([^"\'#][^"\']*)["\']', html):
        u = urldefrag(urljoin(base, href))[0].rstrip("/")
        if u.startswith("http") and same_site(u, base) and not SKIP.search(u):
            out.append(u)
    return list(dict.fromkeys(out))


def sitemap(root: str) -> list[str]:
    xml = _get_text(root.rstrip("/") + "/sitemap.xml") or ""
    return [u.rstrip("/") for u in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml) if same_site(u, root)][:200]


def fetch(url: str) -> dict | None:
    """One page -> {url, title, md, links, dropped}. None if blocked, disallowed, or empty."""
    try:
        check_url(url)
    except Blocked:
        return None
    if not robots_allows(url, _get_text):
        return None
    html = _get(url)
    if not html:
        return None
    md = trafilatura.extract(html, output_format="markdown", include_tables=True, include_links=False, favor_recall=True) or ""
    meta = trafilatura.extract_metadata(html)
    md, dropped = sanitize(md)
    if len(md) < 80:
        return None
    return {"url": url, "title": (meta and meta.title) or urlparse(url).path or url, "md": md, "links": links(html, url), "dropped": dropped}


def rank(frontier: list[str], hint: str) -> list[str]:
    """Cheap relevance: words of the question that appear in the URL path, shallower first."""
    words = {w for w in re.findall(r"[a-z0-9]{3,}", hint.lower())}
    def score(u):
        path = urlparse(u).path.lower()
        return (-sum(w in path for w in words), path.count("/"), len(path))
    return sorted(frontier, key=score)


if __name__ == "__main__":
    html = '<a href="/docs/install">x</a><a href="https://other.com/a">y</a><a href="/logo.png">z</a><a href="/login">l</a>'
    assert links(html, "https://ex.com/") == ["https://ex.com/docs/install"]
    assert rank(["https://e.com/blog/x", "https://e.com/pricing"], "how much is pricing")[0].endswith("pricing")
    print("crawl ok")
