"""Composed ads report — Italian ranking + artifact for Agent UI."""

from pathlib import Path

from monny.config.settings import get_settings
from monny.graph.app import get_graph, run_agent
from monny.graph.nodes.planner import _stub_infer_plan_raw
from monny.skills import reporting
from monny.storage.artifacts import artifact_dir


PROMPT_IT = "controlla le ads e generami un report di quelle che hanno funzionato meglio"


def test_stub_plans_italian_ads_report_prompt():
    plan = _stub_infer_plan_raw(PROMPT_IT, PROMPT_IT)
    assert plan == ["spend_google", "spend_meta", "reporting"]


def test_reporting_ranks_best_campaigns():
    findings = [
        {
            "skill": "spend_google",
            "summary": "Google Ads: 2 campagne",
            "diagnosis": {
                "channel": "google",
                "totals": {
                    "campaigns": 2,
                    "healthy": 1,
                    "waste": 1,
                    "spend": 100,
                    "waste_spend": 40,
                    "waste_spend_pct": 40,
                },
                "campaigns": [
                    {
                        "id": "g1",
                        "name": "Winner",
                        "roas": 4.5,
                        "cpa": 8,
                        "spend": 60,
                        "healthy": True,
                        "flags": [],
                    },
                    {
                        "id": "g2",
                        "name": "Loser",
                        "roas": 0.5,
                        "cpa": 90,
                        "spend": 40,
                        "healthy": False,
                        "flags": ["roas_below_2.0"],
                    },
                ],
            },
            "proposals": [
                {
                    "action_type": "pause_campaign",
                    "channel": "google",
                    "entity_name": "Loser",
                    "reason": "low ROAS",
                    "requires_approval": True,
                }
            ],
        }
    ]
    report = reporting.run(findings, PROMPT_IT)
    assert report["top_campaigns"][0]["name"] == "Winner"
    md = report["markdown"]
    assert "Campagne che hanno funzionato meglio" in md
    assert "Winner" in md
    assert "Da rivedere" in md
    assert "Loser" in md
    assert "spend_google" not in md  # Italian labels, not skill ids as headers
    assert report["proposal_count"] == 1


def test_dry_run_italian_ads_report_artifact(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(root / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MONNY_DRY_RUN", "1")
    monkeypatch.setenv("MONNY_LIVE", "0")
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    get_settings.cache_clear()
    get_graph.cache_clear()

    result = run_agent(
        tenant_id="demo",
        goal=PROMPT_IT,
        message=PROMPT_IT,
        thread_id="report-it",
        dry_run=True,
    )
    report = result.get("report") or {}
    assert result["status"] in {"awaiting_approval", "completed"}
    assert report.get("spend_channels")
    assert report.get("top_campaigns")
    assert "Campagne che hanno funzionato meglio" in (report.get("markdown") or "")
    assert "Report" in (result.get("reply") or "") or "report" in (result.get("reply") or "").lower()

    md_path = artifact_dir(tmp_path, "demo") / "last_report.md"
    assert md_path.exists()
    assert "funzionato meglio" in md_path.read_text(encoding="utf-8")

    get_settings.cache_clear()
    get_graph.cache_clear()
