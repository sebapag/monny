"""Filesystem artifact helpers for reports and change sets."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def artifact_dir(data_dir: Path | str, tenant_id: str) -> Path:
    path = Path(data_dir) / tenant_id / "artifacts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json_artifact(
    data_dir: Path | str,
    tenant_id: str,
    name: str,
    payload: dict[str, Any],
) -> Path:
    target = artifact_dir(data_dir, tenant_id) / name
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return target


def read_json_artifact(
    data_dir: Path | str,
    tenant_id: str,
    name: str,
) -> dict[str, Any] | None:
    path = artifact_dir(data_dir, tenant_id) / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def list_artifacts(data_dir: Path | str, tenant_id: str) -> list[dict[str, Any]]:
    root = artifact_dir(data_dir, tenant_id)
    items: list[dict[str, Any]] = []
    for path in sorted(
        list(root.glob("*.json")) + list(root.glob("*.md")),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    ):
        stat = path.stat()
        items.append(
            {
                "name": path.name,
                "path": str(path),
                "size": stat.st_size,
                "mtime": stat.st_mtime,
            }
        )
    return items
