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
    # Italian-facing company know-how (Admin Piano + HITL / report).
    metrics: tuple[str, ...] = ()
    hitl_prompts: tuple[str, ...] = ()
    decision_rights_hint: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "playbook": self.playbook,
            "knowledge_tags": list(self.knowledge_tags),
            "knowledge_paths": list(self.knowledge_paths),
            "decision_rights_key": self.decision_rights_key,
            "metrics": list(self.metrics),
            "hitl_prompts": list(self.hitl_prompts),
            "decision_rights_hint": self.decision_rights_hint,
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


def _kh(
    *,
    playbook: str,
    tags: tuple[str, ...],
    paths: tuple[str, ...],
    key: str,
    metrics: tuple[str, ...],
    hitl: tuple[str, ...],
    hint: str,
) -> SkillKnowhow:
    return SkillKnowhow(
        playbook=playbook,
        knowledge_tags=tags,
        knowledge_paths=paths,
        decision_rights_key=key,
        metrics=metrics,
        hitl_prompts=hitl,
        decision_rights_hint=hint,
    )


_ADS_METRICS_FREE = (
    "Spend totale periodo",
    "% spend su campagne waste",
    "Campagne healthy vs waste",
    "ROAS / CPA medi per canale",
)
_ADS_HITL_FREE = (
    "Confermi la pausa delle campagne sotto ROAS minimo?",
    "Approvi la riduzione budget entro la policy?",
)
_ADS_METRICS_PLUS = _ADS_METRICS_FREE + (
    "ROAS blended Google+Meta",
    "Waste spend con trend",
    "Coverage playbook nel run",
)
_ADS_HITL_PLUS = (
    "Approvi il pacchetto P0 (pause) e rinvii P1?",
    "Consenti apply within_policy sulle allow-list?",
)

_SEO_METRICS_FREE = (
    "URL crawlate ok / totale",
    "Issue per severità",
    "Pagine con proposta di modifica",
)
_SEO_HITL_FREE = (
    "Approvi il changeset SEO sulle URL prioritarie?",
    "Rivedere i title rispetto al tono di voce?",
)
_SEO_METRICS_PLUS = _SEO_METRICS_FREE + (
    "Coverage intent URL prioritarie",
    "Chunk knowledge usati nel brief",
)
_SEO_HITL_PLUS = (
    "Approvi i brief content P0 e il packaging report?",
    "Consenti dry-run CMS sul changeset SEO?",
)

# Graph skill id → catalog entry. Always-allowed infra skills stay out of catalog.
SKILL_CATALOG: dict[str, SkillDef] = {
    # --- Ads / Media (spend) ---
    "spend_google": SkillDef(
        id="spend_google",
        department="spend",
        tier="free",
        label_it="Spend · Google Ads",
        blurb_it="Diagnosi campagne Google: ROAS/CPA, proposte pause/tagli entro policy.",
        entitlement="spend",
        knowhow=_kh(
            playbook="playbooks/ads-base.md",
            tags=("spend", "ads", "brand", "playbook", "free"),
            paths=("spend-guidelines.md", "playbooks/ads-base.md"),
            key="spend",
            metrics=_ADS_METRICS_FREE,
            hitl=_ADS_HITL_FREE,
            hint="Free: always_ask prima di pause/riduci budget. Live optimize → Plus.",
        ),
    ),
    "spend_meta": SkillDef(
        id="spend_meta",
        department="spend",
        tier="free",
        label_it="Spend · Meta",
        blurb_it="Diagnosi campagne Meta: ROAS/CPA, proposte pause/tagli entro policy.",
        entitlement="spend",
        knowhow=_kh(
            playbook="playbooks/ads-base.md",
            tags=("spend", "ads", "brand", "playbook", "free"),
            paths=("spend-guidelines.md", "playbooks/ads-base.md"),
            key="spend",
            metrics=_ADS_METRICS_FREE,
            hitl=_ADS_HITL_FREE,
            hint="Free: always_ask prima di pause/riduci budget. Live optimize → Plus.",
        ),
    ),
    "spend_deep_optimize": SkillDef(
        id="spend_deep_optimize",
        department="spend",
        tier="plus",
        label_it="Spend deep · ottimizzazione",
        blurb_it=(
            "Plus: retrieval ricco, packaging report ROAS multi-canale, "
            "hook adapter live e decision rights within_policy."
        ),
        entitlement="spend",
        knowhow=_kh(
            playbook="playbooks/ads-deep.md",
            tags=("spend", "ads", "plus", "optimize", "playbook"),
            paths=("playbooks/ads-deep.md", "spend-guidelines.md"),
            key="spend",
            metrics=_ADS_METRICS_PLUS,
            hitl=_ADS_HITL_PLUS,
            hint="Plus: within_policy / agent_resolves se Admin li abilita; brand Search resta HITL.",
        ),
        extension_hook=True,
    ),
    # --- SEO ---
    "seo_crawler": SkillDef(
        id="seo_crawler",
        department="seo",
        tier="free",
        label_it="Crawl pagine",
        blurb_it="Crawl delle pagine prioritarie (input per audit title/meta/H1).",
        entitlement="seo",
        knowhow=_kh(
            playbook="playbooks/seo-base.md",
            tags=("seo", "site", "playbook", "free"),
            paths=("playbooks/seo-base.md",),
            key="seo",
            metrics=_SEO_METRICS_FREE,
            hitl=_SEO_HITL_FREE,
            hint="Free: crawl+audit; apply changeset solo con always_ask.",
        ),
    ),
    "seo_audit": SkillDef(
        id="seo_audit",
        department="seo",
        tier="free",
        label_it="Audit SEO",
        blurb_it="Audit title / meta / H1 e proposte changeset (HITL).",
        entitlement="seo",
        knowhow=_kh(
            playbook="playbooks/seo-base.md",
            tags=("seo", "site", "brand", "playbook", "free"),
            paths=("playbooks/seo-base.md", "brand-voice.md"),
            key="seo",
            metrics=_SEO_METRICS_FREE,
            hitl=_SEO_HITL_FREE,
            hint="Free: always_ask prima di seo_apply_changeset. Brief deep → Plus.",
        ),
    ),
    "seo_deep_content": SkillDef(
        id="seo_deep_content",
        department="seo",
        tier="plus",
        label_it="SEO deep · content & report",
        blurb_it="Plus: brief content, packaging report SEO e hook CMS/live apply.",
        entitlement="seo",
        knowhow=_kh(
            playbook="playbooks/seo-deep.md",
            tags=("seo", "content", "plus", "playbook"),
            paths=("playbooks/seo-deep.md", "brand-voice.md"),
            key="seo",
            metrics=_SEO_METRICS_PLUS,
            hitl=_SEO_HITL_PLUS,
            hint="Plus: brief+report; publish CMS sempre con HITL su legal/home.",
        ),
        extension_hook=True,
    ),
    # --- Commerce ---
    "shopify_promo": SkillDef(
        id="shopify_promo",
        department="shopify",
        tier="free",
        label_it="Promo Shopify",
        blurb_it="Anteprima proposta promo negozio con HITL obbligatorio.",
        entitlement="shopify",
        knowhow=_kh(
            playbook="playbooks/commerce-base.md",
            tags=("commerce", "shopify", "playbook", "free"),
            paths=("playbooks/commerce-base.md", "product-faq.md"),
            key="shopify",
            metrics=(
                "Promo proposte nel run",
                "Sconto % vs tetto interno",
                "Flag conflitto ads attive",
            ),
            hitl=(
                "Confermi la promo proposta e la finestra temporale?",
                "Escludere i bestseller dal discount?",
            ),
            hint="Free: always_ask su ogni promo; nessuna price rule automatica.",
        ),
        extension_hook=True,
    ),
    "shopify_deep_merch": SkillDef(
        id="shopify_deep_merch",
        department="shopify",
        tier="plus",
        label_it="Commerce deep · merchandising",
        blurb_it="Plus: calendario merch, anti-stacking, packaging report promo/GMV.",
        entitlement="shopify",
        knowhow=_kh(
            playbook="playbooks/commerce-deep.md",
            tags=("commerce", "shopify", "plus", "merch", "playbook"),
            paths=("playbooks/commerce-deep.md", "product-faq.md"),
            key="shopify",
            metrics=(
                "GMV stimato promo",
                "Margine a rischio %",
                "Overlap ads ↔ promo",
                "Coverage collezioni prioritarie",
            ),
            hitl=(
                "Approvi il piano merchandising P0?",
                "Consenti within_policy sotto soglia sconto?",
            ),
            hint="Plus: within_policy solo sotto soglia Admin; bundle sempre HITL.",
        ),
        extension_hook=True,
    ),
    # --- Leads ---
    "lead_warming": SkillDef(
        id="lead_warming",
        department="leads",
        tier="free",
        label_it="Lead warming",
        blurb_it="Anteprima sequenza lead warming (nessun invio reale).",
        entitlement="leads",
        knowhow=_kh(
            playbook="playbooks/leads-base.md",
            tags=("leads", "crm", "playbook", "free"),
            paths=("playbooks/leads-base.md", "brand-voice.md"),
            key="leads",
            metrics=(
                "Touch previsti",
                "Lead target stimati",
                "Flag CRM mancante",
            ),
            hitl=(
                "Attivare la sequenza warming proposta?",
                "Rivedere il tono del touch 1?",
            ),
            hint="Free: always_ask; nessun invio automatico.",
        ),
        extension_hook=True,
    ),
    "leads_deep_nurture": SkillDef(
        id="leads_deep_nurture",
        department="leads",
        tier="plus",
        label_it="Lead deep · nurture",
        blurb_it="Plus: scoring, branching, packaging report funnel e hook CRM.",
        entitlement="leads",
        knowhow=_kh(
            playbook="playbooks/leads-deep.md",
            tags=("leads", "crm", "plus", "nurture", "playbook"),
            paths=("playbooks/leads-deep.md", "brand-voice.md"),
            key="leads",
            metrics=(
                "Score medio audience",
                "Drop-off per touch",
                "Template pre-approvati",
            ),
            hitl=(
                "Approvi nurture P0 con branching?",
                "Consenti send within_policy sui template whitelist?",
            ),
            hint="Plus: within_policy solo su template whitelist; VIP sempre HITL.",
        ),
        extension_hook=True,
    ),
    # --- Operations ---
    "ops_orders": SkillDef(
        id="ops_orders",
        department="operations",
        tier="free",
        label_it="Stato ordini",
        blurb_it="Overview fulfillment e ordini aperti (anteprima).",
        entitlement="operations",
        knowhow=_kh(
            playbook="playbooks/ops-base.md",
            tags=("operations", "fulfillment", "playbook", "free"),
            paths=("playbooks/ops-base.md",),
            key="operations",
            metrics=("Ordini aperti", "Età media backlog"),
            hitl=("Escalare a magazzino gli ordini oltre SLA?",),
            hint="Free: always_ask su azioni operative; nessuna write WMS.",
        ),
        extension_hook=True,
    ),
    "ops_inventory": SkillDef(
        id="ops_inventory",
        department="operations",
        tier="free",
        label_it="Giacenze",
        blurb_it="Stock alerts e soglie di riordino (anteprima).",
        entitlement="operations",
        knowhow=_kh(
            playbook="playbooks/ops-base.md",
            tags=("operations", "fulfillment", "playbook", "free"),
            paths=("playbooks/ops-base.md",),
            key="operations",
            metrics=("SKU sotto soglia", "Alert stock"),
            hitl=("Aprire hint di riordino per SKU critici?",),
            hint="Free: always_ask; nessuna mutate stock.",
        ),
        extension_hook=True,
    ),
    "ops_shipping": SkillDef(
        id="ops_shipping",
        department="operations",
        tier="free",
        label_it="Spedizioni",
        blurb_it="Spedizioni in corso e ritardi rispetto all’ETA (anteprima).",
        entitlement="operations",
        knowhow=_kh(
            playbook="playbooks/ops-base.md",
            tags=("operations", "fulfillment", "playbook", "free"),
            paths=("playbooks/ops-base.md",),
            key="operations",
            metrics=("Spedizioni in ritardo", "ETA breach"),
            hitl=("Aprire ticket corriere per i ritardi segnalati?",),
            hint="Free: always_ask; reminder carrier solo dopo HITL.",
        ),
        extension_hook=True,
    ),
    "ops_deep_sla": SkillDef(
        id="ops_deep_sla",
        department="operations",
        tier="plus",
        label_it="Operations deep · SLA",
        blurb_it="Plus: matrice SLA, report OTIF, eccezioni P0 e hook WMS.",
        entitlement="operations",
        knowhow=_kh(
            playbook="playbooks/ops-deep.md",
            tags=("operations", "fulfillment", "plus", "sla", "playbook"),
            paths=("playbooks/ops-deep.md",),
            key="operations",
            metrics=(
                "OTIF stimato",
                "Breach SLA per warehouse",
                "Coverage alert P0",
            ),
            hitl=(
                "Approvi il piano eccezioni P0 e il report OTIF?",
                "Abilitare reminder within_policy ai carrier whitelist?",
            ),
            hint="Plus: within_policy su reminder pre-approvati; rimborsi sempre HITL.",
        ),
        extension_hook=True,
    ),
    # --- Design ---
    "design_assets": SkillDef(
        id="design_assets",
        department="design",
        tier="free",
        label_it="Asset creativi",
        blurb_it="Inventario asset creativi (brand, campagne, formati).",
        entitlement="design",
        knowhow=_kh(
            playbook="playbooks/design-base.md",
            tags=("design", "brand", "creative", "playbook", "free"),
            paths=("playbooks/design-base.md", "brand-voice.md"),
            key="design",
            metrics=("Asset inventariati", "Formati mancanti"),
            hitl=("Procedere con l’inventario asset proposto?",),
            hint="Free: always_ask su publish/DAM write.",
        ),
        extension_hook=True,
    ),
    "design_ads": SkillDef(
        id="design_ads",
        department="design",
        tier="free",
        label_it="Creatività ads",
        blurb_it="Proposte / varianti creatività per ads (anteprima).",
        entitlement="design",
        knowhow=_kh(
            playbook="playbooks/design-base.md",
            tags=("design", "brand", "creative", "playbook", "free"),
            paths=("playbooks/design-base.md", "brand-voice.md"),
            key="design",
            metrics=("Varianti proposte", "Formati coperti"),
            hitl=("Approvi le varianti ads proposte?",),
            hint="Free: always_ask prima di export verso Media.",
        ),
        extension_hook=True,
    ),
    "design_brand": SkillDef(
        id="design_brand",
        department="design",
        tier="free",
        label_it="Brand kit",
        blurb_it="Check coerenza brand kit (logo, colori, tono).",
        entitlement="design",
        knowhow=_kh(
            playbook="playbooks/design-base.md",
            tags=("design", "brand", "creative", "playbook", "free"),
            paths=("playbooks/design-base.md", "brand-voice.md"),
            key="design",
            metrics=("Score coerenza brand",),
            hitl=("Il brand kit risulta coerente — vuoi review umana?",),
            hint="Free: always_ask su lockup logo / legal.",
        ),
        extension_hook=True,
    ),
    "design_deep_campaign": SkillDef(
        id="design_deep_campaign",
        department="design",
        tier="plus",
        label_it="Design deep · campaign kit",
        blurb_it="Plus: matrice formati, score creatività, packaging report e hook DAM.",
        entitlement="design",
        knowhow=_kh(
            playbook="playbooks/design-deep.md",
            tags=("design", "brand", "plus", "campaign", "playbook"),
            paths=("playbooks/design-deep.md", "brand-voice.md"),
            key="design",
            metrics=(
                "Coverage formati richiesti",
                "Score medio kit",
                "Allineamento copy ↔ brand",
            ),
            hitl=(
                "Approvi il campaign kit P0 e il report score?",
                "Consenti export within_policy sulla cartella whitelist?",
            ),
            hint="Plus: within_policy su export whitelist; logo/legal sempre HITL.",
        ),
        extension_hook=True,
    ),
    # --- IT ---
    "it_integrations": SkillDef(
        id="it_integrations",
        department="it",
        tier="free",
        label_it="Integrazioni",
        blurb_it="Salute integrazioni (Shopify, Ads, Search Console…).",
        entitlement="it",
        knowhow=_kh(
            playbook="playbooks/it-base.md",
            tags=("it", "integrations", "playbook", "free"),
            paths=("playbooks/it-base.md",),
            key="it",
            metrics=("Integrazioni healthy / totali", "Età ultimo sync ok"),
            hitl=("Aprire ticket su integrazione unhealthy?",),
            hint="Free: always_ask su disable/rotate; solo checklist.",
        ),
        extension_hook=True,
    ),
    "it_access": SkillDef(
        id="it_access",
        department="it",
        tier="free",
        label_it="Accessi da completare",
        blurb_it="Credenziali / secret mancanti (collegato al cue Agent).",
        entitlement="it",
        knowhow=_kh(
            playbook="playbooks/it-base.md",
            tags=("it", "integrations", "playbook", "free"),
            paths=("playbooks/it-base.md",),
            key="it",
            metrics=("Secret mancanti",),
            hitl=("Completare gli accessi mancanti segnalati?",),
            hint="Free: always_ask; nessuna rotazione secret automatica.",
        ),
        extension_hook=True,
    ),
    "it_monitoring": SkillDef(
        id="it_monitoring",
        department="it",
        tier="free",
        label_it="Monitoring runtime",
        blurb_it="Uptime ed errori runtime (anteprima).",
        entitlement="it",
        knowhow=_kh(
            playbook="playbooks/it-base.md",
            tags=("it", "integrations", "playbook", "free"),
            paths=("playbooks/it-base.md",),
            key="it",
            metrics=("Errori runtime nel periodo", "Uptime snapshot"),
            hitl=("Escalare gli errori runtime P0 a Leadership?",),
            hint="Free: alert only; remediation → Plus.",
        ),
        extension_hook=True,
    ),
    "it_deep_reliability": SkillDef(
        id="it_deep_reliability",
        department="it",
        tier="plus",
        label_it="IT deep · reliability",
        blurb_it="Plus: reliability score, runbook incident, packaging report e remediation hook.",
        entitlement="it",
        knowhow=_kh(
            playbook="playbooks/it-deep.md",
            tags=("it", "integrations", "plus", "reliability", "playbook"),
            paths=("playbooks/it-deep.md",),
            key="it",
            metrics=(
                "Reliability score blended",
                "Incident aperti per severità",
                "Coverage runbook",
            ),
            hitl=(
                "Approvi il piano incident P0 e il report reliability?",
                "Consenti re-sync within_policy sulle integrazioni whitelist?",
            ),
            hint="Plus: within_policy su re-sync read-only; rotate secret sempre HITL.",
        ),
        extension_hook=True,
    ),
    # --- Controlling ---
    "ctrl_budget": SkillDef(
        id="ctrl_budget",
        department="controlling",
        tier="free",
        label_it="Budget vs spend",
        blurb_it="Rollup budget vs spend per canale / periodo.",
        entitlement="controlling",
        knowhow=_kh(
            playbook="playbooks/controlling-base.md",
            tags=("controlling", "budget", "kpi", "playbook", "free"),
            paths=("playbooks/controlling-base.md",),
            key="controlling",
            metrics=("Budget vs spend € / %", "Canali over/under"),
            hitl=("Rivedere lo scostamento budget del canale segnalato?",),
            hint="Free: always_ask su proposte di riallocazione.",
        ),
        extension_hook=True,
    ),
    "ctrl_kpi": SkillDef(
        id="ctrl_kpi",
        department="controlling",
        tier="free",
        label_it="KPI snapshot",
        blurb_it="Snapshot KPI (ROAS, CPA, conversioni).",
        entitlement="controlling",
        knowhow=_kh(
            playbook="playbooks/controlling-base.md",
            tags=("controlling", "budget", "kpi", "playbook", "free"),
            paths=("playbooks/controlling-base.md",),
            key="controlling",
            metrics=("ROAS / CPA snapshot",),
            hitl=("Condividere lo snapshot KPI con Leadership?",),
            hint="Free: lettura KPI; forecast → Plus.",
        ),
        extension_hook=True,
    ),
    "ctrl_costs": SkillDef(
        id="ctrl_costs",
        department="controlling",
        tier="free",
        label_it="Costi anomali",
        blurb_it="Alert costi anomali rispetto alla baseline.",
        entitlement="controlling",
        knowhow=_kh(
            playbook="playbooks/controlling-base.md",
            tags=("controlling", "budget", "kpi", "playbook", "free"),
            paths=("playbooks/controlling-base.md",),
            key="controlling",
            metrics=("Anomalie costo count",),
            hitl=("Escalare a Leadership l’anomalia costo segnalata?",),
            hint="Free: alert + HITL; scenario planning → Plus.",
        ),
        extension_hook=True,
    ),
    "ctrl_deep_forecast": SkillDef(
        id="ctrl_deep_forecast",
        department="controlling",
        tier="plus",
        label_it="Controlling deep · forecast",
        blurb_it="Plus: forecast run-rate, scenari base/stretch, packaging report finance-light.",
        entitlement="controlling",
        knowhow=_kh(
            playbook="playbooks/controlling-deep.md",
            tags=("controlling", "budget", "plus", "forecast", "playbook"),
            paths=("playbooks/controlling-deep.md",),
            key="controlling",
            metrics=(
                "Forecast fine mese vs budget",
                "Delta scenario stretch",
                "Coverage canali nel report",
            ),
            hitl=(
                "Approvi il forecast e lo scenario stretch?",
                "Consenti export report within_policy?",
            ),
            hint="Plus: export within_policy; cambio budget Ads reale sempre HITL (Spend).",
        ),
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
