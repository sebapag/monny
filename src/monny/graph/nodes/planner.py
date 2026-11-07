"""Planner node — routes goal/message to MVP skills (+ stub surfaces when asked)."""

from __future__ import annotations

from monny.graph import timeline
from monny.graph.state import AgentState
from monny.storage.runs import SKILL_LABELS


def _infer_plan(goal: str, message: str) -> list[str]:
    text = f"{goal} {message}".lower()
    plan: list[str] = []

    wants_promo = any(
        k in text for k in ("promo", "promotion", "discount", "price rule", "shopify promo")
    )
    wants_leads = any(
        k in text for k in ("lead", "warming", "nurture", "crm", "sequence")
    )
    wants_spend = any(k in text for k in ("spend", "ads", "budget", "roas", "cpa", "meta", "google"))
    wants_seo = any(k in text for k in ("seo", "title", "meta", "page", "sitemap", "crawl"))
    wants_report = any(k in text for k in ("report", "summary", "overview", "daily"))

    if wants_promo:
        plan.append("shopify_promo")
    if wants_leads:
        plan.append("lead_warming")

    if wants_promo or wants_leads:
        if wants_spend:
            plan.extend(["spend_google", "spend_meta"])
        if wants_seo:
            plan.append("seo_audit")
    else:
        if wants_spend or (wants_report and not wants_seo) or (not wants_seo and not wants_spend):
            plan.extend(["spend_google", "spend_meta"])
        if wants_seo or (wants_report and not wants_spend) or "overview" in text:
            plan.append("seo_audit")
        if not plan:
            plan.extend(["spend_google", "spend_meta"])

    plan.append("reporting")
    seen: set[str] = set()
    ordered: list[str] = []
    for item in plan:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def planner_node(state: AgentState) -> dict:
    run_id = state.get("run_id")
    timeline.start(run_id, "planner", "Sto scegliendo le skill per il tuo obiettivo…")
    goal = state.get("goal") or state.get("message") or "report spend ultimi 7 giorni"
    plan = _infer_plan(goal, state.get("message", ""))
    plan_labels = [SKILL_LABELS.get(s, s) for s in plan]
    timeline.done(run_id, "planner", f"Piano: {', '.join(plan_labels)}")
    return {
        "goal": goal,
        "plan": plan,
        "findings": [],
        "pending_proposals": [],
        "approval_ids": [],
        "status": "planning",
    }
