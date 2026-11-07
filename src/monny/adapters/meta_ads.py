"""Meta Ads adapter — fixtures by default; live client interface behind MONNY_LIVE=1."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from monny.adapters.live_mode import use_live
from monny.config.loader import resolve_secret
from monny.config.models import TenantConfig


class MetaAdsLiveClient:
    """Meta Marketing API client interface (Graph insights).

    Tenant secret_ref must resolve to a user/system access token with ads_read.
    """

    GRAPH = "https://graph.facebook.com/v21.0"

    def __init__(self, *, ad_account_id: str, access_token: str) -> None:
        self.ad_account_id = ad_account_id
        self.access_token = access_token

    @classmethod
    def from_tenant(cls, tenant: TenantConfig) -> MetaAdsLiveClient:
        meta = tenant.ads.meta
        if meta is None:
            raise ValueError("Meta Ads not configured for tenant")
        token = resolve_secret(meta.secret_ref)
        if not token:
            raise ValueError(f"Secret not set: {meta.secret_ref}")
        return cls(ad_account_id=meta.ad_account_id, access_token=token)

    def fetch_campaign_metrics(self, *, lookback_days: int = 7) -> dict[str, Any]:
        account = self.ad_account_id
        if not account.startswith("act_"):
            account = f"act_{account}"
        url = f"{self.GRAPH}/{account}/insights"
        params = {
            "access_token": self.access_token,
            "level": "campaign",
            "date_preset": "last_7d" if lookback_days <= 7 else "last_14d",
            "fields": (
                "campaign_id,campaign_name,impressions,clicks,spend,"
                "actions,action_values,cost_per_action_type"
            ),
        }
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            payload = resp.json()
        return {
            "ad_account_id": self.ad_account_id,
            "mode": "live",
            "lookback_days": lookback_days,
            "campaigns": _normalize_meta_rows(payload.get("data") or []),
        }

    def mutate_campaign(
        self,
        *,
        action_type: str,
        entity_id: str,
        budget_delta_pct: float | None = None,
    ) -> dict[str, Any]:
        return {
            "mode": "live",
            "status": "not_executed_scaffold",
            "action_type": action_type,
            "entity_id": entity_id,
            "budget_delta_pct": budget_delta_pct,
            "note": (
                "Live Meta mutate is scaffolded. Wire Campaign status/budget update "
                "before enabling unattended production writes."
            ),
        }


def _normalize_meta_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        spend = float(row.get("spend") or 0)
        conversions = 0.0
        value = 0.0
        for action in row.get("actions") or []:
            if action.get("action_type") in {"purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"}:
                conversions += float(action.get("value") or 0)
        for action in row.get("action_values") or []:
            if action.get("action_type") in {"purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"}:
                value += float(action.get("value") or 0)
        out.append(
            {
                "id": str(row.get("campaign_id") or ""),
                "name": row.get("campaign_name") or "",
                "status": "ACTIVE",
                "impressions": int(row.get("impressions") or 0),
                "clicks": int(row.get("clicks") or 0),
                "spend": round(spend, 2),
                "conversions": conversions,
                "cpa": round(spend / conversions, 2) if conversions else 0,
                "roas": round(value / spend, 2) if spend else 0,
            }
        )
    return out


def fetch_spend(tenant: TenantConfig, *, dry_run: bool, fixtures_dir: Path) -> dict[str, Any]:
    meta = tenant.ads.meta
    if meta is None:
        return {"error": "meta ads not configured", "campaigns": [], "mode": "unconfigured"}

    if not use_live(dry_run=dry_run, secret_ref=meta.secret_ref):
        fixture = fixtures_dir / "meta_demo.json"
        data = json.loads(fixture.read_text(encoding="utf-8"))
        data["mode"] = "fixture"
        return data

    try:
        client = MetaAdsLiveClient.from_tenant(tenant)
        lookback = tenant.policy.spend.thresholds.lookback_days
        return client.fetch_campaign_metrics(lookback_days=lookback)
    except Exception as exc:
        return {
            "ad_account_id": meta.ad_account_id,
            "mode": "live_error",
            "campaigns": [],
            "error": str(exc),
            "note": "Live Meta Ads call failed; fix credentials or set MONNY_LIVE=0.",
        }


def apply_action(
    tenant: TenantConfig,
    *,
    action_type: str,
    entity_id: str,
    budget_delta_pct: float | None = None,
    dry_run: bool,
) -> dict[str, Any]:
    meta = tenant.ads.meta
    if meta is None:
        return {"status": "error", "error": "meta ads not configured"}
    if not use_live(dry_run=dry_run, secret_ref=meta.secret_ref):
        return {
            "status": "applied_stub",
            "mode": "fixture",
            "action_type": action_type,
            "entity_id": entity_id,
            "channel": "meta",
            "note": "Dry-run / MONNY_LIVE=0 — no Meta API call.",
        }
    client = MetaAdsLiveClient.from_tenant(tenant)
    return client.mutate_campaign(
        action_type=action_type,
        entity_id=entity_id,
        budget_delta_pct=budget_delta_pct,
    )
