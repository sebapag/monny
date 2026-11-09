"""FastAPI surface: agent chat, async runs + timeline, approvals, tenant admin."""

from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from monny.api.schemas import (
    ApprovalDecision,
    ApprovalOut,
    ChatRequest,
    ChatResponse,
    KnowledgeRetrieveRequest,
    KnowledgeSourceToggle,
    RunOut,
    RunStartRequest,
    SecretStatus,
    TenantUpsert,
)
from monny.knowledge import list_sources, load_manifest, retrieve, set_source_enabled
from monny.config.entitlements import (
    ENTITLEMENT_LABELS_IT,
    blocked_entitlements_for_text,
    entitlement_summary,
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

    def runs():
        return get_run_store(settings.monny_data_dir)

    def _health_payload() -> dict[str, Any]:
        llm_on = llm_configured(settings)
        return {
            "ok": True,
            "dry_run": settings.dry_run,
            "default_tenant": settings.monny_default_tenant,
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
    def start_run(body: RunStartRequest) -> RunOut:
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
    def get_run(run_id: str) -> RunOut:
        run = runs().get(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return RunOut(**run.to_dict())

    @app.get("/api/runs/{run_id}/stream")
    async def stream_run(run_id: str) -> StreamingResponse:
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
    def chat(body: ChatRequest) -> ChatResponse:
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
                "apply_result": apply_result,
            },
        )

        out = ApprovalOut(**item.__dict__, apply_result=apply_result)
        return out

    @app.get("/api/tenants")
    def tenants() -> list[dict[str, Any]]:
        out = []
        store = approvals()
        for tenant_id in list_tenant_ids(Path(settings.monny_tenants_dir)):
            cfg = load_tenant(tenant_id, Path(settings.monny_tenants_dir))
            refs = _collect_secret_refs(cfg)
            secrets = [SecretStatus(**secret_status(r)).model_dump() for r in refs]
            pending = store.list(tenant_id=tenant_id, status="pending")
            out.append(
                {
                    "tenant_id": tenant_id,
                    "display_name": cfg.display_name,
                    "secrets": secrets,
                    "secrets_configured": sum(1 for s in secrets if s["configured"]),
                    "secrets_total": len(secrets),
                    "pending_approvals": len(pending),
                    "subscription": entitlement_summary(cfg),
                }
            )
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
            "subscription": entitlement_summary(cfg),
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

    @app.get("/api/tenants/{tenant_id}/artifacts")
    def tenant_artifacts(tenant_id: str) -> dict[str, Any]:
        try:
            load_tenant(tenant_id, Path(settings.monny_tenants_dir))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        items = list_artifacts(settings.monny_data_dir, tenant_id)
        return {"tenant_id": tenant_id, "artifacts": items}

    @app.get("/api/tenants/{tenant_id}/artifacts/{name}")
    def tenant_artifact(tenant_id: str, name: str) -> dict[str, Any]:
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
    def knowledge_list(tenant_id: str) -> dict[str, Any]:
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
    def knowledge_retrieve(tenant_id: str, body: KnowledgeRetrieveRequest) -> dict[str, Any]:
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
