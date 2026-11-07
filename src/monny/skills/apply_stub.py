"""Apply stubs after HITL approval — no live Ads/CMS mutations."""

from __future__ import annotations

from typing import Any

from monny.skills import seo_apply


def apply_approved(payload: dict[str, Any]) -> dict[str, Any]:
    action = payload.get("action_type")
    if action == "seo_apply_changeset":
        change_set = payload.get("change_set") or {}
        return seo_apply.run(change_set, approved=True)
    if action in {"pause_campaign", "reduce_budget"}:
        return {
            "skill": "spend_apply",
            "status": "applied_stub",
            "action_type": action,
            "channel": payload.get("channel"),
            "entity_id": payload.get("entity_id"),
            "entity_name": payload.get("entity_name"),
            "note": "Ads mutation stub only — dry-run / MONNY_LIVE=0 does not call live APIs.",
            "metrics": payload.get("metrics"),
            "proposed_budget_delta_pct": payload.get("proposed_budget_delta_pct"),
        }
    return {
        "skill": "apply_stub",
        "status": "noop",
        "action_type": action,
        "note": f"No apply handler for action_type={action}",
    }
