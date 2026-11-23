"""Plus-tier deep skill stubs — extension hooks until live adapters land.

Each run pulls tenant know-how (playbook path + knowledge tags) so the Agent
surfaces company process even while side effects stay proposal-only.
"""

from __future__ import annotations

from typing import Any

from monny.config.models import TenantConfig
from monny.config.skill_catalog import get_skill
from monny.skills.knowhow import load_knowhow

PHASE = "plus_extension"

# skill_id → interfaces reserved for live adapters + Italian summary
_PLUS_META: dict[str, dict[str, Any]] = {
    "spend_deep_optimize": {
        "channel": "google",
        "entity_name": "Ottimizzazione spend deep",
        "action_type": "phase2_stub",
        "interfaces": [
            "deep_roas_packaging",
            "live_adapter_optimize",
            "advanced_decision_rights",
        ],
        "summary": "Spend deep (Plus): know-how caricato; ottimizzazione live in anteprima.",
        "reason_prefix": "Plus: packaging report ROAS + hook adapter live.",
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
        "summary": "SEO deep (Plus): know-how caricato; brief/report in anteprima.",
        "reason_prefix": "Plus: brief content + packaging report SEO. Hook CMS/live apply riservato.",
    },
    "shopify_deep_merch": {
        "channel": "shopify",
        "entity_name": "Commerce deep merchandising",
        "action_type": "phase2_stub",
        "interfaces": [
            "merch_calendar",
            "promo_report_packaging",
            "shopify_price_rule_live",
        ],
        "summary": "Commerce deep (Plus): piano merch e report in anteprima.",
        "reason_prefix": "Plus: calendario merch + anti-stacking. Nessuna price rule reale.",
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
        "summary": "Lead deep (Plus): scoring/branching in anteprima.",
        "reason_prefix": "Plus: scoring + branching nurture. Nessun invio CRM reale.",
    },
    "ops_deep_sla": {
        "channel": "operations",
        "entity_name": "Operations deep SLA",
        "action_type": "phase2_stub",
        "interfaces": [
            "sla_matrix",
            "ops_report_packaging",
            "wms_exception_live",
        ],
        "summary": "Operations deep (Plus): SLA/OTIF in anteprima.",
        "reason_prefix": "Plus: matrice SLA + report OTIF. Nessuna write WMS.",
    },
    "design_deep_campaign": {
        "channel": "design",
        "entity_name": "Design deep campaign kit",
        "action_type": "phase2_stub",
        "interfaces": [
            "format_matrix",
            "creative_score",
            "dam_publish_live",
        ],
        "summary": "Design deep (Plus): campaign kit e score in anteprima.",
        "reason_prefix": "Plus: matrice formati + score creatività. Nessun publish DAM.",
    },
    "it_deep_reliability": {
        "channel": "it",
        "entity_name": "IT deep reliability",
        "action_type": "phase2_stub",
        "interfaces": [
            "reliability_score",
            "incident_runbook",
            "remediation_live",
        ],
        "summary": "IT deep (Plus): reliability score e runbook in anteprima.",
        "reason_prefix": "Plus: reliability score + runbook. Nessuna remediation live.",
    },
    "ctrl_deep_forecast": {
        "channel": "controlling",
        "entity_name": "Controlling deep forecast",
        "action_type": "phase2_stub",
        "interfaces": [
            "spend_forecast",
            "scenario_pack",
            "finance_export_live",
        ],
        "summary": "Controlling deep (Plus): forecast e scenari in anteprima.",
        "reason_prefix": "Plus: forecast + scenario pack. Nessun export finance live.",
    },
}


def _run_plus(skill_id: str, tenant: TenantConfig) -> dict[str, Any]:
    meta = _PLUS_META[skill_id]
    knowhow = load_knowhow(tenant, skill_id)
    skill = get_skill(skill_id)
    playbook = knowhow.get("playbook") or "n/d"
    proposals = [
        {
            "action_type": meta["action_type"],
            "channel": meta["channel"],
            "entity_type": "skill",
            "entity_id": skill_id,
            "entity_name": meta["entity_name"],
            "reason": (
                f"{meta['reason_prefix']} "
                f"Playbook: {playbook}. "
                "Nessuna modifica reale finché l’adapter live non è collegato."
            ),
            "requires_approval": True,
            "phase": PHASE,
            "stub": True,
            "interfaces": meta["interfaces"],
            "knowhow": knowhow,
            "metrics": list((skill.knowhow.metrics if skill else ()) or knowhow.get("metrics") or []),
            "hitl_prompts": list(
                (skill.knowhow.hitl_prompts if skill else ()) or knowhow.get("hitl_prompts") or []
            ),
        }
    ]
    return {
        "skill": skill_id,
        "status": "plus_extension_stub",
        "phase": PHASE,
        "summary": meta["summary"],
        "knowhow": knowhow,
        "interfaces": meta["interfaces"],
        "proposals": proposals,
    }


PLUS_RUNNERS: dict[str, Any] = {sid: (lambda t, sid=sid, **_: _run_plus(sid, t)) for sid in _PLUS_META}

ALL_PLUS_SKILLS = frozenset(_PLUS_META)


def run(skill_name: str, tenant: TenantConfig, **kwargs: Any) -> dict[str, Any]:
    if skill_name not in _PLUS_META:
        return {
            "skill": skill_name,
            "status": "skipped",
            "summary": "Plus skill non registrata.",
        }
    return _run_plus(skill_name, tenant)
