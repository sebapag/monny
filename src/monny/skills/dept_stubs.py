"""Phase-2 department skill stubs — Operations, Design, IT, Controlling.

Activatable entitlements; proposal-only (no side effects). Italian UI labels live
in web/src/labels.ts and storage/runs.py SKILL_LABELS.
"""

from __future__ import annotations

from typing import Any

from monny.config.models import TenantConfig

PHASE = 2

# skill_id → stub metadata (interfaces reserved for later live adapters)
STUB_META: dict[str, dict[str, Any]] = {
    "ops_orders": {
        "channel": "operations",
        "entity_name": "Stato ordini",
        "reason": "Anteprima fulfillment: elenco ordini aperti e stati di evasione.",
        "interfaces": ["list_orders", "fulfillment_overview"],
        "summary": "Stato ordini / fulfillment in anteprima — nessuna modifica reale.",
    },
    "ops_inventory": {
        "channel": "operations",
        "entity_name": "Giacenze",
        "reason": "Anteprima giacenze e soglie di riordino / stock alerts.",
        "interfaces": ["list_inventory", "stock_alerts"],
        "summary": "Giacenze e stock alerts in anteprima — nessuna modifica reale.",
    },
    "ops_shipping": {
        "channel": "operations",
        "entity_name": "Spedizioni",
        "reason": "Anteprima spedizioni in corso e ritardi rispetto all’ETA.",
        "interfaces": ["list_shipments", "delay_alerts"],
        "summary": "Spedizioni e ritardi in anteprima — nessuna modifica reale.",
    },
    "design_assets": {
        "channel": "design",
        "entity_name": "Asset creativi",
        "reason": "Anteprima inventario asset creativi (brand, campagne, formati).",
        "interfaces": ["list_assets", "tag_assets"],
        "summary": "Inventario asset creativi in anteprima — nessuna modifica reale.",
    },
    "design_ads": {
        "channel": "design",
        "entity_name": "Creatività ads",
        "reason": "Anteprima proposte di creatività per ads (bozze, varianti).",
        "interfaces": ["propose_creatives", "variant_matrix"],
        "summary": "Proposte creatività ads in anteprima — nessuna modifica reale.",
    },
    "design_brand": {
        "channel": "design",
        "entity_name": "Brand kit",
        "reason": "Anteprima check brand kit / coerenza logo, colori, tono.",
        "interfaces": ["brand_kit_check", "consistency_score"],
        "summary": "Check brand kit in anteprima — nessuna modifica reale.",
    },
    "it_integrations": {
        "channel": "it",
        "entity_name": "Integrazioni",
        "reason": "Anteprima salute integrazioni (Shopify, Ads, Search Console…).",
        "interfaces": ["integration_health", "last_sync"],
        "summary": "Salute integrazioni in anteprima — nessuna modifica reale.",
    },
    "it_access": {
        "channel": "it",
        "entity_name": "Accessi",
        "reason": (
            "Anteprima accessi / credenziali da completare "
            "(collegato al cue «Accessi da completare» in Agent)."
        ),
        "interfaces": ["list_missing_secrets", "access_checklist"],
        "summary": "Accessi e credenziali da completare — anteprima, nessuna modifica reale.",
    },
    "it_monitoring": {
        "channel": "it",
        "entity_name": "Monitoring",
        "reason": "Anteprima uptime / errori runtime (stub).",
        "interfaces": ["uptime_snapshot", "runtime_errors"],
        "summary": "Uptime ed errori runtime in anteprima — nessuna modifica reale.",
    },
    "ctrl_budget": {
        "channel": "controlling",
        "entity_name": "Budget",
        "reason": "Anteprima budget vs spend per canale / periodo.",
        "interfaces": ["budget_vs_spend", "period_rollup"],
        "summary": "Budget vs spend in anteprima — nessuna modifica reale.",
    },
    "ctrl_kpi": {
        "channel": "controlling",
        "entity_name": "KPI",
        "reason": "Anteprima snapshot KPI (ROAS, CPA, conversioni).",
        "interfaces": ["kpi_snapshot", "trend_flags"],
        "summary": "KPI snapshot in anteprima — nessuna modifica reale.",
    },
    "ctrl_costs": {
        "channel": "controlling",
        "entity_name": "Costi anomali",
        "reason": "Anteprima alert costi anomali rispetto alla baseline.",
        "interfaces": ["cost_anomaly_alerts", "baseline_compare"],
        "summary": "Alert costi anomali in anteprima — nessuna modifica reale.",
    },
}

ALL_STUB_SKILLS = frozenset(STUB_META)


def run(skill_name: str, tenant: TenantConfig | None = None, **_kwargs: Any) -> dict[str, Any]:
    meta = STUB_META.get(skill_name)
    if meta is None:
        return {
            "skill": skill_name,
            "status": "skipped",
            "summary": "Skill stub non registrata.",
        }
    label = tenant.display_name if tenant else "tenant"
    proposals = [
        {
            "action_type": "phase2_stub",
            "channel": meta["channel"],
            "entity_type": "skill",
            "entity_id": skill_name,
            "entity_name": meta["entity_name"],
            "reason": f"{meta['reason']} Contesto: {label}.",
            "requires_approval": True,
            "phase": PHASE,
            "stub": True,
            "interfaces": meta["interfaces"],
        }
    ]
    return {
        "skill": skill_name,
        "status": "phase2_stub",
        "phase": PHASE,
        "summary": meta["summary"],
        "note": f"Interfaces reserved: {', '.join(meta['interfaces'])}.",
        "interfaces": meta["interfaces"],
        "proposals": proposals,
    }
