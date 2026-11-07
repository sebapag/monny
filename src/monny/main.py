"""CLI entry: python -m monny --tenant demo --goal "..." | --job spend_daily"""

from __future__ import annotations

import argparse
import json

from monny.config.loader import list_tenant_ids, load_tenant
from monny.config.settings import get_settings
from monny.graph.app import run_agent
from monny.jobs import JOBS, resolve_job
from monny.storage.audit import append_audit


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Monny deep agent CLI (dry-run by default)")
    parser.add_argument("--tenant", default=None, help="Tenant id (default from env)")
    parser.add_argument(
        "--goal",
        default="report spend ultimi 7 giorni",
        help="Goal / instruction for the agent",
    )
    parser.add_argument(
        "--job",
        default=None,
        choices=sorted(JOBS.keys()),
        help="Scheduled job (spend_daily | seo_weekly)",
    )
    parser.add_argument("--thread-id", default=None, help="LangGraph thread id")
    parser.add_argument("--json", action="store_true", help="Emit full state as JSON")
    parser.add_argument("--list-tenants", action="store_true", help="List configured tenants")
    parser.add_argument("--list-jobs", action="store_true", help="List scheduled jobs")
    return parser


def cli(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = get_settings()

    if args.list_tenants:
        for tenant_id in list_tenant_ids():
            cfg = load_tenant(tenant_id)
            print(f"{tenant_id}\t{cfg.display_name}")
        return 0

    if args.list_jobs:
        for name, job in sorted(JOBS.items()):
            print(f"{name}\t{job.goal}\t{job.description}")
        return 0

    tenant_id = args.tenant or settings.monny_default_tenant
    goal = args.goal
    job_name: str | None = None
    thread_id = args.thread_id

    if args.job:
        job = resolve_job(args.job)
        job_name = job.name
        goal = job.goal
        thread_id = thread_id or f"{tenant_id}-job-{job.name}"

    result = run_agent(
        tenant_id=tenant_id,
        goal=goal,
        thread_id=thread_id,
    )

    if job_name:
        append_audit(
            settings.monny_data_dir,
            tenant_id,
            "job_completed",
            {
                "job": job_name,
                "goal": goal,
                "status": result.get("status"),
                "approval_ids": result.get("approval_ids") or [],
            },
        )

    if args.json:
        payload = dict(result)
        if job_name:
            payload["job"] = job_name
        print(json.dumps(payload, indent=2, default=str))
    else:
        prefix = f"[job={job_name}] " if job_name else ""
        print(result.get("reply") or result.get("report", {}).get("markdown") or "No reply")
        print(
            f"\n{prefix}[status={result.get('status')} "
            f"dry_run={result.get('dry_run', settings.dry_run)} "
            f"live={settings.monny_live}]"
        )
    return 0


def main() -> None:
    raise SystemExit(cli())


if __name__ == "__main__":
    main()
