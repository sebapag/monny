"""CMS adapter router — selects implementation from tenant.site.cms_adapter."""

from __future__ import annotations

from typing import Any

from monny.adapters import shopify as shopify_adapter
from monny.config.models import TenantConfig


def describe(tenant: TenantConfig, *, dry_run: bool) -> dict[str, Any]:
    adapter = tenant.site.cms_adapter
    if adapter == "shopify_online_store":
        return {
            "adapter": adapter,
            "shopify": shopify_adapter.shop_summary(tenant, dry_run=dry_run),
            "site": tenant.site.model_dump(),
        }
    return {
        "adapter": adapter,
        "site": tenant.site.model_dump(),
        "note": f"Adapter '{adapter}' is a stub in this scaffold slice.",
    }
