"""Lead warming — proposal-only (no CRM adapter). Richer findings from tenant know-how."""

from __future__ import annotations

from typing import Any

from monny.config.models import TenantConfig
from monny.skills.knowhow import load_knowhow, with_knowhow

ENABLED = True
PHASE = 3


def run(tenant: TenantConfig | None = None, **_kwargs: Any) -> dict[str, Any]:
    label = tenant.display_name if tenant else "tenant"
    knowhow = load_knowhow(tenant, "lead_warming") if tenant else {}
    playbook = knowhow.get("playbook_title") or knowhow.get("playbook") or "leads playbook"
    metrics = {
        "knowhow_metrics": list(knowhow.get("metrics") or [])[:6],
        "hitl_prompts": list(knowhow.get("hitl_prompts") or [])[:3],
        "playbook": knowhow.get("playbook"),
    }
    proposals = [
        {
            "action_type": "phase3_stub",
            "channel": "lead_warming",
            "entity_type": "skill",
            "entity_id": "lead_warming",
            "entity_name": "Lead warming",
            "reason": (
                f"Sequenza warming per {label}: ingest → score → touch. "
                f"Playbook: {playbook}. Nessun invio CRM (adapter assente) — proposta strutturata."
            ),
            "requires_approval": True,
            "phase": PHASE,
            "stub": True,
            "interfaces": ["ingest_lead", "score", "message_sequence"],
            "metrics": metrics,
        }
    ]
    result: dict[str, Any] = {
        "skill": "lead_warming",
        "status": "proposal_only",
        "phase": PHASE,
        "summary": (
            f"Lead warming in proposta per {label} — playbook citato, nessun CRM live."
        ),
        "note": "Nessun adapter CRM: proposal-only con know-how tenant.",
        "interfaces": ["ingest_lead", "score", "message_sequence"],
        "metrics": metrics,
        "proposals": proposals,
    }
    if tenant is not None:
        result = with_knowhow(result, tenant, "lead_warming")
    return result
