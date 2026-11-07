from pathlib import Path

from monny.config.loader import list_tenant_ids, load_tenant, secret_status


ROOT = Path(__file__).resolve().parents[1]


def test_list_and_load_demo_tenant():
    tenants = list_tenant_ids(ROOT / "tenants")
    assert "demo" in tenants
    cfg = load_tenant("demo", ROOT / "tenants")
    assert cfg.tenant_id == "demo"
    assert cfg.shopify.auth.secret_ref == "SHOPIFY_TOKEN_DEMO"
    assert cfg.ads.google is not None
    assert cfg.policy.hitl_default is True


def test_secret_status_never_leaks_value(monkeypatch):
    monkeypatch.setenv("SHOPIFY_TOKEN_DEMO", "super-secret")
    status = secret_status("SHOPIFY_TOKEN_DEMO")
    assert status["configured"] is True
    assert "super-secret" not in str(status)
