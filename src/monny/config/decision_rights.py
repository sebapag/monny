"""Helpers for policy.decision_rights (per skill-family autonomy)."""

from __future__ import annotations

from typing import Literal

from monny.config.models import Autonomy, TenantConfig

SkillFamily = Literal[
    "spend",
    "seo",
    "shopify",
    "leads",
    "operations",
    "design",
    "it",
    "controlling",
]


def autonomy_for(tenant: TenantConfig, family: SkillFamily) -> Autonomy:
    rights = tenant.policy.decision_rights
    return getattr(rights, family, "always_ask") or "always_ask"


def skill_requires_approval(tenant: TenantConfig, family: SkillFamily) -> bool:
    """
    Whether proposals for this family should go through HITL.
    Respects hitl_default as a global floor when autonomy is always_ask.
    """
    mode = autonomy_for(tenant, family)
    if mode == "agent_resolves":
        return False
    if mode == "within_policy":
        if family == "spend":
            return not tenant.policy.spend.auto_apply.enabled
        if family == "seo":
            return not tenant.policy.seo.auto_apply
        # Other families: still ask until they have auto_apply hooks.
        return True
    # always_ask
    return bool(tenant.policy.hitl_default)
