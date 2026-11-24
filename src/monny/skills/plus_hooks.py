"""Plus-tier deep skills — rich proposals from tenant data + playbooks.

No fake WMS/DAM/CRM. `stub: false` only when a real Shopify/ads adapter read backs the finding.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from monny.adapters import google_ads, meta_ads, shopify as shopify_adapter
from monny.config.models import TenantConfig
from monny.config.settings import get_settings
from monny.config.skill_catalog import get_skill
from monny.skills.knowhow import load_knowhow

PHASE = "plus_extension"

_PLUS_META: dict[str, dict[str, Any]] = {
    "spend_deep_optimize": {
        "channel": "google",
        "entity_name": "Ottimizzazione spend deep",
        "action_type": "department_proposal",
        "interfaces": [
            "deep_roas_packaging",
            "live_adapter_optimize",
            "advanced_decision_rights",
        ],
        "summary": "Spend deep (Plus): packaging ROAS da canali ads.",
        "reason_prefix": "Plus: packaging report ROAS + hook adapter live.",
        "adapter": "ads",
    },
    "seo_deep_content": {
        "channel": "seo",
        "entity_name": "SEO deep content & report",
        "action_type": "seo_apply_changeset",
        "interfaces": [
            "content_brief",
            "seo_report_packaging",
            "cms_live_apply_hook",
        ],
        "summary": "SEO deep (Plus): brief/report da playbook + CMS path esistente.",
        "reason_prefix": "Plus: brief content + packaging report SEO. Apply via path CMS esistente.",
        "adapter": None,
    },
    "shopify_deep_merch": {
        "channel": "shopify",
        "entity_name": "Commerce deep merchandising",
        "action_type": "department_proposal",
        "interfaces": [
            "merch_calendar",
            "promo_report_packaging",
            "shopify_price_rule_live",
        ],
        "summary": "Commerce deep (Plus): merch da Shopify collegato.",
        "reason_prefix": "Plus: calendario merch + anti-stacking da price rule / inventory.",
        "adapter": "shopify",
    },
    "leads_deep_nurture": {
        "channel": "leads",
        "entity_name": "Lead deep nurture",
        "action_type": "phase3_stub",
        "interfaces": [
            "lead_scoring",
            "nurture_branching",
            "crm_sequence_live",
        ],
        "summary": "Lead deep (Plus): scoring/branching in proposta (nessun CRM).",
        "reason_prefix": "Plus: scoring + branching nurture. Nessun invio CRM reale.",
        "adapter": None,
    },
    "ops_deep_sla": {
        "channel": "operations",
        "entity_name": "Operations deep SLA",
        "action_type": "department_proposal",
        "interfaces": [
            "sla_matrix",
            "ops_report_packaging",
            "wms_exception_live",
        ],
        "summary": "Operations deep (Plus): SLA da ordini Shopify se collegato.",
        "reason_prefix": "Plus: matrice SLA + report OTIF da ordini (nessuna write WMS).",
        "adapter": "shopify_orders",
    },
    "design_deep_campaign": {
        "channel": "design",
        "entity_name": "Design deep campaign kit",
        "action_type": "department_proposal",
        "interfaces": [
            "format_matrix",
            "creative_score",
            "dam_publish_live",
        ],
        "summary": "Design deep (Plus): kit da campagne ads (nessun DAM).",
        "reason_prefix": "Plus: matrice formati + score creatività da ads. Nessun publish DAM.",
        "adapter": "ads",
    },
    "it_deep_reliability": {
        "channel": "it",
        "entity_name": "IT deep reliability",
        "action_type": "department_proposal",
        "interfaces": [
            "reliability_score",
            "incident_runbook",
            "remediation_live",
        ],
        "summary": "IT deep (Plus): reliability da stato integrazioni tenant.",
        "reason_prefix": "Plus: reliability score + runbook da secret/connector status.",
        "adapter": "integrations",
    },
    "ctrl_deep_forecast": {
        "channel": "controlling",
        "entity_name": "Controlling deep forecast",
        "action_type": "department_proposal",
        "interfaces": [
            "spend_forecast",
            "scenario_pack",
            "finance_export_live",
        ],
        "summary": "Controlling deep (Plus): forecast da billing + ads.",
        "reason_prefix": "Plus: forecast + scenario pack da spend. Nessun export finance live.",
        "adapter": "ads",
    },
}


def _spend_fixtures_dir() -> Path:
    return Path(__file__).resolve().parents[3] / "fixtures" / "spend"


def _run_plus(skill_id: str, tenant: TenantConfig, *, dry_run: bool) -> dict[str, Any]:
    meta = _PLUS_META[skill_id]
    knowhow = load_knowhow(tenant, skill_id)
    skill = get_skill(skill_id)
    playbook = knowhow.get("playbook") or "n/d"
    playbook_title = knowhow.get("playbook_title") or playbook
    adapter = meta.get("adapter")
    uses_real = False
    metrics: dict[str, Any] = {
        "catalog_metrics": list((skill.knowhow.metrics if skill else ()) or knowhow.get("metrics") or []),
    }
    findings: dict[str, Any] = {}
    cta = None
    reason = (
        f"{meta['reason_prefix']} Playbook: {playbook_title}. "
        "Nessuna modifica reale senza HITL / adapter write."
    )
    summary = meta["summary"]
    action_type = meta["action_type"]
    stub = True

    if adapter == "shopify":
        if not shopify_adapter.is_connected(tenant):
            cta = shopify_adapter.connection_cta(tenant)
            reason = cta["message_it"]
            summary = reason
            action_type = "connect_shopify"
            stub = False
        else:
            rules = shopify_adapter.read_price_rules(tenant, dry_run=dry_run)
            inv = shopify_adapter.read_inventory(tenant, dry_run=dry_run)
            findings = {"price_rules": rules, "inventory": inv}
            uses_real = True
            stub = False
            metrics.update(
                {
                    "price_rules": len(rules.get("price_rules") or []),
                    "low_stock": inv.get("low_stock_count"),
                    "mode": rules.get("mode"),
                }
            )
            reason = (
                f"{meta['reason_prefix']} mode={rules.get('mode')}, "
                f"rule={metrics['price_rules']}, low_stock={metrics['low_stock']}. "
                f"Playbook: {playbook_title}."
            )

    elif adapter == "shopify_orders":
        if not shopify_adapter.is_connected(tenant):
            cta = shopify_adapter.connection_cta(tenant)
            reason = cta["message_it"]
            summary = reason
            action_type = "connect_shopify"
            stub = False
        else:
            orders = shopify_adapter.read_orders(tenant, dry_run=dry_run)
            findings = {"orders": orders}
            uses_real = True
            stub = False
            metrics.update(
                {
                    "orders": len(orders.get("orders") or []),
                    "open": orders.get("open_count"),
                    "mode": orders.get("mode"),
                }
            )
            reason = (
                f"{meta['reason_prefix']} Ordini aperti={orders.get('open_count')} "
                f"(mode={orders.get('mode')}). Playbook: {playbook_title}."
            )

    elif adapter == "ads":
        fixtures = _spend_fixtures_dir()
        google = google_ads.fetch_spend(tenant, dry_run=dry_run, fixtures_dir=fixtures)
        meta_data = meta_ads.fetch_spend(tenant, dry_run=dry_run, fixtures_dir=fixtures)
        findings = {"google": google, "meta": meta_data}
        uses_real = True
        stub = False
        g = google.get("campaigns") or []
        m = meta_data.get("campaigns") or []
        spend = sum(float(c.get("spend") or 0) for c in g + m)
        metrics.update(
            {
                "google_campaigns": len(g),
                "meta_campaigns": len(m),
                "spend_sampled": round(spend, 2),
                "budget_eur": tenant.billing.ads_monthly_budget_eur,
                "spent_month_eur": tenant.billing.ads_spent_this_month_eur,
            }
        )
        reason = (
            f"{meta['reason_prefix']} Campagne G={len(g)} M={len(m)}, "
            f"spend sample={spend:.2f}€, mese={tenant.billing.ads_spent_this_month_eur}€. "
            f"Playbook: {playbook_title}."
        )

    elif adapter == "integrations":
        from monny.config.loader import resolve_secret

        snap = {
            "shopify_connected": shopify_adapter.is_connected(tenant),
            "shopify_secret": resolve_secret(tenant.shopify.auth.secret_ref) is not None,
            "google_secret": bool(
                tenant.ads.google and resolve_secret(tenant.ads.google.secret_ref)
            ),
            "meta_secret": bool(tenant.ads.meta and resolve_secret(tenant.ads.meta.secret_ref)),
        }
        findings = {"integrations": snap}
        uses_real = True
        stub = False
        metrics.update(snap)
        reason = (
            f"{meta['reason_prefix']} Shopify connected={snap['shopify_connected']}. "
            f"Playbook: {playbook_title}."
        )

    else:
        # Proposal-only with richer know-how citation (no fake external systems)
        metrics["hitl_prompts"] = list(
            (skill.knowhow.hitl_prompts if skill else ()) or knowhow.get("hitl_prompts") or []
        )[:3]
        reason = (
            f"{meta['reason_prefix']} Playbook: {playbook_title}. "
            "Proposal-only: nessun sistema esterno inventato."
        )
        action_type = meta["action_type"]
        stub = True

    proposals = [
        {
            "action_type": action_type,
            "channel": meta["channel"],
            "entity_type": "skill",
            "entity_id": skill_id,
            "entity_name": meta["entity_name"],
            "reason": reason,
            "requires_approval": action_type != "connect_shopify",
            "phase": PHASE,
            "stub": stub,
            "interfaces": meta["interfaces"],
            "knowhow": knowhow,
            "metrics": metrics,
            "hitl_prompts": list(
                (skill.knowhow.hitl_prompts if skill else ()) or knowhow.get("hitl_prompts") or []
            ),
            "admin_hash": (cta or {}).get("admin_hash") if cta else None,
        }
    ]
    result: dict[str, Any] = {
        "skill": skill_id,
        "status": "needs_connector" if cta else ("ok" if uses_real else "plus_extension_proposal"),
        "phase": PHASE,
        "summary": summary,
        "knowhow": knowhow,
        "interfaces": meta["interfaces"],
        "metrics": metrics,
        "findings": findings,
        "proposals": proposals,
    }
    if cta:
        result["cta"] = cta
    return result


PLUS_RUNNERS: dict[str, Any] = {
    sid: (lambda t, sid=sid, **kw: _run_plus(sid, t, dry_run=kw.get("dry_run", True)))
    for sid in _PLUS_META
}

ALL_PLUS_SKILLS = frozenset(_PLUS_META)


def run(skill_name: str, tenant: TenantConfig, **kwargs: Any) -> dict[str, Any]:
    if skill_name not in _PLUS_META:
        return {
            "skill": skill_name,
            "status": "skipped",
            "summary": "Plus skill non registrata.",
        }
    settings = get_settings()
    dry_run = kwargs.get("dry_run", settings.dry_run)
    return _run_plus(skill_name, tenant, dry_run=bool(dry_run))
