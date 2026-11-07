"""Execute planned skills against the tenant."""

from __future__ import annotations

from pathlib import Path

from monny.adapters import shopify as shopify_adapter
from monny.config.loader import load_tenant
from monny.config.settings import get_settings
from monny.graph.state import AgentState
from monny.skills import (
    lead_warming,
    reporting,
    seo_audit,
    shopify_promo,
    spend_google,
    spend_meta,
)
from monny.storage.artifacts import write_json_artifact
from monny.storage.audit import append_audit


def skills_runner_node(state: AgentState) -> dict:
    settings = get_settings()
    tenant = load_tenant(state["tenant_id"], Path(settings.monny_tenants_dir).resolve())
    dry_run = state.get("dry_run", settings.dry_run)
    fixtures_dir = Path(__file__).resolve().parents[4] / "fixtures" / "spend"
    findings = list(state.get("findings") or [])
    plan = state.get("plan") or []

    shop = shopify_adapter.read_shop(tenant, dry_run=dry_run)
    findings.append(
        {
            "skill": "shopify_read",
            "summary": (
                f"Shopify {shop.get('shop_domain')} mode={shop.get('mode')} "
                f"shop={(shop.get('shop') or {}).get('name')}"
            ),
            "shopify": shop,
        }
    )

    for skill_name in plan:
        if skill_name == "spend_google":
            findings.append(spend_google.run(tenant, dry_run=dry_run, fixtures_dir=fixtures_dir))
        elif skill_name == "spend_meta":
            findings.append(spend_meta.run(tenant, dry_run=dry_run, fixtures_dir=fixtures_dir))
        elif skill_name == "seo_audit":
            findings.append(seo_audit.run(tenant, dry_run=dry_run))
        elif skill_name == "shopify_promo":
            findings.append(shopify_promo.run(tenant))
        elif skill_name == "lead_warming":
            findings.append(lead_warming.run(tenant))
        elif skill_name == "reporting":
            continue
        else:
            findings.append(
                {"skill": skill_name, "summary": "Skill not registered in MVP.", "status": "skipped"}
            )

    report = reporting.run(findings, state.get("goal", ""))
    findings.append(report)

    write_json_artifact(settings.monny_data_dir, tenant.tenant_id, "last_report.json", report)

    spend_channels = report.get("spend_channels") or []
    if spend_channels:
        write_json_artifact(
            settings.monny_data_dir,
            tenant.tenant_id,
            "last_spend_report.json",
            {
                "goal": state.get("goal"),
                "spend_channels": spend_channels,
                "proposal_count": report.get("proposal_count", 0),
            },
        )

    seo_cs = report.get("seo_change_set")
    if seo_cs:
        write_json_artifact(
            settings.monny_data_dir,
            tenant.tenant_id,
            "last_seo_report.json",
            {
                "goal": state.get("goal"),
                "change_set": seo_cs,
                "seo_findings": report.get("seo_findings") or [],
                "crawler": next(
                    (f.get("crawler") for f in findings if f.get("skill") == "seo_audit"),
                    None,
                ),
            },
        )

    append_audit(
        settings.monny_data_dir,
        tenant.tenant_id,
        "skills_ran",
        {
            "plan": plan,
            "proposal_count": report.get("proposal_count", 0),
            "shopify_mode": shop.get("mode"),
        },
    )

    return {
        "findings": findings,
        "report": report,
        "pending_proposals": report.get("proposals", []),
        "status": "skills_done",
    }
