"""Execute planned skills against the tenant — emits timeline skill presence."""

from __future__ import annotations

import time
from pathlib import Path

from monny.adapters import shopify as shopify_adapter
from monny.config.entitlements import is_skill_allowed
from monny.config.loader import load_tenant
from monny.config.settings import get_settings
from monny.graph import timeline
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


def _pause_for_presence() -> None:
    """Yield so the UI can poll a running step (presence, not a silent wait)."""
    time.sleep(1.4)


def skills_runner_node(state: AgentState) -> dict:
    settings = get_settings()
    run_id = state.get("run_id")
    tenant = load_tenant(state["tenant_id"], Path(settings.monny_tenants_dir).resolve())
    dry_run = state.get("dry_run", settings.dry_run)
    fixtures_dir = Path(__file__).resolve().parents[4] / "fixtures" / "spend"
    findings = list(state.get("findings") or [])
    plan = state.get("plan") or []

    timeline.start(run_id, "shopify_read", f"Leggo il negozio {tenant.shopify.shop_domain}…")
    _pause_for_presence()
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
    timeline.done(
        run_id,
        "shopify_read",
        f"{(shop.get('shop') or {}).get('name')} · mode={shop.get('mode')}",
    )

    for skill_name in plan:
        if skill_name == "reporting":
            continue

        if not is_skill_allowed(tenant, skill_name):
            findings.append(
                {
                    "skill": skill_name,
                    "summary": "Skill non attiva nel piano di sottoscrizione.",
                    "status": "skipped_entitlement",
                }
            )
            continue

        if skill_name == "spend_google":
            timeline.start(run_id, "spend_google", "Analizzo campagne Google Ads…")
            _pause_for_presence()
            result = spend_google.run(tenant, dry_run=dry_run, fixtures_dir=fixtures_dir)
            findings.append(result)
            timeline.done(run_id, "spend_google", result.get("summary") or "Completato")
        elif skill_name == "spend_meta":
            timeline.start(run_id, "spend_meta", "Analizzo campagne Meta…")
            _pause_for_presence()
            result = spend_meta.run(tenant, dry_run=dry_run, fixtures_dir=fixtures_dir)
            findings.append(result)
            timeline.done(run_id, "spend_meta", result.get("summary") or "Completato")
        elif skill_name == "seo_audit":
            timeline.start(run_id, "seo_crawler", "Crawl delle pagine prioritarie…")
            _pause_for_presence()
            timeline.start(run_id, "seo_audit", "Valuto title / meta / H1…")
            _pause_for_presence()
            result = seo_audit.run(tenant, dry_run=dry_run)
            findings.append(result)
            crawler = result.get("crawler") or {}
            timeline.done(
                run_id,
                "seo_crawler",
                f"{crawler.get('ok_count', 0)}/{crawler.get('url_count', 0)} URL ok",
            )
            timeline.done(run_id, "seo_audit", result.get("summary") or "Completato")
        elif skill_name == "shopify_promo":
            timeline.start(run_id, "shopify_promo", "Stub promo Shopify (fase 2)…")
            _pause_for_presence()
            result = shopify_promo.run(tenant)
            findings.append(result)
            timeline.done(run_id, "shopify_promo", result.get("summary") or "Stub")
        elif skill_name == "lead_warming":
            timeline.start(run_id, "lead_warming", "Stub lead warming (fase 3)…")
            _pause_for_presence()
            result = lead_warming.run(tenant)
            findings.append(result)
            timeline.done(run_id, "lead_warming", result.get("summary") or "Stub")
        else:
            findings.append(
                {"skill": skill_name, "summary": "Skill not registered in MVP.", "status": "skipped"}
            )

    timeline.start(run_id, "reporting", "Compongo il report…")
    _pause_for_presence()
    report = reporting.run(findings, state.get("goal", ""))
    findings.append(report)
    timeline.done(
        run_id,
        "reporting",
        (
            f"{report.get('proposal_count', 0)} proposte nel report"
            if (report.get("proposal_count") or 0) != 1
            else "1 proposta nel report"
        ),
    )

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
            "run_id": run_id,
        },
    )

    return {
        "findings": findings,
        "report": report,
        "pending_proposals": report.get("proposals", []),
        "status": "skills_done",
    }
