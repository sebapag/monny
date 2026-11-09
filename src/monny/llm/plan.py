"""LLM skill-plan inference — short JSON only, no chain-of-thought."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from monny.config.settings import Settings, get_settings
from monny.llm.client import chat_completion, llm_configured

# Skills the planner may return (reporting is always appended if missing).
ALLOWED_SKILLS: frozenset[str] = frozenset(
    {
        "spend_google",
        "spend_meta",
        "seo_audit",
        "shopify_promo",
        "lead_warming",
        "ops_orders",
        "ops_inventory",
        "ops_shipping",
        "design_assets",
        "design_ads",
        "design_brand",
        "it_integrations",
        "it_access",
        "it_monitoring",
        "ctrl_budget",
        "ctrl_kpi",
        "ctrl_costs",
        "reporting",
    }
)

SYSTEM_PROMPT = """You are Monny's planner. Choose skills for a marketing / ops run.
Reply with ONLY a JSON object, no markdown, no explanation, no chain-of-thought:
{"skills":["skill_id",...]}
Allowed skill_id values: spend_google, spend_meta, seo_audit, shopify_promo, lead_warming, ops_orders, ops_inventory, ops_shipping, design_assets, design_ads, design_brand, it_integrations, it_access, it_monitoring, ctrl_budget, ctrl_kpi, ctrl_costs, reporting.
Rules: pick the minimum useful skills for the goal; always include reporting last; never invent ids."""


@dataclass(frozen=True)
class PlanInference:
    skills: list[str]
    source: Literal["llm", "stub"]
    note_it: str | None = None
    detail: str | None = None


def _dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def normalize_plan_skills(raw: list[Any]) -> list[str]:
    """Validate/allowlist skill ids; ensure reporting is last."""
    plan: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        sid = item.strip()
        if sid in ALLOWED_SKILLS and sid != "reporting":
            plan.append(sid)
    plan = _dedupe_keep_order(plan)
    plan.append("reporting")
    return plan


def parse_plan_json(text: str) -> list[str]:
    """Extract skills list from model JSON (tolerates fenced markdown)."""
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence:
        cleaned = fence.group(1).strip()
    # Prefer first JSON object if the model added stray text despite instructions.
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("plan JSON must be an object")
    skills = data.get("skills")
    if not isinstance(skills, list) or not skills:
        raise ValueError("plan JSON missing skills list")
    normalized = normalize_plan_skills(skills)
    if not any(s != "reporting" for s in normalized) and skills:
        # Model returned only unknown ids — treat as failure so stub can take over.
        if not any(isinstance(s, str) and s.strip() in ALLOWED_SKILLS for s in skills):
            raise ValueError("plan JSON contained no allowed skill ids")
    return normalized


def infer_plan_skills(
    goal: str,
    message: str,
    *,
    stub_plan: list[str],
    settings: Settings | None = None,
    client: httpx.Client | None = None,
) -> PlanInference:
    """
    When XAI_API_KEY is set, ask Grok for a short skill plan.
    On missing key or any failure, return stub_plan with an Italian UX note when degraded.
    """
    s = settings or get_settings()
    if not llm_configured(s):
        return PlanInference(skills=list(stub_plan), source="stub")

    user = (
        f"Goal: {goal.strip() or '(none)'}\n"
        f"Message: {message.strip() or '(none)'}\n"
        "Return JSON only."
    )
    try:
        content = chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
            ],
            settings=s,
            client=client,
        )
        skills = parse_plan_json(content)
        return PlanInference(skills=skills, source="llm")
    except Exception as exc:  # noqa: BLE001 — degrade to stub for UX / offline
        return PlanInference(
            skills=list(stub_plan),
            source="stub",
            note_it=(
                "Piano automatico: l'assistente non è riuscito a rispondere, "
                "ho usato le regole di base."
            ),
            detail=str(exc),
        )
