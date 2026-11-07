from pathlib import Path

from monny.config.loader import load_tenant
from monny.config.settings import get_settings
from monny.skills import seo_audit
from monny.subagents import seo_crawler

ROOT = Path(__file__).resolve().parents[1]


def test_crawler_uses_fixtures_for_example_hosts():
    urls = [
        "https://www.demo-shop.example/",
        "https://www.demo-shop.example/collections/all",
    ]
    result = seo_crawler.crawl(urls, allow_live=False)
    assert result["subagent"] == "seo_crawler"
    assert result["ok_count"] == 2
    assert "fixture" in result["sources"]
    assert all("title" in p for p in result["pages"])
    # no HTML bodies leaked
    assert all("html" not in p for p in result["pages"])


def test_seo_audit_uses_crawler_metadata(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "0")
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()
    tenant = load_tenant("demo", ROOT / "tenants")
    out = seo_audit.run(tenant, dry_run=True)
    assert out["crawler"]["subagent"] == "seo_crawler"
    assert out["crawler"]["url_count"] == 3
    assert out["change_set"]["changes"]
    get_settings.cache_clear()
