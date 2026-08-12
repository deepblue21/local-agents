"""Web console: static delivery, browser session auth, and CSRF handling.

The browser client uses a different credential path from Android — an HttpOnly
refresh cookie plus an in-memory access token — so these tests pin the properties
that make that path safe: the refresh token never appears in a response body, the
cookie is HttpOnly and SameSite-restricted, cookie-authenticated routes require the
CSRF header, and the served pages carry a CSP with no inline-script escape hatch.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from local_agents.app import CSRF_COOKIE, REFRESH_COOKIE, create_app, derive_session_title
from local_agents.config import Settings
from local_agents.webapp import ASSETS

ADMIN = "b" * 40


def make_settings(tmp_path, **overrides) -> Settings:
    base = dict(
        database=tmp_path / "local_agents.db",
        admin_token=ADMIN,
        public_url="https://agents.example.test",
        ollama_url="http://127.0.0.1:9",
        nova_url=None,
    )
    base.update(overrides)
    return Settings(**base)


def make_client(tmp_path, **overrides) -> TestClient:
    return TestClient(
        create_app(make_settings(tmp_path, **overrides)),
        client=("127.0.0.1", 51000),
    )


def pairing_code(client: TestClient) -> str:
    response = client.post("/api/v1/admin/pairing", headers={"X-Admin-Token": ADMIN})
    assert response.status_code == 200
    return response.json()["code"]


def start_web_session(client: TestClient) -> tuple[str, str]:
    response = client.post(
        "/api/v1/web/session",
        json={"code": pairing_code(client), "device_name": "Browser"},
    )
    assert response.status_code == 200
    body = response.json()
    return body["access_token"], body["csrf_token"]


# --------------------------------------------------------------- static assets


def test_console_and_assets_are_served_with_a_strict_csp(tmp_path):
    with make_client(tmp_path) as client:
        page = client.get("/app")
        assert page.status_code == 200
        csp = page.headers["content-security-policy"]
        # No inline-script escape hatch: an injected string cannot execute.
        assert "script-src 'self'" in csp
        assert "unsafe-inline" not in csp
        assert "default-src 'none'" in csp
        assert "frame-ancestors 'none'" in csp

        asset = client.get("/assets/console.js")
        assert asset.status_code == 200
        assert asset.headers["content-type"].startswith("text/javascript")
        assert client.get("/manifest.webmanifest").status_code == 200
        assert client.get("/sw.js").status_code == 200


def test_service_worker_may_call_fetch(tmp_path):
    """A worker runs under the CSP of its own script response.

    Serving `sw.js` under the load-nothing API policy leaves `connect-src` at
    `'none'`, which blocks every fetch inside the worker and makes navigation in the
    installed app fail outright.
    """
    with make_client(tmp_path) as client:
        csp = client.get("/sw.js").headers["content-security-policy"]
        assert "connect-src 'self'" in csp
        assert "unsafe-inline" not in csp


def test_api_responses_declare_a_load_nothing_policy(tmp_path):
    with make_client(tmp_path) as client:
        response = client.get("/health")
        csp = response.headers["content-security-policy"]
        assert csp.startswith("default-src 'none'")
        assert "script-src" not in csp
        assert response.headers["x-frame-options"] == "DENY"


def test_asset_route_cannot_reach_outside_the_bundle(tmp_path):
    with make_client(tmp_path) as client:
        for name in ("../config.py", "..%2Fconfig.py", "app.py", "index.html", "admin.html"):
            assert client.get(f"/assets/{name}").status_code == 404


def test_assets_revalidate_with_an_etag(tmp_path):
    with make_client(tmp_path) as client:
        first = client.get("/assets/console.css")
        etag = first.headers["etag"]
        assert first.headers["cache-control"] == "no-cache"
        second = client.get("/assets/console.css", headers={"If-None-Match": etag})
        assert second.status_code == 304


def test_root_redirects_to_the_console(tmp_path):
    with make_client(tmp_path) as client:
        response = client.get("/", follow_redirects=False)
        assert response.status_code == 307
        assert response.headers["location"] == "/app"


def test_console_can_be_disabled(tmp_path):
    with make_client(tmp_path, web_console_enabled=False) as client:
        assert client.get("/app").status_code == 404
        assert client.get("/manifest.webmanifest").status_code == 404
        assert client.get("/health").json()["console"] is False
        assert client.post("/api/v1/web/session", json={"code": "x" * 30}).status_code == 404
        # The admin page stays reachable so pairing an Android device still works.
        assert client.get("/admin").status_code == 200


def test_bundle_contains_no_inline_handlers():
    """The CSP forbids inline script; markup with onclick= would silently break."""
    for name in ("index.html", "admin.html"):
        body = ASSETS[name].body.decode("utf-8")
        assert "<script>" not in body
        assert "onclick=" not in body.lower()


# --------------------------------------------------------------- session auth


def test_web_session_keeps_the_refresh_token_out_of_script_reach(tmp_path):
    with make_client(tmp_path) as client:
        response = client.post(
            "/api/v1/web/session",
            json={"code": pairing_code(client), "device_name": "Browser"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "refresh_token" not in body
        assert body["access_token"] and body["csrf_token"]

        cookies = "; ".join(response.headers.get_list("set-cookie"))
        assert f"{REFRESH_COOKIE}=" in cookies
        assert "HttpOnly" in cookies
        assert "SameSite=strict" in cookies.replace("samesite", "SameSite")
        assert "Path=/api/v1/web" in cookies

        refresh_cookie = next(
            item for item in response.headers.get_list("set-cookie") if item.startswith(REFRESH_COOKIE)
        )
        csrf_cookie = next(
            item for item in response.headers.get_list("set-cookie") if item.startswith(CSRF_COOKIE)
        )
        # The CSRF value must stay script-readable so the console can echo it back.
        assert "HttpOnly" in refresh_cookie
        assert "HttpOnly" not in csrf_cookie


def test_access_token_from_a_web_session_drives_the_normal_api(tmp_path):
    with make_client(tmp_path) as client:
        access, _ = start_web_session(client)
        headers = {"Authorization": f"Bearer {access}"}
        assert client.get("/api/v1/sessions", headers=headers).status_code == 200
        assert client.get("/api/v1/capabilities", headers=headers).json()["web_console"] is True


def test_web_refresh_requires_the_csrf_header(tmp_path):
    with make_client(tmp_path) as client:
        _, csrf = start_web_session(client)

        assert client.post("/api/v1/web/refresh").status_code == 403
        assert client.post(
            "/api/v1/web/refresh", headers={"X-CSRF-Token": "wrong"}
        ).status_code == 403

        rotated = client.post("/api/v1/web/refresh", headers={"X-CSRF-Token": csrf})
        assert rotated.status_code == 200
        assert rotated.json()["access_token"]


def test_web_refresh_rotates_and_rejects_replay(tmp_path):
    with make_client(tmp_path) as client:
        _, csrf = start_web_session(client)
        stale_refresh = client.cookies.get(REFRESH_COOKIE)

        first = client.post("/api/v1/web/refresh", headers={"X-CSRF-Token": csrf})
        assert first.status_code == 200
        assert client.cookies.get(REFRESH_COOKIE) != stale_refresh

        # Replaying the consumed refresh token must fail. It must *not* clear the
        # cookies: see test_a_lost_refresh_race_does_not_clear_the_winner_s_cookie.
        client.cookies.set(REFRESH_COOKIE, stale_refresh, path="/api/v1/web")
        replay = client.post(
            "/api/v1/web/refresh", headers={"X-CSRF-Token": client.cookies.get(CSRF_COOKIE)}
        )
        assert replay.status_code == 401


def test_a_lost_refresh_race_does_not_clear_the_winner_s_cookie(tmp_path):
    """Two tabs reloading together must not log the whole browser out.

    Both present the same refresh token; one rotates it and the other gets a 401.
    If that 401 cleared the cookies it would delete the token the winning tab had
    just been issued, ending the session for every tab at once.
    """
    with make_client(tmp_path) as client:
        _, csrf = start_web_session(client)
        shared_refresh = client.cookies.get(REFRESH_COOKIE)

        winner = client.post("/api/v1/web/refresh", headers={"X-CSRF-Token": csrf})
        assert winner.status_code == 200
        rotated = client.cookies.get(REFRESH_COOKIE)
        assert rotated != shared_refresh

        # The second tab still holds the now-spent token.
        client.cookies.set(REFRESH_COOKIE, shared_refresh, path="/api/v1/web")
        loser = client.post(
            "/api/v1/web/refresh", headers={"X-CSRF-Token": client.cookies.get(CSRF_COOKIE)}
        )
        assert loser.status_code == 401
        assert not loser.headers.get_list("set-cookie")

        # The rotated token is untouched, so a retry succeeds.
        client.cookies.set(REFRESH_COOKIE, rotated, path="/api/v1/web")
        retry = client.post(
            "/api/v1/web/refresh", headers={"X-CSRF-Token": client.cookies.get(CSRF_COOKIE)}
        )
        assert retry.status_code == 200


def test_web_refresh_without_a_session_is_rejected(tmp_path):
    with make_client(tmp_path) as client:
        client.cookies.set(CSRF_COOKIE, "orphan-csrf", path="/")
        response = client.post("/api/v1/web/refresh", headers={"X-CSRF-Token": "orphan-csrf"})
        assert response.status_code == 401


def test_web_logout_revokes_the_refresh_token(tmp_path):
    with make_client(tmp_path) as client:
        _, csrf = start_web_session(client)
        refresh = client.cookies.get(REFRESH_COOKIE)

        assert client.post("/api/v1/web/logout").status_code == 403
        assert client.post("/api/v1/web/logout", headers={"X-CSRF-Token": csrf}).status_code == 200

        client.cookies.set(REFRESH_COOKIE, refresh, path="/api/v1/web")
        client.cookies.set(CSRF_COOKIE, csrf, path="/")
        assert client.post(
            "/api/v1/web/refresh", headers={"X-CSRF-Token": csrf}
        ).status_code == 401


def test_web_session_rejects_a_used_pairing_code(tmp_path):
    with make_client(tmp_path) as client:
        code = pairing_code(client)
        assert client.post(
            "/api/v1/web/session", json={"code": code, "device_name": "Browser"}
        ).status_code == 200
        assert client.post(
            "/api/v1/web/session", json={"code": code, "device_name": "Browser"}
        ).status_code == 401


def test_web_session_cookies_follow_the_request_scheme(tmp_path):
    """Secure is set for HTTPS callers and omitted for plain-HTTP local access.

    Forcing Secure from `public_url` would break the console on the plain-HTTP
    tailnet address, because the browser would refuse to return the cookie.
    """
    with make_client(tmp_path) as client:
        plain = client.post(
            "/api/v1/web/session",
            json={"code": pairing_code(client), "device_name": "Browser"},
        )
        assert all("Secure" not in value for value in plain.headers.get_list("set-cookie"))

    with make_client(tmp_path) as client:
        client.base_url = "https://testserver"
        secure = client.post(
            "/api/v1/web/session",
            json={"code": pairing_code(client), "device_name": "Browser"},
        )
        assert all("Secure" in value for value in secure.headers.get_list("set-cookie"))


@pytest.mark.parametrize("forced", [True, False])
def test_cookie_secure_flag_can_be_forced(tmp_path, forced):
    with make_client(tmp_path, web_session_cookie_secure=forced) as client:
        response = client.post(
            "/api/v1/web/session",
            json={"code": pairing_code(client), "device_name": "Browser"},
        )
        cookies = response.headers.get_list("set-cookie")
        assert all(("Secure" in value) is forced for value in cookies)


def test_web_session_is_rate_limited(tmp_path):
    with make_client(tmp_path, auth_rate_limit_per_minute=1) as client:
        body = {"code": "z" * 30, "device_name": "Browser"}
        assert client.post("/api/v1/web/session", json=body).status_code == 401
        assert client.post("/api/v1/web/session", json=body).status_code == 429


# --------------------------------------------------------------- title helper


@pytest.mark.parametrize(
    ("prompt", "expected"),
    [
        ("Kısa görev", "Kısa görev"),
        ("  boşluklu   görev  ", "boşluklu görev"),
        ("satır\nsonu", "satır sonu"),
        ("", "Yeni sohbet"),
    ],
)
def test_derive_session_title(prompt, expected):
    assert derive_session_title(prompt) == expected


def test_derive_session_title_truncates_on_a_word_boundary():
    title = derive_session_title("alpha bravo charlie delta echo foxtrot golf hotel india juliett")
    assert title.endswith("…")
    assert len(title) <= 61
    assert not title.rstrip("…").endswith(" ")
