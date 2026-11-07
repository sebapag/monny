"""Shared spend diagnosis: CPA/ROAS/waste → gated action proposals."""

from __future__ import annotations

from typing import Any

from monny.config.models import SpendPolicy, TenantConfig


def diagnose_campaigns(
    campaigns: list[dict[str, Any]],
    *,
    channel: str,
    tenant: TenantConfig,
) -> dict[str, Any]:
    policy: SpendPolicy = tenant.policy.spend
    thresholds = policy.thresholds
    hitl = tenant.policy.hitl_default

    healthy: list[dict[str, Any]] = []
    waste: list[dict[str, Any]] = []
    diagnoses: list[dict[str, Any]] = []
    proposals: list[dict[str, Any]] = []

    total_spend = 0.0
    waste_spend = 0.0

    for c in campaigns:
        spend = float(c.get("spend") or 0)
        roas = float(c.get("roas") or 0)
        cpa = float(c.get("cpa") or 0)
        conversions = float(c.get("conversions") or 0)
        total_spend += spend

        flags: list[str] = []
        if roas < thresholds.min_roas:
            flags.append(f"roas_below_{thresholds.min_roas}")
        if cpa > thresholds.max_cpa:
            flags.append(f"cpa_above_{thresholds.max_cpa}")
        if conversions == 0 and spend > 0:
            flags.append("zero_conversions")

        row = {
            **c,
            "channel": channel,
            "flags": flags,
            "healthy": not flags,
        }
        diagnoses.append(row)

        if flags:
            waste.append(row)
            waste_spend += spend
            # High waste + zero/low conversions → pause; otherwise propose budget cut
            if "zero_conversions" in flags or roas < thresholds.min_roas * 0.5:
                action = "pause_campaign"
                rationale = (
                    f"Severe underperformance: ROAS {roas}, CPA {cpa}, "
                    f"flags={','.join(flags)}"
                )
            else:
                action = "reduce_budget"
                delta = min(policy.max_budget_delta_pct, 15.0)
                rationale = (
                    f"ROAS {roas} / CPA {cpa} vs policy "
                    f"(min_roas={thresholds.min_roas}, max_cpa={thresholds.max_cpa}); "
                    f"propose -{delta:g}% daily budget"
                )
                row = {**row, "proposed_budget_delta_pct": -delta}

            proposals.append(
                {
                    "action_type": action,
                    "channel": channel,
                    "entity_type": "campaign",
                    "entity_id": c.get("id"),
                    "entity_name": c.get("name"),
                    "metrics": {
                        "spend": spend,
                        "roas": roas,
                        "cpa": cpa,
                        "conversions": conversions,
                        "daily_budget": c.get("daily_budget"),
                    },
                    "flags": flags,
                    "reason": rationale,
                    "requires_approval": hitl,
                    "proposed_budget_delta_pct": row.get("proposed_budget_delta_pct"),
                }
            )
        else:
            healthy.append(row)

    return {
        "channel": channel,
        "lookback_policy_days": thresholds.lookback_days,
        "thresholds": {
            "min_roas": thresholds.min_roas,
            "max_cpa": thresholds.max_cpa,
        },
        "totals": {
            "campaigns": len(campaigns),
            "healthy": len(healthy),
            "waste": len(waste),
            "spend": round(total_spend, 2),
            "waste_spend": round(waste_spend, 2),
            "waste_spend_pct": round((waste_spend / total_spend * 100) if total_spend else 0, 1),
        },
        "campaigns": diagnoses,
        "waste": waste,
        "healthy": healthy,
        "proposals": proposals,
    }
