"""Thin FastAPI LangGraph worker for Cloud Run and local Ubuntu.

Owns real planner/runs. Auth/tenants UI stay on Supabase + Edge.
Edge stub remains fallback when WORKER_URL is unset.
"""

from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from monny.api.schemas import (
    ApprovalDecision,
    ApprovalOut,
    AuthUserOut,
    ChatRequest,
    ChatResponse,
    LoginRequest,
    LoginResponse,
    RunOut,
    RunStartRequest,
)
from monny.auth.deps import COOKIE_NAME, get_current_user, require_user
from monny.auth.service import auth_backend, login as auth_login, logout_token
from monny.auth.supabase_client import SupabaseError
from monny.auth.users import AuthenticatedUser, clear_users_cache
from monny.config.entitlements import (
    ENTITLEMENT_LABELS_IT,
    blocked_entitlements_for_text,
)
from monny.config.loader import load_tenant
from monny.config.models import TenantConfig
from monny.config.settings import get_settings
from monny.graph.app import run_agent
from monny.graph.nodes.planner import (
    _apply_entitlements,
    _infer_plan_with_meta,
    _stub_infer_plan_raw,
)
from monny.llm.client import llm_configured
from monny.skills.apply_stub import apply_approved
from monny.storage.approvals import ApprovalStore
from monny.storage.artifacts import write_json_artifact
from monny.storage.audit import append_audit
from monny.storage.runs import get_run_store
from monny.worker import supabase_sync

UserDep = Annotated[AuthenticatedUser, Depends(require_user)]


def create_worker_app() -> FastAPI:
    settings = get_settings()
    clear_users_cache()
    app = FastAPI(
        title="Atrium LangGraph Worker",
        version="0.2.0",
        description="Agent runs + HITL — Cloud Run / local Ubuntu",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def approvals() -> ApprovalStore:
        return ApprovalStore(settings.monny_data_dir)

    def runs():
        return get_run_store(settings.monny_data_dir)

    def _refuse_disabled_skills(cfg: TenantConfig, goal: str, message: str) -> None:
        text = f"{goal} {message}"
        blocked = blocked_entitlements_for_text(cfg, text)
        if not blocked:
            return
        lowered = text.lower()
        requested: list[str] = []
        for key, words in (
            ("shopify", ("promo", "promotion", "discount", "price rule", "shopify promo")),
            ("leads", ("lead", "warming", "nurture", "crm", "sequence")),
            ("spend", ("spend", "ads", "budget", "roas", "cpa", "meta", "google")),
            ("seo", ("seo", "title", "meta", "page", "sitemap", "crawl")),
        ):
            if any(w in lowered for w in words):
                requested.append(key)
        if not requested:
            return
        if set(requested) <= set(blocked):
            labels = [ENTITLEMENT_LABELS_IT.get(k, k) for k in blocked]
            detail = (
                "Reparto non attivo nel piano: "
                + ", ".join(labels)
                + ". Attivalo in Admin → Attivazione piano / reparti."
            )
            raise HTTPException(status_code=403, detail=detail)

    def _start_background_run(
        *,
        tenant_id: str,
        goal: str,
        message: str,
        thread_id: str,
        tenant: TenantConfig,
    ) -> str:
        stub_plan = _apply_entitlements(_stub_infer_plan_raw(goal, message), tenant)
        planned = ["shopify_read", *stub_plan]
        run = runs().create(
            tenant_id=tenant_id,
            thread_id=thread_id,
            goal=goal,
            planned_skills=planned,
        )
        supabase_sync.upsert_run(settings, run.to_dict())

        def _worker() -> None:
            try:
                inference = _infer_plan_with_meta(goal, message, tenant=tenant)
                plan = inference.skills
                if plan != stub_plan:
                    runs().replan(run.id, ["shopify_read", *plan])
                result = run_agent(
                    tenant_id=tenant_id,
                    goal=goal,
                    message=message,
                    thread_id=thread_id,
                    run_id=run.id,
                    plan=plan,
                    planner_source=inference.source,
                    planner_note=inference.note_it,
                    planner_detail=inference.detail,
                )
                latest = runs().get(run.id)
                if latest:
                    supabase_sync.upsert_run(settings, latest.to_dict())
                # Sync any new approvals created during the graph.
                for appr_id in (result or {}).get("approval_ids") or []:
                    item = approvals().get(appr_id)
                    if item:
                        supabase_sync.upsert_approval(settings, item.__dict__)
            except Exception as exc:  # noqa: BLE001
                runs().fail(run.id, str(exc))
                failed = runs().get(run.id)
                if failed:
                    supabase_sync.upsert_run(settings, failed.to_dict())

        threading.Thread(
            target=_worker,
            daemon=True,
            name=f"atrium-worker-{run.id[:8]}",
        ).start()
        return run.id

    def _set_session_cookie(response: Response, token: str, *, max_age: int) -> None:
        if not token:
            return
        response.set_cookie(
            key=COOKIE_NAME,
            value=token,
            httponly=True,
            samesite="lax",
            secure=settings.monny_auth_cookie_secure,
            max_age=max_age,
            path="/",
        )

    @app.get("/health")
    @app.get("/api/health")
    def health() -> dict[str, Any]:
        llm_on = llm_configured(settings)
        return {
            "ok": True,
            "service": "atrium-worker",
            "dry_run": settings.dry_run,
            "default_tenant": settings.monny_default_tenant,
            "auth": {
                "backend": auth_backend(settings),
                "supabase_configured": settings.supabase_configured,
            },
            "supabase_sync": supabase_sync.sync_enabled(settings),
            "llm": {
                "enabled": llm_on,
                "provider": "xai" if llm_on else None,
                "model": settings.monny_llm_model if llm_on else None,
                "base_url": settings.monny_llm_base_url if llm_on else None,
            },
            "planner": "langgraph",
        }

    @app.post("/api/auth/login", response_model=LoginResponse)
    def login(body: LoginRequest, response: Response) -> LoginResponse:
        """Local/fixture login when SPA talks to the worker without Supabase Auth."""
        try:
            outcome = auth_login(settings, body.email, body.password)
        except SupabaseError as exc:
            raise HTTPException(
                status_code=exc.status_code or 401,
                detail=str(exc) or "Email o password non validi",
            ) from exc
        _set_session_cookie(response, outcome.token, max_age=outcome.expires_in or 3600)
        return LoginResponse(
            token=outcome.token,
            user=AuthUserOut(
                email=outcome.user.email,
                display_name=outcome.user.display_name,
                role=outcome.user.role,
                tenant_id=outcome.user.tenant_id,
                user_id=outcome.user.user_id,
            ),
            expires_in=outcome.expires_in,
            backend=outcome.backend,
            refresh_token=outcome.refresh_token,
        )

    @app.post("/api/auth/logout")
    def logout(
        request: Request,
        response: Response,
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, bool]:
        token = None
        if authorization and authorization.lower().startswith("bearer "):
            token = authorization.split(" ", 1)[1].strip()
        token = token or request.cookies.get(COOKIE_NAME)
        logout_token(settings, token)
        response.delete_cookie(key=COOKIE_NAME, path="/")
        return {"ok": True}

    @app.get("/api/auth/me", response_model=AuthUserOut)
    def me(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthUserOut:
        return AuthUserOut(
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            tenant_id=user.tenant_id,
            user_id=user.user_id,
        )

    @app.post("/api/runs", response_model=RunOut)
    def start_run(body: RunStartRequest, _user: UserDep) -> RunOut:
        try:
            cfg = load_tenant(body.tenant_id, Path(settings.monny_tenants_dir))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        thread_id = body.thread_id or f"{body.tenant_id}-web"
        goal = body.goal or body.message
        _refuse_disabled_skills(cfg, goal, body.message)
        run_id = _start_background_run(
            tenant_id=body.tenant_id,
            goal=goal,
            message=body.message,
            thread_id=thread_id,
            tenant=cfg,
        )
        run = runs().get(run_id)
        assert run is not None
        return RunOut(**run.to_dict())

    @app.get("/api/runs/{run_id}", response_model=RunOut)
    def get_run(run_id: str, _user: UserDep) -> RunOut:
        run = runs().get(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return RunOut(**run.to_dict())

    @app.get("/api/runs/{run_id}/stream")
    async def stream_run(run_id: str, _user: UserDep) -> StreamingResponse:
        if runs().get(run_id) is None:
            raise HTTPException(status_code=404, detail="Run not found")

        async def event_gen():
            terminal = {"completed", "awaiting_approval", "error"}
            while True:
                run = runs().get(run_id)
                if run is None:
                    yield f"data: {json.dumps({'error': 'missing'})}\n\n"
                    break
                payload = run.to_dict()
                yield f"data: {json.dumps(payload)}\n\n"
                if run.status in terminal:
                    break
                await asyncio.sleep(0.25)

        return StreamingResponse(event_gen(), media_type="text/event-stream")

    @app.post("/api/chat", response_model=ChatResponse)
    def chat(body: ChatRequest, _user: UserDep) -> ChatResponse:
        try:
            cfg = load_tenant(body.tenant_id, Path(settings.monny_tenants_dir))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        thread_id = body.thread_id or f"{body.tenant_id}-web"
        goal = body.goal or body.message
        _refuse_disabled_skills(cfg, goal, body.message)
        inference = _infer_plan_with_meta(goal, body.message, tenant=cfg)
        plan = inference.skills
        run = runs().create(
            tenant_id=body.tenant_id,
            thread_id=thread_id,
            goal=goal,
            planned_skills=["shopify_read", *plan],
        )
        supabase_sync.upsert_run(settings, run.to_dict())
        result = run_agent(
            tenant_id=body.tenant_id,
            goal=goal,
            message=body.message,
            thread_id=thread_id,
            run_id=run.id,
            plan=plan,
            planner_source=inference.source,
            planner_note=inference.note_it,
            planner_detail=inference.detail,
        )
        latest = runs().get(run.id)
        if latest:
            supabase_sync.upsert_run(settings, latest.to_dict())
        for appr_id in result.get("approval_ids") or []:
            item = approvals().get(appr_id)
            if item:
                supabase_sync.upsert_approval(settings, item.__dict__)
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
            run_id=run.id,
        )

    @app.get("/api/approvals", response_model=list[ApprovalOut])
    def list_approvals(
        _user: UserDep,
        tenant_id: str | None = None,
        status: str | None = "pending",
    ):
        store = approvals()
        if status == "pending":
            open_items = store.list(tenant_id=tenant_id, status="pending")
            escalated = store.list(tenant_id=tenant_id, status="escalated")
            items = sorted(
                [*open_items, *escalated],
                key=lambda a: a.created_at,
                reverse=True,
            )
        else:
            items = store.list(tenant_id=tenant_id, status=status)  # type: ignore[arg-type]
        return [ApprovalOut(**item.__dict__) for item in items]

    @app.post("/api/approvals/{approval_id}/decide", response_model=ApprovalOut)
    def decide(approval_id: str, body: ApprovalDecision, _user: UserDep) -> ApprovalOut:
        store = approvals()
        try:
            item = store.decide(
                approval_id,
                body.decision,
                note=body.note,
                delegate_to=body.delegate_to,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        apply_result: dict[str, Any] | None = None
        if body.decision == "approved":
            apply_result = apply_approved(item.payload, tenant_id=item.tenant_id)
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
                "delegate_to": body.delegate_to,
                "apply_result": apply_result,
            },
        )
        out = ApprovalOut(**item.__dict__, apply_result=apply_result)
        supabase_sync.upsert_approval(settings, {**item.__dict__, "apply_result": apply_result})
        return out

    return app


app = create_worker_app()
