"""Structure-aware chunking: strip boilerplate, split on headings, small children for search, parent sections for context."""
import hashlib, re
from collections import Counter
from dataclasses import dataclass

CHILD = 450      # chars searched
PARENT = 2400    # chars handed to the LLM
HEADING = re.compile(r"^(#{1,4})\s+(.*)")


@dataclass
class Chunk:
    text: str      # child text (what we embed / BM25)
    parent: str    # section text (what the LLM reads)
    url: str
    title: str
    path: str      # "Page › H2 › H3"


def _h(s: str) -> str:
    return hashlib.md5(s.strip().lower().encode()).hexdigest()


def boilerplate(pages: list[str], min_pages: int = 3) -> set[str]:
    """Paragraphs repeated on many pages are nav/footer/cookie text."""
    seen = Counter()
    for md in pages:
        seen.update({_h(p) for p in md.split("\n\n") if p.strip()})
    return {h for h, n in seen.items() if n >= min(min_pages, max(2, len(pages)))} if len(pages) > 1 else set()


def sections(md: str):
    """Yield (heading_path, body) per heading section. Tables/code fences never split."""
    path, buf, in_fence = [], [], False
    for line in md.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
        m = None if in_fence else HEADING.match(line)
        if m:
            if buf:
                yield list(path), "\n".join(buf).strip()
            level = len(m.group(1))
            path = path[: level - 1] + [m.group(2).strip()]
            buf = []
        else:
            buf.append(line)
    if buf:
        yield list(path), "\n".join(buf).strip()


def _windows(text: str, size: int):
    """Split on paragraph boundaries into ~size windows; one oversized paragraph (table/code) stays whole."""
    out, cur = [], ""
    for para in text.split("\n\n"):
        if cur and len(cur) + len(para) > size:
            out.append(cur); cur = para
        else:
            cur = f"{cur}\n\n{para}" if cur else para
    if cur:
        out.append(cur)
    return out


def chunk_page(md: str, url: str, title: str, drop: set[str]) -> list[Chunk]:
    md = "\n\n".join(p for p in md.split("\n\n") if _h(p) not in drop)
    out = []
    for path, body in sections(md):
        if len(body) < 40:
            continue
        crumb = " › ".join([title] + path)
        for parent in _windows(body, PARENT):
            for child in _windows(parent, CHILD):
                out.append(Chunk(f"{crumb}\n{child}", parent, url, title, crumb))
    return out


if __name__ == "__main__":
    nav = "Home | Docs | Pricing"
    pages = [f"{nav}\n\n# P{i}\n\n## Install\n\nRun pip install x{i} and then configure the project settings carefully." for i in range(3)]
    drop = boilerplate(pages)
    cs = chunk_page(pages[0], "u", "Site", drop)
    assert cs and all(nav not in c.text for c in cs), "boilerplate leaked"
    assert cs[0].path.startswith("Site › P0"), cs[0].path
    code = "## Code\n\n```\n# not a heading\n" + "x=1\n" * 200 + "```"
    assert len(list(sections(code))) == 1, "fence split"
    print("chunk ok")
