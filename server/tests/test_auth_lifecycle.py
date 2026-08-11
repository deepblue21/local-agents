"""Authentication lifecycle tests: admin gating, pairing/token expiry, revocation.

Covers the security-relevant edges of the pairing -> access/refresh -> revoke flow
that the smoke test in ``test_api`` does not exercise.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from local_agents.app import create_app
from local_agents.config import INSECURE_ADMIN_TOKEN, Settings

ADMIN = "a" * 40


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
    # A concrete peer address is required: trusted-proxy checks parse it as an IP,
    # and TestClient's default "testclient" host is not one.
    return TestClient(
        create_app(make_settings(tmp_path, **overrides)),
        client=("127.0.0.1", 51000),
    )


def issue_pairing(client: TestClient, admin: str = ADMIN):
    return client.post("/api/v1/admin/pairing", headers={"X-Admin-Token": admin})


def test_admin_pairing_requires_valid_token(tmp_path):
    with make_client(tmp_path) as client:
        assert client.post("/api/v1/admin/pairing").status_code == 401
        assert issue_pairing(client, admin="wrong-token").status_code == 401
        assert issue_pairing(client).status_code == 200


@pytest.mark.parametrize("token", ["short-token", INSECURE_ADMIN_TOKEN])
def test_insecure_admin_token_refuses_start_without_dev_override(tmp_path, token):
    with pytest.raises(RuntimeError, match="LOCAL_AGENTS_ADMIN_TOKEN"):
        create_app(make_settings(tmp_path, admin_token=token))

    app = create_app(
        make_settings(
            tmp_path,
            admin_token=token,
            allow_insecure_admin=True,
        )
    )
    with TestClient(app) as client:
        assert issue_pairing(client, admin=token).status_code == 200


def test_auth_rate_limit_is_keyed_by_path_and_client(tmp_path):
    """With a trusted proxy declared, the forwarded client address keys the bucket."""
    with make_client(
        tmp_path,
        auth_rate_limit_per_minute=1,
        trusted_proxy_networks="127.0.0.0/8",
    ) as client:
        body = {"code": "x" * 30, "device_name": "Phone"}
        headers = {"CF-Connecting-IP": "203.0.113.10"}

        first = client.post("/api/v1/pair/exchange", json=body, headers=headers)
        assert first.status_code == 401

        limited = client.post("/api/v1/pair/exchange", json=body, headers=headers)
        assert limited.status_code == 429
        assert limited.headers["retry-after"]

        other_client = client.post(
            "/api/v1/pair/exchange",
            json=body,
            headers={"CF-Connecting-IP": "203.0.113.11"},
        )
        assert other_client.status_code == 401


def test_forwarded_client_headers_are_ignored_without_a_trusted_proxy(tmp_path):
    """A spoofed client-IP header must not reset the rate-limit bucket.

    Any caller can send ``CF-Connecting-IP``. If it were trusted unconditionally, an
    attacker on a directly exposed port would rotate the value and get unlimited
    attempts against the pairing and refresh endpoints.
    """
    with make_client(tmp_path, auth_rate_limit_per_minute=1) as client:
        body = {"code": "x" * 30, "device_name": "Phone"}

        first = client.post(
            "/api/v1/pair/exchange", json=body, headers={"CF-Connecting-IP": "203.0.113.10"}
        )
        assert first.status_code == 401

        for spoofed in ("203.0.113.11", "203.0.113.12", "198.51.100.7"):
            response = client.post(
                "/api/v1/pair/exchange", json=body, headers={"CF-Connecting-IP": spoofed}
            )
            assert response.status_code == 429

        forwarded_for = client.post(
            "/api/v1/pair/exchange", json=body, headers={"X-Forwarded-For": "198.51.100.9"}
        )
        assert forwarded_for.status_code == 429


def test_docs_are_disabled_and_security_headers_are_set(tmp_path):
    with make_client(tmp_path) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/redoc").status_code == 404
        assert client.get("/openapi.json").status_code == 404

        admin = client.get("/admin")
        assert admin.headers["x-content-type-options"] == "nosniff"
        assert admin.headers["x-frame-options"] == "DENY"
        assert admin.headers["referrer-policy"] == "no-referrer"
        assert "frame-ancestors 'none'" in admin.headers["content-security-policy"]
        assert admin.headers["strict-transport-security"].startswith("max-age=31536000")


def test_bearer_rejects_malformed_authorization(tmp_path):
    with make_client(tmp_path) as client:
        assert client.get("/api/v1/sessions").status_code == 401
        assert client.get(
            "/api/v1/sessions", headers={"Authorization": "token-without-scheme"}
        ).status_code == 401
        assert client.get(
            "/api/v1/sessions", headers={"Authorization": "Bearer not-a-real-token"}
        ).status_code == 401


def test_pairing_code_is_single_use(tmp_path):
    with make_client(tmp_path) as client:
        code = issue_pairing(client).json()["code"]
        assert len(code.split("-")) == 6
        assert all(len(group) == 4 for group in code.split("-"))
        first = client.post(
            "/api/v1/pair/exchange",
            json={"code": code.lower().replace("-", " · "), "device_name": "Phone"},
        )
        assert first.status_code == 200
        replay = client.post(
            "/api/v1/pair/exchange", json={"code": code, "device_name": "Phone"}
        )
        assert replay.status_code == 401


def test_expired_pairing_code_is_rejected(tmp_path):
    with make_client(tmp_path, pairing_code_minutes=0) as client:
        code = issue_pairing(client).json()["code"]
        resp = client.post(
            "/api/v1/pair/exchange", json={"code": code, "device_name": "Phone"}
        )
        assert resp.status_code == 401


def test_expired_access_token_is_rejected_but_refresh_still_works(tmp_path):
    with make_client(tmp_path, access_token_minutes=0) as client:
        code = issue_pairing(client).json()["code"]
        tokens = client.post(
            "/api/v1/pair/exchange", json={"code": code, "device_name": "Phone"}
        ).json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        assert client.get("/api/v1/sessions", headers=headers).status_code == 401
        refreshed = client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert refreshed.status_code == 200


def test_revoked_device_cannot_authenticate_or_refresh(tmp_path):
    # The schema models device revocation (devices.revoked_at) and the auth/refresh
    # queries already enforce it, even though no HTTP endpoint exposes revocation yet.
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as client:
        code = issue_pairing(client).json()["code"]
        tokens = client.post(
            "/api/v1/pair/exchange", json={"code": code, "device_name": "Phone"}
        ).json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        assert client.get("/api/v1/sessions", headers=headers).status_code == 200

        with app.state.db.connect() as conn:
            conn.execute(
                "UPDATE devices SET revoked_at=?", (datetime.now(UTC).isoformat(),)
            )

        assert client.get("/api/v1/sessions", headers=headers).status_code == 401
        assert client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code == 401


def test_admin_can_list_and_revoke_devices(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as client:
        first_code = issue_pairing(client).json()["code"]
        first_tokens = client.post(
            "/api/v1/pair/exchange", json={"code": first_code, "device_name": "Pixel"}
        ).json()
        second_code = issue_pairing(client).json()["code"]
        second_tokens = client.post(
            "/api/v1/pair/exchange", json={"code": second_code, "device_name": "Tablet"}
        ).json()
        admin_headers = {"X-Admin-Token": ADMIN}
        first_auth = {"Authorization": f"Bearer {first_tokens['access_token']}"}
        second_auth = {"Authorization": f"Bearer {second_tokens['access_token']}"}

        assert client.get("/api/v1/admin/devices").status_code == 401
        listed = client.get("/api/v1/admin/devices", headers=admin_headers)
        assert listed.status_code == 200
        devices = listed.json()
        assert {device["name"] for device in devices} == {"Pixel", "Tablet"}
        pixel = next(device for device in devices if device["name"] == "Pixel")
        assert pixel["revoked_at"] is None

        revoked = client.post(
            f"/api/v1/admin/devices/{pixel['id']}/revoke", headers=admin_headers
        )
        assert revoked.status_code == 200
        assert revoked.json()["id"] == pixel["id"]
        assert revoked.json()["revoked_at"] is not None

        assert client.get("/api/v1/sessions", headers=first_auth).status_code == 401
        assert client.post(
            "/api/v1/auth/refresh", json={"refresh_token": first_tokens["refresh_token"]}
        ).status_code == 401
        assert client.get("/api/v1/sessions", headers=second_auth).status_code == 200

        missing = client.post("/api/v1/admin/devices/missing/revoke", headers=admin_headers)
        assert missing.status_code == 404
