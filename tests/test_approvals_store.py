"""ApprovalStore must survive empty/corrupt disk state (do not brick HITL)."""

from __future__ import annotations

import json

from monny.storage.approvals import ApprovalStore


def test_empty_approvals_file_does_not_crash(tmp_path):
    path = tmp_path / "approvals.json"
    path.write_text("", encoding="utf-8")
    store = ApprovalStore(tmp_path)
    assert store.list() == []
    created = store.create(
        tenant_id="demo",
        thread_id="t1",
        action_type="reduce_budget",
        summary="test",
        payload={"x": 1},
    )
    assert created.id
    reloaded = ApprovalStore(tmp_path)
    assert len(reloaded.list(status=None)) == 1
    assert json.loads(path.read_text(encoding="utf-8"))


def test_corrupt_approvals_file_is_quarantined(tmp_path):
    path = tmp_path / "approvals.json"
    path.write_text("{not-json", encoding="utf-8")
    store = ApprovalStore(tmp_path)
    assert store.list() == []
    assert (tmp_path / "approvals.json.corrupt").exists() or not path.exists()
    store.create(
        tenant_id="demo",
        thread_id="t1",
        action_type="reduce_budget",
        summary="ok",
        payload={},
    )
    assert path.exists()
    assert isinstance(json.loads(path.read_text(encoding="utf-8")), list)


def test_atomic_persist_never_writes_empty(tmp_path):
    store = ApprovalStore(tmp_path)
    store.create(
        tenant_id="demo",
        thread_id="t1",
        action_type="reduce_budget",
        summary="a",
        payload={},
    )
    text = (tmp_path / "approvals.json").read_text(encoding="utf-8")
    assert text.strip()
    assert json.loads(text)
