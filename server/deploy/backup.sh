#!/usr/bin/env bash
# ShomalDoc native backup (no Docker): local pg_dump + tar of the uploads folder, with rotation.
# Install:  sudo install -m 750 -o root deploy/backup.sh /usr/local/bin/shomaldoc-backup
# Cron:     0 2 * * *  root  /usr/local/bin/shomaldoc-backup >> /var/log/shomaldoc-backup.log 2>&1
#
# Restore:
#   gunzip -c db-YYYY-MM-DD_HHMM.sql.gz | sudo -u postgres psql -d shomaldoc
#   sudo tar xzf uploads-YYYY-MM-DD_HHMM.tgz -C /var/lib/shomaldoc/uploads
set -euo pipefail

ENV_FILE=${ENV_FILE:-/opt/shomaldoc/server/.env}
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

BACKUP_DIR=${BACKUP_DIR:-/var/backups/shomaldoc}
UPLOAD_DIR=${UPLOAD_DIR:-/var/lib/shomaldoc/uploads}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
TS=$(date +%F_%H%M)

: "${DATABASE_URL:?DATABASE_URL is not set (expected in $ENV_FILE)}"
command -v pg_dump >/dev/null || { echo "pg_dump not found: apt install postgresql-client"; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] dumping database…"
pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" | gzip -9 > "$BACKUP_DIR/db-$TS.sql.gz.part"
mv "$BACKUP_DIR/db-$TS.sql.gz.part" "$BACKUP_DIR/db-$TS.sql.gz"

echo "[$(date -Is)] archiving uploads from $UPLOAD_DIR…"
tar czf "$BACKUP_DIR/uploads-$TS.tgz.part" -C "$UPLOAD_DIR" .
mv "$BACKUP_DIR/uploads-$TS.tgz.part" "$BACKUP_DIR/uploads-$TS.tgz"

# Sanity checks: the archives must be readable
gzip -t "$BACKUP_DIR/db-$TS.sql.gz"
tar tzf "$BACKUP_DIR/uploads-$TS.tgz" >/dev/null

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tgz' \) -mtime +"$KEEP_DAYS" -delete
echo "[$(date -Is)] done: $(du -sh "$BACKUP_DIR" | cut -f1) in $BACKUP_DIR"
