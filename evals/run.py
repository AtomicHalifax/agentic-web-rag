"""Retrieval evals against a running API. Prints a markdown table; exits 1 if quality drops below the gate.

    python evals/run.py http://localhost:7860

recall@4  = answerable questions whose expected page is in the top-4 sources
abstain   = unanswerable questions where the agent was NOT confident (so the UI says "This site doesn't say")
"""
import json, sys
from pathlib import Path

import httpx

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:7860"
GATE = {"recall@4": 0.6, "abstain": 0.5}


def events(path, body):
    with httpx.stream("POST", API + path, json=body, timeout=300) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if line:
                yield json.loads(line)


def main():
    rows = [json.loads(l) for l in Path(__file__).with_name("golden.jsonl").read_text().splitlines() if l.strip()]
    sessions, hits, abst, n_ans, n_un, lat, out = {}, 0, 0, 0, 0, [], []
    for r in rows:
        if r["site"] not in sessions:
            sessions[r["site"]] = next(e["id"] for e in events("/sites", {"url": r["site"]}) if e["type"] == "session")
        ctx = [e for e in events(f"/sites/{sessions[r['site']]}/retrieve", {"q": r["q"]}) if e["type"] == "context"][0]
        lat.append(ctx["ms"])
        urls = [s["url"] for s in ctx["sources"]]
        if r["answerable"]:
            n_ans += 1; ok = any(r["expect_url"] in u for u in urls); hits += ok
        else:
            n_un += 1; ok = not ctx["confident"]; abst += ok
        out.append(f"| {r['q'][:48]} | {'✓' if ok else '✗'} | {ctx['hops']} | {ctx['ms']} |")
    score = {"recall@4": hits / max(n_ans, 1), "abstain": abst / max(n_un, 1)}
    lat.sort()
    print("| question | pass | hops | ms |\n|---|---|---|---|\n" + "\n".join(out))
    print(f"\n**recall@4 {score['recall@4']:.2f} · abstain {score['abstain']:.2f} · p50 {lat[len(lat)//2]} ms**")
    sys.exit(0 if all(score[k] >= v for k, v in GATE.items()) else 1)


if __name__ == "__main__":
    main()
