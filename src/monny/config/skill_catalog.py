"""Canonical skill catalog — know-how + free/plus tier per skill.

Portable tenant knowledge (playbooks / tags) feeds these skills. Department
toggles in subscription.skills still gate families; tier gates plus depth.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

SkillTier = Literal["free", "plus"]
DepartmentId = Literal[
    "spend",
    "seo",
    "shopify",
    "leads",
    "operations",
    "design",
    "it",
    "controlling",
]


@dataclass(frozen=True)
class SkillKnowhow:
    """Linkage to tenant knowledge layer + packaged playbooks."""

    playbook: str | None = None
    knowledge_tags: tuple[str, ...] = ()
    knowledge_paths: tuple[str, ...] = ()
    decision_rights_key: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "playbook": self.playbook,
            "knowledge_tags": list(self.knowledge_tags),
            "knowledge_paths": list(self.knowledge_paths),
            "decision_rights_key": self.decision_rights_key,
        }


@dataclass(frozen=True)
class SkillDef:
    id: str
    department: DepartmentId
    tier: SkillTier
    label_it: str
    blurb_it: str
    entitlement: str  # subscription.skills key
    knowhow: SkillKnowhow = field(default_factory=SkillKnowhow)
    # When True, skill is a deep extension hook (stub OK until live adapter).
    extension_hook: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "department": self.department,
            "tier": self.tier,
            "label_it": self.label_it,
            "blurb_it": self.blurb_it,
            "entitlement": self.entitlement,
            "knowhow": self.knowhow.to_dict(),
            "extension_hook": self.extension_hook,
        }


# Graph skill id → catalog entry. Always-allowed infra skills stay out of catalog.
SKILL_CATALOG: dict[str, SkillDef] = {
    # --- Ads / Media (spend) ---
    "spend_google": SkillDef(
        id="spend_google",
        department="spend",
        tier="free",
        label_it="Spend · Google Ads",
        blurb_it="Diagnosi campagne Google: ROAS/CPA e proposte base.",
        entitlement="spend",
        knowhow=SkillKnowhow(
            playbook="playbooks/ads-base.md",
            knowledge_tags=("spend", "ads", "brand"),
            knowledge_paths=("spend-guidelines.md", "playbooks/ads-base.md"),
            decision_rights_key="spend",
        ),
    ),
    "spend_meta": SkillDef(
        id="spend_meta",
        department="spend",
        tier="free",
        label_it="Spend · Meta",
        blurb_it="Diagnosi campagne Meta: ROAS/CPA e proposte base.",
        entitlement="spend",
        knowhow=SkillKnowhow(
            playbook="playbooks/ads-base.md",
            knowledge_tags=("spend", "ads", "brand"),
            knowledge_paths=("spend-guidelines.md", "playbooks/ads-base.md"),
            decision_rights_key="spend",
        ),
    ),
    "spend_deep_optimize": SkillDef(
        id="spend_deep_optimize",
        department="spend",
        tier="plus",
        label_it="Spend deep · ottimizzazione",
        blurb_it=(
            "Plus: retrieval ricco, packaging report ROAS, hook adapter live "
            "e decision rights avanzati."
        ),
        entitlement="spend",
        knowhow=SkillKnowhow(
            playbook="playbooks/ads-deep.md",
            knowledge_tags=("spend", "ads", "plus", "optimize"),
            knowledge_paths=("playbooks/ads-deep.md", "spend-guidelines.md"),
            decision_rights_key="spend",
        ),
        extension_hook=True,
    ),
    # --- SEO ---
    "seo_crawler": SkillDef(
        id="seo_crawler",
        department="seo",
        tier="free",
        label_it="Crawl pagine",
        blurb_it="Crawl delle pagine prioritarie (title/meta/H1 input).",
        entitlement="seo",
        knowhow=SkillKnowhow(
            playbook="playbooks/seo-base.md",
            knowledge_tags=("seo", "site"),
            knowledge_paths=("playbooks/seo-base.md",),
            decision_rights_key="seo",
        ),
    ),
    "seo_audit": SkillDef(
        id="seo_audit",
        department="seo",
        tier="free",
        label_it="Audit SEO",
        blurb_it="Audit title / meta / H1 sulle pagine prioritarie.",
        entitlement="seo",
        knowhow=SkillKnowhow(
            playbook="playbooks/seo-base.md",
            knowledge_tags=("seo", "site", "brand"),
            knowledge_paths=("playbooks/seo-base.md", "brand-voice.md"),
            decision_rights_key="seo",
        ),
    ),
    "seo_deep_content": SkillDef(
        id="seo_deep_content",
        department="seo",
        tier="plus",
        label_it="SEO deep · content & report",
        blurb_it=(
            "Plus: brief content, packaging report SEO e hook CMS/live apply."
        ),
        entitlement="seo",
        knowhow=SkillKnowhow(
            playbook="playbooks/seo-deep.md",
            knowledge_tags=("seo", "content", "plus"),
            knowledge_paths=("playbooks/seo-deep.md", "brand-voice.md"),
            decision_rights_key="seo",
        ),
        extension_hook=True,
    ),
    # --- Commerce / leads / phase-2 (free base when dept enabled) ---
    "shopify_promo": SkillDef(
        id="shopify_promo",
        department="shopify",
        tier="free",
        label_it="Promo Shopify",
        blurb_it="Anteprima proposta promo negozio.",
        entitlement="shopify",
        knowhow=SkillKnowhow(decision_rights_key="shopify"),
        extension_hook=True,
    ),
    "lead_warming": SkillDef(
        id="lead_warming",
        department="leads",
        tier="free",
        label_it="Lead warming",
        blurb_it="Anteprima sequenza lead warming.",
        entitlement="leads",
        knowhow=SkillKnowhow(decision_rights_key="leads"),
        extension_hook=True,
    ),
    "ops_orders": SkillDef(
        id="ops_orders",
        department="operations",
        tier="free",
        label_it="Stato ordini",
        blurb_it="Overview fulfillment (anteprima).",
        entitlement="operations",
        knowhow=SkillKnowhow(decision_rights_key="operations"),
        extension_hook=True,
    ),
    "ops_inventory": SkillDef(
        id="ops_inventory",
        department="operations",
        tier="free",
        label_it="Giacenze",
        blurb_it="Stock alerts (anteprima).",
        entitlement="operations",
        knowhow=SkillKnowhow(decision_rights_key="operations"),
        extension_hook=True,
    ),
    "ops_shipping": SkillDef(
        id="ops_shipping",
        department="operations",
        tier="free",
        label_it="Spedizioni",
        blurb_it="Spedizioni e ritardi (anteprima).",
        entitlement="operations",
        knowhow=SkillKnowhow(decision_rights_key="operations"),
        extension_hook=True,
    ),
    "design_assets": SkillDef(
        id="design_assets",
        department="design",
        tier="free",
        label_it="Asset creativi",
        blurb_it="Inventario asset (anteprima).",
        entitlement="design",
        knowhow=SkillKnowhow(decision_rights_key="design"),
        extension_hook=True,
    ),
    "design_ads": SkillDef(
        id="design_ads",
        department="design",
        tier="free",
        label_it="Creatività ads",
        blurb_it="Proposte creatività ads (anteprima).",
        entitlement="design",
        knowhow=SkillKnowhow(decision_rights_key="design"),
        extension_hook=True,
    ),
    "design_brand": SkillDef(
        id="design_brand",
        department="design",
        tier="free",
        label_it="Brand kit",
        blurb_it="Check coerenza brand kit (anteprima).",
        entitlement="design",
        knowhow=SkillKnowhow(decision_rights_key="design"),
        extension_hook=True,
    ),
    "it_integrations": SkillDef(
        id="it_integrations",
        department="it",
        tier="free",
        label_it="Integrazioni",
        blurb_it="Salute integrazioni (anteprima).",
        entitlement="it",
        knowhow=SkillKnowhow(decision_rights_key="it"),
        extension_hook=True,
    ),
    "it_access": SkillDef(
        id="it_access",
        department="it",
        tier="free",
        label_it="Accessi da completare",
        blurb_it="Credenziali mancanti (anteprima).",
        entitlement="it",
        knowhow=SkillKnowhow(decision_rights_key="it"),
        extension_hook=True,
    ),
    "it_monitoring": SkillDef(
        id="it_monitoring",
        department="it",
        tier="free",
        label_it="Monitoring runtime",
        blurb_it="Uptime / errori (anteprima).",
        entitlement="it",
        knowhow=SkillKnowhow(decision_rights_key="it"),
        extension_hook=True,
    ),
    "ctrl_budget": SkillDef(
        id="ctrl_budget",
        department="controlling",
        tier="free",
        label_it="Budget vs spend",
        blurb_it="Rollup budget (anteprima).",
        entitlement="controlling",
        knowhow=SkillKnowhow(decision_rights_key="controlling"),
        extension_hook=True,
    ),
    "ctrl_kpi": SkillDef(
        id="ctrl_kpi",
        department="controlling",
        tier="free",
        label_it="KPI snapshot",
        blurb_it="Snapshot KPI (anteprima).",
        entitlement="controlling",
        knowhow=SkillKnowhow(decision_rights_key="controlling"),
        extension_hook=True,
    ),
    "ctrl_costs": SkillDef(
        id="ctrl_costs",
        department="controlling",
        tier="free",
        label_it="Costi anomali",
        blurb_it="Alert costi anomali (anteprima).",
        entitlement="controlling",
        knowhow=SkillKnowhow(decision_rights_key="controlling"),
        extension_hook=True,
    ),
}


def get_skill(skill_id: str) -> SkillDef | None:
    return SKILL_CATALOG.get(skill_id)


def list_skills(
    *,
    department: str | None = None,
    tier: SkillTier | None = None,
) -> list[SkillDef]:
    out = list(SKILL_CATALOG.values())
    if department:
        out = [s for s in out if s.department == department]
    if tier:
        out = [s for s in out if s.tier == tier]
    return out


def catalog_summary() -> list[dict[str, Any]]:
    return [s.to_dict() for s in SKILL_CATALOG.values()]


def skill_to_entitlement_map() -> dict[str, str]:
    """Graph skill id → subscription.skills key (includes seo_apply alias)."""
    mapping = {sid: s.entitlement for sid, s in SKILL_CATALOG.items()}
    mapping["seo_apply"] = "seo"
    return mapping


def asdict_safe(obj: Any) -> dict[str, Any]:
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return asdict(obj)
