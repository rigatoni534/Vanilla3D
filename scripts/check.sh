#!/usr/bin/env bash
# Vanilla3D repository check. Runs the same checks as `npm run check`.
#
#   ./scripts/check.sh
#   npm run check
#
# It needs Node only: no install, no browser, no network.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/check.mjs "$@"
