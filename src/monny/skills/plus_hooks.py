"""Plus-tier deep skill stubs — extension hooks until live adapters land.

Each run pulls tenant know-how (playbook path + knowledge tags) so the Agent
surfaces company process even while side effects stay proposal-only.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from monny.config.models import TenantConfig
from monny.config.settings import get_settings
from monny.config.skill_catalog import get_skill
from monny.knowledge import retrieve

PHASE = "plus_extension"


def _knowhow_payload(tenant: TenantConfig, skill_id: str) -> dict[str, Any]:
    skill = get_skill(skill_id)
    if skill is None:
        return {}
    kh = skill.knowhow
    settings = get_settings()
    tenants_root = Path(settings.monny_tenants_dir)
    chunks: list[dict[str, Any]] = []
    try:
        retrieved = retrieve(
            tenant.tenant_id,
            skill.label_it,
            tags=list(kh.knowledge_tags) or None,
            limit=4,
            root=tenants_root,
        )
        chunks = [c.to_dict() for c in retrieved]
    except Exception:  # noqa: BLE001 — dry-run / missing knowledge is OK
        chunks = []
    playbook_excerpt = ""
    if kh.playbook:
        path = tenants_root / tenant.tenant_id / "knowledge" / kh.playbook
        if path.exists():
            playbook_excerpt = path.read_text(encoding="utf-8")[:1200]
    return {
        "playbook": kh.playbook,
        "knowledge_tags": list(kh.knowledge_tags),
        "knowledge_paths": list(kh.knowledge_paths),
        "chunks": chunks,
        "playbook_excerpt": playbook_excerpt,
    }


def run_spend_deep_optimize(tenant: TenantConfig, **_kwargs: Any) -> dict[str, Any]:
    knowhow = _knowhow_payload(tenant, "spend_deep_optimize")
    proposals = [
        {
            "action_type": "phase2_stub",
            "channel": "google",
            "entity_type": "skill",
            "entity_id": "spend_deep_optimize",
            "entity_name": "Ottimizzazione spend deep",
            "reason": (
                "Plus: packaging report ROAS + hook adapter live. "
                f"Playbook: {knowhow.get('playbook') or 'n/d'}. "
                "Nessuna modifica reale finché l’adapter live non è collegato."
            ),
            "requires_approval": True,
            "phase": PHASE,
            "stub": True,
            "interfaces": [
                "deep_roas_packaging",
                "live_adapter_optimize",
                "advanced_decision_rights",
            ],
            "knowhow": knowhow,
        }
    ]
    return {
        "skill": "spend_deep_optimize",
        "status": "plus_extension_stub",
        "phase": PHASE,
        "summary": (
            "Spend deep (Plus): know-how caricato; ottimizzazione live in anteprima."
        ),
        "knowhow": knowhow,
        "interfaces": proposals[0]["interfaces"],
        "proposals": proposals,
    }


def run_seo_deep_content(tenant: TenantConfig, **_kwargs: Any) -> dict[str, Any]:
    knowhow = _knowhow_payload(tenant, "seo_deep_content")
    proposals = [
        {
            "action_type": "seo_apply_changeset",
            "channel": "seo",
            "entity_type": "skill",
            "entity_id": "seo_deep_content",
            "entity_name": "SEO deep content & report",
            "reason": (
                "Plus: brief content + packaging report SEO. "
                f"Playbook: {knowhow.get('playbook') or 'n/d'}. "
                "Hook CMS/live apply riservato — nessuna modifica reale."
            ),
            "requires_approval": True,
            "phase": PHASE,
            "stub": True,
            "interfaces": [
                "content_brief",
                "seo_report_packaging",
                "cms_live_apply_hook",
            ],
            "knowhow": knowhow,
        }
    ]
    return {
        "skill": "seo_deep_content",
        "status": "plus_extension_stub",
        "phase": PHASE,
        "summary": (
            "SEO deep (Plus): know-how caricato; brief/report in anteprima."
        ),
        "knowhow": knowhow,
        "interfaces": proposals[0]["interfaces"],
        "proposals": proposals,
    }


PLUS_RUNNERS: dict[str, Any] = {
    "spend_deep_optimize": run_spend_deep_optimize,
    "seo_deep_content": run_seo_deep_content,
}

ALL_PLUS_SKILLS = frozenset(PLUS_RUNNERS)


def run(skill_name: str, tenant: TenantConfig, **kwargs: Any) -> dict[str, Any]:
    runner = PLUS_RUNNERS.get(skill_name)
    if runner is None:
        return {
            "skill": skill_name,
            "status": "skipped",
            "summary": "Plus skill non registrata.",
        }
    return runner(tenant, **kwargs)
