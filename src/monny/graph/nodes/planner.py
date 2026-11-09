"""Planner node — routes goal/message to MVP skills (+ stub surfaces when asked)."""

from __future__ import annotations

from pathlib import Path

import httpx

from monny.config.entitlements import filter_plan
from monny.config.loader import load_tenant
from monny.config.models import TenantConfig
from monny.config.settings import Settings, get_settings
from monny.graph import timeline
from monny.graph.state import AgentState
from monny.llm.plan import PlanInference, infer_plan_skills
from monny.storage.runs import SKILL_LABELS


def _stub_infer_plan_raw(goal: str, message: str) -> list[str]:
    """Keyword/heuristic planner — used when no LLM key or as fallback."""
    text = f"{goal} {message}".lower()
    plan: list[str] = []

    wants_promo = any(
        k in text for k in ("promo", "promotion", "discount", "price rule", "shopify promo")
    )
    wants_leads = any(
        k in text for k in ("lead", "warming", "nurture", "crm", "sequence")
    )
    wants_ops = any(
        k in text
        for k in (
            "operat",
            "fulfillment",
            "giacenz",
            "inventory",
            "stock alert",
            "spedizion",
            "shipping",
            "ordini",
            "stato ordini",
        )
    )
    wants_design = any(
        k in text
        for k in ("design", "creative", "creativit", "brand kit", "asset creativ", "graphic")
    )
    wants_it = any(
        k in text
        for k in (
            "integraz",
            "integration",
            "accessi",
            "credenzial",
            "uptime",
            "monitoring",
            "runtime",
        )
    )
    wants_ctrl = any(
        k in text
        for k in ("controlling", "budget vs", "kpi snapshot", "costi anomali", "cost alert")
    )
    wants_spend = any(k in text for k in ("spend", "ads", "budget", "roas", "cpa", "meta", "google"))
    wants_seo = any(k in text for k in ("seo", "title", "meta", "page", "sitemap", "crawl"))
    wants_report = any(k in text for k in ("report", "summary", "overview", "daily"))

    stub_only = False
    if wants_promo:
        plan.append("shopify_promo")
        stub_only = True
    if wants_leads:
        plan.append("lead_warming")
        stub_only = True
    if wants_ops:
        if "giacenz" in text or "inventory" in text or "stock" in text:
            plan.append("ops_inventory")
        elif "spedizion" in text or "shipping" in text or "ritard" in text:
            plan.append("ops_shipping")
        else:
            plan.append("ops_orders")
        stub_only = True
    if wants_design:
        if "brand" in text:
            plan.append("design_brand")
        elif "asset" in text:
            plan.append("design_assets")
        elif "ads" in text or "creativ" in text:
            plan.append("design_ads")
        else:
            plan.append("design_assets")
        stub_only = True
    if wants_it:
        if "accessi" in text or "credenzial" in text:
            plan.append("it_access")
        elif "uptime" in text or "monitor" in text or "runtime" in text or "errori" in text:
            plan.append("it_monitoring")
        else:
            plan.append("it_integrations")
        stub_only = True
    if wants_ctrl:
        if "kpi" in text:
            plan.append("ctrl_kpi")
        elif "cost" in text or "anomali" in text:
            plan.append("ctrl_costs")
        else:
            plan.append("ctrl_budget")
        stub_only = True

    if stub_only:
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


def _infer_plan_raw(
    goal: str,
    message: str,
    *,
    settings: Settings | None = None,
    client: httpx.Client | None = None,
) -> list[str]:
    """Plan skill ids — Grok when XAI_API_KEY is set, else keyword stub."""
    return infer_plan_raw_with_meta(
        goal, message, settings=settings, client=client
    ).skills


def infer_plan_raw_with_meta(
    goal: str,
    message: str,
    *,
    settings: Settings | None = None,
    client: httpx.Client | None = None,
) -> PlanInference:
    stub = _stub_infer_plan_raw(goal, message)
    return infer_plan_skills(
        goal,
        message,
        stub_plan=stub,
        settings=settings,
        client=client,
    )


def _apply_entitlements(plan: list[str], tenant: TenantConfig | None) -> list[str]:
    if tenant is None:
        return plan
    filtered = filter_plan(tenant, plan)
    # If every product skill was stripped, keep reporting only (Leadership path).
    if not any(s != "reporting" for s in filtered):
        return ["reporting"]
    return filtered


def _infer_plan(
    goal: str,
    message: str,
    tenant: TenantConfig | None = None,
    *,
    settings: Settings | None = None,
    client: httpx.Client | None = None,
) -> list[str]:
    inference = infer_plan_raw_with_meta(
        goal, message, settings=settings, client=client
    )
    return _apply_entitlements(inference.skills, tenant)


def _infer_plan_with_meta(
    goal: str,
    message: str,
    tenant: TenantConfig | None = None,
    *,
    settings: Settings | None = None,
    client: httpx.Client | None = None,
) -> PlanInference:
    inference = infer_plan_raw_with_meta(
        goal, message, settings=settings, client=client
    )
    skills = _apply_entitlements(inference.skills, tenant)
    return PlanInference(
        skills=skills,
        source=inference.source,
        note_it=inference.note_it,
        detail=inference.detail,
    )


def planner_node(state: AgentState) -> dict:
    run_id = state.get("run_id")
    timeline.start(run_id, "planner", "Sto scegliendo le skill per il tuo obiettivo…")
    goal = state.get("goal") or state.get("message") or "report spend ultimi 7 giorni"
    settings = get_settings()
    tenant = load_tenant(state["tenant_id"], Path(settings.monny_tenants_dir).resolve())

    # Reuse a precomputed plan (API previews once) to avoid a second LLM call.
    precomputed = state.get("plan")
    if precomputed:
        plan = _apply_entitlements(list(precomputed), tenant)
        note_it = state.get("planner_note")
        detail = state.get("planner_detail")
        source = state.get("planner_source") or "stub"
    else:
        inference = _infer_plan_with_meta(
            goal, state.get("message", ""), tenant=tenant, settings=settings
        )
        plan = inference.skills
        note_it = inference.note_it
        detail = inference.detail
        source = inference.source

    plan_labels = [SKILL_LABELS.get(s, s) for s in plan]
    done_msg = f"Piano: {', '.join(plan_labels)}"
    if note_it:
        # Italian UX note first; technical detail stays secondary/collapsed in timeline text.
        done_msg = note_it
        if detail:
            done_msg = f"{note_it} (dettaglio tecnico: {detail})"
        else:
            done_msg = f"{note_it} Piano: {', '.join(plan_labels)}"
    elif source == "llm":
        done_msg = f"Piano (assistente): {', '.join(plan_labels)}"

    timeline.done(run_id, "planner", done_msg)
    out: dict = {
        "goal": goal,
        "plan": plan,
        "findings": [],
        "pending_proposals": [],
        "approval_ids": [],
        "status": "planning",
        "planner_source": source,
    }
    if note_it:
        out["planner_note"] = note_it
    if detail:
        out["planner_detail"] = detail
    return out
