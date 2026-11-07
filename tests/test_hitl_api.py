from pathlib import Path

from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.config.settings import get_settings
from monny.graph.app import get_graph

ROOT = Path(__file__).resolve().parents[1]


def test_chat_spend_and_approve_reject(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    monkeypatch.setenv("MONNY_LIVE", "0")
    get_settings.cache_clear()
    get_graph.cache_clear()

    client = TestClient(create_app())
    chat = client.post(
        "/api/chat",
        json={"tenant_id": "demo", "message": "report spend ultimi 7 giorni"},
    )
    assert chat.status_code == 200
    body = chat.json()
    assert body["status"] == "awaiting_approval"
    assert body["report"]["spend_channels"]
    assert body["approval_ids"]

    pending = client.get("/api/approvals", params={"tenant_id": "demo"}).json()
    assert len(pending) >= 1
    first = pending[0]["id"]
    approved = client.post(
        f"/api/approvals/{first}/decide",
        json={"decision": "approved"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["apply_result"]["status"] == "applied_stub"

    if len(pending) > 1:
        second = pending[1]["id"]
        rejected = client.post(
            f"/api/approvals/{second}/decide",
            json={"decision": "rejected", "note": "not now"},
        )
        assert rejected.status_code == 200
        assert rejected.json()["status"] == "rejected"

    audit_path = tmp_path / "demo" / "audit.jsonl"
    assert audit_path.exists()
    text = audit_path.read_text(encoding="utf-8")
    assert "approval_approved" in text

    get_settings.cache_clear()
    get_graph.cache_clear()


def test_seo_chat_emits_changeset(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()
    get_graph.cache_clear()
    client = TestClient(create_app())
    chat = client.post(
        "/api/chat",
        json={"tenant_id": "demo", "message": "seo audit of priority pages"},
    )
    assert chat.status_code == 200
    body = chat.json()
    assert body["report"]["seo_change_set"]
    assert body["report"]["seo_change_set"]["changes"]
    get_settings.cache_clear()
    get_graph.cache_clear()
