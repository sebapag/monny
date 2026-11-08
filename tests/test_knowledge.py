"""Knowledge layer: manifest, stub retrieve, API list/toggle."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.config.settings import get_settings
from monny.knowledge import list_sources, retrieve, set_source_enabled
from monny.skills import spend_google

ROOT = Path(__file__).resolve().parents[1]


def test_demo_manifest_and_retrieve():
    root = ROOT / "tenants"
    sources = list_sources("demo", root)
    assert len(sources) >= 2
    assert any(s.id == "brand-voice" and s.enabled for s in sources)

    chunks = retrieve("demo", "tono di voce ads", tags=["spend", "brand"], limit=3, root=root)
    assert chunks
    assert all(c.excerpt for c in chunks)
    assert any(c.source_id in {"brand-voice", "spend-guidelines"} for c in chunks)


def test_set_source_enabled_roundtrip(tmp_path):
    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    src = set_source_enabled("demo", "product-faq", False, root=tenants)
    assert src.enabled is False
    again = list_sources("demo", tenants)
    assert next(s for s in again if s.id == "product-faq").enabled is False
    set_source_enabled("demo", "product-faq", True, root=tenants)


def test_knowledge_api_list_retrieve_toggle(tmp_path, monkeypatch):
    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()

    client = TestClient(create_app())
    listed = client.get("/api/tenants/demo/knowledge")
    assert listed.status_code == 200
    body = listed.json()
    assert body["tenant_id"] == "demo"
    assert len(body["sources"]) >= 2

    retrieved = client.post(
        "/api/tenants/demo/knowledge/retrieve",
        json={"query": "budget ads", "tags": ["spend"], "limit": 3},
    )
    assert retrieved.status_code == 200
    assert retrieved.json()["chunks"]

    toggled = client.patch(
        "/api/tenants/demo/knowledge/sources/brand-voice",
        json={"enabled": False},
    )
    assert toggled.status_code == 200
    assert toggled.json()["source"]["enabled"] is False

    get_settings.cache_clear()


def test_spend_google_includes_knowledge(tmp_path, monkeypatch):
    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()

    from monny.config.loader import load_tenant

    tenant = load_tenant("demo", tenants)
    fixtures = ROOT / "fixtures" / "spend"
    result = spend_google.run(tenant, dry_run=True, fixtures_dir=fixtures)
    assert "knowledge" in result
    assert isinstance(result["knowledge"], list)
    get_settings.cache_clear()
