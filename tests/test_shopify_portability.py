from pathlib import Path

from monny.adapters import shopify
from monny.config.loader import load_tenant
from monny.config.settings import get_settings

ROOT = Path(__file__).resolve().parents[1]


def test_shopify_fixture_differs_by_tenant_yaml_only(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "0")
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()

    demo = load_tenant("demo", ROOT / "tenants")
    acme = load_tenant("acme", ROOT / "tenants")
    assert demo.shopify.shop_domain != acme.shopify.shop_domain

    d = shopify.read_shop(demo, dry_run=True)
    a = shopify.read_shop(acme, dry_run=True)
    assert d["mode"] == "fixture"
    assert a["mode"] == "fixture"
    assert d["shop"]["name"] == "Demo Shop"
    assert a["shop"]["name"] == "Acme Store"
    assert d["sample_page"]["title"] != a["sample_page"]["title"]
    get_settings.cache_clear()
