"""LangGraph StateGraph: planner → skills → hitl → end."""

from __future__ import annotations

import sqlite3
from functools import lru_cache
from pathlib import Path

from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph

from monny.config.settings import get_settings
from monny.graph.nodes.hitl import hitl_node
from monny.graph.nodes.planner import planner_node
from monny.graph.nodes.skills_runner import skills_runner_node
from monny.graph.state import AgentState

# Keep connection alive for process lifetime (SqliteSaver needs an open conn).
_SQLITE_CONN: sqlite3.Connection | None = None


def _build_checkpointer():
    global _SQLITE_CONN
    settings = get_settings()
    data_dir = Path(settings.monny_data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "checkpoints.sqlite"
    try:
        _SQLITE_CONN = sqlite3.connect(str(db_path), check_same_thread=False)
        saver = SqliteSaver(_SQLITE_CONN)
        saver.setup()
        return saver
    except Exception:
        return MemorySaver()


@lru_cache
def get_graph():
    builder = StateGraph(AgentState)
    builder.add_node("planner", planner_node)
    builder.add_node("skills", skills_runner_node)
    builder.add_node("hitl", hitl_node)
    builder.add_edge(START, "planner")
    builder.add_edge("planner", "skills")
    builder.add_edge("skills", "hitl")
    builder.add_edge("hitl", END)
    checkpointer = _build_checkpointer()
    return builder.compile(checkpointer=checkpointer)


def run_agent(
    *,
    tenant_id: str,
    goal: str,
    message: str | None = None,
    thread_id: str | None = None,
    dry_run: bool | None = None,
) -> dict:
    settings = get_settings()
    graph = get_graph()
    tid = thread_id or f"{tenant_id}-cli"
    state: AgentState = {
        "tenant_id": tenant_id,
        "goal": goal,
        "message": message or goal,
        "thread_id": tid,
        "dry_run": settings.dry_run if dry_run is None else dry_run,
    }
    result = graph.invoke(state, config={"configurable": {"thread_id": tid}})
    return dict(result)
