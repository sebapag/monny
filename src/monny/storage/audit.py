"""Append-only audit log per tenant."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _audit_path(data_dir: Path, tenant_id: str) -> Path:
    path = data_dir / tenant_id / "audit.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def append_audit(
    data_dir: Path | str,
    tenant_id: str,
    event: str,
    payload: dict[str, Any] | None = None,
) -> None:
    path = _audit_path(Path(data_dir), tenant_id)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "tenant_id": tenant_id,
        "event": event,
        "payload": payload or {},
    }
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
