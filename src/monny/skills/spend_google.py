"""Skill: Google Ads spend read + propose gated writes (mock in dry-run)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from monny.adapters import google_ads
from monny.config.models import TenantConfig


def run(tenant: TenantConfig, *, dry_run: bool, fixtures_dir: Path) -> dict[str, Any]:
    data = google_ads.fetch_spend(tenant, dry_run=dry_run, fixtures_dir=fixtures_dir)
    campaigns = data.get("campaigns", [])
    thresholds = tenant.policy.spend.thresholds
    waste = [
        c
        for c in campaigns
        if c.get("roas", 0) < thresholds.min_roas or c.get("cpa", 0) > thresholds.max_cpa
    ]
    proposals: list[dict[str, Any]] = []
    for c in waste:
        proposals.append(
            {
                "action_type": "pause_campaign",
                "channel": "google",
                "entity_id": c["id"],
                "entity_name": c["name"],
                "reason": f"ROAS {c.get('roas')} / CPA {c.get('cpa')} vs policy",
                "requires_approval": tenant.policy.hitl_default,
            }
        )
    return {
        "skill": "spend_google",
        "mode": "dry_run" if dry_run else "live",
        "summary": f"Reviewed {len(campaigns)} Google campaigns; {len(waste)} underperforming.",
        "campaigns": campaigns,
        "proposals": proposals,
    }
