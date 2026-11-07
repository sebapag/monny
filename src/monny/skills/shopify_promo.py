"""Skill stub: Shopify promotions (phase 2) — explicit stub proposals, no side effects."""

from __future__ import annotations

from typing import Any

from monny.config.models import TenantConfig

ENABLED = True  # routable when asked; still a no-op apply
PHASE = 2


def run(tenant: TenantConfig | None = None, **_kwargs: Any) -> dict[str, Any]:
    shop = tenant.shopify.shop_domain if tenant else "unknown"
    proposals = [
        {
            "action_type": "phase2_stub",
            "channel": "shopify_promo",
            "entity_type": "skill",
            "entity_id": "shopify_promo",
            "entity_name": "Shopify promotions (phase 2)",
            "reason": (
                f"Phase 2 stub for {shop}: would list price rules / propose discounts. "
                "No Shopify writes in this phase."
            ),
            "requires_approval": True,
            "phase": PHASE,
            "stub": True,
            "interfaces": ["list_price_rules", "propose_discount", "apply_discount"],
        }
    ]
    return {
        "skill": "shopify_promo",
        "status": "phase2_stub",
        "phase": PHASE,
        "summary": (
            "Shopify promotions are a phase-2 stub — proposal only, no real side effects."
        ),
        "note": "Interfaces reserved: list_price_rules, propose_discount, apply_discount.",
        "interfaces": ["list_price_rules", "propose_discount", "apply_discount"],
        "proposals": proposals,
    }
