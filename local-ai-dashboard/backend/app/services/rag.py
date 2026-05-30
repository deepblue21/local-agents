"""Knowledge Base / RAG service — chunk, embed, store in Qdrant."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import uuid
from pathlib import Path
from typing import Any, Iterable

from ..config import get_settings
from ..db import get_conn

log = logging.getLogger("rag")

# Lazy imports to avoid heavy startup cost when RAG isn't used.
_embedder = None
_qdrant = None
_collection_ready = False


def _get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer

        log.info("loading embedding model %s", get_settings().embedding_model)
        _embedder = SentenceTransformer(get_settings().embedding_model)
    return _embedder


def _get_qdrant():
    global _qdrant
    if _qdrant is None:
        from qdrant_client import QdrantClient

        _qdrant = QdrantClient(url=get_settings().qdrant_url)
    return _qdrant


def _ensure_collection() -> None:
    global _collection_ready
    if _collection_ready:
        return
    from qdrant_client.http import models as qm

    cfg = get_settings()
    client = _get_qdrant()
    try:
        client.get_collection(cfg.kb_collection)
    except Exception:
        client.create_collection(
            collection_name=cfg.kb_collection,
            vectors_config=qm.VectorParams(size=1024, distance=qm.Distance.COSINE),
        )
    _collection_ready = True


# ── Parsing ──────────────────────────────────────────────────────────────


def _read_pdf(path: Path) -> str:
    from pypdf import PdfReader

    text = []
    reader = PdfReader(str(path))
    for page in reader.pages:
        try:
            text.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n\n".join(text)


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def parse_file(path: Path) -> tuple[str, str]:
    """Return (text, source_label). source ∈ {"pdf", "markdown", "obsidian", "text"}."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _read_pdf(path), "pdf"
    if suffix in {".md", ".markdown"}:
        return _read_text(path), "markdown"
    return _read_text(path), "text"


# ── Chunking ─────────────────────────────────────────────────────────────


def chunk_text(text: str, size: int = 600, overlap: int = 60) -> list[str]:
    """Token-ish chunker: counts whitespace-separated 'words' as a proxy."""
    words = re.split(r"\s+", text.strip())
    chunks: list[str] = []
    i = 0
    while i < len(words):
        piece = " ".join(words[i : i + size]).strip()
        if piece:
            chunks.append(piece)
        i += max(1, size - overlap)
    return chunks


# ── Indexing pipeline ────────────────────────────────────────────────────


async def index_file(doc_id: str, path: Path, name: str, source: str = "") -> None:
    """Embed + upsert into Qdrant; update kb_docs progress row."""
    cfg = get_settings()
    text, parsed_source = await asyncio.to_thread(parse_file, path)
    source = source or parsed_source
    chunks = chunk_text(text, cfg.chunk_size, cfg.chunk_overlap)

    conn = get_conn()
    conn.execute(
        "UPDATE kb_docs SET chunks=?, source=?, status='indexing', progress=0 WHERE id=?",
        (len(chunks), source, doc_id),
    )

    if not chunks:
        conn.execute("UPDATE kb_docs SET status='active', progress=100 WHERE id=?", (doc_id,))
        return

    _ensure_collection()
    embedder = _get_embedder()
    client = _get_qdrant()
    batch = 16
    points = []
    for start in range(0, len(chunks), batch):
        slice_ = chunks[start : start + batch]
        vectors = await asyncio.to_thread(embedder.encode, slice_, normalize_embeddings=True)
        for i, (chunk, vec) in enumerate(zip(slice_, vectors)):
            points.append(
                {
                    "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{doc_id}/{start + i}")),
                    "vector": vec.tolist(),
                    "payload": {
                        "doc_id": doc_id,
                        "doc_name": name,
                        "chunk_index": start + i,
                        "text": chunk[:2000],
                    },
                }
            )
        progress = round(min(100, ((start + len(slice_)) / len(chunks)) * 100), 1)
        conn.execute("UPDATE kb_docs SET progress=? WHERE id=?", (progress, doc_id))

    if points:
        await asyncio.to_thread(
            client.upsert,
            collection_name=cfg.kb_collection,
            points=points,
        )
    conn.execute("UPDATE kb_docs SET status='active', progress=100 WHERE id=?", (doc_id,))


async def search(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    _ensure_collection()
    embedder = _get_embedder()
    client = _get_qdrant()
    cfg = get_settings()
    vec = await asyncio.to_thread(embedder.encode, query, normalize_embeddings=True)
    hits = await asyncio.to_thread(
        client.search,
        collection_name=cfg.kb_collection,
        query_vector=vec.tolist(),
        limit=top_k,
    )
    return [
        {
            "score": float(h.score),
            "doc_id": h.payload.get("doc_id"),
            "doc_name": h.payload.get("doc_name"),
            "text": h.payload.get("text"),
            "chunk_index": h.payload.get("chunk_index"),
        }
        for h in hits
    ]


async def delete_doc(doc_id: str) -> None:
    from qdrant_client.http import models as qm

    _ensure_collection()
    client = _get_qdrant()
    cfg = get_settings()
    await asyncio.to_thread(
        client.delete,
        collection_name=cfg.kb_collection,
        points_selector=qm.FilterSelector(
            filter=qm.Filter(
                must=[qm.FieldCondition(key="doc_id", match=qm.MatchValue(value=doc_id))]
            )
        ),
    )
    get_conn().execute("DELETE FROM kb_docs WHERE id=?", (doc_id,))


# ── Obsidian vault ingest ────────────────────────────────────────────────


async def ingest_obsidian_vault(folder: Path) -> list[str]:
    """Walk an Obsidian vault, register each note as a KB doc, kick off indexing."""
    if not folder.exists() or not folder.is_dir():
        raise FileNotFoundError(folder)
    notes = list(folder.rglob("*.md"))
    created: list[str] = []
    conn = get_conn()
    for note in notes:
        if note.name.startswith("."):
            continue
        doc_id = hashlib.sha1(str(note).encode()).hexdigest()[:12]
        size = note.stat().st_size
        conn.execute(
            "INSERT OR REPLACE INTO kb_docs (id, name, source, size, chunks, status, progress, storage_path) "
            "VALUES (?, ?, 'obsidian', ?, 0, 'indexing', 0, ?)",
            (doc_id, note.name, size, str(note)),
        )
        created.append(doc_id)
        asyncio.create_task(index_file(doc_id, note, note.name, "obsidian"))
    return created
