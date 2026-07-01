from __future__ import annotations

import asyncio
import os
import re
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


WORKSPACE = Path(os.getenv("LOCAL_AGENTS_RUNNER_WORKSPACE", "/workspace")).resolve()
MAX_TEXT_BYTES = 1_000_000
MAX_OUTPUT_BYTES = 100_000


class ToolRequest(BaseModel):
    tool: str = Field(pattern="^(list_files|read_file|search_files|write_file|run_command)$")
    arguments: dict = Field(default_factory=dict)


def safe_path(value: str, *, create_parent: bool = False) -> Path:
    candidate = WORKSPACE / value
    if create_parent:
        parent = candidate.parent.resolve()
        if parent != WORKSPACE and WORKSPACE not in parent.parents:
            raise HTTPException(400, "path escapes workspace")
        return parent / candidate.name
    resolved = candidate.resolve()
    if resolved != WORKSPACE and WORKSPACE not in resolved.parents:
        raise HTTPException(400, "path escapes workspace")
    return resolved


def list_files(arguments: dict) -> dict:
    base = safe_path(str(arguments.get("path", ".")))
    if not base.is_dir():
        raise HTTPException(400, "path is not a directory")
    items = []
    for item in sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))[:500]:
        items.append({
            "name": item.name,
            "path": item.relative_to(WORKSPACE).as_posix(),
            "type": "directory" if item.is_dir() else "file",
            "size": item.stat().st_size if item.is_file() else None,
        })
    return {"ok": True, "items": items}


def read_file(arguments: dict) -> dict:
    path = safe_path(str(arguments.get("path", "")))
    if not path.is_file():
        raise HTTPException(400, "file not found")
    if path.stat().st_size > MAX_TEXT_BYTES:
        raise HTTPException(413, "file exceeds 1 MB text limit")
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(415, "file is not UTF-8 text") from exc
    return {"ok": True, "path": path.relative_to(WORKSPACE).as_posix(), "content": content}


def search_files(arguments: dict) -> dict:
    query = str(arguments.get("query", ""))
    if not query or len(query) > 500:
        raise HTTPException(400, "query is required and must be under 500 characters")
    try:
        pattern = re.compile(query)
    except re.error as exc:
        raise HTTPException(400, f"invalid regular expression: {exc}") from exc
    base = safe_path(str(arguments.get("path", ".")))
    matches = []
    for path in base.rglob("*"):
        if len(matches) >= 200:
            break
        if not path.is_file() or ".git" in path.parts or path.stat().st_size > MAX_TEXT_BYTES:
            continue
        try:
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                if pattern.search(line):
                    matches.append({
                        "path": path.relative_to(WORKSPACE).as_posix(),
                        "line": number,
                        "text": line[:500],
                    })
                    if len(matches) >= 200:
                        break
        except (UnicodeDecodeError, OSError):
            continue
    return {"ok": True, "matches": matches, "truncated": len(matches) >= 200}


def write_file(arguments: dict) -> dict:
    path = safe_path(str(arguments.get("path", "")), create_parent=True)
    content = str(arguments.get("content", ""))
    encoded = content.encode("utf-8")
    if len(encoded) > MAX_TEXT_BYTES:
        raise HTTPException(413, "content exceeds 1 MB limit")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".local-agents-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    return {"ok": True, "path": path.relative_to(WORKSPACE).as_posix(), "bytes": len(encoded)}


async def run_command(arguments: dict) -> dict:
    argv = arguments.get("argv")
    if not isinstance(argv, list) or not argv or not all(isinstance(item, str) for item in argv):
        raise HTTPException(400, "argv must be a non-empty string array")
    if len(argv) > 100 or any(len(item) > 10_000 for item in argv):
        raise HTTPException(400, "command is too large")
    cwd = safe_path(str(arguments.get("cwd", ".")))
    if not cwd.is_dir():
        raise HTTPException(400, "cwd is not a directory")
    timeout = max(1, min(int(arguments.get("timeout_seconds", 60)), 120))
    env = {
        "PATH": os.getenv("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": "/tmp/local-agents-home",
        "LANG": "C.UTF-8",
        "NO_COLOR": "1",
    }
    process = await asyncio.create_subprocess_exec(
        *argv,
        cwd=cwd,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except TimeoutError:
        process.kill()
        await process.wait()
        raise HTTPException(408, "command timed out") from None
    return {
        "ok": process.returncode == 0,
        "exit_code": process.returncode,
        "stdout": stdout[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace"),
        "stderr": stderr[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace"),
        "truncated": len(stdout) > MAX_OUTPUT_BYTES or len(stderr) > MAX_OUTPUT_BYTES,
    }


app = FastAPI(title="Local_Agents Runner", docs_url=None, redoc_url=None)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "workspace": WORKSPACE.name}


@app.post("/tools/execute")
async def execute(body: ToolRequest) -> dict:
    handlers = {
        "list_files": list_files,
        "read_file": read_file,
        "search_files": search_files,
        "write_file": write_file,
    }
    if body.tool == "run_command":
        return await run_command(body.arguments)
    return handlers[body.tool](body.arguments)
