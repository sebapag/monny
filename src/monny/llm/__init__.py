"""Optional LLM helpers (xAI Grok). Missing API key → stub/no-op paths."""

from monny.llm.client import chat_completion, llm_configured
from monny.llm.plan import PlanInference, infer_plan_skills

__all__ = [
    "PlanInference",
    "chat_completion",
    "infer_plan_skills",
    "llm_configured",
]
