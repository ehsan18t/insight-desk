# Entity Relationship Diagram

> Database entity relationships for InsightDesk

---

## Table of Contents

- [ERD Overview](#erd-overview)
- [Core Entities](#core-entities)
- [Relationship Map](#relationship-map)
- [Entity Details](#entity-details)

---

## ERD Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           INSIGHTDESK ERD                                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│     Users       │         │     Teams       │         │   TeamMembers   │
├─────────────────┤         ├─────────────────┤         ├─────────────────┤
│ id (PK)         │◄───────┐│ id (PK)         │◄───────┐│ id (PK)         │
│ email           │        ││ name            │        ││ team_id (FK)────┼─────┘
│ name            │        ││ description     │        ││ user_id (FK)────┼──────┐
│ password_hash   │        ││ created_at      │        ││ role_in_team    │      │
│ role            │        ││ updated_at      │        ││ created_at      │      │
│ status          │        │└─────────────────┘        │└─────────────────┘      │
│ avatar_url      │        │                           │                         │
│ created_at      │◄───────┼───────────────────────────┼─────────────────────────┘
│ updated_at      │        │
│ deleted_at      │        │
└────────┬────────┘        │
         │                 │
         │                 │
         │   ┌─────────────┼──────────────────────────────────────────────────────┐
         │   │             │                                                       │
         ▼   ▼             │                                                       │
┌─────────────────┐        │         ┌─────────────────┐                          │
│    Tickets      │        │         │  TicketMessages │                          │
├─────────────────┤        │         ├─────────────────┤                          │
│ id (PK)         │◄───────┼─────────┤ id (PK)         │                          │
│ subject         │        │         │ ticket_id (FK)──┼──────────────────────────┘
│ description     │        │         │ sender_id (FK)──┼───────────────────────┐
│ created_by (FK)─┼────────┘         │ message         │                       │
│ assigned_to(FK)─┼──────────────────┤ attachment_url  │                       │
│ team_id (FK)    │                  │ is_internal     │                       │
│ priority        │                  │ created_at      │                       │
│ status          │                  │ updated_at      │                       │
│ channel         │                  └─────────────────┘                       │
│ sla_policy_id   │                                                            │
│ first_response  │         ┌─────────────────┐                                │
│ sla_due_at      │         │   TicketNotes   │                                │
│ resolved_at     │         ├─────────────────┤                                │
│ closed_at       │◄────────┤ id (PK)         │                                │
│ auto_closed_at  │         │ ticket_id (FK)──┼────────────────────────────────┤
│ tags            │         │ agent_id (FK)───┼────────────────────────────────┤
│ custom_fields   │         │ message         │                                │
│ created_at      │         │ created_at      │                                │
│ updated_at      │         └─────────────────┘                                │
│ deleted_at      │                                                            │
└────────┬────────┘         ┌─────────────────┐                                │
         │                  │TicketActivity   │                                │
         │                  ├─────────────────┤                                │
         └─────────────────►│ id (PK)         │                                │
                            │ ticket_id (FK)  │                                │
                            │ actor_id (FK)───┼────────────────────────────────┤
                            │ action_type     │                                │
                            │ old_value       │                                │
                            │ new_value       │                                │
                            │ metadata        │                                │
                            │ created_at      │                                │
                            └─────────────────┘                                │
                                                                               │
┌─────────────────┐         ┌─────────────────┐                                │
│   KB Category   │         │   KB Articles   │                                │
├─────────────────┤         ├─────────────────┤                                │
│ id (PK)         │◄────────┤ id (PK)         │                                │
│ name            │         │ title           │                                │
│ slug            │         │ slug            │                                │
│ description     │         │ content         │                                │
│ parent_id (FK)  │         │ excerpt         │                                │
│ order           │         │ category_id(FK) │                                │
│ created_at      │         │ author_id (FK)──┼────────────────────────────────┤
│ updated_at      │         │ status          │                                │
└─────────────────┘         │ published_at    │                                │
                            │ views           │                                │
                            │ helpful_count   │                                │
                            │ not_helpful     │                                │
                            │ created_at      │                                │
                            │ updated_at      │                                │
                            └─────────────────┘                                │
                                                                               │
┌─────────────────┐         ┌─────────────────┐                                │
│  SLA Policies   │         │ Notifications   │                                │
├─────────────────┤         ├─────────────────┤                                │
│ id (PK)         │         │ id (PK)         │                                │
│ name            │         │ user_id (FK)────┼────────────────────────────────┘
│ description     │         │ type            │
│ first_response  │         │ title           │
│ resolution_time │         │ message         │
│ business_hours  │         │ data            │
│ escalation      │         │ read            │
│ priority_rules  │         │ read_at         │
│ is_default      │         │ created_at      │
│ created_at      │         └─────────────────┘
│ updated_at      │
└─────────────────┘         ┌─────────────────┐
                            │AutomationRules  │
┌─────────────────┐         ├─────────────────┤
│ Sessions        │         │ id (PK)         │
├─────────────────┤         │ name            │
│ id (PK)         │         │ description     │
│ user_id (FK)    │         │ trigger         │
│ token           │         │ conditions      │
│ user_agent      │         │ actions         │
│ ip_address      │         │ priority        │
│ expires_at      │         │ enabled         │
│ created_at      │         │ last_triggered  │
└─────────────────┘         │ trigger_count   │
                            │ created_by      │
                            │ created_at      │
                            │ updated_at      │
                            └─────────────────┘
```

---

## Core Entities

### Entity Categories

| Category | Entities | Purpose |
|----------|----------|---------|
| **Identity** | Users, Sessions, Teams, TeamMembers | User management & authentication |
| **Ticketing** | Tickets, TicketMessages, TicketNotes, TicketActivity | Core support workflow |
| **Knowledge** | KBCategories, KBArticles | Self-service knowledge base |
| **Automation** | SLAPolicies, AutomationRules | Workflow automation |
| **Communication** | Notifications | User notifications |

---

## Relationship Map

### One-to-Many Relationships

| Parent | Child | Relationship |
|--------|-------|--------------|
| Users | Tickets (created_by) | A user creates many tickets |
| Users | Tickets (assigned_to) | An agent is assigned to many tickets |
| Users | TicketMessages | A user sends many messages |
| Users | TicketNotes | An agent creates many notes |
| Users | Sessions | A user has many sessions |
| Users | Notifications | A user receives many notifications |
| Teams | Tickets | A team handles many tickets |
| Tickets | TicketMessages | A ticket has many messages |
| Tickets | TicketNotes | A ticket has many internal notes |
| Tickets | TicketActivity | A ticket has many activity logs |
| KBCategories | KBArticles | A category contains many articles |
| KBCategories | KBCategories | A category has many sub-categories |

### Many-to-Many Relationships

| Entity A | Entity B | Junction Table |
|----------|----------|----------------|
| Users | Teams | TeamMembers |
| Tickets | Tags | TicketTags (implicit via JSONB) |

---

## Entity Details

### Users

Central identity entity for all user types.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| name | VARCHAR(100) | NOT NULL | Display name |
| password_hash | VARCHAR(255) | NOT NULL | Argon2id hash |
| role | ENUM | NOT NULL, DEFAULT 'user' | user, agent, admin |
| status | ENUM | NOT NULL, DEFAULT 'active' | active, suspended, pending |
| avatar_url | VARCHAR(500) | NULL | Profile image URL |
| email_verified_at | TIMESTAMPTZ | NULL | Email verification timestamp |
| last_login_at | TIMESTAMPTZ | NULL | Last successful login |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |
| deleted_at | TIMESTAMPTZ | NULL | Soft delete timestamp |

### Teams

Agent organizational units.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| name | VARCHAR(100) | NOT NULL, UNIQUE | Team name |
| description | TEXT | NULL | Team description |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL | Last update timestamp |

### TeamMembers

Junction table for team membership.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| team_id | UUID | FK → Teams, NOT NULL | Team reference |
| user_id | UUID | FK → Users, NOT NULL | User reference |
| role_in_team | ENUM | NOT NULL | agent, supervisor, lead |
| created_at | TIMESTAMPTZ | NOT NULL | Join timestamp |

**Unique Constraint:** (team_id, user_id)

### Tickets

Core ticketing entity.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| ticket_number | VARCHAR(20) | UNIQUE, NOT NULL | Human-readable ID (e.g., TKT-00001) |
| subject | VARCHAR(200) | NOT NULL | Ticket subject |
| description | TEXT | NOT NULL | Initial description |
| created_by | UUID | FK → Users, NOT NULL | Ticket creator |
| assigned_to | UUID | FK → Users, NULL | Assigned agent |
| team_id | UUID | FK → Teams, NULL | Assigned team |
| priority | ENUM | NOT NULL, DEFAULT 'medium' | low, medium, high, urgent |
| status | ENUM | NOT NULL, DEFAULT 'open' | open, pending, resolved, closed |
| channel | ENUM | NOT NULL, DEFAULT 'web' | web, email, chat, api |
| sla_policy_id | UUID | FK → SLAPolicies, NULL | Applied SLA policy |
| first_response_at | TIMESTAMPTZ | NULL | First agent response time |
| sla_due_at | TIMESTAMPTZ | NULL | SLA deadline |
| sla_breached | BOOLEAN | DEFAULT FALSE | SLA breach flag |
| resolved_at | TIMESTAMPTZ | NULL | Resolution timestamp |
| closed_at | TIMESTAMPTZ | NULL | Close timestamp |
| auto_closed_at | TIMESTAMPTZ | NULL | Auto-close timestamp |
| tags | JSONB | DEFAULT '[]' | Tag array |
| custom_fields | JSONB | DEFAULT '{}' | Custom field values |
| metadata | JSONB | DEFAULT '{}' | Additional metadata |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL | Last update timestamp |
| deleted_at | TIMESTAMPTZ | NULL | Soft delete timestamp |

### TicketMessages

Public messages in ticket threads.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| ticket_id | UUID | FK → Tickets, NOT NULL | Parent ticket |
| sender_id | UUID | FK → Users, NOT NULL | Message author |
| message | TEXT | NOT NULL | Message content |
| message_html | TEXT | NULL | Rendered HTML |
| attachment_urls | JSONB | DEFAULT '[]' | Attachment URLs array |
| is_internal | BOOLEAN | DEFAULT FALSE | Internal-only flag |
| created_at | TIMESTAMPTZ | NOT NULL | Send timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL | Edit timestamp |

### TicketNotes

Private agent-only notes.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| ticket_id | UUID | FK → Tickets, NOT NULL | Parent ticket |
| agent_id | UUID | FK → Users, NOT NULL | Note author |
| message | TEXT | NOT NULL | Note content |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |

### TicketActivity

Audit log for ticket changes.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| ticket_id | UUID | FK → Tickets, NOT NULL | Parent ticket |
| actor_id | UUID | FK → Users, NULL | User who made change (NULL for system) |
| action_type | VARCHAR(50) | NOT NULL | Action type code |
| old_value | JSONB | NULL | Previous value |
| new_value | JSONB | NULL | New value |
| metadata | JSONB | DEFAULT '{}' | Additional context |
| created_at | TIMESTAMPTZ | NOT NULL | Action timestamp |

**Action Types:**
- `status_change`
- `priority_change`
- `assignment_change`
- `team_change`
- `sla_applied`
- `sla_breached`
- `tag_added`
- `tag_removed`
- `merged`
- `reopened`

### KBCategories

Knowledge base category hierarchy.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| name | VARCHAR(100) | NOT NULL | Category name |
| slug | VARCHAR(100) | UNIQUE, NOT NULL | URL-friendly slug |
| description | TEXT | NULL | Category description |
| parent_id | UUID | FK → KBCategories, NULL | Parent category |
| icon | VARCHAR(50) | NULL | Icon identifier |
| order | INTEGER | DEFAULT 0 | Display order |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL | Last update timestamp |

### KBArticles

Knowledge base articles.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| title | VARCHAR(200) | NOT NULL | Article title |
| slug | VARCHAR(200) | UNIQUE, NOT NULL | URL-friendly slug |
| content | TEXT | NOT NULL | Article content (Markdown) |
| content_html | TEXT | NULL | Rendered HTML |
| excerpt | VARCHAR(500) | NULL | Short description |
| category_id | UUID | FK → KBCategories, NOT NULL | Parent category |
| author_id | UUID | FK → Users, NOT NULL | Article author |
| status | ENUM | NOT NULL, DEFAULT 'draft' | draft, review, published, archived |
| published_at | TIMESTAMPTZ | NULL | Publication timestamp |
| views | INTEGER | DEFAULT 0 | View count |
| helpful_count | INTEGER | DEFAULT 0 | Helpful votes |
| not_helpful_count | INTEGER | DEFAULT 0 | Not helpful votes |
| search_vector | TSVECTOR | NULL | Full-text search vector |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL | Last update timestamp |

### SLAPolicies

SLA configuration.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| name | VARCHAR(100) | NOT NULL | Policy name |
| description | TEXT | NULL | Policy description |
| first_response_time | INTEGER | NOT NULL | Minutes to first response |
| resolution_time | INTEGER | NOT NULL | Minutes to resolution |
| business_hours_only | BOOLEAN | DEFAULT TRUE | Apply during business hours only |
| business_hours | JSONB | NULL | Business hours config |
| escalation_rules | JSONB | DEFAULT '[]' | Escalation configuration |
| priority_multipliers | JSONB | DEFAULT '{}' | Priority-based time adjustments |
| is_default | BOOLEAN | DEFAULT FALSE | Default policy flag |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL | Last update timestamp |

### AutomationRules

Workflow automation configuration.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| name | VARCHAR(100) | NOT NULL | Rule name |
| description | TEXT | NULL | Rule description |
| trigger | VARCHAR(50) | NOT NULL | Trigger event |
| conditions | JSONB | NOT NULL | Condition tree |
| actions | JSONB | NOT NULL | Action list |
| priority | INTEGER | DEFAULT 0 | Execution priority |
| enabled | BOOLEAN | DEFAULT TRUE | Active flag |
| last_triggered_at | TIMESTAMPTZ | NULL | Last execution |
| trigger_count | INTEGER | DEFAULT 0 | Execution count |
| created_by | UUID | FK → Users, NOT NULL | Rule creator |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL | Last update timestamp |

### Notifications

User notifications.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| user_id | UUID | FK → Users, NOT NULL | Recipient user |
| type | VARCHAR(50) | NOT NULL | Notification type |
| title | VARCHAR(200) | NOT NULL | Notification title |
| message | TEXT | NOT NULL | Notification body |
| data | JSONB | DEFAULT '{}' | Additional data |
| read | BOOLEAN | DEFAULT FALSE | Read status |
| read_at | TIMESTAMPTZ | NULL | Read timestamp |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |

### Sessions

User authentication sessions.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| user_id | UUID | FK → Users, NOT NULL | Session owner |
| refresh_token | VARCHAR(500) | UNIQUE, NOT NULL | Refresh token |
| user_agent | VARCHAR(500) | NULL | Browser/client info |
| ip_address | INET | NULL | Client IP |
| expires_at | TIMESTAMPTZ | NOT NULL | Expiration time |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |

---

## Related Documents

- [Schema Details](./schema.md) — Full DDL with constraints
- [Migrations Strategy](./migrations.md) — Migration approach
- [Indexing Strategy](./indexing.md) — Performance indexes
- [Backup & Recovery](./backup-recovery.md) — Data protection

---

*Next: [Schema Details →](./schema.md)*
