import time
from pathlib import Path

from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.config.settings import get_settings
from monny.graph.app import get_graph
from monny.storage.runs import reset_run_store_for_tests

ROOT = Path(__file__).resolve().parents[1]


def test_async_run_exposes_skill_timeline(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    monkeypatch.setenv("MONNY_LIVE", "0")
    get_settings.cache_clear()
    get_graph.cache_clear()
    reset_run_store_for_tests()

    client = TestClient(create_app())
    started = client.post(
        "/api/runs",
        json={"tenant_id": "demo", "message": "report spend ultimi 7 giorni"},
    )
    assert started.status_code == 200
    run_id = started.json()["id"]
    assert started.json()["steps"]
    skills = [s["skill"] for s in started.json()["steps"]]
    assert "planner" in skills
    assert "spend_google" in skills
    assert "hitl" in skills

    terminal = {"completed", "awaiting_approval", "error"}
    saw_running = False
    final = None
    for _ in range(80):
        snap = client.get(f"/api/runs/{run_id}").json()
        if any(s["status"] == "running" for s in snap["steps"]) or snap.get("active_skill"):
            saw_running = True
        if snap["status"] in terminal:
            final = snap
            break
        time.sleep(0.15)

    assert final is not None
    assert saw_running or any(s["status"] == "done" for s in final["steps"])
    assert final["status"] == "awaiting_approval"
    assert final["reply"]
    assert any(s["skill"] == "spend_google" and s["status"] == "done" for s in final["steps"])
    assert any(s["skill"] == "hitl" and s["status"] == "waiting" for s in final["steps"])

    get_settings.cache_clear()
    get_graph.cache_clear()
    reset_run_store_for_tests()


def test_seo_run_includes_crawler_step(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    get_graph.cache_clear()
    reset_run_store_for_tests()

    client = TestClient(create_app())
    started = client.post(
        "/api/runs",
        json={"tenant_id": "demo", "message": "seo audit of priority pages"},
    )
    run_id = started.json()["id"]
    skills = [s["skill"] for s in started.json()["steps"]]
    assert skills.index("seo_crawler") < skills.index("seo_audit")

    for _ in range(80):
        snap = client.get(f"/api/runs/{run_id}").json()
        if snap["status"] in {"completed", "awaiting_approval", "error"}:
            assert any(s["skill"] == "seo_crawler" and s["status"] == "done" for s in snap["steps"])
            break
        time.sleep(0.15)

    get_settings.cache_clear()
    get_graph.cache_clear()
    reset_run_store_for_tests()
