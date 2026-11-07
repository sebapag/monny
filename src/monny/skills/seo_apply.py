"""Skill: SEO apply — gated stub (records approval, no CMS writes in this slice)."""

from __future__ import annotations

from typing import Any


def run(change_set: dict[str, Any], *, approved: bool) -> dict[str, Any]:
    if not approved:
        return {
            "skill": "seo_apply",
            "status": "skipped",
            "reason": "Not approved",
        }
    changes = change_set.get("changes") or []
    # Mark proposed → applied_stub (no CMS mutation)
    applied = []
    for change in changes:
        applied.append({**change, "status": "applied_stub"})
    return {
        "skill": "seo_apply",
        "status": "applied_stub",
        "applied": len(applied),
        "note": "CMS apply adapter is a stub — change set recorded as applied_stub only.",
        "change_set": {**change_set, "status": "applied_stub", "changes": applied},
    }
