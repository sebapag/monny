from pathlib import Path

from monny.config.settings import get_settings
from monny.graph.app import run_agent


def test_dry_run_spend_report(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(root / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    monkeypatch.setenv("MONNY_LIVE", "0")
    get_settings.cache_clear()

    result = run_agent(
        tenant_id="demo",
        goal="report spend ultimi 7 giorni",
        thread_id="test-thread",
        dry_run=True,
    )
    assert result["status"] in {"awaiting_approval", "completed"}
    assert result.get("reply")
    assert result.get("report", {}).get("proposal_count", 0) >= 1
    get_settings.cache_clear()
