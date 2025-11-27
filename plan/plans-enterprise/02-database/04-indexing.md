# Indexing Strategy

> Database index optimization for InsightDesk performance

---

## Table of Contents

- [Indexing Principles](#indexing-principles)
- [Index Inventory](#index-inventory)
- [Query Patterns & Indexes](#query-patterns--indexes)
- [Full-Text Search](#full-text-search)
- [Composite Indexes](#composite-indexes)
- [Partial Indexes](#partial-indexes)
- [Index Maintenance](#index-maintenance)

---

## Indexing Principles

### When to Add an Index

| Scenario | Add Index? |
|----------|------------|
| Column in WHERE clause frequently | ✅ Yes |
| Column in JOIN conditions | ✅ Yes |
| Column in ORDER BY | ✅ Consider |
| Foreign key column | ✅ Yes (Prisma adds automatically) |
| Frequently updated column | ⚠️ Carefully |
| Low cardinality column (few distinct values) | ⚠️ Maybe partial index |
| Small table (< 1000 rows) | ❌ Usually not needed |

### Index Types in PostgreSQL

| Type | Use Case |
|------|----------|
| **B-tree** (default) | Equality, range queries, sorting |
| **Hash** | Equality only (rarely needed) |
| **GIN** | Full-text search, JSONB, arrays |
| **GiST** | Geometric, full-text, range types |
| **BRIN** | Large tables with naturally ordered data |

---

## Index Inventory

### Users Table

```sql
-- Primary key (automatic)
CREATE UNIQUE INDEX users_pkey ON users(id);

-- Login lookup
CREATE UNIQUE INDEX users_email_key ON users(email);

-- Role-based queries
CREATE INDEX idx_users_role ON users(role);

-- Status filtering
CREATE INDEX idx_users_status ON users(status);

-- Soft delete filtering
CREATE INDEX idx_users_deleted_at ON users(deleted_at) 
  WHERE deleted_at IS NULL;
```

### Tickets Table

```sql
-- Primary key
CREATE UNIQUE INDEX tickets_pkey ON tickets(id);

-- Human-readable lookup
CREATE UNIQUE INDEX tickets_ticket_number_key ON tickets(ticket_number);

-- Customer's tickets
CREATE INDEX idx_tickets_created_by ON tickets(created_by);

-- Agent's assigned tickets
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);

-- Team tickets
CREATE INDEX idx_tickets_team_id ON tickets(team_id);

-- Status filtering (most common)
CREATE INDEX idx_tickets_status ON tickets(status);

-- Priority filtering
CREATE INDEX idx_tickets_priority ON tickets(priority);

-- SLA deadline queries
CREATE INDEX idx_tickets_sla_due_at ON tickets(sla_due_at) 
  WHERE sla_due_at IS NOT NULL AND status NOT IN ('resolved', 'closed');

-- Date range queries
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);

-- Soft deletes
CREATE INDEX idx_tickets_deleted_at ON tickets(deleted_at) 
  WHERE deleted_at IS NULL;

-- Composite: Agent dashboard (status + assigned)
CREATE INDEX idx_tickets_agent_dashboard 
  ON tickets(assigned_to, status, priority) 
  WHERE deleted_at IS NULL;

-- Composite: Queue view (unassigned + status)
CREATE INDEX idx_tickets_queue 
  ON tickets(status, priority DESC, created_at) 
  WHERE assigned_to IS NULL AND deleted_at IS NULL;
```

### TicketMessages Table

```sql
-- Primary key
CREATE UNIQUE INDEX ticket_messages_pkey ON ticket_messages(id);

-- Messages for a ticket (most common)
CREATE INDEX idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);

-- Messages by sender
CREATE INDEX idx_ticket_messages_sender_id ON ticket_messages(sender_id);

-- Chronological order
CREATE INDEX idx_ticket_messages_created_at ON ticket_messages(created_at);

-- Composite: Ticket thread
CREATE INDEX idx_ticket_messages_thread 
  ON ticket_messages(ticket_id, created_at DESC);
```

### TicketActivity Table

```sql
-- Primary key
CREATE UNIQUE INDEX ticket_activities_pkey ON ticket_activities(id);

-- Activity for a ticket
CREATE INDEX idx_ticket_activities_ticket_id ON ticket_activities(ticket_id);

-- Activity by user
CREATE INDEX idx_ticket_activities_actor_id ON ticket_activities(actor_id);

-- Activity type filtering
CREATE INDEX idx_ticket_activities_action_type ON ticket_activities(action_type);

-- Time-based queries
CREATE INDEX idx_ticket_activities_created_at ON ticket_activities(created_at DESC);

-- Composite: Ticket audit log
CREATE INDEX idx_ticket_activities_audit 
  ON ticket_activities(ticket_id, created_at DESC);
```

### KBArticles Table

```sql
-- Primary key
CREATE UNIQUE INDEX kb_articles_pkey ON kb_articles(id);

-- URL slug lookup
CREATE UNIQUE INDEX kb_articles_slug_key ON kb_articles(slug);

-- Category filtering
CREATE INDEX idx_kb_articles_category_id ON kb_articles(category_id);

-- Author filtering
CREATE INDEX idx_kb_articles_author_id ON kb_articles(author_id);

-- Publication status
CREATE INDEX idx_kb_articles_status ON kb_articles(status);

-- Published articles (public)
CREATE INDEX idx_kb_articles_published 
  ON kb_articles(category_id, published_at DESC) 
  WHERE status = 'published';

-- Full-text search
CREATE INDEX idx_kb_articles_search 
  ON kb_articles USING GIN(to_tsvector('english', title || ' ' || content));
```

### Notifications Table

```sql
-- Primary key
CREATE UNIQUE INDEX notifications_pkey ON notifications(id);

-- User's notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);

-- Unread filter
CREATE INDEX idx_notifications_read ON notifications(read);

-- Chronological
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- Composite: User's unread notifications
CREATE INDEX idx_notifications_user_unread 
  ON notifications(user_id, created_at DESC) 
  WHERE read = false;
```

### Sessions Table

```sql
-- Primary key
CREATE UNIQUE INDEX sessions_pkey ON sessions(id);

-- Token lookup
CREATE UNIQUE INDEX sessions_refresh_token_key ON sessions(refresh_token);

-- User's sessions
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Cleanup expired
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

---

## Query Patterns & Indexes

### Common Query Patterns

#### 1. Agent Dashboard

```sql
-- Query
SELECT * FROM tickets 
WHERE assigned_to = $1 
  AND status IN ('open', 'pending')
  AND deleted_at IS NULL
ORDER BY priority DESC, created_at ASC;

-- Covered by
CREATE INDEX idx_tickets_agent_dashboard 
  ON tickets(assigned_to, status, priority) 
  WHERE deleted_at IS NULL;
```

#### 2. Ticket Queue (Unassigned)

```sql
-- Query
SELECT * FROM tickets 
WHERE assigned_to IS NULL 
  AND status = 'open'
  AND team_id = $1
  AND deleted_at IS NULL
ORDER BY priority DESC, created_at ASC;

-- Covered by
CREATE INDEX idx_tickets_queue_team 
  ON tickets(team_id, status, priority DESC, created_at) 
  WHERE assigned_to IS NULL AND deleted_at IS NULL;
```

#### 3. SLA Breach Check

```sql
-- Query
SELECT * FROM tickets 
WHERE sla_due_at < NOW()
  AND sla_breached = false
  AND status NOT IN ('resolved', 'closed');

-- Covered by
CREATE INDEX idx_tickets_sla_check 
  ON tickets(sla_due_at) 
  WHERE sla_breached = false 
    AND status NOT IN ('resolved', 'closed');
```

#### 4. Knowledge Base Search

```sql
-- Query
SELECT * FROM kb_articles 
WHERE status = 'published'
  AND to_tsvector('english', title || ' ' || content) @@ plainto_tsquery($1)
ORDER BY ts_rank(...) DESC;

-- Covered by
CREATE INDEX idx_kb_articles_search 
  ON kb_articles USING GIN(to_tsvector('english', title || ' ' || content))
  WHERE status = 'published';
```

---

## Full-Text Search

### Configuration

```sql
-- Create custom text search configuration (optional)
CREATE TEXT SEARCH CONFIGURATION insightdesk (COPY = english);

-- Add custom dictionary for domain terms
ALTER TEXT SEARCH CONFIGURATION insightdesk
  ALTER MAPPING FOR word, asciiword WITH simple, english_stem;
```

### Ticket Search Index

```sql
-- Add search vector column
ALTER TABLE tickets ADD COLUMN search_vector tsvector;

-- Create GIN index
CREATE INDEX idx_tickets_search ON tickets USING GIN(search_vector);

-- Update trigger
CREATE OR REPLACE FUNCTION tickets_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', coalesce(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_search_vector_trigger
  BEFORE INSERT OR UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION tickets_search_vector_update();
```

### Search Query

```typescript
// Prisma raw query for full-text search
const results = await prisma.$queryRaw`
  SELECT id, subject, description,
         ts_rank(search_vector, plainto_tsquery('english', ${query})) as rank
  FROM tickets
  WHERE search_vector @@ plainto_tsquery('english', ${query})
    AND deleted_at IS NULL
  ORDER BY rank DESC
  LIMIT ${limit}
`;
```

---

## Composite Indexes

### Design Principles

1. **Column order matters**: Most selective first for equality, range last
2. **Cover common queries**: Include all columns needed
3. **Avoid redundancy**: Don't duplicate single-column indexes

### Examples

```sql
-- Agent dashboard: assigned_to (equality) + status (equality) + priority (sort)
CREATE INDEX idx_tickets_agent_view 
  ON tickets(assigned_to, status, priority DESC)
  WHERE deleted_at IS NULL;

-- Date range + status
CREATE INDEX idx_tickets_reporting 
  ON tickets(created_at, status)
  WHERE deleted_at IS NULL;

-- Team queue with priority
CREATE INDEX idx_tickets_team_queue 
  ON tickets(team_id, status, priority DESC, created_at)
  WHERE assigned_to IS NULL;
```

---

## Partial Indexes

### When to Use

- Filter out large portions of data
- Frequently queried subset
- Reduce index size

### Examples

```sql
-- Only non-deleted records
CREATE INDEX idx_tickets_active 
  ON tickets(status, priority)
  WHERE deleted_at IS NULL;

-- Only open tickets for SLA monitoring
CREATE INDEX idx_tickets_open_sla 
  ON tickets(sla_due_at)
  WHERE status IN ('open', 'pending') 
    AND sla_due_at IS NOT NULL;

-- Only unread notifications
CREATE INDEX idx_notifications_unread 
  ON notifications(user_id, created_at DESC)
  WHERE read = false;

-- Only published articles
CREATE INDEX idx_kb_published 
  ON kb_articles(category_id, published_at DESC)
  WHERE status = 'published';
```

---

## Index Maintenance

### Monitoring Index Usage

```sql
-- Index usage statistics
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Find unused indexes
SELECT 
  schemaname || '.' || relname AS table,
  indexrelname AS index,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
  idx_scan as index_scans
FROM pg_stat_user_indexes ui
JOIN pg_index i ON ui.indexrelid = i.indexrelid
WHERE NOT indisunique 
  AND idx_scan < 50 
  AND pg_relation_size(relid) > 5 * 8192
ORDER BY pg_relation_size(i.indexrelid) / nullif(idx_scan, 0) DESC NULLS FIRST;
```

### Index Bloat Detection

```sql
-- Check for bloated indexes
SELECT 
  current_database(), 
  nspname, 
  c.relname AS index,
  round(100 * pg_relation_size(indexrelid) / pg_relation_size(indrelid)) / 100 AS index_ratio,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  pg_size_pretty(pg_relation_size(indrelid)) AS table_size
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE pg_relation_size(indrelid) > 0
ORDER BY index_ratio DESC;
```

### Reindexing

```sql
-- Reindex a specific index (blocking)
REINDEX INDEX idx_tickets_status;

-- Reindex concurrently (non-blocking, PostgreSQL 12+)
REINDEX INDEX CONCURRENTLY idx_tickets_status;

-- Reindex entire table
REINDEX TABLE tickets;

-- Scheduled maintenance (add to cron)
-- Weekly: REINDEX INDEX CONCURRENTLY for heavily updated indexes
```

### VACUUM and ANALYZE

```sql
-- Update statistics for query planner
ANALYZE tickets;

-- Reclaim space and update statistics
VACUUM ANALYZE tickets;

-- Full vacuum (blocking, reclaims more space)
VACUUM FULL tickets;
```

---

## Query Analysis

### Using EXPLAIN ANALYZE

```sql
-- Analyze query plan
EXPLAIN ANALYZE
SELECT * FROM tickets 
WHERE assigned_to = 'user-uuid' 
  AND status = 'open'
  AND deleted_at IS NULL
ORDER BY priority DESC, created_at;

-- Look for:
-- ✅ Index Scan / Index Only Scan (good)
-- ⚠️ Bitmap Heap Scan (acceptable)
-- ❌ Seq Scan on large tables (needs index)
```

### Expected Plans

```sql
-- Good: Using our composite index
Index Scan using idx_tickets_agent_dashboard on tickets
  Index Cond: ((assigned_to = 'user-uuid'::uuid) AND (status = 'open'))
  Filter: (deleted_at IS NULL)

-- Bad: Sequential scan
Seq Scan on tickets
  Filter: ((assigned_to = 'user-uuid'::uuid) AND ...)
```

---

## Related Documents

- [Schema Details](./schema.md) — Table definitions
- [Migrations](./migrations.md) — Index deployment
- [Performance](../09-performance/database.md) — Query optimization

---

*Next: [Backup & Recovery →](./backup-recovery.md)*
