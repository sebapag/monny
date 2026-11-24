from pathlib import Path

from monny.adapters import shopify
from monny.config.loader import load_tenant, save_tenant
from monny.config.settings import get_settings
from monny.skills import dept_stubs, shopify_promo
from monny.skills.apply_stub import apply_approved

ROOT = Path(__file__).resolve().parents[1]


def test_shopify_not_connected_cta(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "0")
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()
    tenant = load_tenant("demo", ROOT / "tenants")
    assert tenant.shopify.connected is False
    assert shopify.is_connected(tenant) is False

    result = shopify_promo.run(tenant, dry_run=True)
    assert result["status"] == "needs_connector"
    assert result["cta"]["admin_hash"] == "#admin/connectors"
    assert result["proposals"][0]["action_type"] == "connect_shopify"
    assert result["proposals"][0]["stub"] is False
    get_settings.cache_clear()


def test_shopify_promo_uses_fixture_when_connected(tmp_path, monkeypatch):
    import shutil

    from monny.config.secrets_store import set_secret

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    data = tmp_path / "data"
    cfg = load_tenant("demo", tenants)
    cfg.shopify.connected = True
    save_tenant(cfg, tenants)

    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(data))
    monkeypatch.setenv("MONNY_LIVE", "0")
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()
    set_secret("demo", cfg.shopify.auth.secret_ref, "shpat_test_demo")

    tenant = load_tenant("demo", tenants)
    result = shopify_promo.run(tenant, dry_run=True)
    assert result["status"] == "ok"
    assert result["proposals"][0]["action_type"] == "create_price_rule"
    assert result["proposals"][0]["stub"] is False
    assert result["proposals"][0]["proposed_rule"]["title"]

    applied = apply_approved(
        {
            "action_type": "create_price_rule",
            "proposed_rule": result["proposals"][0]["proposed_rule"],
            "stub": False,
        },
        tenant_id="demo",
    )
    assert applied["status"] == "applied_stub"
    assert applied["mode"] == "fixture"
    get_settings.cache_clear()


def test_ops_orders_reads_shopify_when_connected(tmp_path, monkeypatch):
    import shutil

    from monny.config.secrets_store import set_secret

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    data = tmp_path / "data"
    cfg = load_tenant("demo", tenants)
    cfg.shopify.connected = True
    save_tenant(cfg, tenants)
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(data))
    monkeypatch.setenv("MONNY_LIVE", "0")
    get_settings.cache_clear()
    set_secret("demo", cfg.shopify.auth.secret_ref, "shpat_test_demo")

    tenant = load_tenant("demo", tenants)
    result = dept_stubs.run("ops_orders", tenant, dry_run=True)
    assert result["proposals"][0]["stub"] is False
    assert result["metrics"]["orders_sampled"] >= 1
    assert result["findings"]["orders"]["mode"] == "fixture"

    inv = dept_stubs.run("ops_inventory", tenant, dry_run=True)
    assert inv["proposals"][0]["stub"] is False
    assert inv["metrics"]["skus"] >= 1
    get_settings.cache_clear()


def test_ops_shipping_stays_proposal_only(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "0")
    get_settings.cache_clear()
    tenant = load_tenant("demo", ROOT / "tenants")
    result = dept_stubs.run("ops_shipping", tenant, dry_run=True)
    assert result["proposals"][0]["stub"] is True
    assert result["status"] == "proposal_only"
    assert "playbook" in (result.get("knowhow") or {}) or result["metrics"].get("playbook")
    get_settings.cache_clear()


def test_shopify_orders_portable_by_domain(tmp_path, monkeypatch):
    from monny.config.secrets_store import set_secret

    monkeypatch.setenv("MONNY_LIVE", "0")
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    demo = load_tenant("demo", ROOT / "tenants")
    acme = load_tenant("acme", ROOT / "tenants")
    demo.shopify.connected = True
    acme.shopify.connected = True
    set_secret("demo", demo.shopify.auth.secret_ref, "tok_demo")
    set_secret("acme", acme.shopify.auth.secret_ref, "tok_acme")
    d = shopify.read_orders(demo, dry_run=True)
    a = shopify.read_orders(acme, dry_run=True)
    assert d["mode"] == "fixture" and a["mode"] == "fixture"
    assert d["orders"][0]["name"] != a["orders"][0]["name"]
    get_settings.cache_clear()
