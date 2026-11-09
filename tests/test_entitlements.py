from pathlib import Path

from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.config.entitlements import (
    effective_office_mode,
    entitlement_summary,
    filter_plan,
    is_office_view_entitled,
    is_skill_allowed,
)
from monny.config.loader import load_tenant
from monny.config.models import (
    SubscriptionConfig,
    SubscriptionFeatures,
    SubscriptionSkills,
    TenantConfig,
)
from monny.config.settings import get_settings
from monny.graph.nodes.planner import _infer_plan

ROOT = Path(__file__).resolve().parents[1]


def _demo_with_skills(**flags: bool) -> TenantConfig:
    cfg = load_tenant("demo", ROOT / "tenants")
    skills = SubscriptionSkills(
        spend=flags.get("spend", True),
        seo=flags.get("seo", True),
        shopify=flags.get("shopify", False),
        leads=flags.get("leads", False),
        operations=flags.get("operations", False),
        design=flags.get("design", False),
        it=flags.get("it", False),
        controlling=flags.get("controlling", False),
    )
    return cfg.model_copy(
        update={"subscription": SubscriptionConfig(plan="growth", skills=skills)}
    )


def test_demo_seed_subscription_defaults():
    cfg = load_tenant("demo", ROOT / "tenants")
    assert cfg.subscription.plan == "growth"
    assert cfg.subscription.skills.spend is True
    assert cfg.subscription.skills.seo is True
    assert cfg.subscription.skills.shopify is False
    assert cfg.subscription.skills.leads is False
    assert cfg.subscription.skills.operations is True
    assert cfg.subscription.skills.design is True
    assert cfg.subscription.skills.it is True
    assert cfg.subscription.skills.controlling is False
    assert cfg.subscription.features.office_view is True
    assert cfg.subscription.office_mode == "auto"


def test_office_view_entitlement_gates_mode():
    cfg = load_tenant("acme", ROOT / "tenants")
    assert is_office_view_entitled(cfg) is False
    assert effective_office_mode(cfg) == "auto"

    entitled = cfg.model_copy(
        update={
            "subscription": SubscriptionConfig(
                plan="growth",
                skills=cfg.subscription.skills,
                features=SubscriptionFeatures(office_view=True),
                office_mode="light",
            )
        }
    )
    assert is_office_view_entitled(entitled) is True
    assert effective_office_mode(entitled) == "light"

    summary = entitlement_summary(entitled)
    assert summary["office_view"] is True
    assert summary["office_mode"] == "light"
    assert "office_view" in summary["feature_labels_it"]


def test_filter_plan_drops_disabled_skills():
    tenant = _demo_with_skills(spend=True, seo=False, shopify=False, leads=False)
    plan = ["spend_google", "spend_meta", "seo_audit", "shopify_promo", "reporting"]
    assert filter_plan(tenant, plan) == ["spend_google", "spend_meta", "reporting"]
    assert is_skill_allowed(tenant, "hitl")
    assert is_skill_allowed(tenant, "seo_audit") is False


def test_planner_respects_entitlements():
    tenant = _demo_with_skills(spend=False, seo=True, shopify=False, leads=False)
    plan = _infer_plan("report spend ultimi 7 giorni", "", tenant=tenant)
    assert "spend_google" not in plan
    assert "spend_meta" not in plan
    # spend-only goal with spend off → reporting only
    assert plan == ["reporting"]


def test_api_refuses_disabled_skill_goal(tmp_path, monkeypatch):
    import shutil

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()

    client = TestClient(create_app())
    detail = client.get("/api/tenants/demo").json()
    cfg = detail["config"]
    cfg["subscription"] = {
        "plan": "growth",
        "skills": {
            "spend": True,
            "seo": True,
            "shopify": False,
            "leads": False,
            "operations": True,
            "design": True,
            "it": True,
            "controlling": False,
        },
    }
    assert client.put("/api/tenants/demo", json={"config": cfg}).status_code == 200

    blocked = client.post(
        "/api/runs",
        json={"tenant_id": "demo", "message": "lead warming sequence stub"},
    )
    assert blocked.status_code == 403
    assert "non attivo" in blocked.json()["detail"].lower() or "Reparto" in blocked.json()["detail"]

    ok = client.post(
        "/api/runs",
        json={"tenant_id": "demo", "message": "report spend ultimi 7 giorni"},
    )
    assert ok.status_code == 200
    get_settings.cache_clear()


def test_health_aliases(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    client = TestClient(create_app())
    assert client.get("/health").json()["ok"] is True
    assert client.get("/api/health").json()["ok"] is True
    get_settings.cache_clear()
