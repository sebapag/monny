"""Local markdown knowledge retrieve — no embedding API required for dry-run."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import yaml

from monny.config.loader import tenants_root


@dataclass
class KnowledgeSource:
    id: str
    title: str
    type: str = "markdown"
    path: str = ""
    tags: list[str] = field(default_factory=list)
    enabled: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class KnowledgeChunk:
    source_id: str
    title: str
    excerpt: str
    tags: list[str] = field(default_factory=list)
    score: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def knowledge_dir(tenant_id: str, root: Path | None = None) -> Path:
    return (root or tenants_root()) / tenant_id / "knowledge"


def manifest_path(tenant_id: str, root: Path | None = None) -> Path:
    return knowledge_dir(tenant_id, root) / "manifest.yaml"


def load_manifest(tenant_id: str, root: Path | None = None) -> dict[str, Any]:
    path = manifest_path(tenant_id, root)
    if not path.exists():
        return {"sources": [], "index": {"backend": "local_stub", "embedding": "stub_hash"}}
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    if "sources" not in data:
        data["sources"] = []
    if "index" not in data:
        data["index"] = {"backend": "local_stub", "embedding": "stub_hash"}
    return data


def _parse_source(raw: dict[str, Any]) -> KnowledgeSource:
    return KnowledgeSource(
        id=str(raw.get("id") or ""),
        title=str(raw.get("title") or raw.get("id") or ""),
        type=str(raw.get("type") or "markdown"),
        path=str(raw.get("path") or ""),
        tags=[str(t) for t in (raw.get("tags") or [])],
        enabled=bool(raw.get("enabled", True)),
    )


def list_sources(tenant_id: str, root: Path | None = None) -> list[KnowledgeSource]:
    manifest = load_manifest(tenant_id, root)
    return [_parse_source(s) for s in manifest.get("sources") or [] if isinstance(s, dict)]


def save_manifest(tenant_id: str, manifest: dict[str, Any], root: Path | None = None) -> Path:
    path = manifest_path(tenant_id, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        yaml.safe_dump(manifest, fh, sort_keys=False, allow_unicode=True)
    return path


def set_source_enabled(
    tenant_id: str,
    source_id: str,
    enabled: bool,
    root: Path | None = None,
) -> KnowledgeSource:
    manifest = load_manifest(tenant_id, root)
    sources = manifest.get("sources") or []
    found: dict[str, Any] | None = None
    for raw in sources:
        if isinstance(raw, dict) and raw.get("id") == source_id:
            raw["enabled"] = enabled
            found = raw
            break
    if found is None:
        raise KeyError(f"Knowledge source not found: {source_id}")
    save_manifest(tenant_id, manifest, root)
    return _parse_source(found)


def _chunk_markdown(text: str, *, max_chars: int = 420) -> list[str]:
    """Split on headings / blank lines into short citeable excerpts."""
    parts = re.split(r"\n(?=#{1,3}\s)|\n{2,}", text.strip())
    chunks: list[str] = []
    for part in parts:
        cleaned = re.sub(r"\s+", " ", part.strip())
        if not cleaned:
            continue
        if len(cleaned) <= max_chars:
            chunks.append(cleaned)
            continue
        # Soft wrap long sections
        start = 0
        while start < len(cleaned):
            chunks.append(cleaned[start : start + max_chars].strip())
            start += max_chars
    return chunks


def _score(query: str, tags_filter: list[str] | None, source: KnowledgeSource, excerpt: str) -> float:
    score = 0.0
    q_tokens = {t for t in re.split(r"[^\wàèéìòù]+", query.lower()) if len(t) > 2}
    tag_set = {t.lower() for t in source.tags}
    if tags_filter:
        wanted = {t.lower() for t in tags_filter}
        overlap = len(wanted & tag_set)
        if overlap:
            score += 2.0 * overlap
        else:
            # Still allow weak lexical match if no tag overlap
            score += 0.1
    else:
        score += 0.5

    excerpt_l = excerpt.lower()
    title_l = source.title.lower()
    for tok in q_tokens:
        if tok in title_l:
            score += 1.5
        if tok in excerpt_l:
            score += 1.0
        if tok in tag_set:
            score += 1.2
    # Prefer enabled brand/spend docs slightly when query empty
    if not q_tokens and not tags_filter:
        score += 0.2
    return score


def retrieve(
    tenant_id: str,
    query: str,
    *,
    tags: list[str] | None = None,
    limit: int = 5,
    root: Path | None = None,
) -> list[KnowledgeChunk]:
    """Stub retrieval over enabled markdown sources (dry-run friendly)."""
    base = knowledge_dir(tenant_id, root)
    results: list[KnowledgeChunk] = []
    for source in list_sources(tenant_id, root):
        if not source.enabled or source.type != "markdown" or not source.path:
            continue
        file_path = base / source.path
        if not file_path.exists():
            continue
        text = file_path.read_text(encoding="utf-8")
        for excerpt in _chunk_markdown(text):
            score = _score(query, tags, source, excerpt)
            if score <= 0:
                continue
            results.append(
                KnowledgeChunk(
                    source_id=source.id,
                    title=source.title,
                    excerpt=excerpt,
                    tags=list(source.tags),
                    score=round(score, 3),
                )
            )
    results.sort(key=lambda c: c.score, reverse=True)
    return results[: max(1, limit)]
