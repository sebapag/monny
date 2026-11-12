"""Skill: reporting — assemble Italian markdown + structured payload for Agent UI."""

from __future__ import annotations

from typing import Any

CHANNEL_LABELS_IT = {
    "google": "Google Ads",
    "meta": "Meta Ads",
    "seo": "SEO",
    "shopify": "Shopify",
}

SKILL_LABELS_IT = {
    "shopify_read": "Lettura negozio",
    "spend_google": "Google Ads",
    "spend_meta": "Meta Ads",
    "seo_audit": "Audit SEO",
    "shopify_promo": "Promo Shopify",
    "lead_warming": "Lead warming",
}


def _channel_label(channel: str | None) -> str:
    if not channel:
        return "Canale"
    return CHANNEL_LABELS_IT.get(channel, channel)


def _skill_label(skill: str | None) -> str:
    if not skill:
        return "Skill"
    return SKILL_LABELS_IT.get(skill, skill)


def _campaign_rows(spend_channels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for diagnosis in spend_channels:
        channel = diagnosis.get("channel")
        for camp in diagnosis.get("campaigns") or []:
            rows.append(
                {
                    **camp,
                    "channel": camp.get("channel") or channel,
                    "roas": float(camp.get("roas") or 0),
                    "spend": float(camp.get("spend") or 0),
                    "cpa": float(camp.get("cpa") or 0),
                    "healthy": bool(camp.get("healthy")),
                    "flags": list(camp.get("flags") or []),
                }
            )
    rows.sort(key=lambda c: (c["roas"], c["spend"]), reverse=True)
    return rows


def run(findings: list[dict[str, Any]], goal: str) -> dict[str, Any]:
    proposals: list[dict[str, Any]] = []
    spend_channels: list[dict[str, Any]] = []
    seo_change_set: dict[str, Any] | None = None
    seo_findings: list[dict[str, Any]] = []
    shopify: dict[str, Any] | None = None
    section_notes: list[str] = []

    for item in findings:
        skill = item.get("skill", "unknown")
        if skill == "reporting":
            continue

        label = _skill_label(skill)
        summary = (item.get("summary") or "").strip()
        if summary:
            section_notes.append(f"- **{label}**: {summary}")

        if skill == "shopify_read" and item.get("shopify"):
            shopify = item["shopify"]

        diagnosis = item.get("diagnosis")
        if diagnosis:
            spend_channels.append(diagnosis)

        for proposal in item.get("proposals", []):
            proposals.append(proposal)

        change_set = item.get("change_set")
        if change_set:
            seo_change_set = change_set
            seo_findings = item.get("findings") or []

    ranked = _campaign_rows(spend_channels)
    top_campaigns = ranked[:5]
    best = [c for c in ranked if c.get("healthy")]
    weak = [c for c in ranked if not c.get("healthy")]

    lines: list[str] = []
    title_goal = (goal or "").strip() or "Analisi ads"
    lines.append(f"# Report ads")
    lines.append("")
    lines.append(f"Richiesta: {title_goal}")
    lines.append("")

    if ranked:
        lines.append("## Campagne che hanno funzionato meglio")
        lines.append("")
        showcase = best[:5] if best else top_campaigns
        if not showcase:
            lines.append("_Nessuna campagna nel periodo._")
        else:
            for i, camp in enumerate(showcase, start=1):
                lines.append(
                    f"{i}. **{camp.get('name') or 'Campagna'}** "
                    f"({_channel_label(camp.get('channel'))}) — "
                    f"ROAS {camp.get('roas')} · CPA {camp.get('cpa')} · "
                    f"spesa €{camp.get('spend')}"
                )
        lines.append("")

        if weak:
            lines.append("## Da rivedere")
            lines.append("")
            for camp in weak:
                flag_txt = ", ".join(camp.get("flags") or []) or "sotto soglia"
                lines.append(
                    f"- **{camp.get('name') or 'Campagna'}** "
                    f"({_channel_label(camp.get('channel'))}) — "
                    f"ROAS {camp.get('roas')} · spesa €{camp.get('spend')} "
                    f"({flag_txt})"
                )
            lines.append("")

        lines.append("## Riepilogo canali")
        lines.append("")
        for diagnosis in spend_channels:
            totals = diagnosis.get("totals") or {}
            lines.append(
                f"- **{_channel_label(diagnosis.get('channel'))}**: "
                f"spesa €{totals.get('spend')} · poco efficace €{totals.get('waste_spend')} "
                f"({totals.get('waste_spend_pct')}%) · "
                f"{totals.get('healthy')} ok / {totals.get('waste')} da rivedere"
            )
        lines.append("")
    elif seo_change_set:
        changes = seo_change_set.get("changes") or []
        lines.append("## Suggerimenti SEO")
        lines.append("")
        lines.append(f"{len(changes)} pagine con proposte di miglioramento.")
        for change in changes[:8]:
            lines.append(
                f"- `{change.get('url')}`: "
                f"“{(change.get('before') or {}).get('title') or '(vuoto)'}” → "
                f"“{(change.get('after') or {}).get('title')}”"
            )
        lines.append("")
    else:
        lines.append("Nessun dato ads o SEO da includere in questo report.")
        lines.append("")

    if proposals:
        lines.append("## Proposte in attesa (richiedono approvazione)")
        lines.append("")
        for proposal in proposals:
            lines.append(
                f"- **{proposal.get('action_type')}** su "
                f"{_channel_label(proposal.get('channel'))}: "
                f"{proposal.get('entity_name')} — {proposal.get('reason')}"
            )
        lines.append("")
        lines.append(
            "_Le proposte restano in HITL: Approva o Rifiuta nel pannello Approvazioni. "
            "Questo report è solo lettura._"
        )
        lines.append("")

    if section_notes:
        lines.append("## Dettaglio skill")
        lines.append("")
        lines.extend(section_notes)

    markdown = "\n".join(lines).strip()

    return {
        "skill": "reporting",
        "markdown": markdown,
        "proposal_count": len(proposals),
        "proposals": proposals,
        "spend_channels": spend_channels,
        "top_campaigns": top_campaigns,
        "seo_change_set": seo_change_set,
        "seo_findings": seo_findings,
        "shopify": shopify,
    }
