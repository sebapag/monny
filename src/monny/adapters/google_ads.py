"""Google Ads adapter — mock in dry-run, live hook behind MONNY_LIVE."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from monny.config.loader import resolve_secret
from monny.config.models import TenantConfig


def fetch_spend(tenant: TenantConfig, *, dry_run: bool, fixtures_dir: Path) -> dict[str, Any]:
    google = tenant.ads.google
    if google is None:
        return {"error": "google ads not configured", "campaigns": []}

    if dry_run or resolve_secret(google.secret_ref) is None:
        fixture = fixtures_dir / "google_demo.json"
        return json.loads(fixture.read_text(encoding="utf-8"))

    # Live path placeholder — wire Google Ads API here when credentials are present.
    return {
        "customer_id": google.customer_id,
        "mode": "live_stub",
        "campaigns": [],
        "note": "Live Google Ads client not wired in this scaffold slice.",
    }
