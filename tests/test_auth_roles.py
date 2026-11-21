"""Role gates: agent vs admin; Agent cannot open Admin mutations."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.auth.passwords import hash_password, verify_password
from monny.auth.tokens import decode_token, issue_token
from monny.auth.users import authenticate
from monny.config.settings import get_settings
from tests.conftest import admin_headers, agent_headers

ROOT = Path(__file__).resolve().parents[1]


def test_password_hash_roundtrip():
    hashed = hash_password("agent-demo")
    assert verify_password("agent-demo", hashed)
    assert not verify_password("wrong", hashed)


def test_demo_fixture_users_authenticate():
    agent = authenticate("agent@demo", "agent-demo")
    admin = authenticate("admin@demo", "admin-demo")
    assert agent is not None and agent.role == "agent"
    assert admin is not None and admin.role == "admin"
    assert not agent.can_access_admin
    assert admin.can_access_admin
    assert agent.can_access_agent and admin.can_access_agent


def test_token_roundtrip():
    secret = "unit-test-secret"
    token = issue_token({"sub": "agent@demo", "role": "agent"}, secret=secret, ttl_seconds=60)
    claims = decode_token(token, secret=secret)
    assert claims["sub"] == "agent@demo"
    assert claims["role"] == "agent"


def test_login_me_logout(api_client: TestClient):
    bad = api_client.post(
        "/api/auth/login",
        json={"email": "agent@demo", "password": "wrong"},
    )
    assert bad.status_code == 401

    ok = api_client.post(
        "/api/auth/login",
        json={"email": "agent@demo", "password": "agent-demo"},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["user"]["role"] == "agent"
    assert body["token"]
    assert "atrium_session" in ok.cookies

    me = api_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {body['token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "agent@demo"

    out = api_client.post("/api/auth/logout")
    assert out.status_code == 200


def test_unauthenticated_api_rejected(api_client: TestClient):
    assert api_client.get("/api/tenants").status_code == 401
    assert api_client.get("/api/tenants/demo").status_code == 401
    assert api_client.post("/api/runs", json={"tenant_id": "demo", "message": "x"}).status_code == 401
    # Health stays public
    assert api_client.get("/api/health").status_code == 200


def test_agent_cannot_mutate_admin(api_client: TestClient, tmp_path, monkeypatch):
    import shutil

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MONNY_AUTH_SECRET", "test-auth-secret")
    get_settings.cache_clear()
    client = TestClient(create_app())
    headers = agent_headers(client)

    got = client.get("/api/tenants/demo", headers=headers)
    assert got.status_code == 200
    cfg = got.json()["config"]

    denied = client.put("/api/tenants/demo", headers=headers, json={"config": cfg})
    assert denied.status_code == 403
    assert "Admin" in denied.json()["detail"]

    knowledge = client.get("/api/tenants/demo/knowledge", headers=headers)
    assert knowledge.status_code == 403

    toggle = client.patch(
        "/api/tenants/demo/knowledge/sources/brand-voice",
        headers=headers,
        json={"enabled": False},
    )
    assert toggle.status_code == 403


def test_admin_can_mutate_and_use_agent(api_client: TestClient, tmp_path, monkeypatch):
    import shutil

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MONNY_AUTH_SECRET", "test-auth-secret")
    get_settings.cache_clear()
    client = TestClient(create_app())
    headers = admin_headers(client)

    got = client.get("/api/tenants/demo", headers=headers)
    assert got.status_code == 200
    cfg = got.json()["config"]
    cfg["display_name"] = "Demo Auth Updated"
    saved = client.put("/api/tenants/demo", headers=headers, json={"config": cfg})
    assert saved.status_code == 200

    knowledge = client.get("/api/tenants/demo/knowledge", headers=headers)
    assert knowledge.status_code == 200

    # Admin may also hit Agent surface APIs
    tenants_list = client.get("/api/tenants", headers=headers)
    assert tenants_list.status_code == 200
    assert any(t["tenant_id"] == "demo" for t in tenants_list.json())


def test_agent_can_decide_approvals_not_admin_config(api_client: TestClient):
    headers = agent_headers(api_client)
    approvals = api_client.get("/api/approvals", headers=headers, params={"tenant_id": "demo"})
    assert approvals.status_code == 200
