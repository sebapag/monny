"""ApprovalStore must survive empty/corrupt disk state (do not brick HITL)."""

from __future__ import annotations

import json
import threading

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


def test_three_path_delegate_and_escalate(tmp_path):
    store = ApprovalStore(tmp_path)
    a = store.create(
        tenant_id="demo",
        thread_id="t1",
        action_type="reduce_budget",
        summary="taglia budget",
        payload={"x": 1},
    )
    escalated = store.decide(a.id, "escalated", note="serve umano")
    assert escalated.status == "escalated"
    assert escalated.decided_at is None
    # Still actionable after escalate.
    delegated = store.decide(a.id, "delegated", delegate_to="seo")
    assert delegated.status == "delegated"
    assert delegated.delegate_to == "seo"
    assert delegated.decided_at is not None


def test_delegate_requires_target(tmp_path):
    store = ApprovalStore(tmp_path)
    a = store.create(
        tenant_id="demo",
        thread_id="t1",
        action_type="pause_campaign",
        summary="pausa",
        payload={},
    )
    try:
        store.decide(a.id, "delegated")
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "delegate_to" in str(exc)


def test_concurrent_creates_across_store_instances(tmp_path):
    """Fixed .tmp path used to race; unique temps + path lock must stay green."""
    errors: list[BaseException] = []

    def worker(n: int) -> None:
        try:
            store = ApprovalStore(tmp_path)
            for i in range(8):
                store.create(
                    tenant_id="demo",
                    thread_id=f"t{n}",
                    action_type="reduce_budget",
                    summary=f"w{n}-{i}",
                    payload={"n": n, "i": i},
                )
        except BaseException as exc:  # noqa: BLE001 — collect for assertion
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, errors
    reloaded = ApprovalStore(tmp_path)
    assert len(reloaded.list(status=None)) == 6 * 8
    assert isinstance(json.loads((tmp_path / "approvals.json").read_text(encoding="utf-8")), list)
