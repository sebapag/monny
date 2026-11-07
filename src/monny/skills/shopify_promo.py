"""Skill stub: Shopify promotions (disabled in MVP router)."""

from __future__ import annotations

from typing import Any


ENABLED = False


def run(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    return {
        "skill": "shopify_promo",
        "status": "disabled",
        "note": "Shopify promotions are phase-2 stubs only.",
        "interfaces": ["list_price_rules", "propose_discount", "apply_discount"],
    }
