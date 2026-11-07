from pathlib import Path

from monny.config.loader import load_tenant
from monny.skills import spend_google, spend_meta
from monny.skills.spend_diagnose import diagnose_campaigns

ROOT = Path(__file__).resolve().parents[1]


def test_diagnose_flags_waste_and_proposes_actions():
    tenant = load_tenant("demo", ROOT / "tenants")
    campaigns = [
        {"id": "1", "name": "Good", "spend": 100, "roas": 4.0, "cpa": 10, "conversions": 10, "daily_budget": 20},
        {"id": "2", "name": "Bad", "spend": 200, "roas": 0.4, "cpa": 80, "conversions": 1, "daily_budget": 50},
        {"id": "3", "name": "Mid", "spend": 150, "roas": 1.5, "cpa": 35, "conversions": 5, "daily_budget": 40},
    ]
    result = diagnose_campaigns(campaigns, channel="google", tenant=tenant)
    assert result["totals"]["waste"] == 2
    assert result["totals"]["healthy"] == 1
    actions = {p["action_type"] for p in result["proposals"]}
    assert "pause_campaign" in actions
    assert "reduce_budget" in actions


def test_spend_skills_use_fixtures(tmp_path, monkeypatch):
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(ROOT / "tenants"))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path))
    tenant = load_tenant("demo", ROOT / "tenants")
    fixtures = ROOT / "fixtures" / "spend"
    g = spend_google.run(tenant, dry_run=True, fixtures_dir=fixtures)
    m = spend_meta.run(tenant, dry_run=True, fixtures_dir=fixtures)
    assert g["diagnosis"]["totals"]["campaigns"] == 3
    assert m["diagnosis"]["totals"]["campaigns"] == 3
    assert g["proposals"] and m["proposals"]
