#!/usr/bin/env bash
set -euo pipefail

case "${APP_ENV:-}" in
  development|staging|production) ;;
  *)
    echo "APP_ENV must explicitly be development, staging, or production." >&2
    exit 1
    ;;
esac

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required (install PostgreSQL client tools)." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

OUT_DIR="${1:-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${OUT_DIR}/db-backup-${STAMP}.sql"

mkdir -p "${OUT_DIR}"

echo "[backup-db] writing ${OUT_FILE}"
pg_dump "${DATABASE_URL}" --no-owner --no-privileges --format=plain > "${OUT_FILE}"

echo "[backup-db] done"
