"""Best-effort sync of runs/approvals into Supabase (same DB as Edge/SPA)."""

from __future__ import annotations

from typing import Any

import httpx

from monny.config.settings import Settings


def _rest(settings: Settings, path: str) -> str:
    return f"{settings.supabase_url.rstrip('/')}/rest/v1{path}"


def _headers(settings: Settings) -> dict[str, str]:
    key = (settings.supabase_service_role_key or settings.supabase_anon_key or "").strip()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def sync_enabled(settings: Settings) -> bool:
    return bool(
        settings.supabase_configured
        and (settings.supabase_service_role_key or settings.supabase_anon_key)
    )


def upsert_run(settings: Settings, run: dict[str, Any]) -> None:
    if not sync_enabled(settings):
        return
    row = {
        "id": run["id"],
        "tenant_id": run["tenant_id"],
        "thread_id": run.get("thread_id") or "",
        "goal": run.get("goal") or "",
        "status": run.get("status") or "queued",
        "active_skill": run.get("active_skill"),
        "status_line": run.get("status_line") or "",
        "steps": run.get("steps") or [],
        "reply": run.get("reply"),
        "report": run.get("report"),
        "approval_ids": run.get("approval_ids") or [],
        "error": run.get("error"),
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
    }
    try:
        with httpx.Client(timeout=15.0) as client:
            client.post(_rest(settings, "/agent_runs"), headers=_headers(settings), json=row)
    except Exception:
        # Worker must not fail the agent run if sync is down.
        return


def upsert_approval(settings: Settings, approval: dict[str, Any]) -> None:
    if not sync_enabled(settings):
        return
    row = {
        "id": approval["id"],
        "tenant_id": approval["tenant_id"],
        "thread_id": approval.get("thread_id") or "",
        "action_type": approval.get("action_type") or "proposal",
        "summary": approval.get("summary") or "",
        "payload": approval.get("payload") or {},
        "status": approval.get("status") or "pending",
        "note": approval.get("note"),
        "delegate_to": approval.get("delegate_to"),
        "apply_result": approval.get("apply_result"),
        "created_at": approval.get("created_at"),
        "decided_at": approval.get("decided_at"),
    }
    try:
        with httpx.Client(timeout=15.0) as client:
            client.post(_rest(settings, "/approvals"), headers=_headers(settings), json=row)
    except Exception:
        return
