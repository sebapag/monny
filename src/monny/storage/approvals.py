"""In-memory + disk-backed pending approvals for HITL (dev-friendly)."""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal


Decision = Literal["pending", "approved", "rejected", "delegated", "escalated"]

logger = logging.getLogger(__name__)

# Serialize writers that share the same approvals.json path (multiple store instances).
_PATH_LOCKS: dict[str, threading.Lock] = {}
_PATH_LOCKS_GUARD = threading.Lock()


def _lock_for(path: Path) -> threading.Lock:
    key = str(path.resolve())
    with _PATH_LOCKS_GUARD:
        lock = _PATH_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _PATH_LOCKS[key] = lock
        return lock


@dataclass
class Approval:
    id: str
    tenant_id: str
    thread_id: str
    action_type: str
    summary: str
    payload: dict[str, Any]
    status: Decision = "pending"
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    decided_at: str | None = None
    note: str | None = None
    # Target department id when status is delegated (e.g. spend, seo).
    delegate_to: str | None = None


def _atomic_write_text(path: Path, text: str) -> None:
    """Write via unique temp file + replace so concurrent writers cannot collide."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # Unique name: a fixed "*.json.tmp" races when two stores persist the same path.
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=str(path.parent),
    )
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except Exception:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        raise


class ApprovalStore:
    def __init__(self, data_dir: Path | str) -> None:
        self.data_dir = Path(data_dir)
        self.path = self.data_dir / "approvals.json"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._lock = _lock_for(self.path)
        self._items: dict[str, Approval] = {}
        with self._lock:
            self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        text = self.path.read_text(encoding="utf-8").strip()
        if not text:
            # Truncated/empty file (e.g. killed mid-write before atomic fix) — start clean.
            logger.warning("Ignoring empty approvals file at %s", self.path)
            return
        try:
            raw = json.loads(text)
        except json.JSONDecodeError:
            # Corrupt store must not brick every run at HITL.
            bak = self.path.with_suffix(".json.corrupt")
            try:
                os.replace(self.path, bak)
                logger.warning(
                    "Corrupt approvals.json moved to %s; starting with empty store",
                    bak,
                )
            except OSError:
                logger.warning(
                    "Corrupt approvals.json at %s; starting with empty store",
                    self.path,
                )
            return
        if not isinstance(raw, list):
            logger.warning("approvals.json is not a list; ignoring")
            return
        for item in raw:
            if not isinstance(item, dict):
                continue
            try:
                approval = Approval(**item)
            except TypeError:
                continue
            self._items[approval.id] = approval

    def _persist(self) -> None:
        payload = [asdict(a) for a in self._items.values()]
        _atomic_write_text(self.path, json.dumps(payload, indent=2))

    def _refresh_from_disk(self) -> None:
        """Re-read approvals.json so multiple store instances sharing a path stay coherent."""
        self._items = {}
        self._load()

    def create(
        self,
        *,
        tenant_id: str,
        thread_id: str,
        action_type: str,
        summary: str,
        payload: dict[str, Any],
    ) -> Approval:
        approval = Approval(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            thread_id=thread_id,
            action_type=action_type,
            summary=summary,
            payload=payload,
        )
        with self._lock:
            self._refresh_from_disk()
            self._items[approval.id] = approval
            self._persist()
        return approval

    def list(
        self,
        tenant_id: str | None = None,
        status: Decision | None = "pending",
    ) -> list[Approval]:
        with self._lock:
            self._refresh_from_disk()
            items = list(self._items.values())
        if tenant_id:
            items = [a for a in items if a.tenant_id == tenant_id]
        if status:
            items = [a for a in items if a.status == status]
        return sorted(items, key=lambda a: a.created_at, reverse=True)

    def get(self, approval_id: str) -> Approval | None:
        with self._lock:
            self._refresh_from_disk()
            return self._items.get(approval_id)

    def decide(
        self,
        approval_id: str,
        decision: Literal["approved", "rejected", "delegated", "escalated"],
        note: str | None = None,
        delegate_to: str | None = None,
    ) -> Approval:
        with self._lock:
            self._refresh_from_disk()
            approval = self._items.get(approval_id)
            if approval is None:
                raise KeyError(f"Unknown approval: {approval_id}")
            # Escalated items stay actionable until resolved / delegated / rejected.
            if approval.status not in ("pending", "escalated"):
                raise ValueError(f"Approval already {approval.status}")
            if decision == "delegated" and not delegate_to:
                raise ValueError("delegate_to is required when decision is delegated")
            approval.status = decision
            approval.note = note
            approval.delegate_to = delegate_to if decision == "delegated" else None
            if decision == "escalated":
                # Still open for a human — do not stamp decided_at yet.
                approval.decided_at = None
                if note:
                    approval.note = note
                elif not approval.note:
                    approval.note = "Scalata a decisione umana"
            else:
                approval.decided_at = datetime.now(timezone.utc).isoformat()
            self._persist()
            return approval
