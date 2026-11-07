"""Skill: reporting — assemble a human-readable summary from skill outputs."""

from __future__ import annotations

from typing import Any


def run(findings: list[dict[str, Any]], goal: str) -> dict[str, Any]:
    lines = [f"Goal: {goal}", ""]
    proposals: list[dict[str, Any]] = []
    for item in findings:
        skill = item.get("skill", "unknown")
        lines.append(f"## {skill}")
        lines.append(item.get("summary", ""))
        for proposal in item.get("proposals", []):
            proposals.append(proposal)
            lines.append(
                f"- Propose {proposal.get('action_type')} on "
                f"{proposal.get('channel')}:{proposal.get('entity_name')} "
                f"({proposal.get('reason')})"
            )
        change_set = item.get("change_set")
        if change_set:
            lines.append(f"- SEO change set status={change_set.get('status')} "
                         f"({len(change_set.get('changes', []))} changes)")
        lines.append("")
    return {
        "skill": "reporting",
        "markdown": "\n".join(lines).strip(),
        "proposal_count": len(proposals),
        "proposals": proposals,
    }
