"""In-memory + disk-backed pending approvals for HITL (dev-friendly)."""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal


Decision = Literal["pending", "approved", "rejected"]


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


class ApprovalStore:
    def __init__(self, data_dir: Path | str) -> None:
        self.data_dir = Path(data_dir)
        self.path = self.data_dir / "approvals.json"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._items: dict[str, Approval] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        for item in raw:
            approval = Approval(**item)
            self._items[approval.id] = approval

    def _persist(self) -> None:
        payload = [asdict(a) for a in self._items.values()]
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

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
        self._items[approval.id] = approval
        self._persist()
        return approval

    def list(
        self,
        tenant_id: str | None = None,
        status: Decision | None = "pending",
    ) -> list[Approval]:
        items = list(self._items.values())
        if tenant_id:
            items = [a for a in items if a.tenant_id == tenant_id]
        if status:
            items = [a for a in items if a.status == status]
        return sorted(items, key=lambda a: a.created_at, reverse=True)

    def get(self, approval_id: str) -> Approval | None:
        return self._items.get(approval_id)

    def decide(
        self,
        approval_id: str,
        decision: Literal["approved", "rejected"],
        note: str | None = None,
    ) -> Approval:
        approval = self._items.get(approval_id)
        if approval is None:
            raise KeyError(f"Unknown approval: {approval_id}")
        if approval.status != "pending":
            raise ValueError(f"Approval already {approval.status}")
        approval.status = decision
        approval.note = note
        approval.decided_at = datetime.now(timezone.utc).isoformat()
        self._persist()
        return approval
