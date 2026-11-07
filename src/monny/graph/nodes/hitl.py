"""HITL gate — persist pending proposals; timeline → awaiting decision."""

from __future__ import annotations

from monny.config.settings import get_settings
from monny.graph import timeline
from monny.graph.state import AgentState
from monny.storage.approvals import ApprovalStore
from monny.storage.audit import append_audit
from monny.storage.runs import get_run_store


def _summary_for(proposal: dict) -> str:
    channel = proposal.get("channel") or "?"
    name = proposal.get("entity_name") or proposal.get("entity_id") or "?"
    reason = proposal.get("reason") or ""
    action = proposal.get("action_type") or "action"
    return f"[{action}] {channel}:{name}: {reason}"


def hitl_node(state: AgentState) -> dict:
    settings = get_settings()
    run_id = state.get("run_id")
    timeline.start(run_id, "hitl", "Preparo le proposte per la tua revisione…")

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
            summary=_summary_for(proposal),
            payload=proposal,
        )
        approval_ids.append(approval.id)

    append_audit(
        settings.monny_data_dir,
        state["tenant_id"],
        "hitl_proposals",
        {"approval_ids": approval_ids, "count": len(approval_ids), "run_id": run_id},
    )

    report = state.get("report") or {}
    n = len(approval_ids)
    if approval_ids:
        status = "awaiting_approval"
        label = "proposta" if n == 1 else "proposte"
        reply = (
            f"Ho preparato {n} {label} da revisionare. "
            "Apri il pannello Approvazioni e scegli Approva o Rifiuta."
        )
    else:
        status = "completed"
        reply = "Analisi completata. Non ci sono azioni da approvare al momento."

    if run_id:
        runs = get_run_store(settings.monny_data_dir)
        runs.wait_hitl(run_id, len(approval_ids))
        runs.complete(
            run_id,
            reply=reply,
            report=report,
            approval_ids=approval_ids,
            status="awaiting_approval" if approval_ids else "completed",
        )

    return {
        "approval_ids": approval_ids,
        "reply": reply,
        "status": status,
    }
