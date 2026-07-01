from __future__ import annotations

import ipaddress

import httpx
import pytest

from local_agents.web_tools import WebToolClient


async def public_resolver(host: str):
    return [ipaddress.ip_address("93.184.216.34")]


async def private_resolver(host: str):
    return [ipaddress.ip_address("127.0.0.1")]


@pytest.mark.asyncio
async def test_brave_search_parses_results():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-subscription-token"] == "secret"
        return httpx.Response(
            200,
            json={
                "web": {
                    "results": [
                        {
                            "title": "Example Result",
                            "url": "https://example.com/result",
                            "description": "Current information.",
                        }
                    ]
                }
            },
        )

    client = WebToolClient(
        provider="brave",
        brave_api_key="secret",
        transport=httpx.MockTransport(handler),
    )

    result = await client.web_search({"query": "local agents", "max_results": 1})

    assert result["ok"] is True
    assert result["provider"] == "brave"
    assert result["results"] == [
        {
            "title": "Example Result",
            "url": "https://example.com/result",
            "snippet": "Current information.",
        }
    ]


@pytest.mark.asyncio
async def test_duckduckgo_search_parses_lite_results():
    html = """
    <html><body>
      <a href="/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Example A</a>
      <a href="https://duckduckgo.com/settings">Settings</a>
      <a href="https://example.com/b">Example B</a>
    </body></html>
    """

    client = WebToolClient(
        provider="duckduckgo",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text=html)),
    )

    result = await client.web_search({"query": "example", "max_results": 2})

    assert [item["url"] for item in result["results"]] == [
        "https://example.com/a",
        "https://example.com/b",
    ]


@pytest.mark.asyncio
async def test_fetch_url_extracts_readable_html_after_redirect():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/start":
            return httpx.Response(302, headers={"Location": "/final"})
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8"},
            text="<html><head><title>Doc</title><script>ignore()</script></head>"
            "<body><h1>Hello</h1><p>Readable text.</p></body></html>",
        )

    client = WebToolClient(
        provider="duckduckgo",
        transport=httpx.MockTransport(handler),
        resolver=public_resolver,
    )

    result = await client.fetch_url({"url": "https://example.com/start", "max_chars": 5000})

    assert result["url"] == "https://example.com/final"
    assert result["title"] == "Doc"
    assert "Hello Readable text." in result["content"]
    assert "ignore" not in result["content"]


@pytest.mark.asyncio
async def test_fetch_url_rejects_private_resolved_targets():
    client = WebToolClient(
        provider="duckduckgo",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text="nope")),
        resolver=private_resolver,
    )

    with pytest.raises(ValueError, match="private"):
        await client.fetch_url({"url": "https://internal.example/"})
