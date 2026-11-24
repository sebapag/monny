"""Apply approved HITL actions — stubs by default; live adapters only when MONNY_LIVE=1."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from monny.adapters import google_ads, meta_ads, shopify as shopify_adapter
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

    # Explicit connect CTA — no side effects
    if action == "connect_shopify":
        return {
            "skill": "shopify_promo",
            "status": "redirect_admin",
            "action_type": action,
            "admin_hash": payload.get("admin_hash") or "#admin/connectors",
            "note": "Apri Admin → Connettori commerce per collegare Shopify.",
        }

    # True phase stubs / proposal-only with stub=True — acknowledge without writes.
    # Real adapter-backed proposals set stub=False and use dedicated handlers below.
    if action in {"phase2_stub", "phase3_stub"} or (
        payload.get("stub") and action not in {"create_price_rule", "department_proposal"}
    ):
        return {
            "skill": payload.get("channel") or "stub",
            "status": "noop_stub",
            "action_type": action,
            "phase": payload.get("phase"),
            "note": "Phase stub acknowledged — no side effects executed.",
        }

    if action == "department_proposal":
        return {
            "skill": payload.get("channel") or "department",
            "status": "acknowledged",
            "action_type": action,
            "phase": payload.get("phase"),
            "metrics": payload.get("metrics"),
            "note": (
                "Proposta dipartimento registrata. Nessuna write su WMS/DAM/CRM "
                "(solo adapter reali quando presenti)."
            ),
        }

    if action == "create_price_rule":
        if tenant is None:
            return {
                "skill": "shopify_promo",
                "status": "applied_stub",
                "action_type": action,
                "note": "No tenant loaded — stub only.",
            }
        rule = payload.get("proposed_rule") or {
            "title": payload.get("entity_name") or "ATRIUM-PROMO",
            "value_type": "percentage",
            "value": "-10.0",
            "target_type": "line_item",
            "target_selection": "all",
            "allocation_method": "across",
            "customer_selection": "all",
        }
        result = shopify_adapter.apply_price_rule(tenant, rule=rule, dry_run=dry_run)
        return {
            "skill": "shopify_promo",
            "action_type": action,
            "entity_id": payload.get("entity_id"),
            "entity_name": payload.get("entity_name"),
            **result,
        }

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
