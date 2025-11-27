# Migration Strategy

> Database migration approach, versioning, and rollback procedures

---

## Table of Contents

- [Migration Approach](#migration-approach)
- [Prisma Migrations](#prisma-migrations)
- [Migration Workflow](#migration-workflow)
- [Production Migrations](#production-migrations)
- [Rollback Procedures](#rollback-procedures)
- [Data Migrations](#data-migrations)
- [Best Practices](#best-practices)

---

## Migration Approach

### Principles

1. **Version Control**: All migrations stored in git
2. **Idempotent**: Migrations can be safely re-run
3. **Reversible**: Every migration has a rollback plan
4. **Tested**: Migrations tested in staging before production
5. **Zero-Downtime**: Production migrations don't require downtime

### Migration Types

| Type | Description | Tool |
|------|-------------|------|
| **Schema Migration** | DDL changes (tables, columns, indexes) | Prisma Migrate |
| **Data Migration** | DML changes (data transformation) | Custom scripts |
| **Seed Data** | Initial/test data population | Prisma Seed |

---

## Prisma Migrations

### Directory Structure

```
prisma/
├── schema.prisma           # Current schema
├── migrations/
│   ├── 20241101000000_init/
│   │   └── migration.sql
│   ├── 20241115000000_add_2fa/
│   │   └── migration.sql
│   └── migration_lock.toml
├── seed.ts                 # Seed script
└── data-migrations/        # Custom data migrations
    ├── 001_migrate_tags.ts
    └── 002_backfill_slugs.ts
```

### Commands

```bash
# Create a new migration (development)
bunx prisma migrate dev --name add_feature

# Apply migrations (production)
bunx prisma migrate deploy

# Reset database (development only!)
bunx prisma migrate reset

# Check migration status
bunx prisma migrate status

# Generate Prisma Client
bunx prisma generate

# Format schema
bunx prisma format
```

---

## Migration Workflow

### Development Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT WORKFLOW                          │
└─────────────────────────────────────────────────────────────────┘

1. Modify schema.prisma
         │
         ▼
2. Run: bunx prisma migrate dev --name descriptive_name
         │
         ├── Creates migration SQL file
         ├── Applies to local database
         └── Regenerates Prisma Client
         │
         ▼
3. Test changes locally
         │
         ▼
4. Commit migration files to git
         │
         ▼
5. PR Review
         │
         ▼
6. Merge to main
```

### Staging/Production Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION WORKFLOW                           │
└─────────────────────────────────────────────────────────────────┘

1. Pull latest code with migrations
         │
         ▼
2. Run: bunx prisma migrate deploy
         │
         ├── Applies pending migrations
         └── Updates _prisma_migrations table
         │
         ▼
3. Deploy new application code
         │
         ▼
4. Verify deployment
         │
         ▼
5. Monitor for issues
```

---

## Production Migrations

### Pre-Migration Checklist

- [ ] Migration tested in staging
- [ ] Backup taken
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] Maintenance window scheduled (if needed)
- [ ] Team notified

### Zero-Downtime Migration Patterns

#### 1. Add Column (Non-Breaking)

```sql
-- Safe: Adding nullable column
ALTER TABLE tickets ADD COLUMN new_field VARCHAR(100);
```

#### 2. Rename Column (Breaking - Use Expand/Contract)

```sql
-- Step 1: Add new column
ALTER TABLE tickets ADD COLUMN new_name VARCHAR(100);

-- Step 2: Backfill data (run separately)
UPDATE tickets SET new_name = old_name WHERE new_name IS NULL;

-- Step 3: Deploy code using both columns

-- Step 4: Make new column required
ALTER TABLE tickets ALTER COLUMN new_name SET NOT NULL;

-- Step 5: Deploy code using only new column

-- Step 6: Drop old column (separate migration)
ALTER TABLE tickets DROP COLUMN old_name;
```

#### 3. Add Index Concurrently

```sql
-- Safe: Non-blocking index creation
CREATE INDEX CONCURRENTLY idx_tickets_status ON tickets(status);
```

### CI/CD Integration

```yaml
# .github/workflows/deploy.yml
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
      
      - name: Run migrations
        run: bunx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      
      - name: Verify migration
        run: bunx prisma migrate status
```

---

## Rollback Procedures

### Rollback Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROLLBACK DECISION TREE                        │
└─────────────────────────────────────────────────────────────────┘

Migration Failed?
     │
     ├── YES: Prisma auto-rolls back (no action needed)
     │
     └── NO: Migration succeeded but issues found
              │
              ├── Non-breaking change?
              │   └── Deploy fix-forward migration
              │
              └── Breaking change?
                  ├── Restore from backup (if critical)
                  └── Deploy manual rollback migration
```

### Manual Rollback Migration

For each migration, maintain a rollback file:

```
prisma/
├── migrations/
│   └── 20241115000000_add_feature/
│       ├── migration.sql      # Forward migration
│       └── rollback.sql       # Manual rollback (not auto-applied)
```

```sql
-- migrations/20241115000000_add_feature/rollback.sql
-- Rollback: Remove 2FA columns from users

ALTER TABLE users DROP COLUMN IF EXISTS two_factor_enabled;
ALTER TABLE users DROP COLUMN IF EXISTS two_factor_secret;
```

### Applying Rollback

```bash
# 1. Connect to database
psql $DATABASE_URL

# 2. Apply rollback SQL
\i prisma/migrations/20241115000000_add_feature/rollback.sql

# 3. Remove migration record
DELETE FROM _prisma_migrations 
WHERE migration_name = '20241115000000_add_feature';

# 4. Verify
bunx prisma migrate status
```

### Point-in-Time Recovery

For critical failures, restore from backup:

```bash
# 1. Stop application
# 2. Restore database (see backup-recovery.md)
# 3. Apply migrations up to safe point
bunx prisma migrate resolve --applied "20241101000000_init"
# 4. Restart application with compatible code version
```

---

## Data Migrations

### When to Use Data Migrations

- Backfilling new columns with computed values
- Transforming data formats
- Merging/splitting tables
- Migrating between field types

### Data Migration Template

```typescript
// prisma/data-migrations/001_backfill_ticket_numbers.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting data migration: backfill_ticket_numbers');
  
  const batchSize = 1000;
  let processed = 0;
  let lastId: string | undefined;
  
  while (true) {
    // Fetch batch
    const tickets = await prisma.ticket.findMany({
      where: {
        ticketNumber: null,
        ...(lastId && { id: { gt: lastId } }),
      },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    
    if (tickets.length === 0) break;
    
    // Process batch
    for (const ticket of tickets) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { 
          ticketNumber: `TKT-${String(processed + 1).padStart(5, '0')}` 
        },
      });
      processed++;
    }
    
    lastId = tickets[tickets.length - 1].id;
    console.log(`Processed ${processed} tickets...`);
  }
  
  console.log(`Migration complete. Total processed: ${processed}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Running Data Migrations

```bash
# Run specific data migration
bun run prisma/data-migrations/001_backfill_ticket_numbers.ts

# Or add to package.json
# "db:migrate:data": "bun run prisma/data-migrations/001_backfill_ticket_numbers.ts"
bun run db:migrate:data
```

---

## Best Practices

### DO ✅

1. **Use descriptive migration names**
   ```bash
   bunx prisma migrate dev --name add_2fa_to_users
   ```

2. **Keep migrations small and focused**
   - One logical change per migration
   - Easier to review and rollback

3. **Test migrations with production-like data**
   ```bash
   # Restore staging from production backup
   # Apply migrations
   # Verify data integrity
   ```

4. **Use transactions for data migrations**
   ```typescript
   await prisma.$transaction(async (tx) => {
     // All operations atomic
   });
   ```

5. **Add indexes concurrently in production**
   ```sql
   CREATE INDEX CONCURRENTLY ...
   ```

6. **Document breaking changes**
   ```sql
   -- BREAKING: This migration removes the 'old_field' column
   -- Requires application version >= 2.5.0
   ```

### DON'T ❌

1. **Never edit existing migrations**
   - Create new migrations for changes
   - Exception: Before pushing to shared branch

2. **Never run `migrate reset` in production**
   - Drops all data!

3. **Avoid large data migrations in schema migrations**
   - Separate schema and data changes
   - Run data migrations as separate scripts

4. **Don't skip staging testing**
   - Always test migrations in staging first

5. **Avoid DROP COLUMN without backups**
   - Data is unrecoverable after drop

---

## Migration Naming Convention

```
YYYYMMDDHHMMSS_descriptive_name

Examples:
20241101000000_init
20241115120000_add_2fa_to_users
20241120093000_add_ticket_tags_index
20241125140000_rename_priority_to_severity
```

---

## Related Documents

- [Schema Details](./schema.md) — Full schema reference
- [Indexing Strategy](./indexing.md) — Index management
- [Backup & Recovery](./backup-recovery.md) — Data protection

---

*Next: [Indexing Strategy →](./indexing.md)*
