"""Shopify promotions — live/fixture adapter when connected; CTA otherwise. HITL on writes."""

from __future__ import annotations

from typing import Any

from monny.adapters import shopify as shopify_adapter
from monny.config.models import TenantConfig
from monny.skills.knowhow import with_knowhow

ENABLED = True
PHASE = 2


def run(
    tenant: TenantConfig | None = None,
    *,
    dry_run: bool = True,
    **_kwargs: Any,
) -> dict[str, Any]:
    if tenant is None:
        return {
            "skill": "shopify_promo",
            "status": "skipped",
            "summary": "Tenant assente — impossibile proporre promo.",
            "proposals": [],
        }

    if not shopify_adapter.is_connected(tenant):
        cta = shopify_adapter.connection_cta(tenant)
        result: dict[str, Any] = {
            "skill": "shopify_promo",
            "status": "needs_connector",
            "summary": cta["message_it"],
            "cta": cta,
            "proposals": [
                {
                    "action_type": "connect_shopify",
                    "channel": "shopify_promo",
                    "entity_type": "connector",
                    "entity_id": "shopify",
                    "entity_name": "Collega Shopify",
                    "reason": cta["message_it"],
                    "requires_approval": False,
                    "stub": False,
                    "admin_hash": cta["admin_hash"],
                }
            ],
        }
        return with_knowhow(result, tenant, "shopify_promo")

    shop = shopify_adapter.read_shop(tenant, dry_run=dry_run)
    rules = shopify_adapter.read_price_rules(tenant, dry_run=dry_run)
    inventory = shopify_adapter.read_inventory(tenant, dry_run=dry_run)
    shop_name = (shop.get("shop") or {}).get("name") or tenant.display_name
    mode = rules.get("mode") or shop.get("mode") or "fixture"
    existing = rules.get("price_rules") or []
    low = [
        row
        for row in (inventory.get("inventory") or [])
        if row.get("low_stock") or row.get("out_of_stock")
    ]

    proposed_title = f"ATRIUM-{tenant.tenant_id.upper()}-15"
    proposed_rule = {
        "title": proposed_title,
        "value_type": "percentage",
        "value": "-15.0",
        "target_type": "line_item",
        "target_selection": "all",
        "allocation_method": "across",
        "customer_selection": "all",
        "starts_at": None,
        "ends_at": None,
    }

    reason_parts = [
        f"Promo per {shop_name} ({tenant.shopify.shop_domain}), mode={mode}.",
        f"Price rule esistenti: {len(existing)}.",
    ]
    if low:
        skus = ", ".join(str(r.get("sku") or r.get("title")) for r in low[:3])
        reason_parts.append(f"Evitare sconti su stock critico: {skus}.")
    reason_parts.append(
        f"Proposta: {proposed_title} al 15%. HITL obbligatorio prima della write."
    )

    proposals = [
        {
            "action_type": "create_price_rule",
            "channel": "shopify_promo",
            "entity_type": "price_rule",
            "entity_id": proposed_title,
            "entity_name": proposed_title,
            "reason": " ".join(reason_parts),
            "requires_approval": True,
            "phase": PHASE,
            "stub": False,
            "shopify_mode": mode,
            "proposed_rule": proposed_rule,
            "metrics": {
                "existing_price_rules": len(existing),
                "low_stock_skus": len(low),
                "shop_mode": mode,
            },
            "interfaces": ["list_price_rules", "propose_discount", "apply_discount"],
        }
    ]

    result = {
        "skill": "shopify_promo",
        "status": "ok",
        "phase": PHASE,
        "summary": (
            f"Promo Shopify pronta per HITL · {shop_name} · mode={mode} · "
            f"{len(existing)} rule esistenti."
        ),
        "shopify": shop,
        "price_rules": rules,
        "inventory_snapshot": {
            "low_stock_count": inventory.get("low_stock_count"),
            "out_of_stock_count": inventory.get("out_of_stock_count"),
            "sample": low[:5],
        },
        "interfaces": ["list_price_rules", "propose_discount", "apply_discount"],
        "proposals": proposals,
    }
    return with_knowhow(result, tenant, "shopify_promo")
