"""Skill stub: lead warming / CRM nurturing (disabled in MVP router)."""

from __future__ import annotations

from typing import Any


ENABLED = False


def run(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    return {
        "skill": "lead_warming",
        "status": "disabled",
        "note": "Lead warming is a phase-3 stub only.",
        "interfaces": ["ingest_lead", "score", "message_sequence"],
    }
