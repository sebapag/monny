"""LangGraph agent state."""

from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    tenant_id: str
    goal: str
    message: str
    thread_id: str
    dry_run: bool
    run_id: str
    plan: list[str]
    planner_source: str
    planner_note: str
    planner_detail: str
    findings: list[dict[str, Any]]
    report: dict[str, Any]
    pending_proposals: list[dict[str, Any]]
    approval_ids: list[str]
    reply: str
    status: str
    timeline: list[dict[str, Any]]
