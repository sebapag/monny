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
    "ops_orders": "operations",
    "ops_inventory": "operations",
    "ops_shipping": "operations",
    "design_assets": "design",
    "design_ads": "design",
    "design_brand": "design",
    "it_integrations": "it",
    "it_access": "it",
    "it_monitoring": "it",
    "ctrl_budget": "controlling",
    "ctrl_kpi": "controlling",
    "ctrl_costs": "controlling",
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
    "operations": "Operations",
    "design": "Graphic Designer",
    "it": "IT",
    "controlling": "Controlling",
}

FEATURE_LABELS_IT: dict[str, str] = {
    "office_view": "Modalità vista ufficio",
}

OFFICE_MODE_LABELS_IT: dict[str, str] = {
    "auto": "Automatica",
    "full": "Completa (3D)",
    "light": "Leggera",
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


def is_office_view_entitled(tenant: TenantConfig) -> bool:
    """Paid frontend entitlement: Admin may lock full / light / auto."""
    return bool(tenant.subscription.features.office_view)


def effective_office_mode(tenant: TenantConfig) -> str:
    """
    Without office_view entitlement, always auto.
    With entitlement, honor subscription.office_mode.
    """
    if not is_office_view_entitled(tenant):
        return "auto"
    mode = tenant.subscription.office_mode
    if mode in ("auto", "full", "light"):
        return mode
    return "auto"


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
    if any(
        k in lowered
        for k in ("operat", "fulfillment", "giacenz", "inventory", "stock", "spedizion", "shipping", "ordini")
    ):
        wanted.append("operations")
    if any(
        k in lowered
        for k in ("design", "creative", "creativit", "brand kit", "asset creativ", "graphic")
    ):
        wanted.append("design")
    if any(
        k in lowered
        for k in (
            "integraz",
            "integration",
            "accessi",
            "credenzial",
            "uptime",
            "monitoring",
            "runtime",
        )
    ):
        wanted.append("it")
    if any(
        k in lowered
        for k in ("controlling", "budget vs", "kpi snapshot", "costi anomali", "cost alert")
    ):
        wanted.append("controlling")

    skills = tenant.subscription.skills
    blocked: list[str] = []
    for key in wanted:
        if not bool(getattr(skills, key, False)):
            blocked.append(key)
    return blocked


def entitlement_summary(tenant: TenantConfig) -> dict:
    skills = tenant.subscription.skills
    features = tenant.subscription.features
    return {
        "plan": tenant.subscription.plan,
        "skills": skills.model_dump(),
        "features": features.model_dump(),
        "office_mode": effective_office_mode(tenant),
        "office_mode_preference": tenant.subscription.office_mode,
        "office_view": is_office_view_entitled(tenant),
        "leadership": True,
        "labels_it": ENTITLEMENT_LABELS_IT,
        "feature_labels_it": FEATURE_LABELS_IT,
        "office_mode_labels_it": OFFICE_MODE_LABELS_IT,
    }
