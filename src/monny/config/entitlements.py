"""Subscription skill entitlements — portable across any hyperscaler.

Free vs plus gates skill *capabilities* (catalog tier), not the 3D office.
Department toggles (subscription.skills) still enable/disable whole families.
"""

from __future__ import annotations

from typing import Iterable

from monny.config.models import SubscriptionSkills, TenantConfig
from monny.config.skill_catalog import (
    SKILL_CATALOG,
    catalog_summary,
    get_skill,
    skill_to_entitlement_map,
)

# Graph skill id → subscription skill key (Leadership/HITL always allowed).
SKILL_TO_ENTITLEMENT: dict[str, str] = skill_to_entitlement_map()

# Always available (not gated by subscription.skills / tier).
ALWAYS_ALLOWED = frozenset(
    {
        "planner",
        "hitl",
        "reporting",
        "shopify_read",  # light shop context for any enabled skill run
        "knowledge",
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

PLAN_LABELS_IT: dict[str, str] = {
    "free": "Free",
    "plus": "Plus",
}


def normalize_plan(plan: str | None) -> str:
    """Map legacy starter/growth/scale → free|plus."""
    key = (plan or "free").strip().lower()
    if key in ("free", "starter"):
        return "free"
    if key in ("plus", "growth", "scale"):
        return "plus"
    return "free"


def skills_enabled(tenant: TenantConfig) -> SubscriptionSkills:
    return tenant.subscription.skills


def is_plus_entitled(tenant: TenantConfig) -> bool:
    """Plus skills when plan is plus, or Admin plus_override."""
    if bool(getattr(tenant.subscription, "plus_override", False)):
        return True
    return normalize_plan(tenant.subscription.plan) == "plus"


def is_skill_allowed(tenant: TenantConfig, skill_name: str) -> bool:
    if skill_name in ALWAYS_ALLOWED:
        return True
    key = SKILL_TO_ENTITLEMENT.get(skill_name)
    if key is None:
        return False
    if not bool(getattr(tenant.subscription.skills, key, False)):
        return False
    catalog = get_skill(skill_name)
    if catalog is None:
        # Unknown but mapped (e.g. seo_apply) — dept toggle is enough.
        return True
    if catalog.tier == "plus" and not is_plus_entitled(tenant):
        return False
    return True


def is_office_view_entitled(tenant: TenantConfig) -> bool:
    """
    Market rule: full 3D office for everyone; free vs paid = skills/limits only.
    Kept for API shape compatibility — always treated as on.
    """
    return True


def effective_office_mode(tenant: TenantConfig) -> str:
    """Honor subscription.office_mode; default full 3D for all plans."""
    mode = tenant.subscription.office_mode
    if mode in ("auto", "full", "light"):
        return mode
    return "full"


def filter_plan(tenant: TenantConfig, plan: Iterable[str]) -> list[str]:
    """Drop disabled / plus-gated skills; keep reporting / always-allowed steps."""
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


def blocked_plus_skills_for_text(tenant: TenantConfig, text: str) -> list[str]:
    """
    When text clearly asks for a plus-only deep skill and tenant is not plus-entitled.
    """
    if is_plus_entitled(tenant):
        return []
    lowered = text.lower()
    blocked: list[str] = []
    plus_hints = {
        "spend_deep_optimize": (
            "spend deep",
            "ottimizzazione deep",
            "optimize spend deep",
            "deep roas",
            "live optimize ads",
            "packaging report roas",
        ),
        "seo_deep_content": (
            "seo deep",
            "content brief",
            "brief content",
            "deep seo",
            "seo report pack",
            "packaging report seo",
        ),
        "shopify_deep_merch": (
            "commerce deep",
            "shopify deep",
            "merchandising deep",
            "merch calendar",
            "deep merch",
        ),
        "leads_deep_nurture": (
            "leads deep",
            "lead deep",
            "nurture deep",
            "deep nurture",
            "lead scoring",
        ),
        "ops_deep_sla": (
            "ops deep",
            "operations deep",
            "sla deep",
            "deep sla",
            "otif",
        ),
        "design_deep_campaign": (
            "design deep",
            "campaign kit",
            "deep campaign",
            "creative score",
        ),
        "it_deep_reliability": (
            "it deep",
            "reliability deep",
            "deep reliability",
            "incident runbook",
        ),
        "ctrl_deep_forecast": (
            "controlling deep",
            "ctrl deep",
            "forecast deep",
            "deep forecast",
            "scenario stretch",
        ),
    }
    for skill_id, words in plus_hints.items():
        if any(w in lowered for w in words):
            if not is_skill_allowed(tenant, skill_id):
                blocked.append(skill_id)
    return blocked


def entitlement_summary(tenant: TenantConfig) -> dict:
    skills = tenant.subscription.skills
    features = tenant.subscription.features
    plan = normalize_plan(tenant.subscription.plan)
    plus = is_plus_entitled(tenant)
    allowed_skills = [
        s.id
        for s in SKILL_CATALOG.values()
        if is_skill_allowed(tenant, s.id)
    ]
    return {
        "plan": plan,
        "plus_entitled": plus,
        "plus_override": bool(getattr(tenant.subscription, "plus_override", False)),
        "skills": skills.model_dump(),
        "features": features.model_dump(),
        "office_mode": effective_office_mode(tenant),
        "office_mode_preference": tenant.subscription.office_mode,
        "office_view": is_office_view_entitled(tenant),
        "leadership": True,
        "labels_it": ENTITLEMENT_LABELS_IT,
        "feature_labels_it": FEATURE_LABELS_IT,
        "office_mode_labels_it": OFFICE_MODE_LABELS_IT,
        "plan_labels_it": PLAN_LABELS_IT,
        "skill_catalog": catalog_summary(),
        "allowed_skill_ids": allowed_skills,
    }
