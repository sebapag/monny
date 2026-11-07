from pathlib import Path

from monny.config.loader import load_tenant
from monny.skills import seo_audit, seo_apply

ROOT = Path(__file__).resolve().parents[1]


def test_seo_audit_uses_fixtures_for_example_host():
    tenant = load_tenant("demo", ROOT / "tenants")
    result = seo_audit.run(tenant, dry_run=True)
    assert result["change_set"]["status"] == "proposed"
    assert len(result["findings"]) == 3
    # home + collections should have issues; sample product may be clean
    assert len(result["change_set"]["changes"]) >= 2
    assert result["proposals"]
    assert result["proposals"][0]["action_type"] == "seo_apply_changeset"
    sources = {f["source"] for f in result["findings"]}
    assert "fixture" in sources


def test_seo_apply_stub_marks_applied():
    change_set = {
        "status": "proposed",
        "changes": [{"url": "https://x.example/", "status": "proposed"}],
    }
    out = seo_apply.run(change_set, approved=True)
    assert out["status"] == "applied_stub"
    assert out["change_set"]["changes"][0]["status"] == "applied_stub"
