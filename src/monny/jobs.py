"""Scheduled job definitions — same LangGraph as interactive runs."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class JobSpec:
    name: str
    goal: str
    description: str


JOBS: dict[str, JobSpec] = {
    "spend_daily": JobSpec(
        name="spend_daily",
        goal="report spend ultimi 7 giorni",
        description="Daily spend diagnosis across Google Ads + Meta",
    ),
    "seo_weekly": JobSpec(
        name="seo_weekly",
        goal="seo audit of priority pages",
        description="Weekly SEO audit of tenant priority URLs",
    ),
}


def resolve_job(name: str) -> JobSpec:
    job = JOBS.get(name)
    if job is None:
        known = ", ".join(sorted(JOBS))
        raise KeyError(f"Unknown job '{name}'. Known: {known}")
    return job
