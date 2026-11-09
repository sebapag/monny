"""Planner LLM (xAI Grok) — mocked HTTP; CI stays offline."""

from __future__ import annotations

import json

import httpx
import pytest

from monny.config.settings import Settings, get_settings
from monny.graph.nodes.planner import (
    _infer_plan,
    _infer_plan_raw,
    _stub_infer_plan_raw,
    infer_plan_raw_with_meta,
)
from monny.llm.client import chat_completion, llm_configured
from monny.llm.plan import parse_plan_json


@pytest.fixture(autouse=True)
def _clear_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_stub_planner_without_api_key(monkeypatch):
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    get_settings.cache_clear()
    assert not llm_configured()
    plan = _infer_plan_raw("report spend ultimi 7 giorni", "")
    assert plan == _stub_infer_plan_raw("report spend ultimi 7 giorni", "")
    assert "spend_google" in plan
    assert plan[-1] == "reporting"


def test_stub_forced_when_llm_disabled(monkeypatch):
    monkeypatch.setenv("XAI_API_KEY", "test-key-not-real")
    monkeypatch.setenv("MONNY_LLM_ENABLED", "0")
    get_settings.cache_clear()
    assert not llm_configured()
    assert infer_plan_raw_with_meta("seo audit", "").source == "stub"


def test_parse_plan_json_fenced_and_stray_text():
    raw = 'Sure.\n```json\n{"skills":["seo_audit","reporting"]}\n```\n'
    assert parse_plan_json(raw) == ["seo_audit", "reporting"]
    assert parse_plan_json('{"skills":["spend_google","bogus","spend_meta"]}') == [
        "spend_google",
        "spend_meta",
        "reporting",
    ]


def test_llm_planner_success_mocked(monkeypatch):
    monkeypatch.setenv("XAI_API_KEY", "test-key-not-real")
    monkeypatch.setenv("MONNY_LLM_MODEL", "grok-4.20-0309-non-reasoning")
    get_settings.cache_clear()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/chat/completions")
        assert request.headers.get("Authorization") == "Bearer test-key-not-real"
        body = json.loads(request.content.decode())
        assert body["model"] == "grok-4.20-0309-non-reasoning"
        assert body["temperature"] <= 0.2
        assert body["max_tokens"] <= 512
        assert body["stream"] is False
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": '{"skills":["seo_audit","reporting"]}',
                        }
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        inference = infer_plan_raw_with_meta(
            "seo audit of priority pages",
            "",
            settings=get_settings(),
            client=client,
        )
    assert inference.source == "llm"
    assert inference.skills == ["seo_audit", "reporting"]
    assert inference.note_it is None


def test_llm_planner_http_failure_falls_back_to_stub(monkeypatch):
    monkeypatch.setenv("XAI_API_KEY", "test-key-not-real")
    get_settings.cache_clear()
    stub = _stub_infer_plan_raw("report spend", "")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        inference = infer_plan_raw_with_meta(
            "report spend",
            "",
            settings=get_settings(),
            client=client,
        )
    assert inference.source == "stub"
    assert inference.skills == stub
    assert inference.note_it
    assert "assistente" in inference.note_it.lower() or "automatico" in inference.note_it.lower()


def test_llm_planner_bad_json_falls_back(monkeypatch):
    monkeypatch.setenv("XAI_API_KEY", "test-key-not-real")
    get_settings.cache_clear()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"role": "assistant", "content": "I think we should..."}}
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        inference = infer_plan_raw_with_meta(
            "overview",
            "",
            settings=get_settings(),
            client=client,
        )
    assert inference.source == "stub"
    assert inference.note_it


def test_chat_completion_requires_key():
    settings = Settings(xai_api_key="")
    with pytest.raises(ValueError, match="XAI_API_KEY"):
        chat_completion(messages=[{"role": "user", "content": "hi"}], settings=settings)


def test_health_reports_llm_status(monkeypatch):
    from fastapi.testclient import TestClient

    from monny.api.app import create_app

    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    monkeypatch.setenv("MONNY_LIVE", "0")
    get_settings.cache_clear()
    client = TestClient(create_app())
    payload = client.get("/api/health").json()
    assert payload["ok"] is True
    assert payload["llm"]["enabled"] is False
    assert payload["llm"]["model"] is None

    monkeypatch.setenv("XAI_API_KEY", "test-key-not-real")
    get_settings.cache_clear()
    # Settings are captured at create_app(); rebuild app after env change.
    client = TestClient(create_app())
    payload = client.get("/api/health").json()
    assert payload["llm"]["enabled"] is True
    assert payload["llm"]["provider"] == "xai"
    assert payload["llm"]["model"] == "grok-4.20-0309-non-reasoning"


def test_infer_plan_entitlements_still_apply_with_llm(monkeypatch):
    from pathlib import Path

    from monny.config.loader import load_tenant
    from monny.config.models import SubscriptionConfig, SubscriptionSkills

    monkeypatch.setenv("XAI_API_KEY", "test-key-not-real")
    get_settings.cache_clear()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": '{"skills":["spend_google","spend_meta","seo_audit","reporting"]}',
                        }
                    }
                ]
            },
        )

    root = Path(__file__).resolve().parents[1]
    tenant = load_tenant("demo", root / "tenants").model_copy(
        update={
            "subscription": SubscriptionConfig(
                plan="growth",
                skills=SubscriptionSkills(spend=False, seo=True, shopify=False, leads=False),
            )
        }
    )

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        plan = _infer_plan(
            "report spend and seo",
            "",
            tenant=tenant,
            settings=get_settings(),
            client=client,
        )
    assert "spend_google" not in plan
    assert "seo_audit" in plan
    assert plan[-1] == "reporting"
