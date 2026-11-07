"""Skill: SEO apply — gated; stub only (no CMS writes in this slice)."""

from __future__ import annotations

from typing import Any


def run(change_set: dict[str, Any], *, approved: bool) -> dict[str, Any]:
    if not approved:
        return {
            "skill": "seo_apply",
            "status": "skipped",
            "reason": "Not approved",
        }
    return {
        "skill": "seo_apply",
        "status": "stubbed",
        "applied": 0,
        "note": "CMS apply adapter is a stub in this scaffold slice.",
        "change_set_status": change_set.get("status", "proposed"),
    }
