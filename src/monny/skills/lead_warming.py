"""Skill stub: lead warming / CRM nurturing (phase 3) — explicit stub proposals."""

from __future__ import annotations

from typing import Any

from monny.config.models import TenantConfig
from monny.skills.knowhow import with_knowhow

ENABLED = True  # routable when asked; still a no-op apply
PHASE = 3


def run(tenant: TenantConfig | None = None, **_kwargs: Any) -> dict[str, Any]:
    label = tenant.display_name if tenant else "tenant"
    proposals = [
        {
            "action_type": "phase3_stub",
            "channel": "lead_warming",
            "entity_type": "skill",
            "entity_id": "lead_warming",
            "entity_name": "Lead warming",
            "reason": (
                f"Anteprima sequenza warming per {label}: ingest/score/touch. "
                "Nessun invio CRM in questa fase."
            ),
            "requires_approval": True,
            "phase": PHASE,
            "stub": True,
            "interfaces": ["ingest_lead", "score", "message_sequence"],
        }
    ]
    result: dict[str, Any] = {
        "skill": "lead_warming",
        "status": "phase3_stub",
        "phase": PHASE,
        "summary": "Lead warming in anteprima — proposal only, nessun invio reale.",
        "note": "Interfaces reserved: ingest_lead, score, message_sequence.",
        "interfaces": ["ingest_lead", "score", "message_sequence"],
        "proposals": proposals,
    }
    if tenant is not None:
        result = with_knowhow(result, tenant, "lead_warming")
    return result
