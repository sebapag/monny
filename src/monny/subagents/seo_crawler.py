"""SEO crawler subagent — batch fetch/parse; returns compact page summaries only.

Keeps raw HTML out of the planner context. Fixtures for .example hosts by default;
live HTTP only when allow_live=True (typically MONNY_LIVE=1 and non-example hosts).
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

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


def parse_html(html: str) -> dict[str, str]:
    parser = _PageParser()
    parser.feed(html)
    return {
        "title": re.sub(r"\s+", " ", "".join(parser.title_parts)).strip(),
        "meta_description": (parser.meta_description or "").strip(),
        "h1": re.sub(r"\s+", " ", "".join(parser.h1_parts)).strip(),
    }


def fixture_for_url(url: str) -> Path | None:
    path = urlparse(url).path.rstrip("/") or "/"
    mapping = {
        "/": "home.html",
        "/collections/all": "collections-all.html",
        "/products/sample": "products-sample.html",
    }
    name = mapping.get(path)
    if not name:
        slug = path.strip("/").replace("/", "-") or "home"
        candidate = FIXTURES_SEO / f"{slug}.html"
        return candidate if candidate.exists() else None
    path_obj = FIXTURES_SEO / name
    return path_obj if path_obj.exists() else None


def _load_one(url: str, *, allow_live: bool, timeout: float = 8.0) -> dict[str, Any]:
    host = urlparse(url).hostname or ""
    fixture = fixture_for_url(url)

    # Always prefer fixtures for reserved .example hosts (safe default)
    if host.endswith(".example") and fixture is not None:
        parsed = parse_html(fixture.read_text(encoding="utf-8"))
        return {**parsed, "source": "fixture", "url": url, "ok": True}

    if not allow_live:
        if fixture is not None:
            parsed = parse_html(fixture.read_text(encoding="utf-8"))
            return {**parsed, "source": "fixture", "url": url, "ok": True}
        return {
            "url": url,
            "ok": False,
            "error": "Live fetch disabled; no fixture available",
            "title": "",
            "meta_description": "",
            "h1": "",
            "source": "skipped",
        }

    try:
        with httpx.Client(follow_redirects=True, timeout=timeout) as client:
            resp = client.get(url, headers={"User-Agent": "MonnySeoCrawler/0.1"})
            resp.raise_for_status()
            parsed = parse_html(resp.text)
            return {
                **parsed,
                "source": "live",
                "url": url,
                "ok": True,
                "status_code": resp.status_code,
            }
    except Exception as exc:
        if fixture is not None:
            parsed = parse_html(fixture.read_text(encoding="utf-8"))
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


def crawl(
    urls: list[str],
    *,
    allow_live: bool = False,
    timeout: float = 8.0,
) -> dict[str, Any]:
    """Fetch/parse many URLs; return compact summaries (no HTML bodies)."""
    pages: list[dict[str, Any]] = []
    for url in urls:
        pages.append(_load_one(url, allow_live=allow_live, timeout=timeout))
    return {
        "subagent": "seo_crawler",
        "url_count": len(urls),
        "ok_count": sum(1 for p in pages if p.get("ok")),
        "sources": sorted({str(p.get("source")) for p in pages}),
        "pages": pages,
    }
