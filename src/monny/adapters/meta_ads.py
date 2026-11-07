"""Meta Ads adapter — mock in dry-run, live hook behind MONNY_LIVE."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from monny.config.loader import resolve_secret
from monny.config.models import TenantConfig


def fetch_spend(tenant: TenantConfig, *, dry_run: bool, fixtures_dir: Path) -> dict[str, Any]:
    meta = tenant.ads.meta
    if meta is None:
        return {"error": "meta ads not configured", "campaigns": []}

    if dry_run or resolve_secret(meta.secret_ref) is None:
        fixture = fixtures_dir / "meta_demo.json"
        return json.loads(fixture.read_text(encoding="utf-8"))

    return {
        "ad_account_id": meta.ad_account_id,
        "mode": "live_stub",
        "campaigns": [],
        "note": "Live Meta Ads client not wired in this scaffold slice.",
    }
