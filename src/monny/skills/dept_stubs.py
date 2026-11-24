"""Department skills — Ops/Design/IT/Controlling (+ commerce reads).

No fake WMS/DAM/CRM. Rich structured proposals from tenant data + playbooks.
`stub: false` only where a real Shopify (or ads) adapter read is used.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from monny.adapters import google_ads, meta_ads, shopify as shopify_adapter
from monny.config.models import TenantConfig
from monny.config.settings import get_settings
from monny.skills.knowhow import load_knowhow, with_knowhow

PHASE = 2

# skill_id → metadata (interfaces reserved when no live adapter)
STUB_META: dict[str, dict[str, Any]] = {
    "ops_orders": {
        "channel": "operations",
        "entity_name": "Stato ordini",
        "reason": "Fulfillment: elenco ordini aperti e stati di evasione.",
        "interfaces": ["list_orders", "fulfillment_overview"],
        "summary": "Stato ordini / fulfillment da dati disponibili.",
        "adapter": "shopify_orders",
    },
    "ops_inventory": {
        "channel": "operations",
        "entity_name": "Giacenze",
        "reason": "Giacenze e soglie di riordino / stock alerts.",
        "interfaces": ["list_inventory", "stock_alerts"],
        "summary": "Giacenze e stock alerts da dati disponibili.",
        "adapter": "shopify_inventory",
    },
    "ops_shipping": {
        "channel": "operations",
        "entity_name": "Spedizioni",
        "reason": "Spedizioni in corso e ritardi rispetto all’ETA (proposal-only).",
        "interfaces": ["list_shipments", "delay_alerts"],
        "summary": "Spedizioni: proposta strutturata da playbook (nessun WMS).",
        "adapter": None,
    },
    "design_assets": {
        "channel": "design",
        "entity_name": "Asset creativi",
        "reason": "Inventario asset creativi (brand, campagne, formati) — proposal-only.",
        "interfaces": ["list_assets", "tag_assets"],
        "summary": "Inventario asset: proposta da playbook (nessun DAM).",
        "adapter": None,
    },
    "design_ads": {
        "channel": "design",
        "entity_name": "Creatività ads",
        "reason": "Proposte di creatività per ads (bozze, varianti).",
        "interfaces": ["propose_creatives", "variant_matrix"],
        "summary": "Creatività ads: proposta allineata a spend se disponibile.",
        "adapter": "ads_read",
    },
    "design_brand": {
        "channel": "design",
        "entity_name": "Brand kit",
        "reason": "Check brand kit / coerenza logo, colori, tono.",
        "interfaces": ["brand_kit_check", "consistency_score"],
        "summary": "Brand kit: proposta da knowledge / playbook.",
        "adapter": None,
    },
    "it_integrations": {
        "channel": "it",
        "entity_name": "Integrazioni",
        "reason": "Salute integrazioni (Shopify, Ads, Search Console…).",
        "interfaces": ["integration_health", "last_sync"],
        "summary": "Salute integrazioni da stato tenant / secret.",
        "adapter": "integration_health",
    },
    "it_access": {
        "channel": "it",
        "entity_name": "Accessi",
        "reason": "Accessi / credenziali da completare.",
        "interfaces": ["list_missing_secrets", "access_checklist"],
        "summary": "Accessi e credenziali da completare.",
        "adapter": "integration_health",
    },
    "it_monitoring": {
        "channel": "it",
        "entity_name": "Monitoring",
        "reason": "Uptime / errori runtime (proposal da policy tenant).",
        "interfaces": ["uptime_snapshot", "runtime_errors"],
        "summary": "Monitoring: proposta strutturata (nessun APM esterno).",
        "adapter": None,
    },
    "ctrl_budget": {
        "channel": "controlling",
        "entity_name": "Budget",
        "reason": "Budget vs spend per canale / periodo.",
        "interfaces": ["budget_vs_spend", "period_rollup"],
        "summary": "Budget vs spend da billing + ads fixture/live.",
        "adapter": "ads_billing",
    },
    "ctrl_kpi": {
        "channel": "controlling",
        "entity_name": "KPI",
        "reason": "Snapshot KPI (ROAS, CPA, conversioni).",
        "interfaces": ["kpi_snapshot", "trend_flags"],
        "summary": "KPI da canali ads disponibili.",
        "adapter": "ads_billing",
    },
    "ctrl_costs": {
        "channel": "controlling",
        "entity_name": "Costi anomali",
        "reason": "Alert costi anomali rispetto alla baseline.",
        "interfaces": ["cost_anomaly_alerts", "baseline_compare"],
        "summary": "Costi anomali da spend + budget tenant.",
        "adapter": "ads_billing",
    },
}

ALL_STUB_SKILLS = frozenset(STUB_META)


def _spend_fixtures_dir() -> Path:
    return Path(__file__).resolve().parents[3] / "fixtures" / "spend"


def _playbook_cite(knowhow: dict[str, Any]) -> str:
    title = knowhow.get("playbook_title") or knowhow.get("playbook") or "playbook"
    return f"Playbook: {title}."


def _integration_snapshot(tenant: TenantConfig) -> dict[str, Any]:
    from monny.config.loader import resolve_secret

    shop = tenant.shopify
    google = tenant.ads.google
    meta = tenant.ads.meta
    gsc = tenant.integrations.search_console
    return {
        "shopify": {
            "connected": shopify_adapter.is_connected(tenant),
            "shop_domain": shop.shop_domain,
            "secret_configured": resolve_secret(shop.auth.secret_ref) is not None,
        },
        "google_ads": {
            "configured": google is not None,
            "secret_configured": bool(google and resolve_secret(google.secret_ref)),
            "customer_id": google.customer_id if google else None,
        },
        "meta_ads": {
            "configured": meta is not None,
            "secret_configured": bool(meta and resolve_secret(meta.secret_ref)),
            "ad_account_id": meta.ad_account_id if meta else None,
        },
        "search_console": {
            "configured": gsc is not None,
            "secret_configured": bool(gsc and resolve_secret(gsc.secret_ref)),
        },
    }


def _fetch_ads(tenant: TenantConfig, *, dry_run: bool) -> dict[str, Any]:
    fixtures = _spend_fixtures_dir()
    google = google_ads.fetch_spend(tenant, dry_run=dry_run, fixtures_dir=fixtures)
    meta = meta_ads.fetch_spend(tenant, dry_run=dry_run, fixtures_dir=fixtures)
    return {"google": google, "meta": meta}


def run(
    skill_name: str,
    tenant: TenantConfig | None = None,
    *,
    dry_run: bool | None = None,
    **_kwargs: Any,
) -> dict[str, Any]:
    meta = STUB_META.get(skill_name)
    if meta is None:
        return {
            "skill": skill_name,
            "status": "skipped",
            "summary": "Skill non registrata.",
        }

    settings = get_settings()
    if dry_run is None:
        dry_run = settings.dry_run

    label = tenant.display_name if tenant else "tenant"
    knowhow = load_knowhow(tenant, skill_name) if tenant else {}
    cite = _playbook_cite(knowhow)
    adapter = meta.get("adapter")
    uses_real_adapter = False
    metrics: dict[str, Any] = {}
    findings: dict[str, Any] = {}
    reason = f"{meta['reason']} Contesto: {label}. {cite}"
    summary = meta["summary"]
    cta = None
    status = "proposal"

    if tenant and adapter == "shopify_orders":
        data = shopify_adapter.read_orders(tenant, dry_run=dry_run)
        findings["orders"] = data
        if data.get("mode") == "not_connected":
            cta = data.get("cta")
            status = "needs_connector"
            summary = (cta or {}).get("message_it") or summary
            reason = summary
        else:
            uses_real_adapter = True
            open_count = int(data.get("open_count") or 0)
            orders = data.get("orders") or []
            metrics = {
                "orders_sampled": len(orders),
                "open_unfulfilled": open_count,
                "mode": data.get("mode"),
            }
            reason = (
                f"Ordini Shopify ({data.get('mode')}): {len(orders)} campionati, "
                f"{open_count} aperti/non fulfilled. {cite}"
            )
            summary = f"Stato ordini · {open_count} aperti · mode={data.get('mode')}"

    elif tenant and adapter == "shopify_inventory":
        data = shopify_adapter.read_inventory(tenant, dry_run=dry_run)
        findings["inventory"] = data
        if data.get("mode") == "not_connected":
            cta = data.get("cta")
            status = "needs_connector"
            summary = (cta or {}).get("message_it") or summary
            reason = summary
        else:
            uses_real_adapter = True
            inv = data.get("inventory") or []
            low = int(data.get("low_stock_count") or 0)
            out = int(data.get("out_of_stock_count") or 0)
            metrics = {
                "skus": len(inv),
                "low_stock": low,
                "out_of_stock": out,
                "mode": data.get("mode"),
            }
            reason = (
                f"Giacenze Shopify ({data.get('mode')}): {len(inv)} SKU, "
                f"{low} low-stock, {out} out-of-stock. {cite}"
            )
            summary = f"Giacenze · low={low} · out={out} · mode={data.get('mode')}"

    elif tenant and adapter == "integration_health":
        snap = _integration_snapshot(tenant)
        findings["integrations"] = snap
        uses_real_adapter = True  # derived from real tenant secret/config state
        missing = []
        if not snap["shopify"]["secret_configured"] and not snap["shopify"]["connected"]:
            missing.append("Shopify")
        if snap["google_ads"]["configured"] and not snap["google_ads"]["secret_configured"]:
            missing.append("Google Ads")
        if snap["meta_ads"]["configured"] and not snap["meta_ads"]["secret_configured"]:
            missing.append("Meta Ads")
        metrics = {"missing": missing, "shopify_connected": snap["shopify"]["connected"]}
        reason = (
            f"Integrazioni: Shopify connected={snap['shopify']['connected']}; "
            f"mancanti={', '.join(missing) or 'nessuna'}. {cite}"
        )
        summary = f"Salute integrazioni · mancanti: {', '.join(missing) or 'ok'}"

    elif tenant and adapter in {"ads_read", "ads_billing"}:
        ads = _fetch_ads(tenant, dry_run=dry_run)
        findings["ads"] = ads
        uses_real_adapter = True
        g_camps = ads["google"].get("campaigns") or []
        m_camps = ads["meta"].get("campaigns") or []
        spend = sum(float(c.get("spend") or 0) for c in g_camps + m_camps)
        billing = tenant.billing
        metrics = {
            "google_campaigns": len(g_camps),
            "meta_campaigns": len(m_camps),
            "ads_spend_sampled": round(spend, 2),
            "budget_eur": billing.ads_monthly_budget_eur,
            "spent_month_eur": billing.ads_spent_this_month_eur,
            "google_mode": ads["google"].get("mode"),
            "meta_mode": ads["meta"].get("mode"),
        }
        if skill_name == "design_ads":
            reason = (
                f"Creatività: {len(g_camps)+len(m_camps)} campagne in vista "
                f"(Google mode={ads['google'].get('mode')}, Meta={ads['meta'].get('mode')}). {cite}"
            )
            summary = "Creatività ads allineate alle campagne attive"
        elif skill_name == "ctrl_budget":
            pct = (
                round(100 * billing.ads_spent_this_month_eur / billing.ads_monthly_budget_eur, 1)
                if billing.ads_monthly_budget_eur
                else 0
            )
            reason = (
                f"Budget ads: speso {billing.ads_spent_this_month_eur}€ / "
                f"{billing.ads_monthly_budget_eur}€ ({pct}%). Sample canali {spend}€. {cite}"
            )
            summary = f"Budget vs spend · {pct}% del limite"
        elif skill_name == "ctrl_kpi":
            reason = (
                f"KPI: {len(g_camps)} Google + {len(m_camps)} Meta campagne campionate. {cite}"
            )
            summary = "KPI snapshot da canali ads"
        else:
            waste = [
                c
                for c in g_camps + m_camps
                if float(c.get("roas") or 0) and float(c.get("roas") or 0) < tenant.policy.spend.thresholds.min_roas
            ]
            metrics["low_roas_campaigns"] = len(waste)
            reason = (
                f"Costi anomali: {len(waste)} campagne sotto min_roas="
                f"{tenant.policy.spend.thresholds.min_roas}. {cite}"
            )
            summary = f"Alert costi · {len(waste)} campagne sotto soglia"

    else:
        # Proposal-only: richer findings from know-how metrics / HITL prompts
        metrics = {
            "knowhow_metrics": list(knowhow.get("metrics") or [])[:6],
            "hitl_prompts": list(knowhow.get("hitl_prompts") or [])[:3],
            "playbook": knowhow.get("playbook"),
        }
        reason = (
            f"{meta['reason']} Contesto: {label}. {cite} "
            "Nessun adapter esterno (WMS/DAM/CRM) — solo proposta strutturata."
        )
        status = "proposal_only"

    stub_flag = not uses_real_adapter
    proposals = [
        {
            "action_type": "department_proposal" if uses_real_adapter else "phase2_stub",
            "channel": meta["channel"],
            "entity_type": "skill",
            "entity_id": skill_name,
            "entity_name": meta["entity_name"],
            "reason": reason,
            "requires_approval": True,
            "phase": PHASE,
            "stub": stub_flag,
            "interfaces": meta["interfaces"],
            "metrics": metrics,
            "admin_hash": (cta or {}).get("admin_hash") if cta else None,
        }
    ]

    result: dict[str, Any] = {
        "skill": skill_name,
        "status": status,
        "phase": PHASE,
        "summary": summary,
        "note": f"Interfaces: {', '.join(meta['interfaces'])}.",
        "interfaces": meta["interfaces"],
        "metrics": metrics,
        "findings": findings,
        "proposals": proposals,
    }
    if cta:
        result["cta"] = cta
    if tenant is not None:
        result = with_knowhow(result, tenant, skill_name)
    return result
