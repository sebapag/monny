from pathlib import Path

from fastapi.testclient import TestClient

from monny.api.app import create_app
from monny.config.settings import get_settings

ROOT = Path(__file__).resolve().parents[1]


def test_tenant_get_and_put(tmp_path, monkeypatch):
    # Copy demo tenant into temp tenants dir so we don't mutate the repo fixture permanently
    import shutil

    tenants = tmp_path / "tenants"
    shutil.copytree(ROOT / "tenants" / "demo", tenants / "demo")
    monkeypatch.setenv("MONNY_TENANTS_DIR", str(tenants))
    monkeypatch.setenv("MONNY_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()

    client = TestClient(create_app())
    got = client.get("/api/tenants/demo")
    assert got.status_code == 200
    cfg = got.json()["config"]
    assert cfg["display_name"] == "Demo Shop"
    assert any(s["secret_ref"] == "SHOPIFY_TOKEN_DEMO" for s in got.json()["secrets"])

    cfg["display_name"] = "Demo Shop Updated"
    cfg["policy"]["spend"]["thresholds"]["min_roas"] = 2.5
    saved = client.put("/api/tenants/demo", json={"config": cfg})
    assert saved.status_code == 200

    again = client.get("/api/tenants/demo").json()["config"]
    assert again["display_name"] == "Demo Shop Updated"
    assert again["policy"]["spend"]["thresholds"]["min_roas"] == 2.5
    get_settings.cache_clear()
