"""Attach tenant playbook / knowledge to skill run findings.

Used by free skills, dept stubs, and Plus deep hooks so LangGraph runs
surface company know-how (not only entitlement gates).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from monny.config.models import TenantConfig
from monny.config.settings import get_settings
from monny.config.skill_catalog import get_skill
from monny.knowledge import retrieve

# Plus excerpts intentionally longer so deep skills clearly exceed free.
_FREE_EXCERPT = 1800
_PLUS_EXCERPT = 4800


def _excerpt_limit(tier: str | None) -> int:
    return _PLUS_EXCERPT if tier == "plus" else _FREE_EXCERPT


def _playbook_title(text: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return None


def load_knowhow(tenant: TenantConfig, skill_id: str) -> dict[str, Any]:
    """Load catalog know-how + playbook excerpt + tagged knowledge chunks."""
    skill = get_skill(skill_id)
    if skill is None:
        return {}
    kh = skill.knowhow
    settings = get_settings()
    tenants_root = Path(settings.monny_tenants_dir)
    chunks: list[dict[str, Any]] = []
    query = skill.label_it or skill_id
    try:
        retrieved = retrieve(
            tenant.tenant_id,
            query,
            tags=list(kh.knowledge_tags) or None,
            limit=6 if skill.tier == "plus" else 3,
            root=tenants_root,
        )
        chunks = [c.to_dict() for c in retrieved]
    except Exception:  # noqa: BLE001 — missing knowledge OK in dry-run
        chunks = []

    playbook_excerpt = ""
    playbook_title = None
    if kh.playbook:
        path = tenants_root / tenant.tenant_id / "knowledge" / kh.playbook
        if path.exists():
            full = path.read_text(encoding="utf-8")
            playbook_title = _playbook_title(full)
            limit = _excerpt_limit(skill.tier)
            playbook_excerpt = full[:limit]

    return {
        "skill_id": skill_id,
        "tier": skill.tier,
        "playbook": kh.playbook,
        "playbook_title": playbook_title,
        "knowledge_tags": list(kh.knowledge_tags),
        "knowledge_paths": list(kh.knowledge_paths),
        "decision_rights_key": kh.decision_rights_key,
        "decision_rights_hint": kh.decision_rights_hint,
        "metrics": list(kh.metrics),
        "hitl_prompts": list(kh.hitl_prompts),
        "chunks": chunks,
        "playbook_excerpt": playbook_excerpt,
        "excerpt_chars": len(playbook_excerpt),
    }


def with_knowhow(
    result: dict[str, Any],
    tenant: TenantConfig,
    skill_id: str,
) -> dict[str, Any]:
    """Merge know-how onto a skill result (idempotent if already present)."""
    if result.get("knowhow"):
        return result
    knowhow = load_knowhow(tenant, skill_id)
    if not knowhow:
        return result
    out = {**result, "knowhow": knowhow}
    # Propagate onto proposals so HITL / report can cite the playbook.
    proposals = list(out.get("proposals") or [])
    if proposals:
        enriched = []
        for p in proposals:
            if isinstance(p, dict) and "knowhow" not in p:
                enriched.append({**p, "knowhow": knowhow})
            else:
                enriched.append(p)
        out["proposals"] = enriched
    return out
