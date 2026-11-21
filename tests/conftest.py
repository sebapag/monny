"""Shared pytest fixtures — auth helpers for protected API routes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.auth.users import clear_users_cache
from monny.config.settings import get_settings


@pytest.fixture(autouse=True)
def _clear_settings_and_users():
    get_settings.cache_clear()
    clear_users_cache()
    yield
    get_settings.cache_clear()
    clear_users_cache()


def login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def agent_headers(client: TestClient) -> dict[str, str]:
    return login_headers(client, "agent@demo", "agent-demo")


def admin_headers(client: TestClient) -> dict[str, str]:
    return login_headers(client, "admin@demo", "admin-demo")


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    """Fresh app with isolated data dir (tenants stay on repo fixtures)."""
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MONNY_AUTH_SECRET", "test-auth-secret")
    get_settings.cache_clear()
    clear_users_cache()
    return TestClient(create_app())
