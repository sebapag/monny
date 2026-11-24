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
    """Three-path leadership actions + legacy reject."""

    decision: Literal["approved", "rejected", "delegated", "escalated"]
    note: str | None = None
    # Required when decision == delegated (dept id: spend, seo, …).
    delegate_to: str | None = None


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
    delegate_to: str | None = None
    apply_result: dict[str, Any] | None = None


class TenantUpsert(BaseModel):
    """Full tenant config body (YAML-equivalent JSON). Secrets stay as secret_ref names."""

    config: dict[str, Any]


class ShopifyOAuthStartRequest(BaseModel):
    shop_domain: str


class SecretStatus(BaseModel):
    secret_ref: str
    configured: bool
    source: str | None = None


class KnowledgeRetrieveRequest(BaseModel):
    query: str = ""
    tags: list[str] | None = None
    limit: int = Field(default=5, ge=1, le=20)


class KnowledgeSourceToggle(BaseModel):
    enabled: bool


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""


class AuthUserOut(BaseModel):
    email: str
    display_name: str
    role: Literal["agent", "admin"]
    tenant_id: str
    user_id: str | None = None


class LoginResponse(BaseModel):
    token: str
    user: AuthUserOut
    expires_in: int
    backend: Literal["supabase", "fixtures"] = "fixtures"
    refresh_token: str | None = None


class CreateUserRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""
    role: Literal["agent", "admin"] = "agent"
    tenant_id: str = "demo"


class UpdateUserRequest(BaseModel):
    role: Literal["agent", "admin"]
    display_name: str | None = None
    tenant_id: str | None = None
