"""Skill: SEO audit — fetch/analyze pages, emit SeoChangeSet (no live apply)."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from monny.config.models import TenantConfig

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_SEO = REPO_ROOT / "fixtures" / "seo"


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title_parts: list[str] = []
        self.meta_description: str | None = None
        self.h1_parts: list[str] = []
        self._capture: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        if tag == "title":
            self._capture = "title"
        elif tag == "h1":
            self._capture = "h1"
        elif tag == "meta":
            name = (ad.get("name") or ad.get("property") or "").lower()
            if name in {"description", "og:description"} and ad.get("content"):
                if self.meta_description is None or name == "description":
                    self.meta_description = ad["content"].strip()

    def handle_endtag(self, tag: str) -> None:
        if tag in {"title", "h1"} and self._capture == tag:
            self._capture = None

    def handle_data(self, data: str) -> None:
        if self._capture == "title":
            self.title_parts.append(data)
        elif self._capture == "h1":
            self.h1_parts.append(data)


def _parse_html(html: str) -> dict[str, Any]:
    parser = _PageParser()
    parser.feed(html)
    title = re.sub(r"\s+", " ", "".join(parser.title_parts)).strip()
    h1 = re.sub(r"\s+", " ", "".join(parser.h1_parts)).strip()
    meta = (parser.meta_description or "").strip()
    return {"title": title, "meta_description": meta, "h1": h1}


def _fixture_for_url(url: str) -> Path | None:
    path = urlparse(url).path.rstrip("/") or "/"
    mapping = {
        "/": "home.html",
        "/collections/all": "collections-all.html",
        "/products/sample": "products-sample.html",
    }
    name = mapping.get(path)
    if not name:
        # slugify last segment
        slug = path.strip("/").replace("/", "-") or "home"
        candidate = FIXTURES_SEO / f"{slug}.html"
        return candidate if candidate.exists() else None
    path_obj = FIXTURES_SEO / name
    return path_obj if path_obj.exists() else None


def _load_page(url: str, *, dry_run: bool, timeout: float = 8.0) -> dict[str, Any]:
    host = urlparse(url).hostname or ""
    # Prefer fixtures for .example hosts or when dry-run fetch would be pointless
    fixture = _fixture_for_url(url)
    if host.endswith(".example") and fixture is not None:
        html = fixture.read_text(encoding="utf-8")
        parsed = _parse_html(html)
        return {**parsed, "source": "fixture", "url": url, "ok": True}

    try:
        with httpx.Client(follow_redirects=True, timeout=timeout) as client:
            resp = client.get(url, headers={"User-Agent": "MonnySEOAudit/0.1"})
            resp.raise_for_status()
            parsed = _parse_html(resp.text)
            return {**parsed, "source": "live", "url": url, "ok": True, "status_code": resp.status_code}
    except Exception as exc:
        if fixture is not None and dry_run:
            html = fixture.read_text(encoding="utf-8")
            parsed = _parse_html(html)
            return {
                **parsed,
                "source": "fixture_fallback",
                "url": url,
                "ok": True,
                "fetch_error": str(exc),
            }
        return {
            "url": url,
            "ok": False,
            "error": str(exc),
            "title": "",
            "meta_description": "",
            "h1": "",
            "source": "error",
        }


def _issues_for(page: dict[str, Any]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    if not page.get("ok"):
        issues.append({"code": "fetch_failed", "severity": "high", "detail": page.get("error") or "fetch failed"})
        return issues
    title = page.get("title") or ""
    meta = page.get("meta_description") or ""
    h1 = page.get("h1") or ""
    if not title:
        issues.append({"code": "missing_title", "severity": "high", "detail": "Missing <title>"})
    elif len(title) < 15:
        issues.append({"code": "title_short", "severity": "medium", "detail": f"Title too short ({len(title)} chars)"})
    elif len(title) > 60:
        issues.append({"code": "title_long", "severity": "medium", "detail": f"Title too long ({len(title)} chars)"})
    if not meta:
        issues.append({"code": "missing_meta", "severity": "high", "detail": "Missing meta description"})
    elif len(meta) < 50:
        issues.append({"code": "meta_short", "severity": "medium", "detail": f"Meta too short ({len(meta)} chars)"})
    elif len(meta) > 160:
        issues.append({"code": "meta_long", "severity": "low", "detail": f"Meta too long ({len(meta)} chars)"})
    if not h1:
        issues.append({"code": "missing_h1", "severity": "high", "detail": "Missing H1"})
    return issues


def _propose_copy(page: dict[str, Any], issues: list[dict[str, str]]) -> dict[str, str]:
    url = page.get("url") or ""
    slug = urlparse(url).path.strip("/") or "home"
    label = slug.replace("-", " ").replace("/", " · ")
    title = page.get("title") or ""
    meta = page.get("meta_description") or ""
    h1 = page.get("h1") or ""

    codes = {i["code"] for i in issues}
    if "missing_title" in codes or "title_short" in codes or "title_long" in codes:
        title = f"{label.title()} | Demo Shop"
        if len(title) > 60:
            title = f"{label.title()}"[:57] + "…"
    if "missing_meta" in codes or "meta_short" in codes or "meta_long" in codes:
        meta = (
            f"Scopri {label} su Demo Shop: selezione curata, spedizione rapida "
            f"e assistenza dedicata. Acquista online in sicurezza."
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
    max_urls = tenant.policy.seo.max_urls_per_run
    target_urls = (urls or _default_urls(tenant))[:max_urls]

    findings: list[dict[str, Any]] = []
    changes: list[dict[str, Any]] = []

    for url in target_urls:
        page = _load_page(url, dry_run=dry_run)
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
            proposed = _propose_copy(page, issues)
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
                "entity_name": f"{len(changes)} page change(s)",
                "reason": f"SEO audit found issues on {len(changes)} URL(s)",
                "requires_approval": True,
                "change_set": change_set,
            }
        )

    return {
        "skill": "seo_audit",
        "mode": "dry_run" if dry_run else "live",
        "summary": (
            f"Audited {len(target_urls)} URLs; "
            f"{sum(1 for f in findings if f['issues'])} with issues; "
            f"proposed {len(changes)} changes."
        ),
        "findings": findings,
        "change_set": change_set,
        "proposals": proposals,
        "requires_approval": bool(changes),
    }
