#!/usr/bin/env bash
# Daily PostgreSQL + uploads backup. cron: 0 2 * * * /opt/shomaldoc/server/deploy/backup.sh
set -euo pipefail
DIR=/var/backups/shomaldoc; mkdir -p "$DIR"; TS=$(date +%F)
docker compose -f /opt/shomaldoc/server/docker-compose.yml exec -T db pg_dump -U shomal shomaldoc | gzip > "$DIR/db-$TS.sql.gz"
docker run --rm -v server_uploads:/u -v "$DIR":/b alpine tar czf /b/uploads-$TS.tgz -C /u .
find "$DIR" -mtime +14 -delete
