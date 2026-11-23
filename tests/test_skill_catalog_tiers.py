"""Skill catalog free/plus tiers + knowhow entitlement gates."""

from pathlib import Path

from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.config.entitlements import (
    blocked_plus_skills_for_text,
    entitlement_summary,
    filter_plan,
    is_plus_entitled,
    is_skill_allowed,
    normalize_plan,
)
from monny.config.loader import load_tenant
from monny.config.models import SubscriptionConfig, SubscriptionSkills, TenantConfig
from monny.config.settings import get_settings
from monny.config.skill_catalog import SKILL_CATALOG, get_skill, list_skills
from monny.graph.nodes.planner import _infer_plan
from monny.skills import plus_hooks

ROOT = Path(__file__).resolve().parents[1]


def _with_plan(plan: str, *, plus_override: bool = False, **flags: bool) -> TenantConfig:
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
        update={
            "subscription": SubscriptionConfig(
                plan=plan,  # type: ignore[arg-type]
                skills=skills,
                plus_override=plus_override,
            )
        }
    )


def test_normalize_legacy_plans():
    assert normalize_plan("starter") == "free"
    assert normalize_plan("growth") == "plus"
    assert normalize_plan("scale") == "plus"
    assert normalize_plan("free") == "free"
    assert normalize_plan("plus") == "plus"


def test_demo_seed_is_plus_with_knowhow_playbooks():
    cfg = load_tenant("demo", ROOT / "tenants")
    assert normalize_plan(cfg.subscription.plan) == "plus"
    assert cfg.subscription.plus_override is False
    playbooks = ROOT / "tenants/demo/knowledge/playbooks"
    expected = [
        "ads-base.md",
        "ads-deep.md",
        "seo-base.md",
        "seo-deep.md",
        "commerce-base.md",
        "commerce-deep.md",
        "leads-base.md",
        "leads-deep.md",
        "ops-base.md",
        "ops-deep.md",
        "design-base.md",
        "design-deep.md",
        "it-base.md",
        "it-deep.md",
        "controlling-base.md",
        "controlling-deep.md",
        "leadership-hitl.md",
    ]
    for name in expected:
        path = playbooks / name
        assert path.exists(), name
        body = path.read_text(encoding="utf-8")
        assert len(body) > 400, f"{name} too short for production know-how"
        assert "## Processo" in body or "## Decision rights" in body
    spend = get_skill("spend_google")
    assert spend is not None and spend.tier == "free"
    assert spend.knowhow.playbook == "playbooks/ads-base.md"
    assert spend.knowhow.metrics
    assert spend.knowhow.hitl_prompts
    deep = get_skill("spend_deep_optimize")
    assert deep is not None and deep.tier == "plus" and deep.extension_hook
    assert len(deep.knowhow.metrics) > len(spend.knowhow.metrics)


def test_acme_seed_is_free():
    cfg = load_tenant("acme", ROOT / "tenants")
    assert normalize_plan(cfg.subscription.plan) == "free"
    assert is_plus_entitled(cfg) is False
    assert is_skill_allowed(cfg, "spend_google") is True
    assert is_skill_allowed(cfg, "spend_deep_optimize") is False


def test_plus_skills_gated_by_plan_and_override():
    free = _with_plan("free", spend=True, seo=True)
    assert is_skill_allowed(free, "spend_deep_optimize") is False
    assert is_skill_allowed(free, "seo_deep_content") is False
    assert is_skill_allowed(free, "spend_google") is True
    assert is_skill_allowed(free, "seo_audit") is True

    override = _with_plan("free", plus_override=True, spend=True, seo=True)
    assert is_plus_entitled(override) is True
    assert is_skill_allowed(override, "spend_deep_optimize") is True

    plus = _with_plan("plus", spend=True, seo=True)
    assert is_skill_allowed(plus, "seo_deep_content") is True

    # Dept off still blocks even on plus
    plus_no_seo = _with_plan("plus", spend=True, seo=False)
    assert is_skill_allowed(plus_no_seo, "seo_deep_content") is False


def test_filter_plan_drops_plus_on_free():
    free = _with_plan("free", spend=True, seo=True)
    plan = ["spend_google", "spend_deep_optimize", "seo_audit", "seo_deep_content", "reporting"]
    assert filter_plan(free, plan) == ["spend_google", "seo_audit", "reporting"]


def test_planner_routes_plus_deep_when_entitled():
    plus = _with_plan("plus", spend=True, seo=True)
    plan = _infer_plan("spend deep optimize packaging report roas", "", tenant=plus)
    assert "spend_deep_optimize" in plan

    free = _with_plan("free", spend=True, seo=True)
    plan_free = _infer_plan("spend deep optimize packaging report roas", "", tenant=free)
    assert "spend_deep_optimize" not in plan_free


def test_blocked_plus_skills_for_text():
    free = _with_plan("free", spend=True, seo=True)
    assert "spend_deep_optimize" in blocked_plus_skills_for_text(
        free, "spend deep optimize packaging report roas"
    )
    plus = _with_plan("plus", spend=True, seo=True)
    assert blocked_plus_skills_for_text(plus, "spend deep optimize") == []


def test_entitlement_summary_includes_catalog():
    cfg = load_tenant("demo", ROOT / "tenants")
    summary = entitlement_summary(cfg)
    assert summary["plan"] == "plus"
    assert summary["plus_entitled"] is True
    assert isinstance(summary["skill_catalog"], list)
    assert any(s["id"] == "spend_deep_optimize" for s in summary["skill_catalog"])
    assert "spend_deep_optimize" in summary["allowed_skill_ids"]


def test_legacy_growth_yaml_normalizes_to_plus():
    cfg = TenantConfig.model_validate(
        {
            "tenant_id": "x",
            "display_name": "X",
            "shopify": {
                "shop_domain": "x.myshopify.com",
                "auth": {"secret_ref": "S"},
            },
            "site": {"base_url": "https://x.example", "cms_adapter": "generic_http"},
            "subscription": {"plan": "growth", "skills": {"spend": True}},
        }
    )
    assert cfg.subscription.plan == "plus"


def test_plus_hooks_attach_knowhow(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    cfg = load_tenant("demo", ROOT / "tenants")
    result = plus_hooks.run("spend_deep_optimize", cfg)
    assert result["skill"] == "spend_deep_optimize"
    assert result["knowhow"]["playbook"] == "playbooks/ads-deep.md"
    assert "playbook_excerpt" in result["knowhow"]
    assert result["knowhow"]["excerpt_chars"] > 1800
    # Plus deep exceeds free excerpt budget
    from monny.skills.knowhow import load_knowhow

    free_kh = load_knowhow(cfg, "spend_google")
    assert free_kh["excerpt_chars"] <= 1800
    assert result["knowhow"]["excerpt_chars"] > free_kh["excerpt_chars"]
    get_settings.cache_clear()


def test_dept_stub_and_free_skills_attach_knowhow(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    cfg = load_tenant("demo", ROOT / "tenants")
    from monny.skills import dept_stubs, spend_google

    fixtures = ROOT / "fixtures" / "spend"
    google = spend_google.run(cfg, dry_run=True, fixtures_dir=fixtures)
    assert google["knowhow"]["playbook"] == "playbooks/ads-base.md"
    assert google["knowhow"]["metrics"]

    ops = dept_stubs.run("ops_orders", cfg)
    assert ops["knowhow"]["playbook"] == "playbooks/ops-base.md"
    assert ops["proposals"][0]["knowhow"]["playbook"]

    merch = plus_hooks.run("shopify_deep_merch", cfg)
    assert merch["knowhow"]["playbook"] == "playbooks/commerce-deep.md"
    get_settings.cache_clear()


def test_every_catalog_skill_has_playbook_and_hitl():
    for sid, skill in SKILL_CATALOG.items():
        kh = skill.knowhow
        assert kh.playbook, sid
        assert kh.decision_rights_key, sid
        assert kh.metrics, sid
        assert kh.hitl_prompts, sid
        assert kh.decision_rights_hint, sid
        assert kh.knowledge_tags, sid
        path = ROOT / "tenants/demo/knowledge" / kh.playbook
        assert path.exists(), f"{sid} missing {kh.playbook}"


def test_api_refuses_plus_skill_on_free(tmp_path, monkeypatch):
    import shutil

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()

    from tests.conftest import admin_headers, agent_headers

    client = TestClient(create_app())
    admin = admin_headers(client)
    agent = agent_headers(client)
    detail = client.get("/api/tenants/demo", headers=admin).json()
    cfg = detail["config"]
    cfg["subscription"] = {
        "plan": "free",
        "plus_override": False,
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
    assert client.put("/api/tenants/demo", headers=admin, json={"config": cfg}).status_code == 200

    blocked = client.post(
        "/api/runs",
        headers=agent,
        json={
            "tenant_id": "demo",
            "message": "spend deep optimize packaging report roas",
        },
    )
    assert blocked.status_code == 403
    assert "Plus" in blocked.json()["detail"]

    catalog = client.get("/api/skills/catalog", headers=agent)
    assert catalog.status_code == 200
    ids = {s["id"] for s in catalog.json()["skills"]}
    assert "spend_deep_optimize" in ids
    assert "seo_deep_content" in ids

    get_settings.cache_clear()


def test_catalog_lists_all_departments_free_and_plus():
    depts = {
        "spend",
        "seo",
        "shopify",
        "leads",
        "operations",
        "design",
        "it",
        "controlling",
    }
    for dept in depts:
        skills = list_skills(department=dept)
        assert any(s.tier == "free" for s in skills), dept
        assert any(s.tier == "plus" for s in skills), dept
    assert len(SKILL_CATALOG) >= 20
    assert "ops_deep_sla" in SKILL_CATALOG
    assert "ctrl_deep_forecast" in SKILL_CATALOG


def test_planner_routes_new_plus_deeps():
    plus = _with_plan(
        "plus",
        spend=True,
        seo=True,
        shopify=True,
        leads=True,
        operations=True,
        design=True,
        it=True,
        controlling=True,
    )
    assert "shopify_deep_merch" in _infer_plan(
        "commerce deep merchandising merch calendar", "", tenant=plus
    )
    assert "ops_deep_sla" in _infer_plan("operations deep sla otif", "", tenant=plus)
    assert "ctrl_deep_forecast" in _infer_plan(
        "controlling deep forecast scenario stretch", "", tenant=plus
    )
