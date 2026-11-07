"""HITL gate — create pending approvals for proposals (interrupt placeholder)."""

from __future__ import annotations

from monny.config.settings import get_settings
from monny.graph.state import AgentState
from monny.storage.approvals import ApprovalStore
from monny.storage.audit import append_audit


def hitl_node(state: AgentState) -> dict:
    settings = get_settings()
    store = ApprovalStore(settings.monny_data_dir)
    proposals = state.get("pending_proposals") or []
    approval_ids: list[str] = []

    for proposal in proposals:
        if not proposal.get("requires_approval", True):
            continue
        approval = store.create(
            tenant_id=state["tenant_id"],
            thread_id=state.get("thread_id") or "cli",
            action_type=proposal.get("action_type", "unknown"),
            summary=(
                f"{proposal.get('channel')}:{proposal.get('entity_name')} — "
                f"{proposal.get('reason')}"
            ),
            payload=proposal,
        )
        approval_ids.append(approval.id)

    append_audit(
        settings.monny_data_dir,
        state["tenant_id"],
        "hitl_proposals",
        {"approval_ids": approval_ids, "count": len(approval_ids)},
    )

    if approval_ids:
        reply_extra = (
            f"\n\n{len(approval_ids)} proposal(s) awaiting approval "
            f"(ids: {', '.join(approval_ids[:3])}{'…' if len(approval_ids) > 3 else ''})."
        )
        status = "awaiting_approval"
    else:
        reply_extra = "\n\nNo gated actions proposed."
        status = "completed"

    report = state.get("report") or {}
    reply = (report.get("markdown") or "Done.") + reply_extra

    return {
        "approval_ids": approval_ids,
        "reply": reply,
        "status": status,
    }
