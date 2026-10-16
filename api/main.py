"""HTTP surface. Streams NDJSON so the UI can animate every crawl and search step as it happens."""
import json, os, time, uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import telemetry
from agent import Site
from guard import Blocked, RateLimit, check_question, check_url

app = FastAPI(title="agentic-web-rag")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
telemetry.setup(app)

SITES: dict[str, Site] = {}   # ponytail: in-memory, one replica. Redis/Qdrant when scaling out.
SESSION_TTL = 3600
MAX_SITES = 50
limit = RateLimit(int(os.getenv("RATE_PER_MIN", "20")))


class Start(BaseModel):
    url: str


class Ask(BaseModel):
    q: str


def _ip(req: Request) -> str:
    return (req.headers.get("x-forwarded-for") or req.client.host).split(",")[0].strip()


def _gate(req: Request):
    if not limit.allow(_ip(req)):
        raise HTTPException(429, "Too many requests, slow down a little.")


def _gc():
    now = time.time()
    for sid in [s for s, site in SITES.items() if now - site.created > SESSION_TTL]:
        SITES.pop(sid, None)
    while len(SITES) >= MAX_SITES:
        SITES.pop(min(SITES, key=lambda s: SITES[s].created))


def _stream(gen, name, **attrs):
    def run():
        with telemetry.span(name, **attrs) as s:
            n = 0
            for ev in gen:
                n += 1
                if s is not None and ev["type"] in ("done", "context"):
                    for k in ("pages", "chunks", "ms", "hops", "confident"):
                        if k in ev:
                            s.set_attribute(f"rag.{k}", ev[k])
                yield json.dumps(ev) + "\n"
    return StreamingResponse(run(), media_type="application/x-ndjson")


@app.get("/health")
def health():
    return {"ok": True, "sites": len(SITES)}


@app.post("/sites")
def start(body: Start, req: Request):
    _gate(req)
    try:
        url = check_url(body.url if "://" in body.url else "https://" + body.url)
    except Blocked as e:
        raise HTTPException(400, str(e))
    _gc()
    sid = uuid.uuid4().hex
    SITES[sid] = site = Site(url)
    def gen():
        yield {"type": "session", "id": sid, "root": url}
        yield from site.ingest()
    return _stream(gen(), "ingest")


@app.post("/sites/{sid}/retrieve")
def retrieve(sid: str, body: Ask, req: Request):
    _gate(req)
    site = SITES.get(sid)
    if not site:
        raise HTTPException(404, "Session expired. Paste the link again.")
    try:
        q = check_question(body.q)
    except Blocked as e:
        raise HTTPException(400, str(e))
    return _stream(site.retrieve(q), "retrieve", **{"rag.q_len": len(q)})
