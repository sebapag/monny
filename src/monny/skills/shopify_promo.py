"""Skill stub: Shopify promotions (phase 2) — explicit stub proposals, no side effects."""

from __future__ import annotations

from typing import Any

from monny.config.models import TenantConfig
from monny.skills.knowhow import with_knowhow

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
            "entity_name": "Promo Shopify",
            "reason": (
                f"Anteprima promo per {shop}: price rules / sconti proposti. "
                "Nessuna write Shopify in questa fase."
            ),
            "requires_approval": True,
            "phase": PHASE,
            "stub": True,
            "interfaces": ["list_price_rules", "propose_discount", "apply_discount"],
        }
    ]
    result: dict[str, Any] = {
        "skill": "shopify_promo",
        "status": "phase2_stub",
        "phase": PHASE,
        "summary": "Promo Shopify in anteprima — proposal only, nessuna modifica reale.",
        "note": "Interfaces reserved: list_price_rules, propose_discount, apply_discount.",
        "interfaces": ["list_price_rules", "propose_discount", "apply_discount"],
        "proposals": proposals,
    }
    if tenant is not None:
        result = with_knowhow(result, tenant, "shopify_promo")
    return result
