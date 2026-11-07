"""Skill: reporting — assemble markdown + structured payload for Agent UI."""

from __future__ import annotations

from typing import Any


def run(findings: list[dict[str, Any]], goal: str) -> dict[str, Any]:
    lines = [f"Goal: {goal}", ""]
    proposals: list[dict[str, Any]] = []
    spend_channels: list[dict[str, Any]] = []
    seo_change_set: dict[str, Any] | None = None
    seo_findings: list[dict[str, Any]] = []

    for item in findings:
        skill = item.get("skill", "unknown")
        if skill == "reporting":
            continue
        lines.append(f"## {skill}")
        lines.append(item.get("summary", ""))

        diagnosis = item.get("diagnosis")
        if diagnosis:
            spend_channels.append(diagnosis)
            totals = diagnosis.get("totals", {})
            lines.append(
                f"- Spend €{totals.get('spend')} · waste €{totals.get('waste_spend')} "
                f"({totals.get('waste_spend_pct')}%) · "
                f"{totals.get('healthy')} healthy / {totals.get('waste')} waste"
            )
            for camp in diagnosis.get("campaigns", []):
                flag = "⚠" if camp.get("flags") else "✓"
                lines.append(
                    f"  {flag} {camp.get('name')}: ROAS {camp.get('roas')} · "
                    f"CPA {camp.get('cpa')} · spend €{camp.get('spend')}"
                )

        for proposal in item.get("proposals", []):
            proposals.append(proposal)
            lines.append(
                f"- Propose **{proposal.get('action_type')}** on "
                f"{proposal.get('channel')}:{proposal.get('entity_name')} "
                f"— {proposal.get('reason')}"
            )

        change_set = item.get("change_set")
        if change_set:
            seo_change_set = change_set
            seo_findings = item.get("findings") or []
            lines.append(
                f"- SEO change set status={change_set.get('status')} "
                f"({len(change_set.get('changes', []))} changes)"
            )
            for change in change_set.get("changes", []):
                lines.append(
                    f"  · {change.get('url')}: "
                    f"title “{change.get('before', {}).get('title')}” → "
                    f"“{change.get('after', {}).get('title')}”"
                )
        lines.append("")

    return {
        "skill": "reporting",
        "markdown": "\n".join(lines).strip(),
        "proposal_count": len(proposals),
        "proposals": proposals,
        "spend_channels": spend_channels,
        "seo_change_set": seo_change_set,
        "seo_findings": seo_findings,
    }
