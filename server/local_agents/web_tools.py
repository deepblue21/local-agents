from __future__ import annotations

import asyncio
import html
import ipaddress
import re
import socket
from collections.abc import Awaitable, Callable
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse

import httpx


BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
DUCKDUCKGO_LITE_URL = "https://lite.duckduckgo.com/lite/"
MAX_QUERY_CHARS = 500
MAX_RESULTS = 10
MAX_FETCH_BYTES = 1_000_000
MAX_FETCH_CHARS = 20_000


WEB_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the public web for current information. Return result titles, URLs, "
                "and snippets. Use this before answering questions that need up-to-date facts."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_results": {"type": "integer", "default": 5, "minimum": 1, "maximum": 10},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": (
                "Fetch and extract readable text from one public HTTP or HTTPS URL. Use only "
                "after web_search or when the user supplies a URL. Cite the URL in the answer."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "max_chars": {
                        "type": "integer",
                        "default": 12000,
                        "minimum": 1000,
                        "maximum": 20000,
                    },
                },
                "required": ["url"],
            },
        },
    },
]


Resolver = Callable[[str], Awaitable[list[ipaddress.IPv4Address | ipaddress.IPv6Address]]]


class SearchAnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.anchors: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self._href = href
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "a" or not self._href:
            return
        text = normalize_text(" ".join(self._text))
        if text:
            self.anchors.append((self._href, text))
        self._href = None
        self._text = []


class ReadableTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in {"p", "br", "div", "li", "tr", "h1", "h2", "h3", "section", "article"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in {"p", "li", "tr", "h1", "h2", "h3", "section", "article"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._in_title:
            self.title_parts.append(data)
        self.parts.append(data)

    @property
    def title(self) -> str:
        return normalize_text(" ".join(self.title_parts))

    @property
    def text(self) -> str:
        return normalize_text(" ".join(self.parts))


def normalize_text(value: str) -> str:
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


async def default_resolver(host: str) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    def resolve() -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
        addresses: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
        for info in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM):
            addresses.append(ipaddress.ip_address(info[4][0]))
        return addresses

    return await asyncio.to_thread(resolve)


def clamp_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(number, maximum))


def validate_query(value: Any) -> str:
    query = str(value or "").strip()
    if not query:
        raise ValueError("query is required")
    if len(query) > MAX_QUERY_CHARS:
        raise ValueError("query is too long")
    return query


def normalize_http_url(value: Any) -> str:
    url = str(value or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("url must be an absolute HTTP or HTTPS URL")
    if parsed.username or parsed.password:
        raise ValueError("url credentials are not allowed")
    return url


def clean_duckduckgo_href(href: str) -> str | None:
    href = html.unescape(href)
    absolute = urljoin("https://duckduckgo.com", href)
    parsed = urlparse(absolute)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        if target:
            absolute = target
            parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    if parsed.netloc.endswith("duckduckgo.com"):
        return None
    return absolute


class WebToolClient:
    def __init__(
        self,
        *,
        provider: str = "duckduckgo",
        brave_api_key: str | None = None,
        timeout_seconds: float = 10.0,
        allow_private_fetch: bool = False,
        transport: httpx.AsyncBaseTransport | None = None,
        resolver: Resolver = default_resolver,
    ) -> None:
        self.provider = provider.strip().lower()
        self.brave_api_key = brave_api_key.strip() if brave_api_key else None
        self.timeout_seconds = timeout_seconds
        self.allow_private_fetch = allow_private_fetch
        self.transport = transport
        self.resolver = resolver

    @property
    def enabled(self) -> bool:
        if self.provider in {"disabled", "off", "none"}:
            return False
        if self.provider == "brave":
            return bool(self.brave_api_key)
        return self.provider == "duckduckgo"

    @property
    def schemas(self) -> list[dict]:
        return WEB_TOOL_SCHEMAS if self.enabled else []

    def handles(self, tool: str) -> bool:
        return tool in {"web_search", "fetch_url"}

    async def call(self, tool: str, arguments: dict) -> dict:
        if not self.enabled:
            raise RuntimeError("web tools are not configured")
        if tool == "web_search":
            return await self.web_search(arguments)
        if tool == "fetch_url":
            return await self.fetch_url(arguments)
        raise KeyError(tool)

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=self.timeout_seconds,
            transport=self.transport,
            headers={
                "User-Agent": "Local_Agents/0.1 web research (+https://localagents.local)",
                "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5",
            },
        )

    async def web_search(self, arguments: dict) -> dict:
        query = validate_query(arguments.get("query"))
        limit = clamp_int(arguments.get("max_results"), default=5, minimum=1, maximum=MAX_RESULTS)
        if self.provider == "brave":
            return await self._brave_search(query, limit)
        if self.provider == "duckduckgo":
            return await self._duckduckgo_search(query, limit)
        raise RuntimeError(f"unsupported web search provider: {self.provider}")

    async def _brave_search(self, query: str, limit: int) -> dict:
        if not self.brave_api_key:
            raise RuntimeError("Brave Search API key is not configured")
        async with self._client() as client:
            response = await client.get(
                BRAVE_SEARCH_URL,
                params={"q": query, "count": limit},
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": self.brave_api_key,
                },
            )
            response.raise_for_status()
        data = response.json()
        results = []
        for item in (data.get("web") or {}).get("results", [])[:limit]:
            url = item.get("url")
            title = normalize_text(item.get("title") or "")
            if not url or not title:
                continue
            results.append(
                {
                    "title": title,
                    "url": url,
                    "snippet": normalize_text(item.get("description") or ""),
                }
            )
        return {"ok": True, "provider": "brave", "query": query, "results": results}

    async def _duckduckgo_search(self, query: str, limit: int) -> dict:
        async with self._client() as client:
            response = await client.get(DUCKDUCKGO_LITE_URL, params={"q": query})
            response.raise_for_status()
        parser = SearchAnchorParser()
        parser.feed(response.text)
        seen: set[str] = set()
        results = []
        for href, title in parser.anchors:
            url = clean_duckduckgo_href(href)
            if not url or url in seen:
                continue
            seen.add(url)
            results.append({"title": title, "url": url, "snippet": ""})
            if len(results) >= limit:
                break
        return {"ok": True, "provider": "duckduckgo", "query": query, "results": results}

    async def fetch_url(self, arguments: dict) -> dict:
        url = normalize_http_url(arguments.get("url"))
        max_chars = clamp_int(
            arguments.get("max_chars"),
            default=12_000,
            minimum=1_000,
            maximum=MAX_FETCH_CHARS,
        )
        final_url, content_type, body, byte_truncated = await self._safe_fetch(url)
        text, title = extract_readable_text(body, content_type)
        char_truncated = len(text) > max_chars
        return {
            "ok": True,
            "url": final_url,
            "title": title,
            "content_type": content_type,
            "content": text[:max_chars],
            "truncated": byte_truncated or char_truncated,
        }

    async def _safe_fetch(self, url: str) -> tuple[str, str, bytes, bool]:
        current = url
        async with self._client() as client:
            for _ in range(4):
                await self._validate_public_target(current)
                async with client.stream("GET", current, follow_redirects=False) as response:
                    if 300 <= response.status_code < 400:
                        location = response.headers.get("location")
                        if not location:
                            raise RuntimeError("redirect response has no Location header")
                        current = normalize_http_url(urljoin(current, location))
                        continue
                    response.raise_for_status()
                    content_type = response.headers.get("content-type", "").split(";")[0].strip()
                    body = bytearray()
                    truncated = False
                    async for chunk in response.aiter_bytes():
                        if len(body) + len(chunk) > MAX_FETCH_BYTES:
                            remaining = MAX_FETCH_BYTES - len(body)
                            if remaining > 0:
                                body.extend(chunk[:remaining])
                            truncated = True
                            break
                        body.extend(chunk)
                    return str(response.url), content_type, bytes(body), truncated
        raise RuntimeError("too many redirects")

    async def _validate_public_target(self, url: str) -> None:
        if self.allow_private_fetch:
            return
        parsed = urlparse(url)
        host = (parsed.hostname or "").strip().lower()
        if not host:
            raise ValueError("url host is required")
        if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
            raise ValueError("private hosts are not allowed")
        try:
            ip = ipaddress.ip_address(host)
            addresses = [ip]
        except ValueError:
            try:
                ascii_host = host.encode("idna").decode("ascii")
                addresses = await self.resolver(ascii_host)
            except OSError as exc:
                raise ValueError(f"could not resolve url host: {host}") from exc
        if not addresses or any(not address.is_global for address in addresses):
            raise ValueError("private or non-public network targets are not allowed")


def extract_readable_text(body: bytes, content_type: str) -> tuple[str, str]:
    text = body.decode("utf-8", errors="replace")
    if "html" not in content_type.lower():
        return normalize_text(text), ""
    parser = ReadableTextParser()
    parser.feed(text)
    return parser.text, parser.title
