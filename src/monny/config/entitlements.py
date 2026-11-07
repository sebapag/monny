"""Subscription skill entitlements — portable across any hyperscaler."""

from __future__ import annotations

from typing import Iterable

from monny.config.models import SubscriptionSkills, TenantConfig

# Graph skill id → subscription skill key (Leadership/HITL always allowed).
SKILL_TO_ENTITLEMENT: dict[str, str] = {
    "spend_google": "spend",
    "spend_meta": "spend",
    "seo_audit": "seo",
    "seo_crawler": "seo",
    "seo_apply": "seo",
    "shopify_promo": "shopify",
    "lead_warming": "leads",
}

# Always available (not gated by subscription.skills).
ALWAYS_ALLOWED = frozenset(
    {
        "planner",
        "hitl",
        "reporting",
        "shopify_read",  # light shop context for any enabled skill run
    }
)

ENTITLEMENT_LABELS_IT: dict[str, str] = {
    "spend": "Spend pubblicitario",
    "seo": "SEO",
    "shopify": "Negozio Shopify",
    "leads": "Lead",
}


def skills_enabled(tenant: TenantConfig) -> SubscriptionSkills:
    return tenant.subscription.skills


def is_skill_allowed(tenant: TenantConfig, skill_name: str) -> bool:
    if skill_name in ALWAYS_ALLOWED:
        return True
    key = SKILL_TO_ENTITLEMENT.get(skill_name)
    if key is None:
        return False
    return bool(getattr(tenant.subscription.skills, key, False))


def filter_plan(tenant: TenantConfig, plan: Iterable[str]) -> list[str]:
    """Drop disabled skills; keep reporting / always-allowed steps."""
    return [s for s in plan if is_skill_allowed(tenant, s)]


def blocked_entitlements_for_text(tenant: TenantConfig, text: str) -> list[str]:
    """
    Infer which subscription keys the free-text / goal would need that are off.
    Used by API to refuse runs that only target disabled reparti.
    """
    lowered = text.lower()
    wanted: list[str] = []
    if any(k in lowered for k in ("promo", "promotion", "discount", "price rule", "shopify promo")):
        wanted.append("shopify")
    if any(k in lowered for k in ("lead", "warming", "nurture", "crm", "sequence")):
        wanted.append("leads")
    if any(k in lowered for k in ("spend", "ads", "budget", "roas", "cpa", "meta", "google")):
        wanted.append("spend")
    if any(k in lowered for k in ("seo", "title", "meta", "page", "sitemap", "crawl")):
        wanted.append("seo")

    skills = tenant.subscription.skills
    blocked: list[str] = []
    for key in wanted:
        if not bool(getattr(skills, key, False)):
            blocked.append(key)
    return blocked


def entitlement_summary(tenant: TenantConfig) -> dict:
    skills = tenant.subscription.skills
    return {
        "plan": tenant.subscription.plan,
        "skills": skills.model_dump(),
        "leadership": True,
        "labels_it": ENTITLEMENT_LABELS_IT,
    }
