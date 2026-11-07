"""Skill: Google Ads spend read + structured diagnosis (mock fixtures in dry-run)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from monny.adapters import google_ads
from monny.config.models import TenantConfig
from monny.skills.spend_diagnose import diagnose_campaigns


def run(tenant: TenantConfig, *, dry_run: bool, fixtures_dir: Path) -> dict[str, Any]:
    data = google_ads.fetch_spend(tenant, dry_run=dry_run, fixtures_dir=fixtures_dir)
    campaigns = data.get("campaigns", [])
    diagnosis = diagnose_campaigns(campaigns, channel="google", tenant=tenant)
    totals = diagnosis["totals"]
    return {
        "skill": "spend_google",
        "mode": "dry_run" if dry_run else "live",
        "summary": (
            f"Google: {totals['campaigns']} campaigns, "
            f"{totals['waste']} underperforming "
            f"(waste €{totals['waste_spend']} / {totals['waste_spend_pct']}% of spend)."
        ),
        "diagnosis": diagnosis,
        "campaigns": diagnosis["campaigns"],
        "proposals": diagnosis["proposals"],
    }
