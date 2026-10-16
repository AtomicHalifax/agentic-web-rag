"""Per-site hybrid index: dense (bge-small) + BM25, fused with RRF, then cross-encoder rerank.
ponytail: numpy in memory; one site is a few thousand chunks. Swap to Qdrant when sessions must survive restarts."""
import re
from functools import lru_cache

import numpy as np
from rank_bm25 import BM25Okapi

from chunk import Chunk


def tok(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", s.lower())


@lru_cache(1)
def embedder():
    from fastembed import TextEmbedding
    return TextEmbedding("BAAI/bge-small-en-v1.5")


@lru_cache(1)
def reranker():
    from fastembed.rerank.cross_encoder import TextCrossEncoder
    return TextCrossEncoder("Xenova/ms-marco-MiniLM-L-6-v2")


def rrf(scores: np.ndarray, k: int = 60) -> np.ndarray:
    ranks = np.empty(len(scores)); ranks[np.argsort(-scores)] = np.arange(len(scores))
    return 1 / (k + ranks)


class Index:
    def __init__(self, embed=None, rerank=None):
        self.chunks: list[Chunk] = []
        self.vecs = None
        self.bm25 = None
        self._embed = embed or (lambda xs: np.array(list(embedder().embed(xs))))
        self._rerank = rerank or (lambda q, xs: np.array(list(reranker().rerank(q, xs))))

    def add(self, chunks: list[Chunk]):
        if not chunks:
            return
        v = self._embed([c.text for c in chunks])
        self.chunks += chunks
        self.vecs = v if self.vecs is None else np.vstack([self.vecs, v])
        self.bm25 = BM25Okapi([tok(c.text) for c in self.chunks])  # ponytail: full rebuild, fine below ~10k chunks

    def search(self, q: str, k: int = 4, pool: int = 16) -> list[tuple[Chunk, float]]:
        """Returns (chunk, rerank_score) best first, one per parent section."""
        if not self.chunks:
            return []
        dense = self.vecs @ self._embed([q])[0]
        sparse = np.asarray(self.bm25.get_scores(tok(q)))
        top = np.argsort(-(rrf(dense) + rrf(sparse)))[:pool]
        cand = [self.chunks[i] for i in top]
        scores = self._rerank(q, [c.text for c in cand])
        out, seen = [], set()
        for i in np.argsort(-scores):
            c = cand[i]
            if c.parent in seen:
                continue
            seen.add(c.parent); out.append((c, float(scores[i])))
            if len(out) == k:
                break
        return out


if __name__ == "__main__":
    # Fake embedder/reranker: bag of words, so the check runs without downloading models.
    vocab = {}
    def emb(xs):
        rows = []
        for x in xs:
            v = np.zeros(256)
            for t in tok(x):
                v[vocab.setdefault(t, len(vocab) % 256)] += 1
            rows.append(v / (np.linalg.norm(v) or 1))
        return np.array(rows)
    rr = lambda q, xs: np.array([len(set(tok(q)) & set(tok(x))) for x in xs], float)
    ix = Index(emb, rr)
    ix.add([Chunk("Pricing starts at $10 per month", "P", "u/pricing", "S", "S"),
            Chunk("Our team has five engineers", "T", "u/team", "S", "S")])
    assert ix.search("how much does pricing cost")[0][0].url == "u/pricing"
    print("index ok")
