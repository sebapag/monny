"""Shopify adapter — config-driven read-only; fixtures by default, live behind MONNY_LIVE."""

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
    """Shopify Admin REST client (read shop + pages; write page title/body for SEO apply)."""

    def __init__(self, *, shop_domain: str, token: str, api_version: str) -> None:
        self.shop_domain = shop_domain
        self.token = token
        self.api_version = api_version
        self.base = f"https://{shop_domain}/admin/api/{api_version}"

    @classmethod
    def from_tenant(cls, tenant: TenantConfig) -> ShopifyLiveClient:
        token = resolve_secret(tenant.shopify.auth.secret_ref)
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
        # metafield_description kept for interface completeness (theme SEO often separate)
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


def read_shop(tenant: TenantConfig, *, dry_run: bool) -> dict[str, Any]:
    """Read shop + sample page metadata. Portable: fixture keyed by shop_domain."""
    shop = tenant.shopify
    secret_ref = shop.auth.secret_ref

    if not use_live(dry_run=dry_run, secret_ref=secret_ref):
        fixture = load_fixture(shop.shop_domain)
        if fixture is None:
            return {
                "mode": "fixture_missing",
                "shop_domain": shop.shop_domain,
                "auth_configured": resolve_secret(secret_ref) is not None,
                "error": f"No fixture at fixtures/shopify/{shop.shop_domain}.json",
            }
        pages = fixture.get("pages") or []
        return {
            "mode": "fixture",
            "shop_domain": shop.shop_domain,
            "api_version": shop.api_version,
            "scopes_expected": shop.scopes_expected,
            "auth_configured": resolve_secret(secret_ref) is not None,
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
        # Fall back to fixture if present so portability demos still work
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
            "error": str(exc),
            "fixture_fallback": fallback,
        }


def shop_summary(tenant: TenantConfig, *, dry_run: bool) -> dict[str, Any]:
    """Back-compat summary used by CMS describe()."""
    data = read_shop(tenant, dry_run=dry_run)
    return {
        "shop_domain": data.get("shop_domain"),
        "api_version": tenant.shopify.api_version,
        "scopes_expected": tenant.shopify.scopes_expected,
        "auth_configured": data.get("auth_configured"),
        "mode": data.get("mode"),
        "shop": data.get("shop") or (data.get("fixture_fallback") or {}).get("shop"),
        "sample_page": data.get("sample_page")
        or (data.get("fixture_fallback") or {}).get("sample_page"),
        "error": data.get("error"),
    }
