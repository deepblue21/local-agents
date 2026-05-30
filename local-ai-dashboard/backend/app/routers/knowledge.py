"""Knowledge Base — upload, list, search, Obsidian vault."""

from __future__ import annotations

import asyncio
import hashlib
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..config import get_settings
from ..db import get_conn
from ..services import rag

router = APIRouter(prefix="/api/kb", tags=["knowledge"])


def _human_size(num: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    n = float(num)
    for u in units:
        if n < 1024:
            return f"{n:.1f} {u}".replace(".0 ", " ")
        n /= 1024
    return f"{n:.1f} TB"


@router.get("/docs")
def list_docs() -> list[dict]:
    rows = get_conn().execute(
        "SELECT id, name, source, size, chunks, status, progress FROM kb_docs "
        "ORDER BY created_at DESC"
    ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "source": r["source"],
            "size": _human_size(r["size"]),
            "chunks": r["chunks"],
            "status": r["status"],
            "progress": r["progress"],
        }
        for r in rows
    ]


@router.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    cfg = get_settings()
    storage = cfg.data_path / "kb"
    storage.mkdir(parents=True, exist_ok=True)

    doc_id = uuid.uuid4().hex[:12]
    suffix = Path(file.filename or "upload.txt").suffix or ".txt"
    dest = storage / f"{doc_id}{suffix}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    size = dest.stat().st_size
    source = "pdf" if suffix.lower() == ".pdf" else "markdown"
    get_conn().execute(
        "INSERT INTO kb_docs (id, name, source, size, chunks, status, progress, storage_path) "
        "VALUES (?, ?, ?, ?, 0, 'indexing', 0, ?)",
        (doc_id, file.filename, source, size, str(dest)),
    )
    asyncio.create_task(rag.index_file(doc_id, dest, file.filename or doc_id, source))
    return {"id": doc_id, "name": file.filename, "size": _human_size(size), "status": "indexing"}


@router.delete("/docs/{doc_id}")
async def delete_doc(doc_id: str) -> dict:
    row = get_conn().execute(
        "SELECT storage_path FROM kb_docs WHERE id=?", (doc_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="doc not found")
    if row["storage_path"]:
        try:
            Path(row["storage_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    await rag.delete_doc(doc_id)
    return {"deleted": doc_id}


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


@router.post("/search")
async def search(req: SearchRequest) -> list[dict]:
    return await rag.search(req.query, top_k=req.top_k)


class ObsidianRequest(BaseModel):
    path: str


@router.post("/obsidian")
async def obsidian(req: ObsidianRequest) -> dict:
    folder = Path(req.path).expanduser()
    if not folder.is_dir():
        raise HTTPException(status_code=400, detail="path is not a directory")
    created = await rag.ingest_obsidian_vault(folder)
    return {"created": created, "count": len(created)}
