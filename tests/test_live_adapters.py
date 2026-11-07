from pathlib import Path

import httpx

from monny.adapters import google_ads, meta_ads
from monny.adapters.live_mode import use_live
from monny.config.loader import load_tenant
from monny.config.settings import get_settings

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures" / "spend"


def test_use_live_requires_flag_and_secret(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "0")
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()
    assert use_live(dry_run=True, secret_ref="GOOGLE_ADS_DEMO") is False

    monkeypatch.setenv("MONNY_LIVE", "1")
    monkeypatch.setenv("MONNY_DRY_RUN", "0")
    monkeypatch.delenv("GOOGLE_ADS_DEMO", raising=False)
    get_settings.cache_clear()
    assert use_live(dry_run=False, secret_ref="GOOGLE_ADS_DEMO") is False

    monkeypatch.setenv("GOOGLE_ADS_DEMO", "tok")
    get_settings.cache_clear()
    assert use_live(dry_run=False, secret_ref="GOOGLE_ADS_DEMO") is True
    get_settings.cache_clear()


def test_fetch_spend_stays_on_fixtures_without_live(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "0")
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    get_settings.cache_clear()
    tenant = load_tenant("demo", ROOT / "tenants")
    g = google_ads.fetch_spend(tenant, dry_run=True, fixtures_dir=FIXTURES)
    m = meta_ads.fetch_spend(tenant, dry_run=True, fixtures_dir=FIXTURES)
    assert g["mode"] == "fixture"
    assert m["mode"] == "fixture"
    assert g["campaigns"] and m["campaigns"]
    get_settings.cache_clear()


def test_google_live_path_selected_with_mock_http(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "1")
    monkeypatch.setenv("MONNY_DRY_RUN", "0")
    monkeypatch.setenv("GOOGLE_ADS_DEMO", "access-token")
    monkeypatch.setenv("GOOGLE_ADS_DEVELOPER_TOKEN", "dev-token")
    get_settings.cache_clear()
    tenant = load_tenant("demo", ROOT / "tenants")

    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.headers.get("developer-token") == "dev-token"
        assert request.headers.get("Authorization") == "Bearer access-token"
        return httpx.Response(200, json={"results": []})

    real_client = httpx.Client

    def fake_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(google_ads.httpx, "Client", fake_client)
    data = google_ads.fetch_spend(tenant, dry_run=False, fixtures_dir=FIXTURES)
    assert data["mode"] == "live"
    assert data["campaigns"] == []
    assert calls and "googleAds:searchStream" in str(calls[0].url)
    get_settings.cache_clear()


def test_apply_action_stub_when_not_live(monkeypatch):
    monkeypatch.setenv("MONNY_LIVE", "0")
    get_settings.cache_clear()
    tenant = load_tenant("demo", ROOT / "tenants")
    result = google_ads.apply_action(
        tenant, action_type="pause_campaign", entity_id="g-200", dry_run=True
    )
    assert result["status"] == "applied_stub"
    get_settings.cache_clear()
