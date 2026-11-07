#!/usr/bin/env bash
# Convenience launcher: API on :8000 and (optionally) notes for the UI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source .venv/bin/activate
export MONNY_DRY_RUN="${MONNY_DRY_RUN:-1}"
exec uvicorn monny.api.app:app --reload --host 127.0.0.1 --port 8000
