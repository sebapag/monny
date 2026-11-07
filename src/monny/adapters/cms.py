"""CMS adapter router — describe + apply SeoChangeSet via configured adapter."""

from __future__ import annotations

from typing import Any

from monny.adapters import shopify as shopify_adapter
from monny.adapters.live_mode import use_live
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
        "shopify": None,
        "note": f"Adapter '{adapter}' uses generic stub apply in this slice.",
    }


def apply_seo_changeset(
    tenant: TenantConfig,
    change_set: dict[str, Any],
    *,
    dry_run: bool,
) -> dict[str, Any]:
    """Apply approved SEO changes. Live Shopify writes only when MONNY_LIVE=1 + secret set."""
    adapter = tenant.site.cms_adapter
    changes = list(change_set.get("changes") or [])
    results: list[dict[str, Any]] = []

    live = (
        adapter == "shopify_online_store"
        and use_live(dry_run=dry_run, secret_ref=tenant.shopify.auth.secret_ref)
    )

    if not live:
        for change in changes:
            results.append({**change, "status": "applied_stub", "adapter": adapter})
        return {
            "adapter": adapter,
            "mode": "stub",
            "status": "applied_stub",
            "applied": len(results),
            "changes": results,
            "note": "CMS write stubbed (dry-run or MONNY_LIVE=0). No unattended live writes.",
        }

    client = shopify_adapter.ShopifyLiveClient.from_tenant(tenant)
    pages = { (p.get("handle") or ""): p for p in client.list_pages(limit=50) }
    for change in changes:
        url = change.get("url") or ""
        handle = url.rstrip("/").split("/")[-1] or "home-about"
        page = pages.get(handle)
        after = change.get("after") or {}
        if page is None:
            results.append(
                {
                    **change,
                    "status": "skipped_no_page",
                    "adapter": adapter,
                    "handle": handle,
                }
            )
            continue
        updated = client.update_page(
            page["id"],
            title=after.get("title"),
            metafield_description=after.get("meta_description"),
        )
        results.append(
            {
                **change,
                "status": "applied_live",
                "adapter": adapter,
                "page_id": page["id"],
                "live_result": {"id": (updated.get("page") or {}).get("id")},
            }
        )

    return {
        "adapter": adapter,
        "mode": "live",
        "status": "applied_live",
        "applied": sum(1 for r in results if r.get("status") == "applied_live"),
        "changes": results,
    }
