"""CLI entry: python -m monny.main --tenant demo --goal \"...\""""

from __future__ import annotations

import argparse
import json
import sys

from monny.config.loader import list_tenant_ids, load_tenant
from monny.config.settings import get_settings
from monny.graph.app import run_agent


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Monny deep agent CLI (dry-run by default)")
    parser.add_argument("--tenant", default=None, help="Tenant id (default from env)")
    parser.add_argument(
        "--goal",
        default="report spend ultimi 7 giorni",
        help="Goal / instruction for the agent",
    )
    parser.add_argument("--job", default=None, help="Scheduled job name (e.: spend_daily)")
    parser.add_argument("--thread-id", default=None, help="LangGraph thread id")
    parser.add_argument("--json", action="store_true", help="Emit full state as JSON")
    parser.add_argument("--list-tenants", action="store_true", help="List configured tenants")
    return parser


def cli(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = get_settings()

    if args.list_tenants:
        for tenant_id in list_tenant_ids():
            cfg = load_tenant(tenant_id)
            print(f"{tenant_id}\t{cfg.display_name}")
        return 0

    tenant_id = args.tenant or settings.monny_default_tenant
    goal = args.goal
    if args.job == "spend_daily":
        goal = "report spend ultimi 7 giorni"
    elif args.job == "seo_weekly":
        goal = "seo audit of priority pages"

    result = run_agent(
        tenant_id=tenant_id,
        goal=goal,
        thread_id=args.thread_id,
    )

    if args.json:
        print(json.dumps(result, indent=2, default=str))
    else:
        print(result.get("reply") or result.get("report", {}).get("markdown") or "No reply")
        print(f"\n[status={result.get('status')} dry_run={result.get('dry_run', settings.dry_run)}]")
    return 0


def main() -> None:
    raise SystemExit(cli())


if __name__ == "__main__":
    main()
