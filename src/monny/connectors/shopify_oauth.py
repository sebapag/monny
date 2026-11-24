"""Shopify Admin OAuth (Partner app install) — portable per-tenant tokens.

Env (Partner app):
  SHOPIFY_API_KEY          — client_id
  SHOPIFY_API_SECRET       — client_secret
  SHOPIFY_OAUTH_SCOPES     — optional comma list (defaults to REQUIRED_SCOPES)
  MONNY_PUBLIC_API_URL     — public base for callback (e.g. https://api.example.com)
  MONNY_PUBLIC_APP_URL     — SPA origin for post-connect redirect (e.g. https://app.example.com)

When API key/secret are unset, mock install is used (local/CI) — still full state/callback path.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

from monny.config.loader import load_tenant, save_tenant
from monny.config.models import ShopifyOAuthMeta, TenantConfig
from monny.config.secrets_store import delete_secret, resolve_secret, set_secret
from monny.config.settings import get_settings

# Partner app scopes required for Atrium commerce + SEO + ops reads/writes.
REQUIRED_SCOPES: tuple[str, ...] = (
    "read_products",
    "write_products",
    "read_orders",
    "write_content",
    "read_price_rules",
    "write_price_rules",
)

STATE_TTL_SECONDS = 600
MOCK_CODE_PREFIX = "atrium_mock_code_"
MOCK_TOKEN_PREFIX = "shpat_atrium_mock_"


def requested_scopes() -> list[str]:
    settings = get_settings()
    raw = (settings.shopify_oauth_scopes or "").strip()
    if raw:
        return [s.strip() for s in raw.split(",") if s.strip()]
    return list(REQUIRED_SCOPES)


def oauth_configured() -> bool:
    settings = get_settings()
    return bool(settings.shopify_api_key.strip() and settings.shopify_api_secret.strip())


def normalize_shop_domain(raw: str) -> str:
    shop = (raw or "").strip().lower()
    shop = shop.removeprefix("https://").removeprefix("http://")
    shop = shop.split("/")[0].strip()
    if not shop:
        raise ValueError("Dominio negozio obbligatorio")
    if "." not in shop:
        shop = f"{shop}.myshopify.com"
    if not shop.endswith(".myshopify.com"):
        # Allow custom domains only if they look like a host; Partner OAuth still needs myshopify.
        if "myshopify.com" not in shop:
            raise ValueError(
                "Usa il dominio *.myshopify.com del negozio (es. mio-negozio.myshopify.com)"
            )
    return shop


def callback_url() -> str:
    settings = get_settings()
    base = (settings.monny_public_api_url or "").strip().rstrip("/")
    if not base:
        # Local default — Partner app must allowlist this redirect.
        base = f"http://{settings.monny_api_host}:{settings.monny_api_port}"
    return f"{base}/api/connectors/shopify/callback"


def app_redirect_url(*, status: str = "connected", error: str | None = None) -> str:
    settings = get_settings()
    app = (settings.monny_public_app_url or "").strip().rstrip("/")
    if not app:
        origins = settings.cors_origin_list
        app = origins[0] if origins else "http://127.0.0.1:5173"
    q = f"shopify={status}"
    if error:
        q += f"&error={error}"
    return f"{app}/#admin/connectors?{q}"


def _state_path() -> Path:
    settings = get_settings()
    return Path(settings.monny_data_dir) / "oauth" / "shopify_states.json"


def _load_states() -> dict[str, dict[str, Any]]:
    path = _state_path()
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def _save_states(states: dict[str, dict[str, Any]]) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(states, indent=2) + "\n", encoding="utf-8")


def create_oauth_state(*, tenant_id: str, shop_domain: str) -> str:
    state = secrets.token_urlsafe(24)
    states = _load_states()
    # Drop expired
    now = time.time()
    states = {
        k: v
        for k, v in states.items()
        if isinstance(v, dict) and float(v.get("exp") or 0) > now
    }
    states[state] = {
        "tenant_id": tenant_id,
        "shop_domain": shop_domain,
        "exp": now + STATE_TTL_SECONDS,
        "created_at": now,
    }
    _save_states(states)
    return state


def peek_oauth_state(state: str) -> dict[str, Any] | None:
    if not state:
        return None
    entry = _load_states().get(state)
    if not isinstance(entry, dict):
        return None
    if float(entry.get("exp") or 0) < time.time():
        return None
    return entry


def consume_oauth_state(state: str) -> dict[str, Any] | None:
    if not state:
        return None
    states = _load_states()
    entry = states.pop(state, None)
    _save_states(states)
    if not isinstance(entry, dict):
        return None
    if float(entry.get("exp") or 0) < time.time():
        return None
    return entry


def build_authorize_url(*, shop_domain: str, state: str) -> str:
    settings = get_settings()
    shop = normalize_shop_domain(shop_domain)
    scopes = ",".join(requested_scopes())
    if not oauth_configured():
        # Mock install path (local/CI) — still uses state + callback.
        base = (settings.monny_public_api_url or "").strip().rstrip("/")
        if not base:
            base = f"http://{settings.monny_api_host}:{settings.monny_api_port}"
        return f"{base}/api/connectors/shopify/mock-install?{urlencode({'state': state})}"

    params = {
        "client_id": settings.shopify_api_key.strip(),
        "scope": scopes,
        "redirect_uri": callback_url(),
        "state": state,
    }
    return f"https://{shop}/admin/oauth/authorize?{urlencode(params)}"


def verify_hmac(query: dict[str, str]) -> bool:
    """Validate Shopify callback HMAC when Partner secret is configured."""
    if not oauth_configured():
        return True
    settings = get_settings()
    received = query.get("hmac") or ""
    if not received:
        return False
    message = "&".join(
        f"{k}={v}" for k, v in sorted(query.items()) if k != "hmac"
    )
    digest = hmac.new(
        settings.shopify_api_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(digest, received)


def exchange_code_for_token(*, shop_domain: str, code: str) -> dict[str, Any]:
    shop = normalize_shop_domain(shop_domain)
    if code.startswith(MOCK_CODE_PREFIX) or not oauth_configured():
        return {
            "access_token": f"{MOCK_TOKEN_PREFIX}{shop.split('.')[0]}",
            "scope": ",".join(requested_scopes()),
            "mode": "mock",
        }

    settings = get_settings()
    url = f"https://{shop}/admin/oauth/access_token"
    payload = {
        "client_id": settings.shopify_api_key.strip(),
        "client_secret": settings.shopify_api_secret.strip(),
        "code": code,
    }
    with httpx.Client(timeout=20.0) as client:
        resp = client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    token = data.get("access_token")
    if not token:
        raise ValueError("Shopify non ha restituito access_token")
    return {
        "access_token": token,
        "scope": data.get("scope") or ",".join(requested_scopes()),
        "mode": "live",
    }


def fetch_shop_name(shop_domain: str, access_token: str, *, api_version: str) -> str | None:
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                f"https://{shop_domain}/admin/api/{api_version}/shop.json",
                headers={"X-Shopify-Access-Token": access_token},
            )
            if resp.status_code >= 400:
                return None
            return (resp.json().get("shop") or {}).get("name")
    except Exception:
        return None


def start_oauth(*, tenant_id: str, shop_domain: str) -> dict[str, Any]:
    shop = normalize_shop_domain(shop_domain)
    # Ensure tenant exists
    settings = get_settings()
    load_tenant(tenant_id, Path(settings.monny_tenants_dir))
    state = create_oauth_state(tenant_id=tenant_id, shop_domain=shop)
    authorize_url = build_authorize_url(shop_domain=shop, state=state)
    return {
        "authorize_url": authorize_url,
        "state": state,
        "shop_domain": shop,
        "scopes": requested_scopes(),
        "redirect_uri": callback_url(),
        "mode": "live" if oauth_configured() else "mock",
        "message_it": (
            "Reindirizzamento a Shopify per installare l’app…"
            if oauth_configured()
            else "Modalità demo: installazione OAuth simulata (imposta SHOPIFY_API_KEY/SECRET per il Partner app reale)."
        ),
    }


def complete_oauth_callback(
    *,
    code: str,
    shop: str,
    state: str,
    query: dict[str, str] | None = None,
) -> dict[str, Any]:
    if query and not verify_hmac(query):
        raise ValueError("HMAC Shopify non valido")
    entry = consume_oauth_state(state)
    if entry is None:
        raise ValueError("State OAuth non valido o scaduto — riprova Collega")
    tenant_id = str(entry["tenant_id"])
    expected_shop = normalize_shop_domain(str(entry["shop_domain"]))
    shop_domain = normalize_shop_domain(shop)
    if shop_domain != expected_shop:
        raise ValueError("Il negozio OAuth non corrisponde allo state")

    token_payload = exchange_code_for_token(shop_domain=shop_domain, code=code)
    access_token = str(token_payload["access_token"])
    scopes_raw = str(token_payload.get("scope") or "")
    scopes = [s.strip() for s in scopes_raw.split(",") if s.strip()] or requested_scopes()

    settings = get_settings()
    tenants_root = Path(settings.monny_tenants_dir)
    cfg = load_tenant(tenant_id, tenants_root)
    set_secret(tenant_id, cfg.shopify.auth.secret_ref, access_token)

    shop_name = fetch_shop_name(shop_domain, access_token, api_version=cfg.shopify.api_version)
    if not shop_name:
        shop_name = shop_domain.split(".")[0].replace("-", " ").title()

    from datetime import datetime, timezone

    oauth_meta = ShopifyOAuthMeta(
        scopes_granted=scopes,
        shop_name=shop_name,
        installed_at=datetime.now(timezone.utc).isoformat(),
        mode=str(token_payload.get("mode") or "live"),
    )
    skills = cfg.subscription.skills.model_copy(update={"shopify": True})
    subscription = cfg.subscription.model_copy(update={"skills": skills})
    shopify = cfg.shopify.model_copy(
        update={
            "shop_domain": shop_domain,
            "connected": True,
            "oauth": oauth_meta,
            "scopes_expected": list(dict.fromkeys([*cfg.shopify.scopes_expected, *REQUIRED_SCOPES])),
        }
    )
    updated = cfg.model_copy(update={"shopify": shopify, "subscription": subscription})
    save_tenant(updated, tenants_root)

    return {
        "ok": True,
        "tenant_id": tenant_id,
        "shop_domain": shop_domain,
        "shop_name": shop_name,
        "scopes": scopes,
        "mode": token_payload.get("mode"),
        "redirect_url": app_redirect_url(status="connected"),
    }


def disconnect(*, tenant_id: str) -> dict[str, Any]:
    settings = get_settings()
    tenants_root = Path(settings.monny_tenants_dir)
    cfg = load_tenant(tenant_id, tenants_root)
    delete_secret(tenant_id, cfg.shopify.auth.secret_ref)
    shopify = cfg.shopify.model_copy(
        update={"connected": False, "oauth": None}
    )
    updated = cfg.model_copy(update={"shopify": shopify})
    save_tenant(updated, tenants_root)
    return {
        "ok": True,
        "tenant_id": tenant_id,
        "connected": False,
        "message_it": "Shopify disconnesso. Il token OAuth è stato rimosso.",
    }


def connection_status(tenant: TenantConfig) -> dict[str, Any]:
    token = resolve_secret(tenant.shopify.auth.secret_ref, tenant_id=tenant.tenant_id)
    oauth = tenant.shopify.oauth
    connected = bool(tenant.shopify.connected and token and tenant.shopify.shop_domain)
    return {
        "provider": "shopify",
        "connected": connected,
        "shop_domain": tenant.shopify.shop_domain,
        "shop_name": (oauth.shop_name if oauth else None) or None,
        "scopes_granted": list(oauth.scopes_granted) if oauth else [],
        "scopes_expected": list(tenant.shopify.scopes_expected or REQUIRED_SCOPES),
        "installed_at": oauth.installed_at if oauth else None,
        "token_configured": token is not None,
        "oauth_mode": oauth.mode if oauth else None,
        "partner_app_configured": oauth_configured(),
        "required_scopes": list(REQUIRED_SCOPES),
    }


def mock_install_code(state: str) -> str:
    return f"{MOCK_CODE_PREFIX}{state[:12]}"
