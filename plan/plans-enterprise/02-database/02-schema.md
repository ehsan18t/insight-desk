# Database Schema

> Complete Prisma schema definition for InsightDesk

---

## Table of Contents

- [Schema Overview](#schema-overview)
- [Prisma Schema](#prisma-schema)
- [Enums](#enums)
- [Constraints & Indexes](#constraints--indexes)

---

## Schema Overview

This document contains the complete Prisma schema for InsightDesk. The schema is designed with:

- **Soft deletes** for data retention
- **Audit timestamps** on all entities
- **JSONB fields** for flexible data
- **Full-text search** support
- **UUID primary keys** for distributed systems

---

## Prisma Schema

```prisma
// schema.prisma
// InsightDesk Database Schema

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearch", "fullTextIndex"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// ENUMS
// ============================================

enum UserRole {
  user
  agent
  admin
}

enum UserStatus {
  active
  suspended
  pending
}

enum TeamRole {
  agent
  supervisor
  lead
}

enum TicketPriority {
  low
  medium
  high
  urgent
}

enum TicketStatus {
  open
  pending
  resolved
  closed
}

enum TicketChannel {
  web
  email
  chat
  api
}

enum ArticleStatus {
  draft
  review
  published
  archived
}

// ============================================
// IDENTITY & AUTHENTICATION
// ============================================

model User {
  id               String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email            String      @unique @db.VarChar(255)
  name             String      @db.VarChar(100)
  passwordHash     String      @map("password_hash") @db.VarChar(255)
  role             UserRole    @default(user)
  status           UserStatus  @default(active)
  avatarUrl        String?     @map("avatar_url") @db.VarChar(500)
  emailVerifiedAt  DateTime?   @map("email_verified_at") @db.Timestamptz
  lastLoginAt      DateTime?   @map("last_login_at") @db.Timestamptz
  twoFactorEnabled Boolean     @default(false) @map("two_factor_enabled")
  twoFactorSecret  String?     @map("two_factor_secret") @db.VarChar(255)
  createdAt        DateTime    @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime    @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt        DateTime?   @map("deleted_at") @db.Timestamptz

  // Relations
  teamMemberships  TeamMember[]
  createdTickets   Ticket[]           @relation("CreatedTickets")
  assignedTickets  Ticket[]           @relation("AssignedTickets")
  messages         TicketMessage[]
  notes            TicketNote[]
  activities       TicketActivity[]
  articles         KBArticle[]
  automationRules  AutomationRule[]
  notifications    Notification[]
  sessions         Session[]

  @@index([email])
  @@index([role])
  @@index([status])
  @@index([deletedAt])
  @@map("users")
}

model Session {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  refreshToken String   @unique @map("refresh_token") @db.VarChar(500)
  userAgent    String?  @map("user_agent") @db.VarChar(500)
  ipAddress    String?  @map("ip_address") @db.Inet
  expiresAt    DateTime @map("expires_at") @db.Timestamptz
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}

// ============================================
// TEAMS
// ============================================

model Team {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String   @unique @db.VarChar(100)
  description String?  @db.Text
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  members TeamMember[]
  tickets Ticket[]

  @@map("teams")
}

model TeamMember {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  teamId     String   @map("team_id") @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  roleInTeam TeamRole @default(agent) @map("role_in_team")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([teamId])
  @@index([userId])
  @@map("team_members")
}

// ============================================
// TICKETS
// ============================================

model Ticket {
  id              String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketNumber    String         @unique @map("ticket_number") @db.VarChar(20)
  subject         String         @db.VarChar(200)
  description     String         @db.Text
  createdById     String         @map("created_by") @db.Uuid
  assignedToId    String?        @map("assigned_to") @db.Uuid
  teamId          String?        @map("team_id") @db.Uuid
  priority        TicketPriority @default(medium)
  status          TicketStatus   @default(open)
  channel         TicketChannel  @default(web)
  slaPolicyId     String?        @map("sla_policy_id") @db.Uuid
  firstResponseAt DateTime?      @map("first_response_at") @db.Timestamptz
  slaDueAt        DateTime?      @map("sla_due_at") @db.Timestamptz
  slaBreached     Boolean        @default(false) @map("sla_breached")
  resolvedAt      DateTime?      @map("resolved_at") @db.Timestamptz
  closedAt        DateTime?      @map("closed_at") @db.Timestamptz
  autoClosedAt    DateTime?      @map("auto_closed_at") @db.Timestamptz
  tags            Json           @default("[]") @db.JsonB
  customFields    Json           @default("{}") @map("custom_fields") @db.JsonB
  metadata        Json           @default("{}") @db.JsonB
  createdAt       DateTime       @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime       @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt       DateTime?      @map("deleted_at") @db.Timestamptz

  // Relations
  createdBy  User            @relation("CreatedTickets", fields: [createdById], references: [id])
  assignedTo User?           @relation("AssignedTickets", fields: [assignedToId], references: [id])
  team       Team?           @relation(fields: [teamId], references: [id])
  slaPolicy  SLAPolicy?      @relation(fields: [slaPolicyId], references: [id])
  messages   TicketMessage[]
  notes      TicketNote[]
  activities TicketActivity[]

  @@index([ticketNumber])
  @@index([createdById])
  @@index([assignedToId])
  @@index([teamId])
  @@index([status])
  @@index([priority])
  @@index([slaDueAt])
  @@index([createdAt])
  @@index([deletedAt])
  @@map("tickets")
}

model TicketMessage {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId       String   @map("ticket_id") @db.Uuid
  senderId       String   @map("sender_id") @db.Uuid
  message        String   @db.Text
  messageHtml    String?  @map("message_html") @db.Text
  attachmentUrls Json     @default("[]") @map("attachment_urls") @db.JsonB
  isInternal     Boolean  @default(false) @map("is_internal")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  sender User   @relation(fields: [senderId], references: [id])

  @@index([ticketId])
  @@index([senderId])
  @@index([createdAt])
  @@map("ticket_messages")
}

model TicketNote {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId  String   @map("ticket_id") @db.Uuid
  agentId   String   @map("agent_id") @db.Uuid
  message   String   @db.Text
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  agent  User   @relation(fields: [agentId], references: [id])

  @@index([ticketId])
  @@index([agentId])
  @@map("ticket_notes")
}

model TicketActivity {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticketId   String   @map("ticket_id") @db.Uuid
  actorId    String?  @map("actor_id") @db.Uuid
  actionType String   @map("action_type") @db.VarChar(50)
  oldValue   Json?    @map("old_value") @db.JsonB
  newValue   Json?    @map("new_value") @db.JsonB
  metadata   Json     @default("{}") @db.JsonB
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  actor  User?  @relation(fields: [actorId], references: [id])

  @@index([ticketId])
  @@index([actorId])
  @@index([actionType])
  @@index([createdAt])
  @@map("ticket_activities")
}

// ============================================
// KNOWLEDGE BASE
// ============================================

model KBCategory {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String   @db.VarChar(100)
  slug        String   @unique @db.VarChar(100)
  description String?  @db.Text
  parentId    String?  @map("parent_id") @db.Uuid
  icon        String?  @db.VarChar(50)
  order       Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // Self-relation for hierarchy
  parent   KBCategory?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children KBCategory[] @relation("CategoryHierarchy")

  // Relations
  articles KBArticle[]

  @@index([slug])
  @@index([parentId])
  @@map("kb_categories")
}

model KBArticle {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title           String        @db.VarChar(200)
  slug            String        @unique @db.VarChar(200)
  content         String        @db.Text
  contentHtml     String?       @map("content_html") @db.Text
  excerpt         String?       @db.VarChar(500)
  categoryId      String        @map("category_id") @db.Uuid
  authorId        String        @map("author_id") @db.Uuid
  status          ArticleStatus @default(draft)
  publishedAt     DateTime?     @map("published_at") @db.Timestamptz
  views           Int           @default(0)
  helpfulCount    Int           @default(0) @map("helpful_count")
  notHelpfulCount Int           @default(0) @map("not_helpful_count")
  createdAt       DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  category KBCategory @relation(fields: [categoryId], references: [id])
  author   User       @relation(fields: [authorId], references: [id])

  @@index([slug])
  @@index([categoryId])
  @@index([authorId])
  @@index([status])
  @@index([publishedAt])
  @@map("kb_articles")
}

// ============================================
// SLA & AUTOMATION
// ============================================

model SLAPolicy {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name                String   @db.VarChar(100)
  description         String?  @db.Text
  firstResponseTime   Int      @map("first_response_time") // minutes
  resolutionTime      Int      @map("resolution_time") // minutes
  businessHoursOnly   Boolean  @default(true) @map("business_hours_only")
  businessHours       Json?    @map("business_hours") @db.JsonB
  escalationRules     Json     @default("[]") @map("escalation_rules") @db.JsonB
  priorityMultipliers Json     @default("{}") @map("priority_multipliers") @db.JsonB
  isDefault           Boolean  @default(false) @map("is_default")
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  tickets Ticket[]

  @@map("sla_policies")
}

model AutomationRule {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name            String    @db.VarChar(100)
  description     String?   @db.Text
  trigger         String    @db.VarChar(50)
  conditions      Json      @db.JsonB
  actions         Json      @db.JsonB
  priority        Int       @default(0)
  enabled         Boolean   @default(true)
  lastTriggeredAt DateTime? @map("last_triggered_at") @db.Timestamptz
  triggerCount    Int       @default(0) @map("trigger_count")
  createdById     String    @map("created_by") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  createdBy User @relation(fields: [createdById], references: [id])

  @@index([trigger])
  @@index([enabled])
  @@map("automation_rules")
}

// ============================================
// NOTIFICATIONS
// ============================================

model Notification {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  type      String    @db.VarChar(50)
  title     String    @db.VarChar(200)
  message   String    @db.Text
  data      Json      @default("{}") @db.JsonB
  read      Boolean   @default(false)
  readAt    DateTime? @map("read_at") @db.Timestamptz
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([read])
  @@index([createdAt])
  @@map("notifications")
}

// ============================================
// ANALYTICS (Pre-aggregated)
// ============================================

model DailyTicketMetrics {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  date                DateTime @db.Date
  teamId              String?  @map("team_id") @db.Uuid
  ticketsCreated      Int      @default(0) @map("tickets_created")
  ticketsResolved     Int      @default(0) @map("tickets_resolved")
  ticketsClosed       Int      @default(0) @map("tickets_closed")
  avgFirstResponseMin Float?   @map("avg_first_response_min")
  avgResolutionMin    Float?   @map("avg_resolution_min")
  slaBreaches         Int      @default(0) @map("sla_breaches")
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@unique([date, teamId])
  @@index([date])
  @@index([teamId])
  @@map("daily_ticket_metrics")
}

model AgentPerformance {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  date                DateTime @db.Date
  agentId             String   @map("agent_id") @db.Uuid
  ticketsHandled      Int      @default(0) @map("tickets_handled")
  ticketsResolved     Int      @default(0) @map("tickets_resolved")
  avgResponseTimeMin  Float?   @map("avg_response_time_min")
  avgResolutionTimeMin Float?  @map("avg_resolution_time_min")
  customerSatisfaction Float?  @map("customer_satisfaction")
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@unique([date, agentId])
  @@index([date])
  @@index([agentId])
  @@map("agent_performance")
}
```

---

## Enums

### User Enums

| Enum | Values | Description |
|------|--------|-------------|
| `UserRole` | user, agent, admin | System access level |
| `UserStatus` | active, suspended, pending | Account status |
| `TeamRole` | agent, supervisor, lead | Role within team |

### Ticket Enums

| Enum | Values | Description |
|------|--------|-------------|
| `TicketPriority` | low, medium, high, urgent | Issue urgency |
| `TicketStatus` | open, pending, resolved, closed | Ticket lifecycle |
| `TicketChannel` | web, email, chat, api | Ticket source |

### Article Enums

| Enum | Values | Description |
|------|--------|-------------|
| `ArticleStatus` | draft, review, published, archived | Publication workflow |

---

## Constraints & Indexes

### Unique Constraints

| Table | Columns | Purpose |
|-------|---------|---------|
| users | email | Unique login |
| sessions | refresh_token | Token lookup |
| teams | name | Unique team names |
| team_members | (team_id, user_id) | One membership per team |
| tickets | ticket_number | Human-readable IDs |
| kb_categories | slug | URL-friendly paths |
| kb_articles | slug | URL-friendly paths |
| daily_ticket_metrics | (date, team_id) | One record per day/team |
| agent_performance | (date, agent_id) | One record per day/agent |

### Performance Indexes

See [Indexing Strategy](./indexing.md) for detailed index analysis.

---

## Related Documents

- [ERD Overview](./erd.md) — Entity relationships
- [Migrations](./migrations.md) — Migration strategy
- [Indexing](./indexing.md) — Index optimization
- [Backup & Recovery](./backup-recovery.md) — Data protection

---

*Next: [Migrations Strategy →](./migrations.md)*
