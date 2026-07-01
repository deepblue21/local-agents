from __future__ import annotations

import asyncio
import os
import socket


LISTEN_HOST = os.environ.get("LOCAL_AGENTS_OLLAMA_PROXY_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("LOCAL_AGENTS_OLLAMA_PROXY_LISTEN_PORT", "11435"))
TARGET_HOST = os.environ.get("LOCAL_AGENTS_OLLAMA_PROXY_TARGET_HOST", "::1")
TARGET_PORT = int(os.environ.get("LOCAL_AGENTS_OLLAMA_PROXY_TARGET_PORT", "11434"))


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (ConnectionResetError, OSError):
        pass
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except (ConnectionResetError, OSError):
            pass


async def handle_client(
    client_reader: asyncio.StreamReader,
    client_writer: asyncio.StreamWriter,
) -> None:
    target_reader, target_writer = await asyncio.open_connection(
        TARGET_HOST,
        TARGET_PORT,
        family=socket.AF_INET6,
    )
    try:
        await asyncio.gather(
            pipe(client_reader, target_writer),
            pipe(target_reader, client_writer),
        )
    except (ConnectionResetError, OSError):
        pass


async def main() -> None:
    server = await asyncio.start_server(handle_client, LISTEN_HOST, LISTEN_PORT)
    print(
        f"ollama proxy listening on {LISTEN_HOST}:{LISTEN_PORT} -> [{TARGET_HOST}]:{TARGET_PORT}",
        flush=True,
    )
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
