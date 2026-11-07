"""Shopify adapter — config-driven; read stub only in this slice."""

from __future__ import annotations

from typing import Any

from monny.config.loader import resolve_secret
from monny.config.models import TenantConfig


def shop_summary(tenant: TenantConfig, *, dry_run: bool) -> dict[str, Any]:
    shop = tenant.shopify
    token = resolve_secret(shop.auth.secret_ref)
    return {
        "shop_domain": shop.shop_domain,
        "api_version": shop.api_version,
        "scopes_expected": shop.scopes_expected,
        "auth_configured": token is not None,
        "mode": "dry_run" if dry_run or token is None else "live_stub",
        "note": "Shopify Admin API client not wired for mutations in this scaffold slice.",
    }
