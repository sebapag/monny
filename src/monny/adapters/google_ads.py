"""Google Ads adapter — fixtures by default; live client interface behind MONNY_LIVE=1."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx

from monny.adapters.live_mode import use_live
from monny.config.loader import resolve_secret
from monny.config.models import TenantConfig


class GoogleAdsLiveClient:
    """Minimal Google Ads API client interface (REST searchStream-shaped).

    Required env (in addition to tenant secret_ref token):
      GOOGLE_ADS_DEVELOPER_TOKEN
    Optional:
      GOOGLE_ADS_LOGIN_CUSTOMER_ID  (MCC)
    """

    def __init__(
        self,
        *,
        customer_id: str,
        access_token: str,
        developer_token: str,
        login_customer_id: str | None = None,
    ) -> None:
        self.customer_id = customer_id.replace("-", "")
        self.access_token = access_token
        self.developer_token = developer_token
        self.login_customer_id = (
            login_customer_id.replace("-", "") if login_customer_id else None
        )

    @classmethod
    def from_tenant(cls, tenant: TenantConfig) -> GoogleAdsLiveClient:
        google = tenant.ads.google
        if google is None:
            raise ValueError("Google Ads not configured for tenant")
        token = resolve_secret(google.secret_ref)
        if not token:
            raise ValueError(f"Secret not set: {google.secret_ref}")
        developer = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", "").strip()
        if not developer:
            raise ValueError("GOOGLE_ADS_DEVELOPER_TOKEN is required for live Google Ads")
        login = google.login_customer_id or os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
        return cls(
            customer_id=google.customer_id,
            access_token=token,
            developer_token=developer,
            login_customer_id=login,
        )

    def fetch_campaign_metrics(self, *, lookback_days: int = 7) -> dict[str, Any]:
        """Call Google Ads searchStream. Returns normalized campaign rows."""
        query = f"""
            SELECT campaign.id, campaign.name, campaign.status,
                   metrics.impressions, metrics.clicks, metrics.cost_micros,
                   metrics.conversions, metrics.conversions_value
            FROM campaign
            WHERE segments.date DURING LAST_{lookback_days}_DAYS
        """.strip()
        url = (
            f"https://googleads.googleapis.com/v18/customers/"
            f"{self.customer_id}/googleAds:searchStream"
        )
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "developer-token": self.developer_token,
            "Content-Type": "application/json",
        }
        if self.login_customer_id:
            headers["login-customer-id"] = self.login_customer_id
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, headers=headers, json={"query": query})
            resp.raise_for_status()
            payload = resp.json()
        return {
            "customer_id": self.customer_id,
            "mode": "live",
            "lookback_days": lookback_days,
            "campaigns": _normalize_google_rows(payload),
            "raw_keys": list(payload.keys()) if isinstance(payload, dict) else [],
        }

    def mutate_campaign(
        self,
        *,
        action_type: str,
        entity_id: str,
        budget_delta_pct: float | None = None,
    ) -> dict[str, Any]:
        """Live mutation interface — explicit only; never called unless MONNY_LIVE=1 + approved."""
        return {
            "mode": "live",
            "status": "not_executed_scaffold",
            "action_type": action_type,
            "entity_id": entity_id,
            "budget_delta_pct": budget_delta_pct,
            "note": (
                "Live mutate endpoint is scaffolded. Wire CampaignService mutate "
                "before enabling unattended production writes."
            ),
        }


def _normalize_google_rows(payload: Any) -> list[dict[str, Any]]:
    """Best-effort normalize; live payloads vary — keep empty list if unknown shape."""
    rows: list[dict[str, Any]] = []
    results = payload if isinstance(payload, list) else payload.get("results", []) if isinstance(payload, dict) else []
    for block in results:
        for row in block.get("results", [block] if "campaign" in block else []):
            camp = row.get("campaign") or {}
            metrics = row.get("metrics") or {}
            cost = float(metrics.get("costMicros") or metrics.get("cost_micros") or 0) / 1_000_000
            conversions = float(metrics.get("conversions") or 0)
            value = float(metrics.get("conversionsValue") or metrics.get("conversions_value") or 0)
            rows.append(
                {
                    "id": str(camp.get("id") or ""),
                    "name": camp.get("name") or "",
                    "status": camp.get("status") or "",
                    "impressions": int(metrics.get("impressions") or 0),
                    "clicks": int(metrics.get("clicks") or 0),
                    "spend": round(cost, 2),
                    "conversions": conversions,
                    "cpa": round(cost / conversions, 2) if conversions else 0,
                    "roas": round(value / cost, 2) if cost else 0,
                }
            )
    return rows


def fetch_spend(tenant: TenantConfig, *, dry_run: bool, fixtures_dir: Path) -> dict[str, Any]:
    google = tenant.ads.google
    if google is None:
        return {"error": "google ads not configured", "campaigns": [], "mode": "unconfigured"}

    if not use_live(dry_run=dry_run, secret_ref=google.secret_ref):
        fixture = fixtures_dir / "google_demo.json"
        data = json.loads(fixture.read_text(encoding="utf-8"))
        data["mode"] = "fixture"
        return data

    try:
        client = GoogleAdsLiveClient.from_tenant(tenant)
        lookback = tenant.policy.spend.thresholds.lookback_days
        return client.fetch_campaign_metrics(lookback_days=lookback)
    except Exception as exc:
        return {
            "customer_id": google.customer_id,
            "mode": "live_error",
            "campaigns": [],
            "error": str(exc),
            "note": "Live Google Ads call failed; fix credentials or set MONNY_LIVE=0.",
        }


def apply_action(
    tenant: TenantConfig,
    *,
    action_type: str,
    entity_id: str,
    budget_delta_pct: float | None = None,
    dry_run: bool,
) -> dict[str, Any]:
    google = tenant.ads.google
    if google is None:
        return {"status": "error", "error": "google ads not configured"}
    if not use_live(dry_run=dry_run, secret_ref=google.secret_ref):
        return {
            "status": "applied_stub",
            "mode": "fixture",
            "action_type": action_type,
            "entity_id": entity_id,
            "channel": "google",
            "note": "Dry-run / MONNY_LIVE=0 — no Google Ads API call.",
        }
    client = GoogleAdsLiveClient.from_tenant(tenant)
    return client.mutate_campaign(
        action_type=action_type,
        entity_id=entity_id,
        budget_delta_pct=budget_delta_pct,
    )
