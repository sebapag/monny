"""Skill: SEO apply — HITL-gated; stub by default, live CMS only with MONNY_LIVE=1."""

from __future__ import annotations

from typing import Any

from monny.adapters import cms
from monny.config.models import TenantConfig


def run(
    change_set: dict[str, Any],
    *,
    approved: bool,
    tenant: TenantConfig | None = None,
    dry_run: bool = True,
) -> dict[str, Any]:
    if not approved:
        return {
            "skill": "seo_apply",
            "status": "skipped",
            "reason": "Not approved",
        }
    if tenant is None:
        # Backward-compatible stub when caller has no tenant context
        changes = change_set.get("changes") or []
        applied = [{**c, "status": "applied_stub"} for c in changes]
        return {
            "skill": "seo_apply",
            "status": "applied_stub",
            "applied": len(applied),
            "note": "No tenant context — stub only.",
            "change_set": {**change_set, "status": "applied_stub", "changes": applied},
        }

    result = cms.apply_seo_changeset(tenant, change_set, dry_run=dry_run)
    return {
        "skill": "seo_apply",
        "status": result.get("status"),
        "mode": result.get("mode"),
        "applied": result.get("applied", 0),
        "note": result.get("note"),
        "adapter": result.get("adapter"),
        "change_set": {
            **change_set,
            "status": result.get("status"),
            "changes": result.get("changes") or [],
        },
        "cms_result": result,
    }
