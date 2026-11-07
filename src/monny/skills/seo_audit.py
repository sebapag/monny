"""Skill: SEO audit — uses seo_crawler subagent, emits SeoChangeSet (no live apply)."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from monny.adapters.live_mode import use_live
from monny.config.models import TenantConfig
from monny.config.settings import get_settings
from monny.subagents import seo_crawler


def _issues_for(page: dict[str, Any]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    if not page.get("ok"):
        issues.append(
            {
                "code": "fetch_failed",
                "severity": "high",
                "detail": page.get("error") or "fetch failed",
            }
        )
        return issues
    title = page.get("title") or ""
    meta = page.get("meta_description") or ""
    h1 = page.get("h1") or ""
    if not title:
        issues.append({"code": "missing_title", "severity": "high", "detail": "Missing <title>"})
    elif len(title) < 15:
        issues.append(
            {"code": "title_short", "severity": "medium", "detail": f"Title too short ({len(title)} chars)"}
        )
    elif len(title) > 60:
        issues.append(
            {"code": "title_long", "severity": "medium", "detail": f"Title too long ({len(title)} chars)"}
        )
    if not meta:
        issues.append({"code": "missing_meta", "severity": "high", "detail": "Missing meta description"})
    elif len(meta) < 50:
        issues.append(
            {"code": "meta_short", "severity": "medium", "detail": f"Meta too short ({len(meta)} chars)"}
        )
    elif len(meta) > 160:
        issues.append(
            {"code": "meta_long", "severity": "low", "detail": f"Meta too long ({len(meta)} chars)"}
        )
    if not h1:
        issues.append({"code": "missing_h1", "severity": "high", "detail": "Missing H1"})
    return issues


def _propose_copy(
    page: dict[str, Any],
    issues: list[dict[str, str]],
    *,
    brand: str,
) -> dict[str, str]:
    url = page.get("url") or ""
    slug = urlparse(url).path.strip("/") or "home"
    label = slug.replace("-", " ").replace("/", " · ")
    title = page.get("title") or ""
    meta = page.get("meta_description") or ""
    h1 = page.get("h1") or ""

    codes = {i["code"] for i in issues}
    if "missing_title" in codes or "title_short" in codes or "title_long" in codes:
        title = f"{label.title()} | {brand}"
        if len(title) > 60:
            title = f"{label.title()}"[:57] + "…"
    if "missing_meta" in codes or "meta_short" in codes or "meta_long" in codes:
        meta = (
            f"Discover {label} at {brand}: curated selection, fast shipping, "
            f"and dedicated support. Shop online with confidence."
        )[:155]
    if "missing_h1" in codes:
        h1 = label.title() or "Home"

    return {"title": title, "meta_description": meta, "h1": h1}


def _default_urls(tenant: TenantConfig) -> list[str]:
    if tenant.site.priority_urls:
        return list(tenant.site.priority_urls)
    base = tenant.site.base_url.rstrip("/")
    return [f"{base}/", f"{base}/collections/all", f"{base}/products/sample"]


def run(
    tenant: TenantConfig,
    *,
    dry_run: bool = True,
    urls: list[str] | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    max_urls = tenant.policy.seo.max_urls_per_run
    target_urls = (urls or _default_urls(tenant))[:max_urls]

    # Live crawl only when explicitly live AND dry-run is off (fixtures still win for .example)
    allow_live = use_live(dry_run=dry_run) and settings.monny_live

    crawl_result = seo_crawler.crawl(target_urls, allow_live=allow_live)
    pages = crawl_result.get("pages") or []

    findings: list[dict[str, Any]] = []
    changes: list[dict[str, Any]] = []

    for page in pages:
        url = page.get("url") or ""
        issues = _issues_for(page)
        findings.append(
            {
                "url": url,
                "source": page.get("source"),
                "current": {
                    "title": page.get("title"),
                    "meta_description": page.get("meta_description"),
                    "h1": page.get("h1"),
                },
                "issues": issues,
            }
        )
        if issues and page.get("ok"):
            proposed = _propose_copy(page, issues, brand=tenant.display_name)
            changes.append(
                {
                    "url": url,
                    "before": {
                        "title": page.get("title"),
                        "meta_description": page.get("meta_description"),
                        "h1": page.get("h1"),
                    },
                    "after": proposed,
                    "issues": issues,
                    "status": "proposed",
                }
            )

    change_set = {
        "id": f"seo-{tenant.tenant_id}",
        "tenant_id": tenant.tenant_id,
        "status": "proposed",
        "changes": changes,
    }

    proposals: list[dict[str, Any]] = []
    if changes:
        proposals.append(
            {
                "action_type": "seo_apply_changeset",
                "channel": "seo",
                "entity_type": "change_set",
                "entity_id": change_set["id"],
                "entity_name": f"{len(changes)} pagine",
                "reason": f"L’audit SEO ha trovato problemi su {len(changes)} URL",
                "requires_approval": True,
                "change_set": change_set,
            }
        )

    return {
        "skill": "seo_audit",
        "mode": "dry_run" if dry_run else "live",
        "summary": (
            f"Audited {len(target_urls)} URLs via seo_crawler "
            f"(sources={','.join(crawl_result.get('sources') or [])}); "
            f"{sum(1 for f in findings if f['issues'])} with issues; "
            f"proposed {len(changes)} changes."
        ),
        "crawler": {
            "subagent": "seo_crawler",
            "url_count": crawl_result.get("url_count"),
            "ok_count": crawl_result.get("ok_count"),
            "sources": crawl_result.get("sources"),
            # Omit full page HTML; only compact stats for planner context
        },
        "findings": findings,
        "change_set": change_set,
        "proposals": proposals,
        "requires_approval": bool(changes),
    }
