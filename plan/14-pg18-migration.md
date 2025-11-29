# PostgreSQL 17 → 18 Migration Guide

> **Status**: Ready for implementation  
> **Target**: PostgreSQL 18.1 (released September 2025)

---

## Overview

This document outlines the migration process from PostgreSQL 17 to PostgreSQL 18 for InsightDesk.

### Key Benefits of PostgreSQL 18

- **Asynchronous I/O (AIO)**: Improved performance for sequential scans, bitmap heap scans, and vacuums
- **UUIDv7 support**: Native `uuidv7()` function for time-sortable UUIDs
- **Virtual generated columns**: Default for computed columns (read-time computation)
- **pg_upgrade statistics retention**: No need to run ANALYZE after upgrade
- **Skip scan for B-tree indexes**: Better multicolumn index utilization
- **OAuth authentication support**: Native OAuth in `pg_hba.conf`

---

## Pre-Migration Checklist

### 1. Backup Current Database

```bash
# Development environment - dump all databases
docker exec insightdesk-postgres pg_dumpall -U insightdesk > backup_pg17_$(date +%Y%m%d).sql

# Or for a single database
docker exec insightdesk-postgres pg_dump -U insightdesk insightdesk > backup_insightdesk_$(date +%Y%m%d).sql
```

### 2. Verify Current State

```bash
# Check current PostgreSQL version
docker exec insightdesk-postgres psql -U insightdesk -c "SELECT version();"

# Check database size
docker exec insightdesk-postgres psql -U insightdesk -c "SELECT pg_size_pretty(pg_database_size('insightdesk'));"

# List all indexes (for reindexing reference)
docker exec insightdesk-postgres psql -U insightdesk -d insightdesk -c "\di+"
```

---

## Breaking Changes & Compatibility

### 1. Data Checksums (Default Enabled in PG18)

PostgreSQL 18 enables data checksums by default for new clusters. When using `pg_upgrade`:
- Old clusters without checksums require `--no-data-checksums` on the new cluster
- For Docker development: dump/restore method avoids this complexity

### 2. Full-Text Search Index

InsightDesk uses a GIN FTS index on tickets:

```sql
-- Located in src/db/schema/tables.ts
index("tickets_search_idx").using(
  "gin",
  sql`to_tsvector('english', ${table.title} || ' ' || ${table.description})`,
)
```

**Action Required**: After migration, reindex FTS indexes if using non-libc collation:

```sql
-- Check if reindexing is needed (run after migration)
REINDEX INDEX CONCURRENTLY tickets_search_idx;
```

Since we use `'english'` dictionary (libc-based), reindexing is optional but recommended for consistency.

### 3. MD5 Password Authentication (Deprecated)

PostgreSQL 18 deprecates MD5 passwords. Our setup uses:
- **Application passwords**: Argon2 via better-auth (not affected)
- **Database connection**: SCRAM-SHA-256 (default in modern PostgreSQL)

**Verification**:
```sql
-- Check current auth method
SHOW password_encryption;  -- Should show 'scram-sha-256'
```

### 4. VACUUM/ANALYZE Behavior Change

PG18 now processes inheritance children by default. InsightDesk doesn't use table inheritance, so no action required.

---

## Migration Steps

### Development Environment (Docker)

#### Option A: Fresh Start (Recommended for Dev)

```bash
# 1. Stop and remove old containers
docker compose down

# 2. Remove old volume (WARNING: destroys data)
docker volume rm insight-desk_postgres_data
docker volume rm insight-desk_postgresql_data

# 3. Update docker-compose.dev.yml (already done)
# image: postgres:18-alpine

# 4. Start fresh
docker compose -f docker-compose.dev.yml up -d

# 5. Run migrations and seed
bun run db:migrate
bun run db:seed
```

#### Option B: Preserve Data (Dump/Restore)

```bash
# 1. Backup current database
docker exec insightdesk-postgres pg_dump -U insightdesk -Fc insightdesk > backup.dump

# 2. Stop containers
docker compose down

# 3. Remove old volume
docker volume rm insight-desk_postgresql_data

# 4. Start with new PostgreSQL 18
docker compose -f docker-compose.dev.yml up -d postgresql

# 5. Wait for healthy state
docker compose -f docker-compose.dev.yml ps

# 6. Restore backup
docker exec -i insightdesk-postgres pg_restore -U insightdesk -d insightdesk --no-owner < backup.dump

# 7. Reindex FTS (optional but recommended)
docker exec insightdesk-postgres psql -U insightdesk -d insightdesk -c "REINDEX INDEX CONCURRENTLY tickets_search_idx;"

# 8. Update statistics
docker exec insightdesk-postgres psql -U insightdesk -d insightdesk -c "ANALYZE;"
```

### Production Environment

For production, use `pg_upgrade` with the new `--swap` option for minimal downtime:

```bash
# 1. Full backup (mandatory)
pg_dumpall -U postgres > full_backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Stop application connections

# 3. Run pg_upgrade
pg_upgrade \
  --old-datadir=/var/lib/postgresql/17/data \
  --new-datadir=/var/lib/postgresql/18/data \
  --old-bindir=/usr/lib/postgresql/17/bin \
  --new-bindir=/usr/lib/postgresql/18/bin \
  --swap \
  --jobs=4

# 4. Start PostgreSQL 18

# 5. Run generated scripts
./analyze_new_cluster.sh
./delete_old_cluster.sh  # Only after verification!

# 6. Reindex FTS indexes
psql -U insightdesk -d insightdesk -c "REINDEX INDEX CONCURRENTLY tickets_search_idx;"
```

---

## Post-Migration Verification

```bash
# 1. Verify version
docker exec insightdesk-postgres psql -U insightdesk -c "SELECT version();"
# Expected: PostgreSQL 18.x

# 2. Test FTS functionality
docker exec insightdesk-postgres psql -U insightdesk -d insightdesk -c "
  SELECT id, title FROM tickets 
  WHERE to_tsvector('english', title || ' ' || description) @@ plainto_tsquery('english', 'test')
  LIMIT 5;
"

# 3. Run application tests
bun run test

# 4. Check for any deprecated warnings in logs
docker logs insightdesk-postgres 2>&1 | grep -i "deprecated\|warning"
```

---

## Future Improvements (Optional)

### Consider UUIDv7 for New Tables

PostgreSQL 18 introduces `uuidv7()` for time-sortable UUIDs. Benefits:
- Better index locality (sequential writes)
- Implicit timestamp ordering
- Improved cache utilization

```typescript
// Current: gen_random_uuid() (UUIDv4)
id: uuid("id").primaryKey().defaultRandom(),

// Future consideration for new tables:
// Use uuidv7() in raw SQL or wait for Drizzle ORM support
id: uuid("id").primaryKey().default(sql`uuidv7()`),
```

**Note**: Existing tables should NOT be changed. UUIDv7 is for new tables only.

### Virtual Generated Columns

PG18 makes virtual generated columns the default. Consider for:
- Computed display names
- Derived status fields
- Search optimization fields

```sql
-- Example: Virtual column (computed at read time)
ALTER TABLE tickets 
ADD COLUMN search_text text GENERATED ALWAYS AS (title || ' ' || description) STORED;
-- In PG18, remove STORED for virtual (read-time) computation
```

---

## Rollback Plan

If issues occur after migration:

```bash
# 1. Stop application
docker compose down

# 2. Remove PG18 volume
docker volume rm insight-desk_postgresql_data

# 3. Revert docker-compose.dev.yml to postgres:17-alpine

# 4. Restore from backup
docker compose -f docker-compose.dev.yml up -d postgresql
docker exec -i insightdesk-postgres psql -U insightdesk < backup_pg17_YYYYMMDD.sql
```

---

## References

- [PostgreSQL 18 Release Notes](https://www.postgresql.org/docs/18/release-18.html)
- [Upgrading a PostgreSQL Cluster](https://www.postgresql.org/docs/current/upgrading.html)
- [pg_upgrade Documentation](https://www.postgresql.org/docs/18/pgupgrade.html)
