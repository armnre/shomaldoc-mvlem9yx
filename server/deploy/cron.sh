#!/usr/bin/env bash
# Manual run only — the server already schedules these jobs internally with node-cron.
# Usage: sudo -u shomaldoc /opt/shomaldoc/server/deploy/cron.sh reminders|term
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
EP=$([ "${1:-reminders}" = term ] && echo runTermControl || echo runReminders)
exec npx tsx --tsconfig tsconfig.json src/index.ts run-job "$EP"
