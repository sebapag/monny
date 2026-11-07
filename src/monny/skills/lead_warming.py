"""Skill stub: lead warming / CRM nurturing (phase 3) — explicit stub proposals."""

from __future__ import annotations

from typing import Any

from monny.config.models import TenantConfig

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
            "entity_name": "Lead warming (phase 3)",
            "reason": (
                f"Phase 3 stub for {label}: would ingest/score leads and draft sequences. "
                "No CRM or messaging side effects in this phase."
            ),
            "requires_approval": True,
            "phase": PHASE,
            "stub": True,
            "interfaces": ["ingest_lead", "score", "message_sequence"],
        }
    ]
    return {
        "skill": "lead_warming",
        "status": "phase3_stub",
        "phase": PHASE,
        "summary": (
            "Lead warming is a phase-3 stub — proposal only, no real side effects."
        ),
        "note": "Interfaces reserved: ingest_lead, score, message_sequence.",
        "interfaces": ["ingest_lead", "score", "message_sequence"],
        "proposals": proposals,
    }
