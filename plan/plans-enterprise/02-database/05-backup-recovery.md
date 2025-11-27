# Backup & Recovery

> Database backup procedures, disaster recovery, and data protection

---

## Table of Contents

- [Backup Strategy](#backup-strategy)
- [Backup Types](#backup-types)
- [Automated Backups](#automated-backups)
- [Manual Backup Procedures](#manual-backup-procedures)
- [Recovery Procedures](#recovery-procedures)
- [Disaster Recovery Plan](#disaster-recovery-plan)
- [Testing & Validation](#testing--validation)

---

## Backup Strategy

### Recovery Objectives

| Metric | Target | Description |
|--------|--------|-------------|
| **RPO** (Recovery Point Objective) | 5 minutes | Maximum data loss tolerance |
| **RTO** (Recovery Time Objective) | 1 hour | Maximum downtime tolerance |

### Backup Schedule

| Backup Type | Frequency | Retention | Storage |
|-------------|-----------|-----------|---------|
| WAL Archiving | Continuous | 7 days | Object storage |
| Incremental | Every 15 minutes | 24 hours | Object storage |
| Full Backup | Daily (03:00 UTC) | 30 days | Object storage |
| Weekly Backup | Sunday (03:00 UTC) | 90 days | Object storage |
| Monthly Backup | 1st of month | 1 year | Cold storage |

### Storage Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     BACKUP ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PostgreSQL    │     │    WAL Files    │     │  Object Storage │
│    Primary      │────▶│   (Continuous)  │────▶│   (S3/GCS)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │                                               ▼
        │                                       ┌─────────────────┐
        │                                       │  Cold Storage   │
        │                                       │ (Monthly/Yearly)│
        │                                       └─────────────────┘
        │
        ▼
┌─────────────────┐     ┌─────────────────┐
│   pg_basebackup │────▶│   Full Backups  │
│    (Daily)      │     │   (30-day ret.) │
└─────────────────┘     └─────────────────┘
```

---

## Backup Types

### 1. Continuous WAL Archiving (PITR)

Enables Point-in-Time Recovery to any moment.

```bash
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://insightdesk-backups/wal/%f'
archive_timeout = 60  # Archive every 60 seconds at minimum
```

### 2. Full Base Backup

Complete database snapshot.

```bash
# Using pg_basebackup
pg_basebackup -h localhost -U postgres \
  -D /backups/full/$(date +%Y%m%d) \
  -Ft -z -P -X stream
```

### 3. Logical Backup (pg_dump)

SQL-level backup for portability.

```bash
# Full database dump
pg_dump -h localhost -U postgres \
  -Fc --no-owner --no-acl \
  insightdesk > backup_$(date +%Y%m%d_%H%M%S).dump

# Specific tables only
pg_dump -h localhost -U postgres \
  -Fc -t tickets -t users \
  insightdesk > partial_backup.dump
```

---

## Automated Backups

### Backup Script

```bash
#!/bin/bash
# scripts/backup.sh

set -euo pipefail

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-insightdesk}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
S3_BUCKET="${S3_BUCKET:-insightdesk-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/insightdesk_$TIMESTAMP.dump"

echo "Starting backup at $(date)"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Perform backup
pg_dump -h "$DB_HOST" -U "$DB_USER" \
  -Fc --no-owner --no-acl \
  "$DB_NAME" > "$BACKUP_FILE"

# Verify backup
if [ ! -s "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file is empty!"
  exit 1
fi

# Upload to S3
echo "Uploading to S3..."
aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/daily/$TIMESTAMP.dump"

# Calculate checksum
CHECKSUM=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
echo "$CHECKSUM" | aws s3 cp - "s3://$S3_BUCKET/daily/$TIMESTAMP.sha256"

# Cleanup old local backups
find "$BACKUP_DIR" -name "*.dump" -mtime +7 -delete

# Cleanup old S3 backups (beyond retention)
aws s3 ls "s3://$S3_BUCKET/daily/" | while read -r line; do
  backup_date=$(echo "$line" | awk '{print $4}' | cut -d'_' -f1)
  if [[ $(date -d "$backup_date" +%s) -lt $(date -d "-$RETENTION_DAYS days" +%s) ]]; then
    aws s3 rm "s3://$S3_BUCKET/daily/$(echo $line | awk '{print $4}')"
  fi
done

echo "Backup completed successfully at $(date)"
echo "Backup file: $BACKUP_FILE"
echo "S3 location: s3://$S3_BUCKET/daily/$TIMESTAMP.dump"
echo "Checksum: $CHECKSUM"
```

### Cron Schedule

```cron
# Daily full backup at 3:00 AM UTC
0 3 * * * /opt/insightdesk/scripts/backup.sh >> /var/log/backup.log 2>&1

# WAL archive cleanup (keep 7 days)
0 4 * * * find /var/lib/postgresql/wal_archive -mtime +7 -delete

# Monthly backup to cold storage
0 3 1 * * /opt/insightdesk/scripts/monthly_backup.sh
```

### Kubernetes CronJob

```yaml
# k8s/backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:16-alpine
            command:
            - /bin/sh
            - -c
            - |
              pg_dump -h $DB_HOST -U $DB_USER -Fc $DB_NAME | \
              aws s3 cp - s3://$S3_BUCKET/daily/$(date +%Y%m%d).dump
            env:
            - name: DB_HOST
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: host
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: username
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: password
          restartPolicy: OnFailure
```

---

## Manual Backup Procedures

### Pre-Migration Backup

Before any schema changes:

```bash
# 1. Create timestamped backup
export BACKUP_NAME="pre_migration_$(date +%Y%m%d_%H%M%S)"

pg_dump -h $DB_HOST -U $DB_USER \
  -Fc --no-owner \
  $DB_NAME > /backups/$BACKUP_NAME.dump

# 2. Verify backup
pg_restore --list /backups/$BACKUP_NAME.dump | head -20

# 3. Upload to S3
aws s3 cp /backups/$BACKUP_NAME.dump s3://$S3_BUCKET/migrations/

echo "Backup ready: $BACKUP_NAME"
```

### Table-Level Backup

For specific table operations:

```bash
# Backup specific tables
pg_dump -h $DB_HOST -U $DB_USER \
  -Fc -t tickets -t ticket_messages \
  $DB_NAME > /backups/tickets_backup.dump

# Export as CSV (for analysis)
psql -h $DB_HOST -U $DB_USER $DB_NAME \
  -c "\COPY tickets TO '/backups/tickets.csv' WITH CSV HEADER"
```

---

## Recovery Procedures

### Full Database Restore

```bash
#!/bin/bash
# scripts/restore.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore.sh <backup_file>"
  exit 1
fi

echo "WARNING: This will replace all data in the database!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# 1. Download from S3 if needed
if [[ "$BACKUP_FILE" == s3://* ]]; then
  echo "Downloading from S3..."
  aws s3 cp "$BACKUP_FILE" /tmp/restore.dump
  BACKUP_FILE="/tmp/restore.dump"
fi

# 2. Verify backup integrity
pg_restore --list "$BACKUP_FILE" > /dev/null
if [ $? -ne 0 ]; then
  echo "ERROR: Backup file is corrupted!"
  exit 1
fi

# 3. Stop application
echo "Stopping application..."
# kubectl scale deployment api --replicas=0

# 4. Drop and recreate database
psql -h $DB_HOST -U $DB_USER postgres <<EOF
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME;
EOF

# 5. Restore backup
echo "Restoring database..."
pg_restore -h $DB_HOST -U $DB_USER \
  -d $DB_NAME --no-owner --no-acl \
  "$BACKUP_FILE"

# 6. Verify restoration
TABLES=$(psql -h $DB_HOST -U $DB_USER $DB_NAME -t \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
echo "Restored $TABLES tables"

# 7. Run any pending migrations
echo "Running migrations..."
cd /app && bunx prisma migrate deploy

# 8. Restart application
echo "Restarting application..."
# kubectl scale deployment api --replicas=3

echo "Restore completed successfully!"
```

### Point-in-Time Recovery (PITR)

Recover to a specific timestamp:

```bash
#!/bin/bash
# scripts/pitr_restore.sh

RECOVERY_TARGET=$1  # Format: '2024-01-15 14:30:00 UTC'

if [ -z "$RECOVERY_TARGET" ]; then
  echo "Usage: ./pitr_restore.sh '2024-01-15 14:30:00 UTC'"
  exit 1
fi

echo "Recovering to: $RECOVERY_TARGET"

# 1. Find the base backup before target time
BASE_BACKUP=$(aws s3 ls s3://$S3_BUCKET/full/ | \
  awk '{print $4}' | sort -r | \
  while read f; do
    backup_time=$(echo $f | sed 's/_.*//' | sed 's/\(....\)\(..\)\(..\)/\1-\2-\3/')
    if [[ $(date -d "$backup_time" +%s) -lt $(date -d "$RECOVERY_TARGET" +%s) ]]; then
      echo $f
      break
    fi
  done)

echo "Using base backup: $BASE_BACKUP"

# 2. Download base backup
aws s3 cp "s3://$S3_BUCKET/full/$BASE_BACKUP" /tmp/base_backup.tar.gz

# 3. Stop PostgreSQL
pg_ctl stop -D /var/lib/postgresql/data

# 4. Clear data directory
rm -rf /var/lib/postgresql/data/*

# 5. Extract base backup
tar -xzf /tmp/base_backup.tar.gz -C /var/lib/postgresql/data

# 6. Create recovery configuration
cat > /var/lib/postgresql/data/recovery.signal <<EOF
EOF

cat >> /var/lib/postgresql/data/postgresql.auto.conf <<EOF
restore_command = 'aws s3 cp s3://$S3_BUCKET/wal/%f %p'
recovery_target_time = '$RECOVERY_TARGET'
recovery_target_action = 'promote'
EOF

# 7. Start PostgreSQL in recovery mode
pg_ctl start -D /var/lib/postgresql/data

echo "PITR recovery initiated. Check PostgreSQL logs for progress."
```

### Single Table Restore

Restore a specific table from backup:

```bash
#!/bin/bash
# Restore single table from backup

BACKUP_FILE=$1
TABLE_NAME=$2
TEMP_DB="restore_temp_$$"

# Create temporary database
psql -h $DB_HOST -U $DB_USER postgres \
  -c "CREATE DATABASE $TEMP_DB"

# Restore only the target table to temp database
pg_restore -h $DB_HOST -U $DB_USER \
  -d $TEMP_DB -t "$TABLE_NAME" \
  "$BACKUP_FILE"

# Copy data to production (choose one method)

# Option 1: Replace entire table
psql -h $DB_HOST -U $DB_USER $DB_NAME <<EOF
BEGIN;
TRUNCATE $TABLE_NAME CASCADE;
INSERT INTO $TABLE_NAME SELECT * FROM dblink(
  'dbname=$TEMP_DB',
  'SELECT * FROM $TABLE_NAME'
) AS t(...); -- Specify columns
COMMIT;
EOF

# Option 2: Export/Import via CSV
psql -h $DB_HOST -U $DB_USER $TEMP_DB \
  -c "\COPY $TABLE_NAME TO '/tmp/$TABLE_NAME.csv' WITH CSV HEADER"

psql -h $DB_HOST -U $DB_USER $DB_NAME \
  -c "\COPY $TABLE_NAME FROM '/tmp/$TABLE_NAME.csv' WITH CSV HEADER"

# Cleanup
psql -h $DB_HOST -U $DB_USER postgres \
  -c "DROP DATABASE $TEMP_DB"
```

---

## Disaster Recovery Plan

### Severity Levels

| Level | Scenario | RTO | Procedure |
|-------|----------|-----|-----------|
| **SEV1** | Total data loss | 1 hour | Full restore from latest backup |
| **SEV2** | Corruption detected | 2 hours | PITR to before corruption |
| **SEV3** | Accidental deletion | 4 hours | Single table restore |
| **SEV4** | Performance degradation | 8 hours | Investigate, possible restore |

### Disaster Recovery Runbook

```markdown
## DR Runbook: Database Failure

### 1. Assessment (5 minutes)
- [ ] Identify failure type (corruption, deletion, hardware)
- [ ] Determine affected data scope
- [ ] Estimate data loss window

### 2. Communication (5 minutes)
- [ ] Notify engineering team
- [ ] Update status page
- [ ] Notify stakeholders if SEV1/SEV2

### 3. Recovery Decision
- If corruption: Proceed with PITR
- If deletion: Single table restore
- If total loss: Full restore

### 4. Execute Recovery
- [ ] Stop application traffic
- [ ] Run appropriate restore script
- [ ] Verify data integrity
- [ ] Run application health checks

### 5. Validation
- [ ] Count records in key tables
- [ ] Test critical workflows
- [ ] Check for data consistency

### 6. Resume Operations
- [ ] Restore application traffic
- [ ] Monitor for issues
- [ ] Update status page

### 7. Post-Incident
- [ ] Document timeline
- [ ] Root cause analysis
- [ ] Update procedures if needed
```

### Multi-Region Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    MULTI-REGION ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────┘

      PRIMARY REGION (us-east-1)          DR REGION (us-west-2)
┌─────────────────────────────────┐   ┌─────────────────────────────┐
│  ┌─────────────────────────┐    │   │   ┌─────────────────────┐   │
│  │   PostgreSQL Primary    │    │   │   │  PostgreSQL Standby │   │
│  │   (Active)              │────┼───┼──▶│  (Streaming Rep)    │   │
│  └─────────────────────────┘    │   │   └─────────────────────┘   │
│                                 │   │                             │
│  ┌─────────────────────────┐    │   │   ┌─────────────────────┐   │
│  │   S3 Backup Bucket      │────┼───┼──▶│  S3 Replica Bucket  │   │
│  │   (Primary backups)     │    │   │   │  (Cross-region)     │   │
│  └─────────────────────────┘    │   │   └─────────────────────┘   │
└─────────────────────────────────┘   └─────────────────────────────┘

Failover Time: ~15 minutes
Data Loss: ~0 (synchronous) or ~minutes (async)
```

---

## Testing & Validation

### Monthly Backup Test

```bash
#!/bin/bash
# scripts/test_backup.sh

echo "=== Monthly Backup Validation ==="
echo "Date: $(date)"

# 1. Get latest backup
LATEST=$(aws s3 ls s3://$S3_BUCKET/daily/ | tail -1 | awk '{print $4}')
echo "Testing backup: $LATEST"

# 2. Download backup
aws s3 cp "s3://$S3_BUCKET/daily/$LATEST" /tmp/test_backup.dump

# 3. Verify checksum
aws s3 cp "s3://$S3_BUCKET/daily/${LATEST%.dump}.sha256" /tmp/expected.sha256
ACTUAL=$(sha256sum /tmp/test_backup.dump | awk '{print $1}')
EXPECTED=$(cat /tmp/expected.sha256)

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "ERROR: Checksum mismatch!"
  exit 1
fi
echo "✓ Checksum verified"

# 4. Create test database
TEST_DB="backup_test_$(date +%Y%m%d)"
psql -h $DB_HOST -U $DB_USER postgres \
  -c "CREATE DATABASE $TEST_DB"

# 5. Restore to test database
pg_restore -h $DB_HOST -U $DB_USER \
  -d $TEST_DB --no-owner \
  /tmp/test_backup.dump

# 6. Verify record counts
echo "Verifying record counts..."
USERS=$(psql -h $DB_HOST -U $DB_USER $TEST_DB -t -c "SELECT COUNT(*) FROM users")
TICKETS=$(psql -h $DB_HOST -U $DB_USER $TEST_DB -t -c "SELECT COUNT(*) FROM tickets")

echo "Users: $USERS"
echo "Tickets: $TICKETS"

# 7. Cleanup
psql -h $DB_HOST -U $DB_USER postgres \
  -c "DROP DATABASE $TEST_DB"

echo "=== Backup validation completed ==="
```

### Automated Validation

```yaml
# GitHub Actions: Monthly backup test
name: Backup Validation
on:
  schedule:
    - cron: '0 10 1 * *'  # 1st of each month

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run backup test
        run: ./scripts/test_backup.sh
        env:
          DB_HOST: ${{ secrets.TEST_DB_HOST }}
          DB_USER: ${{ secrets.TEST_DB_USER }}
          PGPASSWORD: ${{ secrets.TEST_DB_PASSWORD }}
          S3_BUCKET: ${{ secrets.BACKUP_BUCKET }}
      
      - name: Notify on failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -d '{"text":"⚠️ Monthly backup validation failed!"}'
```

---

## Related Documents

- [Schema Details](./schema.md) — Database schema
- [Migrations](./migrations.md) — Schema changes
- [Infrastructure](../01-architecture/infrastructure.md) — Cloud setup
- [Monitoring](../07-devops/monitoring.md) — Alerting

---

*Next: [API Overview →](../03-api/overview.md)*
