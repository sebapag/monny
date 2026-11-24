from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.config.loader import load_tenant
from monny.config.secrets_store import load_secrets, resolve_secret, set_secret
from monny.config.settings import get_settings
from monny.connectors import shopify_oauth
from monny.adapters import shopify as shopify_adapter

ROOT = Path(__file__).resolve().parents[1]


def _admin_headers(client: TestClient) -> dict[str, str]:
    from tests.conftest import admin_headers

    return admin_headers(client)


def test_oauth_state_and_mock_callback(tmp_path, monkeypatch):
    import shutil

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    data = tmp_path / "data"
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(data))
    monkeypatch.setenv("MONNY_PUBLIC_API_URL", "http://testserver")
    monkeypatch.setenv("MONNY_PUBLIC_APP_URL", "http://app.test")
    monkeypatch.delenv("SHOPIFY_API_KEY", raising=False)
    monkeypatch.delenv("SHOPIFY_API_SECRET", raising=False)
    get_settings.cache_clear()

    started = shopify_oauth.start_oauth(
        tenant_id="demo",
        shop_domain="demo-shop.myshopify.com",
    )
    assert started["mode"] == "mock"
    assert "mock-install" in started["authorize_url"]
    state = started["state"]
    assert shopify_oauth.peek_oauth_state(state)

    # Invalid state rejected
    try:
        shopify_oauth.complete_oauth_callback(
            code="bad",
            shop="demo-shop.myshopify.com",
            state="nope",
            query={"hmac": "mock"},
        )
        assert False, "expected ValueError"
    except ValueError:
        pass

    code = shopify_oauth.mock_install_code(state)
    result = shopify_oauth.complete_oauth_callback(
        code=code,
        shop="demo-shop.myshopify.com",
        state=state,
        query={"code": code, "shop": "demo-shop.myshopify.com", "state": state, "hmac": "mock"},
    )
    assert result["ok"] is True
    assert result["shop_domain"] == "demo-shop.myshopify.com"
    cfg = load_tenant("demo", tenants)
    assert cfg.shopify.connected is True
    assert cfg.shopify.oauth is not None
    assert cfg.shopify.oauth.mode == "mock"
    token = resolve_secret(cfg.shopify.auth.secret_ref, tenant_id="demo")
    assert token and token.startswith("shpat_atrium_mock_")
    assert shopify_adapter.is_connected(cfg) is True

    # State consumed
    assert shopify_oauth.peek_oauth_state(state) is None

    shopify_oauth.disconnect(tenant_id="demo")
    cfg2 = load_tenant("demo", tenants)
    assert cfg2.shopify.connected is False
    assert resolve_secret(cfg2.shopify.auth.secret_ref, tenant_id="demo") is None
    get_settings.cache_clear()


def test_oauth_api_start_and_callback_flow(tmp_path, monkeypatch):
    import shutil

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    data = tmp_path / "data"
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(data))
    monkeypatch.setenv("MONNY_PUBLIC_API_URL", "http://testserver")
    monkeypatch.setenv("MONNY_PUBLIC_APP_URL", "http://app.test")
    monkeypatch.delenv("SHOPIFY_API_KEY", raising=False)
    monkeypatch.delenv("SHOPIFY_API_SECRET", raising=False)
    get_settings.cache_clear()

    client = TestClient(create_app())
    headers = _admin_headers(client)

    start = client.post(
        "/api/tenants/demo/connectors/shopify/oauth/start",
        headers=headers,
        json={"shop_domain": "demo-shop.myshopify.com"},
    )
    assert start.status_code == 200, start.text
    body = start.json()
    assert body["mode"] == "mock"
    state = body["state"]

    # Follow mock-install → callback (TestClient follows redirects by default)
    mock = client.get(
        f"/api/connectors/shopify/mock-install?state={state}",
        follow_redirects=False,
    )
    assert mock.status_code == 302
    loc = mock.headers["location"]
    assert "/api/connectors/shopify/callback" in loc
    qs = parse_qs(urlparse(loc).query)
    assert qs["state"][0] == state

    cb = client.get(loc, follow_redirects=False)
    assert cb.status_code == 302
    assert "shopify=connected" in cb.headers["location"]

    cfg = load_tenant("demo", tenants)
    assert cfg.shopify.connected is True
    assert load_secrets("demo", data).get(cfg.shopify.auth.secret_ref)

    status = client.get("/api/tenants/demo/connectors/shopify", headers=headers)
    assert status.status_code == 200
    assert status.json()["connected"] is True
    assert status.json()["token_configured"] is True

    disc = client.post(
        "/api/tenants/demo/connectors/shopify/disconnect",
        headers=headers,
    )
    assert disc.status_code == 200
    assert disc.json()["connected"] is False
    get_settings.cache_clear()


def test_live_authorize_url_when_partner_configured(tmp_path, monkeypatch):
    import shutil

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SHOPIFY_API_KEY", "key123")
    monkeypatch.setenv("SHOPIFY_API_SECRET", "sec456")
    monkeypatch.setenv("MONNY_PUBLIC_API_URL", "https://api.example.com")
    get_settings.cache_clear()

    started = shopify_oauth.start_oauth(
        tenant_id="demo",
        shop_domain="acme.myshopify.com",
    )
    assert started["mode"] == "live"
    assert "acme.myshopify.com/admin/oauth/authorize" in started["authorize_url"]
    assert "client_id=key123" in started["authorize_url"]
    assert "read_orders" in started["authorize_url"]
    get_settings.cache_clear()


def test_hmac_required_when_partner_secret_set(monkeypatch):
    monkeypatch.setenv("SHOPIFY_API_KEY", "key")
    monkeypatch.setenv("SHOPIFY_API_SECRET", "secret")
    get_settings.cache_clear()
    assert shopify_oauth.verify_hmac({"shop": "x.myshopify.com", "code": "c"}) is False
    # Craft valid hmac
    message = "code=c&shop=x.myshopify.com"
    import hashlib
    import hmac

    digest = hmac.new(b"secret", message.encode(), hashlib.sha256).hexdigest()
    assert shopify_oauth.verify_hmac(
        {"shop": "x.myshopify.com", "code": "c", "hmac": digest}
    )
    get_settings.cache_clear()


def test_exchange_code_posts_to_shopify(monkeypatch):
    monkeypatch.setenv("SHOPIFY_API_KEY", "key")
    monkeypatch.setenv("SHOPIFY_API_SECRET", "secret")
    get_settings.cache_clear()

    def handler(request: httpx.Request) -> httpx.Response:
        assert "acme.myshopify.com/admin/oauth/access_token" in str(request.url)
        return httpx.Response(
            200,
            json={"access_token": "shpat_live_abc", "scope": "read_products,read_orders"},
        )

    real = httpx.Client

    def fake_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)

    monkeypatch.setattr(shopify_oauth.httpx, "Client", fake_client)
    out = shopify_oauth.exchange_code_for_token(
        shop_domain="acme.myshopify.com",
        code="auth-code",
    )
    assert out["access_token"] == "shpat_live_abc"
    assert out["mode"] == "live"
    get_settings.cache_clear()
