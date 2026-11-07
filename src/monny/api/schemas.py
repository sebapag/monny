"""API request/response models."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    tenant_id: str = "demo"
    message: str
    goal: str | None = None
    thread_id: str | None = None


class ChatResponse(BaseModel):
    thread_id: str
    reply: str
    status: str
    approval_ids: list[str] = Field(default_factory=list)
    report: dict[str, Any] | None = None
    findings: list[dict[str, Any]] = Field(default_factory=list)
    run_id: str | None = None


class RunStartRequest(BaseModel):
    tenant_id: str = "demo"
    message: str
    goal: str | None = None
    thread_id: str | None = None


class TimelineStepOut(BaseModel):
    id: str
    skill: str
    label: str
    status: str
    detail: str = ""
    started_at: str | None = None
    finished_at: str | None = None


class RunOut(BaseModel):
    id: str
    tenant_id: str
    thread_id: str
    goal: str
    status: str
    active_skill: str | None = None
    status_line: str = ""
    steps: list[TimelineStepOut] = Field(default_factory=list)
    reply: str | None = None
    report: dict[str, Any] | None = None
    approval_ids: list[str] = Field(default_factory=list)
    error: str | None = None
    created_at: str
    updated_at: str


class ApprovalDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str | None = None


class ApprovalOut(BaseModel):
    id: str
    tenant_id: str
    thread_id: str
    action_type: str
    summary: str
    payload: dict[str, Any]
    status: str
    created_at: str
    decided_at: str | None = None
    note: str | None = None
    apply_result: dict[str, Any] | None = None


class TenantUpsert(BaseModel):
    """Full tenant config body (YAML-equivalent JSON). Secrets stay as secret_ref names."""

    config: dict[str, Any]


class SecretStatus(BaseModel):
    secret_ref: str
    configured: bool
