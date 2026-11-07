"""Helpers to push skill lifecycle into the run store from graph nodes."""

from __future__ import annotations

from monny.config.settings import get_settings
from monny.storage.runs import get_run_store


def _store():
    settings = get_settings()
    return get_run_store(settings.monny_data_dir)


def start(run_id: str | None, skill: str, detail: str = "") -> None:
    if not run_id:
        return
    _store().start_step(run_id, skill, detail)


def done(run_id: str | None, skill: str, detail: str = "") -> None:
    if not run_id:
        return
    _store().finish_step(run_id, skill, status="done", detail=detail or "Completato")


def error(run_id: str | None, skill: str, detail: str) -> None:
    if not run_id:
        return
    _store().finish_step(run_id, skill, status="error", detail=detail)
