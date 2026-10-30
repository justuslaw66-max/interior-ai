#!/bin/bash
# Corrections per plan for a folder of exporter evidence (the score harness: document-from-evidence.ts, then
# corrections.py). Run from the root of a checkout of the app:
#   bash services/floorplan-vectorizer/tools/score/score.sh <evidence dir> <out dir> [corrections.py options, e.g. -v]
# Writes <out>/docs.json (the app's documents, summarised) and <out>/corrections.json, and prints the table.
# TS_RUN picks another TypeScript runner (default: the checkout's ts-node with tsconfig-paths); PY another python3.
# The sealed plans are scored as numbers only. No network, no git; writes only under <out>.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
EV="${1:?usage: score.sh <evidence dir> <out dir>}"
OUT="${2:?usage: score.sh <evidence dir> <out dir>}"
shift 2
PY="${PY:-python3}"
SEALED="p01,p04,p07,p09,p10,s006,s014,s015,s017,s025,s027,s030,s034,s035,s048,s050,s051,s052,s055,s059,s061,s062,s063,s067,s072,s075,s082"
mkdir -p "$OUT"
if [ -n "${TS_RUN:-}" ]; then
  # shellcheck disable=SC2086
  $TS_RUN "$HERE/document-from-evidence.ts" "$OUT/docs.json" "$EV"/*.evidence.json
else
  npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
    -r tsconfig-paths/register "$HERE/document-from-evidence.ts" "$OUT/docs.json" "$EV"/*.evidence.json
fi
"$PY" "$HERE/corrections.py" --docs="$OUT/docs.json" --ev="$EV" --truth="$HERE/truth-reviewed,$HERE/truth-unreviewed" \
  --sealed="${SEALED_PLANS:-$SEALED}" --json="$OUT/corrections.json" "$@"
