from __future__ import annotations

import os
from pathlib import Path

import httpx


class RunnerClient:
    def __init__(self, socket_path: Path):
        self.socket_path = socket_path

    async def call(self, tool: str, arguments: dict) -> dict:
        if os.name == "nt" or not self.socket_path.exists():
            raise RuntimeError("isolated runner is unavailable")
        transport = httpx.AsyncHTTPTransport(uds=str(self.socket_path))
        async with httpx.AsyncClient(transport=transport, base_url="http://runner", timeout=65) as client:
            response = await client.post("/tools/execute", json={"tool": tool, "arguments": arguments})
            response.raise_for_status()
            return response.json()


RUNNER_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files under the configured workspace.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string", "default": "."}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a UTF-8 text file from the workspace.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_files",
            "description": "Search workspace text files using a regular expression.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "path": {"type": "string", "default": "."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write UTF-8 text inside the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Run an argument-vector command in the isolated workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "argv": {"type": "array", "items": {"type": "string"}},
                    "cwd": {"type": "string", "default": "."},
                    "timeout_seconds": {"type": "integer", "default": 60},
                },
                "required": ["argv"],
            },
        },
    },
]

TOOL_SCHEMAS = RUNNER_TOOL_SCHEMAS
