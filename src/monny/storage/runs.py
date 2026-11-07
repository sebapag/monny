"""In-process run timeline store — skill steps for Agent UX polling/SSE."""

from __future__ import annotations

import json
import threading
import uuid
from copy import deepcopy
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal


StepStatus = Literal["pending", "running", "done", "error", "waiting"]
RunStatus = Literal["queued", "running", "awaiting_approval", "completed", "error"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class TimelineStep:
    id: str
    skill: str
    label: str
    status: StepStatus = "pending"
    detail: str = ""
    started_at: str | None = None
    finished_at: str | None = None


@dataclass
class AgentRun:
    id: str
    tenant_id: str
    thread_id: str
    goal: str
    status: RunStatus = "queued"
    active_skill: str | None = None
    status_line: str = "In coda…"
    steps: list[TimelineStep] = field(default_factory=list)
    reply: str | None = None
    report: dict[str, Any] | None = None
    approval_ids: list[str] = field(default_factory=list)
    error: str | None = None
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "thread_id": self.thread_id,
            "goal": self.goal,
            "status": self.status,
            "active_skill": self.active_skill,
            "status_line": self.status_line,
            "steps": [asdict(s) for s in self.steps],
            "reply": self.reply,
            "report": self.report,
            "approval_ids": self.approval_ids,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


# Italian-facing labels for skill presence
SKILL_LABELS: dict[str, str] = {
    "planner": "Pianificazione",
    "shopify_read": "Lettura Shopify",
    "spend_google": "Spend · Google Ads",
    "spend_meta": "Spend · Meta",
    "seo_audit": "Audit SEO",
    "seo_crawler": "Crawl pagine",
    "shopify_promo": "Promo Shopify (stub)",
    "lead_warming": "Lead warming (stub)",
    "reporting": "Report",
    "hitl": "Approvazione umana",
}


class RunStore:
    def __init__(self, data_dir: Path | str | None = None) -> None:
        self._lock = threading.RLock()
        self._runs: dict[str, AgentRun] = {}
        self.data_dir = Path(data_dir) if data_dir else None
        if self.data_dir:
            self.data_dir.mkdir(parents=True, exist_ok=True)

    def create(
        self,
        *,
        tenant_id: str,
        thread_id: str,
        goal: str,
        planned_skills: list[str] | None = None,
        run_id: str | None = None,
    ) -> AgentRun:
        rid = run_id or str(uuid.uuid4())
        steps: list[TimelineStep] = []
        # Always show planner + hitl bookends around planned skills
        sequence = ["planner"]
        for skill in planned_skills or []:
            if skill == "reporting":
                continue
            if skill == "seo_audit":
                if "seo_crawler" not in sequence:
                    sequence.append("seo_crawler")
                if "seo_audit" not in sequence:
                    sequence.append("seo_audit")
                continue
            if skill not in sequence:
                sequence.append(skill)
        if "reporting" not in sequence:
            sequence.append("reporting")
        sequence.append("hitl")
        for skill in sequence:
            steps.append(
                TimelineStep(
                    id=f"{rid}-{skill}-{len(steps)}",
                    skill=skill,
                    label=SKILL_LABELS.get(skill, skill),
                    status="pending",
                    detail="In attesa…",
                )
            )
        run = AgentRun(
            id=rid,
            tenant_id=tenant_id,
            thread_id=thread_id,
            goal=goal,
            steps=steps,
            status="queued",
            status_line="Preparazione del run…",
        )
        with self._lock:
            self._runs[rid] = run
            self._persist(run)
        return deepcopy(run)

    def get(self, run_id: str) -> AgentRun | None:
        with self._lock:
            run = self._runs.get(run_id)
            return deepcopy(run) if run else None

    def list_for_tenant(self, tenant_id: str, *, limit: int = 20) -> list[AgentRun]:
        with self._lock:
            items = [r for r in self._runs.values() if r.tenant_id == tenant_id]
        items.sort(key=lambda r: r.created_at, reverse=True)
        return [deepcopy(r) for r in items[:limit]]

    def set_run_status(
        self,
        run_id: str,
        status: RunStatus,
        *,
        status_line: str | None = None,
        active_skill: str | None = None,
        clear_active: bool = False,
    ) -> None:
        with self._lock:
            run = self._runs[run_id]
            run.status = status
            if status_line is not None:
                run.status_line = status_line
            if clear_active:
                run.active_skill = None
            elif active_skill is not None:
                run.active_skill = active_skill
            run.updated_at = _now()
            self._persist(run)

    def start_step(self, run_id: str, skill: str, detail: str = "") -> None:
        with self._lock:
            run = self._runs[run_id]
            step = self._find_step(run, skill)
            if step is None:
                step = TimelineStep(
                    id=f"{run_id}-{skill}-{len(run.steps)}",
                    skill=skill,
                    label=SKILL_LABELS.get(skill, skill),
                )
                run.steps.append(step)
            step.status = "running"
            step.detail = detail or f"Esecuzione {step.label}…"
            step.started_at = step.started_at or _now()
            run.active_skill = skill
            run.status = "running"
            run.status_line = step.detail
            run.updated_at = _now()
            self._persist(run)

    def finish_step(
        self,
        run_id: str,
        skill: str,
        *,
        status: StepStatus = "done",
        detail: str = "",
    ) -> None:
        with self._lock:
            run = self._runs[run_id]
            step = self._find_step(run, skill)
            if step is None:
                return
            step.status = status
            step.detail = detail or ("Completato" if status == "done" else detail)
            step.finished_at = _now()
            if run.active_skill == skill:
                run.active_skill = None
            run.updated_at = _now()
            self._persist(run)

    def wait_hitl(self, run_id: str, approval_count: int) -> None:
        with self._lock:
            run = self._runs[run_id]
            step = self._find_step(run, "hitl")
            if step:
                step.status = "waiting" if approval_count else "done"
                step.detail = (
                    (
                        f"{approval_count} proposte in attesa della tua decisione"
                        if approval_count != 1
                        else "1 proposta in attesa della tua decisione"
                    )
                    if approval_count
                    else "Nessuna azione da approvare"
                )
                step.started_at = step.started_at or _now()
                if not approval_count:
                    step.finished_at = _now()
            run.active_skill = "hitl" if approval_count else None
            run.status = "awaiting_approval" if approval_count else "completed"
            run.status_line = (
                "In attesa della tua decisione"
                if approval_count
                else "Run completato"
            )
            run.updated_at = _now()
            self._persist(run)

    def complete(
        self,
        run_id: str,
        *,
        reply: str,
        report: dict[str, Any] | None,
        approval_ids: list[str],
        status: RunStatus,
    ) -> None:
        with self._lock:
            run = self._runs[run_id]
            run.reply = reply
            run.report = report
            run.approval_ids = approval_ids
            run.status = status
            if status == "completed":
                run.status_line = "Run completato"
                run.active_skill = None
            elif status == "awaiting_approval":
                run.status_line = "In attesa della tua decisione"
                run.active_skill = "hitl"
            run.updated_at = _now()
            self._persist(run)

    def fail(self, run_id: str, error: str) -> None:
        with self._lock:
            run = self._runs[run_id]
            run.status = "error"
            run.error = error
            run.status_line = f"Errore: {error}"
            run.active_skill = None
            for step in run.steps:
                if step.status == "running":
                    step.status = "error"
                    step.finished_at = _now()
            run.updated_at = _now()
            self._persist(run)

    def _find_step(self, run: AgentRun, skill: str) -> TimelineStep | None:
        for step in run.steps:
            if step.skill == skill and step.status in {"pending", "running", "waiting"}:
                return step
        for step in reversed(run.steps):
            if step.skill == skill:
                return step
        return None

    def _persist(self, run: AgentRun) -> None:
        if not self.data_dir:
            return
        path = self.data_dir / "runs" / f"{run.id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(run.to_dict(), indent=2), encoding="utf-8")


_STORE: RunStore | None = None
_STORE_LOCK = threading.Lock()


def get_run_store(data_dir: Path | str | None = None) -> RunStore:
    global _STORE
    with _STORE_LOCK:
        if _STORE is None:
            _STORE = RunStore(data_dir)
        return _STORE


def reset_run_store_for_tests() -> None:
    global _STORE
    with _STORE_LOCK:
        _STORE = None
