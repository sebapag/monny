"""Planner node — routes goal/message to MVP skills."""

from __future__ import annotations

from monny.graph.state import AgentState


def _infer_plan(goal: str, message: str) -> list[str]:
    text = f"{goal} {message}".lower()
    plan: list[str] = []
    wants_spend = any(k in text for k in ("spend", "ads", "budget", "roas", "cpa", "meta", "google"))
    wants_seo = any(k in text for k in ("seo", "title", "meta", "page", "sitemap"))
    wants_report = any(k in text for k in ("report", "summary", "overview", "daily"))

    if wants_spend or (wants_report and not wants_seo) or (not wants_seo and not wants_spend):
        plan.extend(["spend_google", "spend_meta"])
    if wants_seo or (wants_report and not wants_spend) or "overview" in text:
        plan.append("seo_audit")
    if not plan:
        plan.extend(["spend_google", "spend_meta"])
    plan.append("reporting")
    return plan


def planner_node(state: AgentState) -> dict:
    goal = state.get("goal") or state.get("message") or "report spend ultimi 7 giorni"
    plan = _infer_plan(goal, state.get("message", ""))
    return {
        "goal": goal,
        "plan": plan,
        "findings": [],
        "pending_proposals": [],
        "approval_ids": [],
        "status": "planning",
    }
