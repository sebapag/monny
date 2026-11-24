"""Shopify adapter — config-driven; fixtures by default, live behind MONNY_LIVE."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from monny.adapters.live_mode import use_live
from monny.config.loader import resolve_secret
from monny.config.models import TenantConfig

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES = REPO_ROOT / "fixtures" / "shopify"


class ShopifyLiveClient:
    """Shopify Admin REST client (read shop/pages/orders/inventory; write pages + price rules)."""

    def __init__(self, *, shop_domain: str, token: str, api_version: str) -> None:
        self.shop_domain = shop_domain
        self.token = token
        self.api_version = api_version
        self.base = f"https://{shop_domain}/admin/api/{api_version}"

    @classmethod
    def from_tenant(cls, tenant: TenantConfig) -> ShopifyLiveClient:
        token = resolve_secret(
            tenant.shopify.auth.secret_ref,
            tenant_id=tenant.tenant_id,
        )
        if not token:
            raise ValueError(f"Secret not set: {tenant.shopify.auth.secret_ref}")
        return cls(
            shop_domain=tenant.shopify.shop_domain,
            token=token,
            api_version=tenant.shopify.api_version,
        )

    def _headers(self) -> dict[str, str]:
        return {
            "X-Shopify-Access-Token": self.token,
            "Content-Type": "application/json",
        }

    def get_shop(self) -> dict[str, Any]:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(f"{self.base}/shop.json", headers=self._headers())
            resp.raise_for_status()
            return resp.json().get("shop") or {}

    def list_pages(self, *, limit: int = 5) -> list[dict[str, Any]]:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(
                f"{self.base}/pages.json",
                headers=self._headers(),
                params={"limit": limit},
            )
            resp.raise_for_status()
            return resp.json().get("pages") or []

    def list_orders(self, *, limit: int = 25, status: str = "any") -> list[dict[str, Any]]:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(
                f"{self.base}/orders.json",
                headers=self._headers(),
                params={"limit": limit, "status": status},
            )
            resp.raise_for_status()
            return resp.json().get("orders") or []

    def list_products(self, *, limit: int = 25) -> list[dict[str, Any]]:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(
                f"{self.base}/products.json",
                headers=self._headers(),
                params={"limit": limit},
            )
            resp.raise_for_status()
            return resp.json().get("products") or []

    def list_price_rules(self, *, limit: int = 25) -> list[dict[str, Any]]:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(
                f"{self.base}/price_rules.json",
                headers=self._headers(),
                params={"limit": limit},
            )
            resp.raise_for_status()
            return resp.json().get("price_rules") or []

    def create_price_rule(self, payload: dict[str, Any]) -> dict[str, Any]:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(
                f"{self.base}/price_rules.json",
                headers=self._headers(),
                json={"price_rule": payload},
            )
            resp.raise_for_status()
            return resp.json().get("price_rule") or {}

    def update_page(
        self,
        page_id: str | int,
        *,
        title: str | None = None,
        body_html: str | None = None,
        metafield_description: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"page": {"id": page_id}}
        if title is not None:
            payload["page"]["title"] = title
        if body_html is not None:
            payload["page"]["body_html"] = body_html
        with httpx.Client(timeout=20.0) as client:
            resp = client.put(
                f"{self.base}/pages/{page_id}.json",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            return {
                "page": resp.json().get("page"),
                "metafield_description": metafield_description,
            }


def _fixture_path(shop_domain: str) -> Path:
    return FIXTURES / f"{shop_domain}.json"


def load_fixture(shop_domain: str) -> dict[str, Any] | None:
    path = _fixture_path(shop_domain)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def is_connected(tenant: TenantConfig) -> bool:
    """True after OAuth install: connected flag + domain + access token in store/env."""
    shop = tenant.shopify
    if not (shop.connected and (shop.shop_domain or "").strip()):
        return False
    return resolve_secret(shop.auth.secret_ref, tenant_id=tenant.tenant_id) is not None


def connection_cta(tenant: TenantConfig) -> dict[str, Any]:
    """Italian CTA when commerce skills need Shopify but it is not connected."""
    return {
        "needed": True,
        "admin_section": "connectors",
        "admin_hash": "#admin/connectors",
        "message_it": (
            "Shopify non è collegato. Apri Admin → Connettori commerce e avvia "
            "«Collega con Shopify» (installazione OAuth dell’app Partner)."
        ),
    }


def read_shop(tenant: TenantConfig, *, dry_run: bool) -> dict[str, Any]:
    """Read shop + sample page metadata. Portable: fixture keyed by shop_domain."""
    shop = tenant.shopify
    secret_ref = shop.auth.secret_ref
    auth_ok = resolve_secret(secret_ref, tenant_id=tenant.tenant_id) is not None

    if not use_live(dry_run=dry_run, secret_ref=secret_ref, tenant_id=tenant.tenant_id):
        fixture = load_fixture(shop.shop_domain)
        if fixture is None:
            return {
                "mode": "fixture_missing",
                "shop_domain": shop.shop_domain,
                "auth_configured": auth_ok,
                "connected": is_connected(tenant),
                "error": f"No fixture at fixtures/shopify/{shop.shop_domain}.json",
            }
        pages = fixture.get("pages") or []
        return {
            "mode": "fixture",
            "shop_domain": shop.shop_domain,
            "api_version": shop.api_version,
            "scopes_expected": shop.scopes_expected,
            "auth_configured": auth_ok,
            "connected": is_connected(tenant),
            "shop": fixture.get("shop"),
            "sample_page": pages[0] if pages else None,
            "pages": pages,
        }

    try:
        client = ShopifyLiveClient.from_tenant(tenant)
        live_shop = client.get_shop()
        pages = client.list_pages(limit=3)
        sample = pages[0] if pages else None
        return {
            "mode": "live",
            "shop_domain": shop.shop_domain,
            "api_version": shop.api_version,
            "scopes_expected": shop.scopes_expected,
            "auth_configured": True,
            "connected": is_connected(tenant),
            "shop": {
                "name": live_shop.get("name"),
                "domain": live_shop.get("domain"),
                "myshopify_domain": live_shop.get("myshopify_domain"),
                "currency": live_shop.get("currency"),
                "primary_locale": live_shop.get("primary_locale"),
                "email": live_shop.get("email"),
            },
            "sample_page": sample,
            "pages": pages,
        }
    except Exception as exc:
        fixture = load_fixture(shop.shop_domain)
        fallback = None
        if fixture:
            pages = fixture.get("pages") or []
            fallback = {
                "shop": fixture.get("shop"),
                "sample_page": pages[0] if pages else None,
                "pages": pages,
            }
        return {
            "mode": "live_error",
            "shop_domain": shop.shop_domain,
            "auth_configured": True,
            "connected": is_connected(tenant),
            "error": str(exc),
            "fixture_fallback": fallback,
        }


def _inventory_from_products(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for product in products:
        title = product.get("title") or product.get("name") or "SKU"
        for variant in product.get("variants") or [{"sku": product.get("sku"), "inventory_quantity": product.get("inventory_quantity")}]:
            qty = int(variant.get("inventory_quantity") or variant.get("qty") or 0)
            rows.append(
                {
                    "product_id": str(product.get("id") or ""),
                    "title": title,
                    "sku": variant.get("sku") or product.get("handle") or "",
                    "inventory_quantity": qty,
                    "low_stock": qty > 0 and qty < 5,
                    "out_of_stock": qty <= 0,
                }
            )
    return rows


def read_orders(tenant: TenantConfig, *, dry_run: bool, limit: int = 25) -> dict[str, Any]:
    """Read open/recent orders — fixture or live Admin API when MONNY_LIVE."""
    shop = tenant.shopify
    if not is_connected(tenant):
        return {
            "mode": "not_connected",
            "shop_domain": shop.shop_domain,
            "orders": [],
            "cta": connection_cta(tenant),
        }

    secret_ref = shop.auth.secret_ref
    if not use_live(dry_run=dry_run, secret_ref=secret_ref, tenant_id=tenant.tenant_id):
        fixture = load_fixture(shop.shop_domain) or {}
        orders = list(fixture.get("orders") or [])[:limit]
        return {
            "mode": "fixture",
            "shop_domain": shop.shop_domain,
            "connected": True,
            "orders": orders,
            "open_count": sum(1 for o in orders if (o.get("fulfillment_status") or "unfulfilled") != "fulfilled"),
        }

    try:
        client = ShopifyLiveClient.from_tenant(tenant)
        orders = client.list_orders(limit=limit)
        return {
            "mode": "live",
            "shop_domain": shop.shop_domain,
            "connected": True,
            "orders": orders,
            "open_count": sum(
                1 for o in orders if (o.get("fulfillment_status") or "unfulfilled") != "fulfilled"
            ),
        }
    except Exception as exc:
        fixture = load_fixture(shop.shop_domain) or {}
        orders = list(fixture.get("orders") or [])[:limit]
        return {
            "mode": "live_error",
            "shop_domain": shop.shop_domain,
            "error": str(exc),
            "orders": orders,
            "fixture_fallback": True,
        }


def read_inventory(tenant: TenantConfig, *, dry_run: bool, limit: int = 25) -> dict[str, Any]:
    """Read inventory levels from products — fixture or live Admin API."""
    shop = tenant.shopify
    if not is_connected(tenant):
        return {
            "mode": "not_connected",
            "shop_domain": shop.shop_domain,
            "inventory": [],
            "cta": connection_cta(tenant),
        }

    secret_ref = shop.auth.secret_ref
    if not use_live(dry_run=dry_run, secret_ref=secret_ref, tenant_id=tenant.tenant_id):
        fixture = load_fixture(shop.shop_domain) or {}
        products = list(fixture.get("products") or [])[:limit]
        inventory = fixture.get("inventory") or _inventory_from_products(products)
        return {
            "mode": "fixture",
            "shop_domain": shop.shop_domain,
            "connected": True,
            "inventory": inventory[:limit],
            "low_stock_count": sum(1 for row in inventory if row.get("low_stock")),
            "out_of_stock_count": sum(1 for row in inventory if row.get("out_of_stock")),
        }

    try:
        client = ShopifyLiveClient.from_tenant(tenant)
        products = client.list_products(limit=limit)
        inventory = _inventory_from_products(products)
        return {
            "mode": "live",
            "shop_domain": shop.shop_domain,
            "connected": True,
            "inventory": inventory,
            "low_stock_count": sum(1 for row in inventory if row.get("low_stock")),
            "out_of_stock_count": sum(1 for row in inventory if row.get("out_of_stock")),
        }
    except Exception as exc:
        fixture = load_fixture(shop.shop_domain) or {}
        inventory = list(fixture.get("inventory") or [])[:limit]
        return {
            "mode": "live_error",
            "shop_domain": shop.shop_domain,
            "error": str(exc),
            "inventory": inventory,
            "fixture_fallback": True,
        }


def read_price_rules(tenant: TenantConfig, *, dry_run: bool, limit: int = 25) -> dict[str, Any]:
    """List price rules — fixture or live (dry-run-against-API when live credentials)."""
    shop = tenant.shopify
    if not is_connected(tenant):
        return {
            "mode": "not_connected",
            "shop_domain": shop.shop_domain,
            "price_rules": [],
            "cta": connection_cta(tenant),
        }

    secret_ref = shop.auth.secret_ref
    if not use_live(dry_run=dry_run, secret_ref=secret_ref, tenant_id=tenant.tenant_id):
        fixture = load_fixture(shop.shop_domain) or {}
        rules = list(fixture.get("price_rules") or [])[:limit]
        return {
            "mode": "fixture",
            "shop_domain": shop.shop_domain,
            "connected": True,
            "price_rules": rules,
        }

    try:
        client = ShopifyLiveClient.from_tenant(tenant)
        rules = client.list_price_rules(limit=limit)
        return {
            "mode": "live",
            "shop_domain": shop.shop_domain,
            "connected": True,
            "price_rules": rules,
        }
    except Exception as exc:
        fixture = load_fixture(shop.shop_domain) or {}
        return {
            "mode": "live_error",
            "shop_domain": shop.shop_domain,
            "error": str(exc),
            "price_rules": list(fixture.get("price_rules") or [])[:limit],
            "fixture_fallback": True,
        }


def apply_price_rule(
    tenant: TenantConfig,
    *,
    rule: dict[str, Any],
    dry_run: bool,
) -> dict[str, Any]:
    """Create a price rule after HITL. Live write only when MONNY_LIVE + secret."""
    if not is_connected(tenant):
        return {
            "status": "blocked",
            "mode": "not_connected",
            "cta": connection_cta(tenant),
            "note": "Collega Shopify in Admin → Connettori commerce prima di applicare promo.",
        }
    secret_ref = tenant.shopify.auth.secret_ref
    if not use_live(dry_run=dry_run, secret_ref=secret_ref, tenant_id=tenant.tenant_id):
        return {
            "status": "applied_stub",
            "mode": "fixture",
            "action_type": "create_price_rule",
            "rule": rule,
            "note": "Dry-run / MONNY_LIVE=0 — nessuna price rule reale su Shopify.",
        }
    client = ShopifyLiveClient.from_tenant(tenant)
    created = client.create_price_rule(rule)
    return {
        "status": "applied",
        "mode": "live",
        "action_type": "create_price_rule",
        "rule": created,
    }


def shop_summary(tenant: TenantConfig, *, dry_run: bool) -> dict[str, Any]:
    """Back-compat summary used by CMS describe()."""
    data = read_shop(tenant, dry_run=dry_run)
    return {
        "shop_domain": data.get("shop_domain"),
        "api_version": tenant.shopify.api_version,
        "scopes_expected": tenant.shopify.scopes_expected,
        "auth_configured": data.get("auth_configured"),
        "connected": data.get("connected"),
        "mode": data.get("mode"),
        "shop": data.get("shop") or (data.get("fixture_fallback") or {}).get("shop"),
        "sample_page": data.get("sample_page")
        or (data.get("fixture_fallback") or {}).get("sample_page"),
        "error": data.get("error"),
    }
