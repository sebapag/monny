from pathlib import Path

from fastapi.testclient import TestClient

from monny.adapters import cms
from monny.api.app import create_app
from monny.config.loader import load_tenant
from monny.config.settings import get_settings
from monny.graph.app import get_graph
from monny.jobs import resolve_job
from monny.main import cli
from monny.skills import seo_apply

ROOT = Path(__file__).resolve().parents[1]


def test_seo_apply_stub_via_cms(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "0")
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()
    tenant = load_tenant("demo", ROOT / "tenants")
    change_set = {
        "status": "proposed",
        "changes": [
            {
                "url": "https://www.demo-shop.example/",
                "before": {"title": "Shop"},
                "after": {"title": "Home | Demo Shop", "meta_description": "x", "h1": "Home"},
            }
        ],
    }
    out = seo_apply.run(change_set, approved=True, tenant=tenant, dry_run=True)
    assert out["status"] == "applied_stub"
    assert out["cms_result"]["mode"] == "stub"
    get_settings.cache_clear()


def test_cms_apply_never_live_without_flag(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "1")
    monkeypatch.setenv("MONNY_DRY_RUN", "0")
    # secret still missing → must not go live
    monkeypatch.delenv("SHOPIFY_TOKEN_DEMO", raising=False)
    get_settings.cache_clear()
    tenant = load_tenant("demo", ROOT / "tenants")
    result = cms.apply_seo_changeset(
        tenant,
        {"changes": [{"url": "https://x", "after": {"title": "T"}}]},
        dry_run=False,
    )
    assert result["mode"] == "stub"
    get_settings.cache_clear()


def test_job_specs_and_cli(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    monkeypatch.setenv("MONNY_LIVE", "0")
    get_settings.cache_clear()
    get_graph.cache_clear()

    assert resolve_job("spend_daily").goal.startswith("report spend")
    assert resolve_job("seo_weekly").goal.startswith("seo audit")

    code = cli(["--job", "spend_daily", "--tenant", "demo"])
    assert code == 0
    out = capsys.readouterr().out
    assert "spend_google" in out or "Google:" in out
    assert "job=spend_daily" in out

    audit = (tmp_path / "demo" / "audit.jsonl").read_text(encoding="utf-8")
    assert "job_completed" in audit

    get_settings.cache_clear()
    get_graph.cache_clear()


def test_hitl_seo_apply_uses_tenant(tmp_path, monkeypatch):
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
    approval_id = chat.json()["approval_ids"][0]
    decided = client.post(
        f"/api/approvals/{approval_id}/decide",
        json={"decision": "approved"},
    )
    assert decided.status_code == 200
    apply_result = decided.json()["apply_result"]
    assert apply_result["status"] == "applied_stub"
    assert apply_result.get("adapter") == "shopify_online_store"
    get_settings.cache_clear()
    get_graph.cache_clear()
