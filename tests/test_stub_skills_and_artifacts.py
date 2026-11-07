from pathlib import Path

from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.config.settings import get_settings
from monny.graph.app import get_graph, run_agent
from monny.graph.nodes.planner import _infer_plan
from monny.skills.apply_stub import apply_approved

ROOT = Path(__file__).resolve().parents[1]


def test_planner_routes_stub_skills():
    assert "shopify_promo" in _infer_plan("propose shopify promo discount", "")
    assert "lead_warming" in _infer_plan("lead warming sequence", "")
    assert "shopify_promo" not in _infer_plan("report spend", "")


def test_stub_skills_produce_proposals(tmp_path, monkeypatch):
    import shutil

    from monny.config.loader import load_tenant, save_tenant
    from monny.config.models import SubscriptionConfig, SubscriptionSkills

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    cfg = load_tenant("demo", tenants)
    cfg = cfg.model_copy(
        update={
            "subscription": SubscriptionConfig(
                plan="scale",
                skills=SubscriptionSkills(spend=True, seo=True, shopify=True, leads=True),
            )
        }
    )
    save_tenant(cfg, tenants)

    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()
    get_graph.cache_clear()

    result = run_agent(
        tenant_id="demo",
        goal="propose shopify promo discount and lead warming",
        thread_id="stub-test",
        dry_run=True,
    )
    actions = {p.get("action_type") for p in result.get("pending_proposals") or []}
    assert "phase2_stub" in actions
    assert "phase3_stub" in actions

    noop = apply_approved(
        {"action_type": "phase2_stub", "stub": True, "phase": 2, "channel": "shopify_promo"},
        tenant_id="demo",
    )
    assert noop["status"] == "noop_stub"

    get_settings.cache_clear()
    get_graph.cache_clear()


def test_artifacts_api_and_tenant_list(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()
    get_graph.cache_clear()

    client = TestClient(create_app())
    tenants = client.get("/api/tenants").json()
    ids = {t["tenant_id"] for t in tenants}
    assert ids == {"demo", "acme"}
    assert all("secrets_total" in t for t in tenants)

    chat = client.post(
        "/api/chat",
        json={"tenant_id": "demo", "message": "report spend ultimi 7 giorni"},
    )
    assert chat.status_code == 200

    arts = client.get("/api/tenants/demo/artifacts").json()
    names = {a["name"] for a in arts["artifacts"]}
    assert "last_report.json" in names
    assert "last_spend_report.json" in names

    last = client.get("/api/tenants/demo/artifacts/last_report.json").json()
    assert last["payload"]["spend_channels"]

    get_settings.cache_clear()
    get_graph.cache_clear()
