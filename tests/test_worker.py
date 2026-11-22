"""LangGraph worker surface (Cloud Run / local Ubuntu)."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from monny.auth.users import clear_users_cache
from monny.config.settings import get_settings
from monny.worker.app import create_worker_app
from tests.conftest import agent_headers


ROOT = Path(__file__).resolve().parents[1]


def test_worker_health_reports_langgraph(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MONNY_AUTH_SECRET", "test-auth-secret")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.setenv("MONNY_AUTH_BACKEND", "fixtures")
    get_settings.cache_clear()
    clear_users_cache()
    client = TestClient(create_worker_app())
    health = client.get("/api/health")
    assert health.status_code == 200
    body = health.json()
    assert body["ok"] is True
    assert body["service"] == "atrium-worker"
    assert body["planner"] == "langgraph"
    assert body["auth"]["backend"] == "fixtures"


def test_worker_login_and_run(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_AUTH_SECRET", "test-auth-secret")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.setenv("MONNY_AUTH_BACKEND", "fixtures")
    monkeypatch.setenv("MONNY_LLM_ENABLED", "0")
    get_settings.cache_clear()
    clear_users_cache()
    client = TestClient(create_worker_app())

    assert client.get("/api/tenants").status_code == 404  # thin worker — no tenant admin

    headers = agent_headers(client)
    started = client.post(
        "/api/runs",
        headers=headers,
        json={"tenant_id": "demo", "message": "report spend ultimi 7 giorni"},
    )
    assert started.status_code == 200, started.text
    run_id = started.json()["id"]
    assert run_id

    got = client.get(f"/api/runs/{run_id}", headers=headers)
    assert got.status_code == 200
    assert got.json()["tenant_id"] == "demo"
