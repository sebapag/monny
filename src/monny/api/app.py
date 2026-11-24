"""FastAPI surface: agent chat, async runs + timeline, approvals, tenant admin."""

from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse

from monny.api.schemas import (
    ApprovalDecision,
    ApprovalOut,
    AuthUserOut,
    ChatRequest,
    ChatResponse,
    CreateUserRequest,
    KnowledgeRetrieveRequest,
    KnowledgeSourceToggle,
    LoginRequest,
    LoginResponse,
    RunOut,
    RunStartRequest,
    SecretStatus,
    ShopifyOAuthStartRequest,
    SignupRequest,
    TenantUpsert,
    UpdateUserRequest,
)
from monny.auth.deps import COOKIE_NAME, get_current_user, require_admin, require_user
from monny.auth.service import (
    auth_backend,
    create_user,
    list_users,
    login as auth_login,
    logout_token,
    set_user_role,
    signup as auth_signup,
)
from monny.auth.supabase_client import SupabaseError
from monny.auth.users import AuthenticatedUser, clear_users_cache
from monny.knowledge import list_sources, load_manifest, retrieve, set_source_enabled
from monny.config.entitlements import (
    ENTITLEMENT_LABELS_IT,
    blocked_entitlements_for_text,
    blocked_plus_skills_for_text,
    entitlement_summary,
)
from monny.config.skill_catalog import catalog_summary, get_skill
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
from monny.graph.nodes.planner import (
    _apply_entitlements,
    _infer_plan_with_meta,
    _stub_infer_plan_raw,
)
from monny.llm.client import llm_configured
from monny.skills.apply_stub import apply_approved
from monny.storage.approvals import ApprovalStore
from monny.storage.artifacts import (
    list_artifacts,
    read_json_artifact,
    write_json_artifact,
)
from monny.storage.audit import append_audit
from monny.storage.runs import get_run_store

UserDep = Annotated[AuthenticatedUser, Depends(require_user)]
AdminDep = Annotated[AuthenticatedUser, Depends(require_admin)]


def create_app() -> FastAPI:
    settings = get_settings()
    clear_users_cache()
    app = FastAPI(title="Atrium API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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

    def _clear_session_cookie(response: Response) -> None:
        response.delete_cookie(key=COOKIE_NAME, path="/")

    def _auth_user_out(user: AuthenticatedUser) -> AuthUserOut:
        return AuthUserOut(
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            tenant_id=user.tenant_id,
            user_id=user.user_id,
        )

    @app.post("/api/auth/login", response_model=LoginResponse)
    def login(body: LoginRequest, response: Response) -> LoginResponse:
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
            user=_auth_user_out(outcome.user),
            expires_in=outcome.expires_in,
            backend=outcome.backend,
            refresh_token=outcome.refresh_token,
        )

    @app.post("/api/auth/signup", response_model=LoginResponse)
    def signup(body: SignupRequest, response: Response) -> LoginResponse:
        try:
            outcome = auth_signup(
                settings,
                email=body.email,
                password=body.password,
                display_name=body.display_name,
            )
        except SupabaseError as exc:
            raise HTTPException(
                status_code=exc.status_code or 400,
                detail=str(exc),
            ) from exc
        if outcome.token:
            _set_session_cookie(response, outcome.token, max_age=outcome.expires_in or 3600)
        return LoginResponse(
            token=outcome.token,
            user=_auth_user_out(outcome.user),
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
        _clear_session_cookie(response)
        return {"ok": True}

    @app.get("/api/auth/me", response_model=AuthUserOut)
    def me(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthUserOut:
        return _auth_user_out(user)

    @app.get("/api/auth/users", response_model=list[AuthUserOut])
    def auth_users_list(
        _admin: AdminDep,
        tenant_id: str | None = None,
    ) -> list[AuthUserOut]:
        try:
            users = list_users(settings, tenant_id=tenant_id)
        except SupabaseError as exc:
            raise HTTPException(status_code=exc.status_code or 500, detail=str(exc)) from exc
        return [_auth_user_out(u) for u in users]

    @app.post("/api/auth/users", response_model=AuthUserOut)
    def auth_users_create(body: CreateUserRequest, _admin: AdminDep) -> AuthUserOut:
        try:
            user = create_user(
                settings,
                email=body.email,
                password=body.password,
                display_name=body.display_name or body.email.split("@")[0],
                role=body.role,
                tenant_id=body.tenant_id or settings.monny_default_tenant,
            )
        except SupabaseError as exc:
            raise HTTPException(status_code=exc.status_code or 400, detail=str(exc)) from exc
        return _auth_user_out(user)

    @app.patch("/api/auth/users/{user_id}", response_model=AuthUserOut)
    def auth_users_update(
        user_id: str,
        body: UpdateUserRequest,
        _admin: AdminDep,
    ) -> AuthUserOut:
        try:
            user = set_user_role(
                settings,
                user_id=user_id,
                role=body.role,
                display_name=body.display_name,
                tenant_id=body.tenant_id,
            )
        except SupabaseError as exc:
            raise HTTPException(status_code=exc.status_code or 400, detail=str(exc)) from exc
        return _auth_user_out(user)

    def approvals() -> ApprovalStore:
        return ApprovalStore(settings.monny_data_dir)

    def runs():
        return get_run_store(settings.monny_data_dir)

    def _health_payload() -> dict[str, Any]:
        llm_on = llm_configured(settings)
        return {
            "ok": True,
            "dry_run": settings.dry_run,
            "default_tenant": settings.monny_default_tenant,
            "auth": {
                "backend": auth_backend(settings),
                "supabase_configured": settings.supabase_configured,
            },
            "llm": {
                "enabled": llm_on,
                "provider": "xai" if llm_on else None,
                "model": settings.monny_llm_model if llm_on else None,
                "base_url": settings.monny_llm_base_url if llm_on else None,
            },
        }

    @app.get("/health")
    def health() -> dict[str, Any]:
        return _health_payload()

    @app.get("/api/health")
    def api_health() -> dict[str, Any]:
        return _health_payload()

    def _refuse_disabled_skills(cfg: TenantConfig, goal: str, message: str) -> None:
        """Refuse when every skill implied by the text is disabled on the plan."""
        text = f"{goal} {message}"
        plus_blocked = blocked_plus_skills_for_text(cfg, text)
        if plus_blocked:
            labels = []
            for sid in plus_blocked:
                skill = get_skill(sid)
                labels.append(skill.label_it if skill else sid)
            detail = (
                "Skill Plus non inclusa nel piano Free: "
                + ", ".join(labels)
                + ". Passa a Plus in Admin → Attivazione piano / reparti "
                "(o abilita override Admin)."
            )
            raise HTTPException(status_code=403, detail=detail)

        blocked = blocked_entitlements_for_text(cfg, text)
        if not blocked:
            return
        # Infer all requested keys (enabled + disabled).
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
        # Instant keyword stub for the timeline so POST /api/runs never blocks on xAI.
        # Optional LLM upgrade happens in the worker (same stub if key missing / fails).
        stub_plan = _apply_entitlements(_stub_infer_plan_raw(goal, message), tenant)
        planned = ["shopify_read", *stub_plan]
        run = runs().create(
            tenant_id=tenant_id,
            thread_id=thread_id,
            goal=goal,
            planned_skills=planned,
        )

        def _worker() -> None:
            try:
                inference = _infer_plan_with_meta(goal, message, tenant=tenant)
                plan = inference.skills
                if plan != stub_plan:
                    runs().replan(run.id, ["shopify_read", *plan])
                run_agent(
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
            except Exception as exc:  # noqa: BLE001 — surface to run store
                runs().fail(run.id, str(exc))

        threading.Thread(target=_worker, daemon=True, name=f"monny-run-{run.id[:8]}").start()
        return run.id

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
        """Sync chat (CLI-compatible). Prefer POST /api/runs for live skill UX."""
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
        # Default inbox: open proposals (pending) + those already escalated to a human.
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
        return out

    @app.get("/api/skills/catalog")
    def skills_catalog(_user: UserDep) -> dict[str, Any]:
        """Portable skill catalog with free/plus tier + knowhow linkage."""
        return {"skills": catalog_summary()}

    @app.get("/api/tenants")
    def tenants(_user: UserDep) -> list[dict[str, Any]]:
        out = []
        store = approvals()
        for tenant_id in list_tenant_ids(Path(settings.monny_tenants_dir)):
            cfg = load_tenant(tenant_id, Path(settings.monny_tenants_dir))
            refs = _collect_secret_refs(cfg)
            secrets = [
                SecretStatus(**secret_status(r, tenant_id=tenant_id)).model_dump()
                for r in refs
            ]
            pending = store.list(tenant_id=tenant_id, status="pending")
            escalated = store.list(tenant_id=tenant_id, status="escalated")
            out.append(
                {
                    "tenant_id": tenant_id,
                    "display_name": cfg.display_name,
                    "secrets": secrets,
                    "secrets_configured": sum(1 for s in secrets if s["configured"]),
                    "secrets_total": len(secrets),
                    "pending_approvals": len(pending) + len(escalated),
                    "subscription": entitlement_summary(cfg),
                }
            )
        return out

    @app.get("/api/tenants/{tenant_id}")
    def get_tenant(tenant_id: str, _user: UserDep) -> dict[str, Any]:
        try:
            cfg = load_tenant(tenant_id, Path(settings.monny_tenants_dir))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        data = cfg.model_dump(mode="json")
        refs = _collect_secret_refs(cfg)
        return {
            "config": data,
            "secrets": [
                SecretStatus(**secret_status(r, tenant_id=tenant_id)).model_dump() for r in refs
            ],
            "path": str(tenants_root(settings.monny_tenants_dir) / tenant_id / "tenant.yaml"),
            "subscription": entitlement_summary(cfg),
            "shopify_connector": _shopify_connector_status(cfg),
        }

    @app.put("/api/tenants/{tenant_id}")
    def put_tenant(tenant_id: str, body: TenantUpsert, _admin: AdminDep) -> dict[str, Any]:
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
    def tenant_audit(
        tenant_id: str,
        _user: UserDep,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        path = Path(settings.monny_data_dir) / tenant_id / "audit.jsonl"
        if not path.exists():
            return []
        lines = path.read_text(encoding="utf-8").strip().splitlines()
        import json

        rows = [json.loads(line) for line in lines if line.strip()]
        return list(reversed(rows[-limit:]))

    @app.get("/api/tenants/{tenant_id}/artifacts")
    def tenant_artifacts(tenant_id: str, _user: UserDep) -> dict[str, Any]:
        try:
            load_tenant(tenant_id, Path(settings.monny_tenants_dir))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        items = list_artifacts(settings.monny_data_dir, tenant_id)
        return {"tenant_id": tenant_id, "artifacts": items}

    @app.get("/api/tenants/{tenant_id}/artifacts/{name}")
    def tenant_artifact(tenant_id: str, name: str, _user: UserDep) -> dict[str, Any]:
        if "/" in name or ".." in name or not name.endswith(".json"):
            raise HTTPException(status_code=400, detail="Invalid artifact name")
        try:
            load_tenant(tenant_id, Path(settings.monny_tenants_dir))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        payload = read_json_artifact(settings.monny_data_dir, tenant_id, name)
        if payload is None:
            raise HTTPException(status_code=404, detail=f"Artifact not found: {name}")
        return {"tenant_id": tenant_id, "name": name, "payload": payload}

    def _require_tenant(tenant_id: str) -> None:
        try:
            load_tenant(tenant_id, Path(settings.monny_tenants_dir))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/tenants/{tenant_id}/knowledge")
    def knowledge_list(tenant_id: str, _admin: AdminDep) -> dict[str, Any]:
        """List knowledge sources for Admin «Conoscenza aziendale»."""
        _require_tenant(tenant_id)
        root = Path(settings.monny_tenants_dir)
        manifest = load_manifest(tenant_id, root)
        sources = [s.to_dict() for s in list_sources(tenant_id, root)]
        return {
            "tenant_id": tenant_id,
            "sources": sources,
            "index": manifest.get("index") or {},
            "path": str(root / tenant_id / "knowledge"),
        }

    @app.post("/api/tenants/{tenant_id}/knowledge/retrieve")
    def knowledge_retrieve(
        tenant_id: str,
        body: KnowledgeRetrieveRequest,
        _user: UserDep,
    ) -> dict[str, Any]:
        """Stub retrieval used by planner/skills (markdown + tags, dry-run friendly)."""
        _require_tenant(tenant_id)
        root = Path(settings.monny_tenants_dir)
        chunks = retrieve(
            tenant_id,
            body.query,
            tags=body.tags,
            limit=body.limit,
            root=root,
        )
        return {
            "tenant_id": tenant_id,
            "query": body.query,
            "tags": body.tags or [],
            "chunks": [c.to_dict() for c in chunks],
        }

    @app.patch("/api/tenants/{tenant_id}/knowledge/sources/{source_id}")
    def knowledge_toggle(
        tenant_id: str,
        source_id: str,
        body: KnowledgeSourceToggle,
        _admin: AdminDep,
    ) -> dict[str, Any]:
        """Enable / disable a knowledge source (persists to manifest.yaml)."""
        _require_tenant(tenant_id)
        root = Path(settings.monny_tenants_dir)
        try:
            source = set_source_enabled(tenant_id, source_id, body.enabled, root=root)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        append_audit(
            settings.monny_data_dir,
            tenant_id,
            "knowledge_source_toggled",
            {"source_id": source_id, "enabled": body.enabled},
        )
        return {"ok": True, "source": source.to_dict()}

    # ----- Shopify OAuth connector -----

    @app.get("/api/tenants/{tenant_id}/connectors/shopify")
    def shopify_connector_get(tenant_id: str, _admin: AdminDep) -> dict[str, Any]:
        _require_tenant(tenant_id)
        cfg = load_tenant(tenant_id, Path(settings.monny_tenants_dir))
        return _shopify_connector_status(cfg)

    @app.post("/api/tenants/{tenant_id}/connectors/shopify/oauth/start")
    def shopify_oauth_start(
        tenant_id: str,
        body: ShopifyOAuthStartRequest,
        _admin: AdminDep,
    ) -> dict[str, Any]:
        """Begin Partner app OAuth — returns authorize_url for browser redirect."""
        from monny.connectors import shopify_oauth

        _require_tenant(tenant_id)
        try:
            result = shopify_oauth.start_oauth(
                tenant_id=tenant_id,
                shop_domain=body.shop_domain,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        append_audit(
            settings.monny_data_dir,
            tenant_id,
            "shopify_oauth_start",
            {"shop_domain": result.get("shop_domain"), "mode": result.get("mode")},
        )
        return result

    @app.post("/api/tenants/{tenant_id}/connectors/shopify/disconnect")
    def shopify_disconnect(tenant_id: str, _admin: AdminDep) -> dict[str, Any]:
        from monny.connectors import shopify_oauth

        _require_tenant(tenant_id)
        result = shopify_oauth.disconnect(tenant_id=tenant_id)
        append_audit(settings.monny_data_dir, tenant_id, "shopify_oauth_disconnect", {})
        return result

    @app.get("/api/connectors/shopify/mock-install")
    def shopify_mock_install(state: str) -> RedirectResponse:
        """Local/CI stand-in for Shopify authorize when Partner credentials are unset."""
        from urllib.parse import urlencode

        from monny.connectors import shopify_oauth

        entry = shopify_oauth.peek_oauth_state(state)
        if not entry:
            return RedirectResponse(
                shopify_oauth.app_redirect_url(status="error", error="state_expired"),
                status_code=302,
            )
        shop = str(entry["shop_domain"])
        code = shopify_oauth.mock_install_code(state)
        q = {"code": code, "shop": shop, "state": state, "hmac": "mock"}
        return RedirectResponse(
            f"/api/connectors/shopify/callback?{urlencode(q)}",
            status_code=302,
        )

    @app.get("/api/connectors/shopify/callback")
    def shopify_oauth_callback(request: Request) -> RedirectResponse:
        """Shopify (or mock) redirects here with code+shop+state."""
        from monny.connectors import shopify_oauth

        params = {k: v for k, v in request.query_params.items()}
        try:
            result = shopify_oauth.complete_oauth_callback(
                code=str(params.get("code") or ""),
                shop=str(params.get("shop") or ""),
                state=str(params.get("state") or ""),
                query=params,
            )
            append_audit(
                settings.monny_data_dir,
                result["tenant_id"],
                "shopify_oauth_connected",
                {
                    "shop_domain": result.get("shop_domain"),
                    "mode": result.get("mode"),
                },
            )
            return RedirectResponse(result["redirect_url"], status_code=302)
        except Exception:  # noqa: BLE001 — redirect with generic error for browser UX
            return RedirectResponse(
                shopify_oauth.app_redirect_url(status="error", error="oauth_failed"),
                status_code=302,
            )

    return app


def _shopify_connector_status(cfg: TenantConfig) -> dict[str, Any]:
    from monny.connectors import shopify_oauth

    return shopify_oauth.connection_status(cfg)


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
