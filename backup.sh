#!/bin/bash
set -e

BACKUP_DIR="/opt/xsta360/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/xsta360_$TIMESTAMP.dump"

echo "[backup] Starting DB backup to $FILE"
docker exec -u postgres xsta360-db-1 pg_dump -U xsta360 -d xsta360 -F c -h /var/run/postgresql > "$FILE"

# Keep only the last 7 days of backups
find "$BACKUP_DIR" -type f -name 'xsta360_*.dump' -mtime +7 -delete

echo "[backup] Done. Size: $(ls -lh "$FILE" | awk '{print $5}')"
