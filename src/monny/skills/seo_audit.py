"""Skill: SEO audit stub — produces a proposed SeoChangeSet without applying."""

from __future__ import annotations

from typing import Any

from monny.config.models import TenantConfig


def run(tenant: TenantConfig, *, dry_run: bool = True) -> dict[str, Any]:
    base = tenant.site.base_url.rstrip("/")
    urls = [f"{base}/", f"{base}/collections/all", f"{base}/products/sample"]
    max_urls = tenant.policy.seo.max_urls_per_run
    urls = urls[:max_urls]
    findings = []
    changes = []
    for url in urls:
        findings.append(
            {
                "url": url,
                "issues": [
                    {"code": "title_length", "severity": "medium", "detail": "Title too generic (mock)"},
                    {"code": "missing_meta", "severity": "high", "detail": "Meta description empty (mock)"},
                ],
            }
        )
        changes.append(
            {
                "url": url,
                "title": f"Optimized title for {url.split('/')[-1] or 'home'}",
                "meta_description": "Mock meta description proposed by Monny SEO audit.",
                "status": "proposed",
            }
        )
    return {
        "skill": "seo_audit",
        "mode": "dry_run" if dry_run else "live_stub",
        "summary": f"Audited {len(urls)} URLs; proposed {len(changes)} changes.",
        "findings": findings,
        "change_set": {"status": "proposed", "changes": changes},
        "requires_approval": True,
    }
