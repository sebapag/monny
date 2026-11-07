"""FastAPI surface: agent chat, approvals, tenant admin config."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from monny.api.schemas import (
    ApprovalDecision,
    ApprovalOut,
    ChatRequest,
    ChatResponse,
    SecretStatus,
    TenantUpsert,
)
from monny.config.loader import (
    list_tenant_ids,
    load_tenant,
    save_tenant,
    secret_status,
    tenants_root,
)
from monny.config.models import TenantConfig
from monny.config.settings import get_settings
from monny.graph.app import run_agent
from monny.skills.apply_stub import apply_approved
from monny.storage.approvals import ApprovalStore
from monny.storage.artifacts import write_json_artifact
from monny.storage.audit import append_audit


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Monny API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def approvals() -> ApprovalStore:
        return ApprovalStore(settings.monny_data_dir)

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "ok": True,
            "dry_run": settings.dry_run,
            "default_tenant": settings.monny_default_tenant,
        }

    @app.post("/api/chat", response_model=ChatResponse)
    def chat(body: ChatRequest) -> ChatResponse:
        try:
            load_tenant(body.tenant_id, Path(settings.monny_tenants_dir))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        thread_id = body.thread_id or f"{body.tenant_id}-web"
        result = run_agent(
            tenant_id=body.tenant_id,
            goal=body.goal or body.message,
            message=body.message,
            thread_id=thread_id,
        )
        return ChatResponse(
            thread_id=thread_id,
            reply=result.get("reply") or "",
            status=result.get("status") or "unknown",
            approval_ids=result.get("approval_ids") or [],
            report=result.get("report"),
            findings=[
                f
                for f in (result.get("findings") or [])
                if f.get("skill") != "reporting"
            ],
        )

    @app.get("/api/approvals", response_model=list[ApprovalOut])
    def list_approvals(tenant_id: str | None = None, status: str | None = "pending"):
        items = approvals().list(tenant_id=tenant_id, status=status)  # type: ignore[arg-type]
        return [ApprovalOut(**item.__dict__) for item in items]

    @app.post("/api/approvals/{approval_id}/decide", response_model=ApprovalOut)
    def decide(approval_id: str, body: ApprovalDecision) -> ApprovalOut:
        store = approvals()
        try:
            item = store.decide(approval_id, body.decision, note=body.note)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        apply_result: dict[str, Any] | None = None
        if body.decision == "approved":
            apply_result = apply_approved(item.payload)
            write_json_artifact(
                settings.monny_data_dir,
                item.tenant_id,
                f"apply-{item.id}.json",
                apply_result,
            )

        append_audit(
            settings.monny_data_dir,
            item.tenant_id,
            f"approval_{body.decision}",
            {
                "approval_id": item.id,
                "action_type": item.action_type,
                "note": body.note,
                "apply_result": apply_result,
            },
        )

        out = ApprovalOut(**item.__dict__, apply_result=apply_result)
        return out

    @app.get("/api/tenants")
    def tenants() -> list[dict[str, str]]:
        out = []
        for tenant_id in list_tenant_ids(Path(settings.monny_tenants_dir)):
            cfg = load_tenant(tenant_id, Path(settings.monny_tenants_dir))
            out.append({"tenant_id": tenant_id, "display_name": cfg.display_name})
        return out

    @app.get("/api/tenants/{tenant_id}")
    def get_tenant(tenant_id: str) -> dict[str, Any]:
        try:
            cfg = load_tenant(tenant_id, Path(settings.monny_tenants_dir))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        data = cfg.model_dump(mode="json")
        refs = _collect_secret_refs(cfg)
        return {
            "config": data,
            "secrets": [SecretStatus(**secret_status(r)).model_dump() for r in refs],
            "path": str(tenants_root(settings.monny_tenants_dir) / tenant_id / "tenant.yaml"),
        }

    @app.put("/api/tenants/{tenant_id}")
    def put_tenant(tenant_id: str, body: TenantUpsert) -> dict[str, Any]:
        payload = dict(body.config)
        payload["tenant_id"] = tenant_id
        try:
            cfg = TenantConfig.model_validate(payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        path = save_tenant(cfg, Path(settings.monny_tenants_dir))
        append_audit(
            settings.monny_data_dir,
            tenant_id,
            "tenant_config_saved",
            {"path": str(path)},
        )
        return {"ok": True, "path": str(path), "tenant_id": tenant_id}

    @app.get("/api/tenants/{tenant_id}/audit")
    def tenant_audit(tenant_id: str, limit: int = 50) -> list[dict[str, Any]]:
        path = Path(settings.monny_data_dir) / tenant_id / "audit.jsonl"
        if not path.exists():
            return []
        lines = path.read_text(encoding="utf-8").strip().splitlines()
        import json

        rows = [json.loads(line) for line in lines if line.strip()]
        return list(reversed(rows[-limit:]))

    return app


def _collect_secret_refs(cfg: TenantConfig) -> list[str]:
    refs: list[str] = [cfg.shopify.auth.secret_ref]
    if cfg.ads.google:
        refs.append(cfg.ads.google.secret_ref)
    if cfg.ads.meta:
        refs.append(cfg.ads.meta.secret_ref)
    if cfg.integrations.search_console:
        refs.append(cfg.integrations.search_console.secret_ref)
    seen: set[str] = set()
    out: list[str] = []
    for r in refs:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


app = create_app()
