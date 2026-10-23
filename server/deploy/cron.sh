#!/usr/bin/env bash
# Scheduled jobs (replacement for platform schedules). Needs an admin session token in SHOMAL_ADMIN_TOKEN.
# crontab:  0 7 * * * /opt/shomaldoc/server/deploy/cron.sh reminders
#           0 3 1 * * /opt/shomaldoc/server/deploy/cron.sh term
set -euo pipefail
EP=$([ "${1:-}" = term ] && echo runTermControl || echo runReminders)
curl -fsS -XPOST "http://127.0.0.1:3000/api/$EP" -H 'content-type: application/json' -d "{\"token\":\"$SHOMAL_ADMIN_TOKEN\",\"dryRun\":false}"
