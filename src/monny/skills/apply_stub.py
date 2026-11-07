"""Apply approved HITL actions — stubs by default; live adapters only when MONNY_LIVE=1."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from monny.adapters import google_ads, meta_ads
from monny.config.loader import load_tenant
from monny.config.settings import get_settings
from monny.skills import seo_apply


def apply_approved(payload: dict[str, Any], *, tenant_id: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    dry_run = settings.dry_run
    tid = tenant_id or payload.get("tenant_id")
    tenant = None
    if tid:
        try:
            tenant = load_tenant(tid, Path(settings.monny_tenants_dir))
        except FileNotFoundError:
            tenant = None

    action = payload.get("action_type")
    if action == "seo_apply_changeset":
        change_set = payload.get("change_set") or {}
        return seo_apply.run(
            change_set,
            approved=True,
            tenant=tenant,
            dry_run=dry_run,
        )

    if action in {"pause_campaign", "reduce_budget"}:
        channel = payload.get("channel")
        entity_id = str(payload.get("entity_id") or "")
        delta = payload.get("proposed_budget_delta_pct")
        if tenant is None:
            return {
                "skill": "spend_apply",
                "status": "applied_stub",
                "action_type": action,
                "channel": channel,
                "entity_id": entity_id,
                "note": "No tenant loaded — stub only.",
            }
        if channel == "google":
            result = google_ads.apply_action(
                tenant,
                action_type=action,
                entity_id=entity_id,
                budget_delta_pct=float(delta) if delta is not None else None,
                dry_run=dry_run,
            )
        elif channel == "meta":
            result = meta_ads.apply_action(
                tenant,
                action_type=action,
                entity_id=entity_id,
                budget_delta_pct=float(delta) if delta is not None else None,
                dry_run=dry_run,
            )
        else:
            result = {"status": "error", "error": f"Unknown channel: {channel}"}
        return {
            "skill": "spend_apply",
            "action_type": action,
            "channel": channel,
            "entity_id": entity_id,
            "entity_name": payload.get("entity_name"),
            "metrics": payload.get("metrics"),
            **result,
        }

    return {
        "skill": "apply_stub",
        "status": "noop",
        "action_type": action,
        "note": f"No apply handler for action_type={action}",
    }
