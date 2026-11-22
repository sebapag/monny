"""Supabase auth path (mocked HTTP) + fixture fallback."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.auth import service as auth_service
from monny.auth.tokens import issue_token
from monny.config.settings import get_settings


class _FakeResponse:
    def __init__(self, status_code: int, payload: Any) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = payload if isinstance(payload, str) else json.dumps(payload)

    def json(self) -> Any:
        if isinstance(self._payload, str):
            return json.loads(self._payload)
        return self._payload


class _FakeClient:
    def __init__(self, routes: dict[tuple[str, str], _FakeResponse]) -> None:
        self.routes = routes

    def __enter__(self) -> _FakeClient:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def post(self, url: str, headers: dict | None = None, json: dict | None = None, **_: Any):
        key = ("POST", url.split("/auth/v1")[-1].split("?")[0] if "/auth/v1" in url else url)
        # Match by path suffix for flexibility
        for (method, path), resp in self.routes.items():
            if method == "POST" and path in url:
                return resp
        raise AssertionError(f"Unexpected POST {url} key={key} json={json}")

    def get(self, url: str, headers: dict | None = None, params: dict | None = None, **_: Any):
        for (method, path), resp in self.routes.items():
            if method == "GET" and path in url:
                return resp
        raise AssertionError(f"Unexpected GET {url} params={params}")

    def patch(self, url: str, headers: dict | None = None, params: dict | None = None, json: dict | None = None, **_: Any):
        for (method, path), resp in self.routes.items():
            if method == "PATCH" and path in url:
                return resp
        raise AssertionError(f"Unexpected PATCH {url}")


@pytest.fixture
def supabase_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-test")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-test")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "supabase-jwt-secret-test")
    monkeypatch.setenv("MONNY_AUTH_BACKEND", "supabase")
    monkeypatch.setenv("MONNY_AUTH_ALLOW_FIXTURE_FALLBACK", "0")
    monkeypatch.setenv("MONNY_AUTH_SECRET", "fixture-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_auth_backend_auto_without_supabase(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.setenv("MONNY_AUTH_BACKEND", "auto")
    get_settings.cache_clear()
    assert auth_service.auth_backend(get_settings()) == "fixtures"


def test_supabase_login_and_me(monkeypatch, supabase_env, tmp_path):
    user_id = "11111111-1111-1111-1111-111111111111"
    access = issue_token(
        {"sub": user_id, "email": "agent@example.com", "role": "authenticated"},
        secret="supabase-jwt-secret-test",
        ttl_seconds=3600,
    )
    profile = {
        "id": user_id,
        "email": "agent@example.com",
        "display_name": "Agent Example",
        "role": "agent",
        "tenant_id": "demo",
    }

    def fake_client(*args: Any, **kwargs: Any) -> _FakeClient:
        return _FakeClient(
            {
                ("POST", "/token"): _FakeResponse(
                    200,
                    {
                        "access_token": access,
                        "refresh_token": "refresh",
                        "expires_in": 3600,
                        "user": {"id": user_id, "email": "agent@example.com"},
                    },
                ),
                ("GET", "/profiles"): _FakeResponse(200, [profile]),
                ("POST", "/logout"): _FakeResponse(200, {}),
            }
        )

    monkeypatch.setattr(httpx, "Client", fake_client)
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    client = TestClient(create_app())

    login = client.post(
        "/api/auth/login",
        json={"email": "agent@example.com", "password": "secret-pass"},
    )
    assert login.status_code == 200, login.text
    body = login.json()
    assert body["backend"] == "supabase"
    assert body["user"]["role"] == "agent"
    assert body["token"] == access

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200
    assert me.json()["email"] == "agent@example.com"

    health = client.get("/api/health")
    assert health.json()["auth"]["backend"] == "supabase"


def test_supabase_admin_role_gate(monkeypatch, supabase_env, tmp_path):
    agent_id = "22222222-2222-2222-2222-222222222222"
    access = issue_token(
        {"sub": agent_id, "email": "agent@example.com", "role": "authenticated"},
        secret="supabase-jwt-secret-test",
        ttl_seconds=3600,
    )
    profile = {
        "id": agent_id,
        "email": "agent@example.com",
        "display_name": "Agent",
        "role": "agent",
        "tenant_id": "demo",
    }

    def fake_client(*args: Any, **kwargs: Any) -> _FakeClient:
        return _FakeClient({("GET", "/profiles"): _FakeResponse(200, [profile])})

    monkeypatch.setattr(httpx, "Client", fake_client)
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    client = TestClient(create_app())

    denied = client.get(
        "/api/tenants/demo/knowledge",
        headers={"Authorization": f"Bearer {access}"},
    )
    assert denied.status_code == 403
