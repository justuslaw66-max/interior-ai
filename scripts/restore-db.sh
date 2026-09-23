#!/usr/bin/env bash
set -euo pipefail

case "${APP_ENV:-}" in
  development|staging|production) ;;
  *)
    echo "APP_ENV must explicitly be development, staging, or production." >&2
    exit 1
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required (install PostgreSQL client tools)." >&2
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <backup.sql> --confirm-environment=${APP_ENV}" >&2
  exit 1
fi

if [[ "$2" != "--confirm-environment=${APP_ENV}" ]]; then
  echo "Refusing restore: pass --confirm-environment=${APP_ENV} after verifying DATABASE_URL." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

echo "[restore-db] restoring ${BACKUP_FILE}"
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${BACKUP_FILE}"

echo "[restore-db] done"
