# 04 - Database Design

> **Drizzle ORM schemas, migrations, and database patterns**

---

## 📊 Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   organizations  │       │      users       │       │   user_roles     │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)          │◄──┐   │ id (PK)          │◄──────│ user_id (FK)     │
│ name             │   │   │ email            │       │ role             │
│ slug             │   │   │ name             │       │ organization_id  │
│ settings (JSONB) │   │   │ avatar_url       │       └──────────────────┘
│ created_at       │   │   │ password_hash    │
└──────────────────┘   │   │ email_verified   │
         │             │   │ created_at       │
         │             │   └──────────────────┘
         │             │            │
         │             │            │ customer_id / assignee_id
         │             │            ▼
         │             │   ┌──────────────────┐       ┌──────────────────┐
         │             └───│     tickets      │───────│  ticket_messages │
         │                 ├──────────────────┤       ├──────────────────┤
         └────────────────►│ id (PK)          │◄──────│ ticket_id (FK)   │
                           │ organization_id  │       │ sender_id (FK)   │
                           │ customer_id (FK) │       │ content          │
                           │ assignee_id (FK) │       │ type             │
                           │ title            │       │ attachments      │
                           │ description      │       │ created_at       │
                           │ status           │       └──────────────────┘
                           │ priority         │
                           │ tags             │       ┌──────────────────┐
                           │ sla_deadline     │       │ticket_activities │
                           │ created_at       │       ├──────────────────┤
                           │ resolved_at      │       │ ticket_id (FK)   │
                           └──────────────────┘       │ user_id (FK)     │
                                    │                 │ action           │
                                    │                 │ metadata (JSONB) │
                                    └────────────────►│ created_at       │
                                                      └──────────────────┘

┌──────────────────┐       ┌──────────────────┐
│    sla_policies  │       │  canned_responses│
├──────────────────┤       ├──────────────────┤
│ id (PK)          │       │ id (PK)          │
│ organization_id  │       │ organization_id  │
│ name             │       │ title            │
│ priority         │       │ content          │
│ response_time    │       │ category         │
│ resolution_time  │       │ created_by       │
│ is_default       │       │ created_at       │
└──────────────────┘       └──────────────────┘
```

---

## 🗂️ Schema Files

### Schema Index

```typescript
// backend/src/db/schema/index.ts
export * from './users';
export * from './organizations';
export * from './tickets';
export * from './messages';
export * from './activities';
export * from './sla';
export * from './canned-responses';
```

### Users Schema

```typescript
// backend/src/db/schema/users.ts
import { 
  pgTable, 
  text, 
  timestamp, 
  boolean, 
  uuid,
  pgEnum,
  index,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './organizations';
import { tickets } from './tickets';

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'agent', 
  'admin',
  'owner'
]);

// ─────────────────────────────────────────────────────────────
// Users Table
// ─────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Profile
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  
  // Authentication
  passwordHash: text('password_hash'),
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at'),
  
  // OAuth
  googleId: text('google_id'),
  githubId: text('github_id'),
  
  // Status
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at'),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  // Indexes for common queries
  index('users_email_idx').on(table.email),
  index('users_google_id_idx').on(table.googleId),
  index('users_github_id_idx').on(table.githubId),
]);

// ─────────────────────────────────────────────────────────────
// User Organization Membership (Many-to-Many with role)
// ─────────────────────────────────────────────────────────────
export const userOrganizations = pgTable('user_organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  role: userRoleEnum('role').notNull().default('customer'),
  
  // Timestamps
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
}, (table) => [
  // Unique constraint: one role per user per org
  uniqueIndex('user_org_unique').on(table.userId, table.organizationId),
  index('user_orgs_user_idx').on(table.userId),
  index('user_orgs_org_idx').on(table.organizationId),
]);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  organizations: many(userOrganizations),
  customerTickets: many(tickets, { relationName: 'customer_tickets' }),
  assignedTickets: many(tickets, { relationName: 'assigned_tickets' }),
}));

export const userOrganizationsRelations = relations(userOrganizations, ({ one }) => ({
  user: one(users, {
    fields: [userOrganizations.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userOrganizations.organizationId],
    references: [organizations.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = typeof userRoleEnum.enumValues[number];
```

### Organizations Schema

```typescript
// backend/src/db/schema/organizations.ts
import { 
  pgTable, 
  text, 
  timestamp, 
  uuid,
  jsonb,
  boolean,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { userOrganizations } from './users';
import { tickets } from './tickets';
import { slaPolicies } from './sla';
import { cannedResponses } from './canned-responses';

// ─────────────────────────────────────────────────────────────
// Organization Settings Type
// ─────────────────────────────────────────────────────────────
export interface OrganizationSettings {
  branding?: {
    primaryColor?: string;
    logoUrl?: string;
  };
  notifications?: {
    emailOnNewTicket?: boolean;
    emailOnTicketUpdate?: boolean;
    slackWebhookUrl?: string;
  };
  features?: {
    liveChatEnabled?: boolean;
    customerPortalEnabled?: boolean;
  };
}

// ─────────────────────────────────────────────────────────────
// Organizations Table
// ─────────────────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Identity
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  
  // Settings
  settings: jsonb('settings').$type<OrganizationSettings>().default({}),
  
  // Billing (for future)
  plan: text('plan').notNull().default('free'),
  
  // Status
  isActive: boolean('is_active').notNull().default(true),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('org_slug_idx').on(table.slug),
]);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(userOrganizations),
  tickets: many(tickets),
  slaPolicies: many(slaPolicies),
  cannedResponses: many(cannedResponses),
}));

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
```

### Tickets Schema

```typescript
// backend/src/db/schema/tickets.ts
import { 
  pgTable, 
  text, 
  timestamp, 
  uuid,
  pgEnum,
  index,
  integer
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { organizations } from './organizations';
import { ticketMessages } from './messages';
import { ticketActivities } from './activities';

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────
export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',      // New ticket, not yet assigned
  'pending',   // Assigned, awaiting response
  'resolved',  // Solution provided, awaiting confirmation
  'closed'     // Completed
]);

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'low',
  'medium',
  'high',
  'urgent'
]);

export const ticketChannelEnum = pgEnum('ticket_channel', [
  'web',       // Customer portal
  'email',     // Email integration
  'chat',      // Live chat
  'api'        // API submission
]);

// ─────────────────────────────────────────────────────────────
// Tickets Table
// ─────────────────────────────────────────────────────────────
export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Human-readable ID (per organization)
  ticketNumber: integer('ticket_number').notNull(),
  
  // Content
  title: text('title').notNull(),
  description: text('description').notNull(),
  
  // Status
  status: ticketStatusEnum('status').notNull().default('open'),
  priority: ticketPriorityEnum('priority').notNull().default('medium'),
  channel: ticketChannelEnum('channel').notNull().default('web'),
  
  // Classification
  tags: text('tags').array().default(sql`ARRAY[]::text[]`),
  categoryId: uuid('category_id'),
  
  // Relationships
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => users.id),
  assigneeId: uuid('assignee_id')
    .references(() => users.id),
  
  // SLA Tracking
  slaDeadline: timestamp('sla_deadline'),
  firstResponseAt: timestamp('first_response_at'),
  slaBreached: timestamp('sla_breached'),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
  closedAt: timestamp('closed_at'),
}, (table) => [
  // Composite index for listing tickets by org + status
  index('tickets_org_status_idx').on(table.organizationId, table.status),
  
  // Index for customer's tickets
  index('tickets_customer_idx').on(table.customerId),
  
  // Index for agent's assigned tickets
  index('tickets_assignee_idx').on(table.assigneeId),
  
  // Index for SLA deadline tracking
  index('tickets_sla_deadline_idx').on(table.slaDeadline),
  
  // Unique ticket number per org
  index('tickets_org_number_idx').on(table.organizationId, table.ticketNumber),
  
  // Full-text search on title and description
  index('tickets_search_idx').using(
    'gin',
    sql`to_tsvector('english', ${table.title} || ' ' || ${table.description})`
  ),
]);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tickets.organizationId],
    references: [organizations.id],
  }),
  customer: one(users, {
    fields: [tickets.customerId],
    references: [users.id],
    relationName: 'customer_tickets',
  }),
  assignee: one(users, {
    fields: [tickets.assigneeId],
    references: [users.id],
    relationName: 'assigned_tickets',
  }),
  messages: many(ticketMessages),
  activities: many(ticketActivities),
}));

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type TicketStatus = typeof ticketStatusEnum.enumValues[number];
export type TicketPriority = typeof ticketPriorityEnum.enumValues[number];
```

### Messages Schema

```typescript
// backend/src/db/schema/messages.ts
import { 
  pgTable, 
  text, 
  timestamp, 
  uuid,
  pgEnum,
  jsonb,
  boolean,
  index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tickets } from './tickets';
import { users } from './users';

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────
export const messageTypeEnum = pgEnum('message_type', [
  'reply',          // Customer or agent reply
  'internal_note',  // Agent-only note
  'system'          // Automated system message
]);

// ─────────────────────────────────────────────────────────────
// Attachment Type
// ─────────────────────────────────────────────────────────────
export interface Attachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

// ─────────────────────────────────────────────────────────────
// Ticket Messages Table
// ─────────────────────────────────────────────────────────────
export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relationship
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id')
    .references(() => users.id),
  
  // Content
  content: text('content').notNull(),
  type: messageTypeEnum('type').notNull().default('reply'),
  
  // Attachments
  attachments: jsonb('attachments').$type<Attachment[]>().default([]),
  
  // Email integration
  emailMessageId: text('email_message_id'),
  
  // Edit tracking
  isEdited: boolean('is_edited').notNull().default(false),
  editedAt: timestamp('edited_at'),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  // Messages for a ticket, ordered by time
  index('messages_ticket_created_idx').on(table.ticketId, table.createdAt),
  
  // Find message by email ID (for threading)
  index('messages_email_id_idx').on(table.emailMessageId),
]);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketMessages.ticketId],
    references: [tickets.id],
  }),
  sender: one(users, {
    fields: [ticketMessages.senderId],
    references: [users.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type NewTicketMessage = typeof ticketMessages.$inferInsert;
export type MessageType = typeof messageTypeEnum.enumValues[number];
```

### Activities Schema

```typescript
// backend/src/db/schema/activities.ts
import { 
  pgTable, 
  text, 
  timestamp, 
  uuid,
  pgEnum,
  jsonb,
  index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tickets } from './tickets';
import { users } from './users';

// ─────────────────────────────────────────────────────────────
// Activity Actions
// ─────────────────────────────────────────────────────────────
export const activityActionEnum = pgEnum('activity_action', [
  'created',
  'status_changed',
  'priority_changed',
  'assigned',
  'unassigned',
  'tagged',
  'message_added',
  'resolved',
  'closed',
  'reopened',
  'sla_breached'
]);

// ─────────────────────────────────────────────────────────────
// Activity Metadata Types
// ─────────────────────────────────────────────────────────────
export type ActivityMetadata = {
  // Status change
  fromStatus?: string;
  toStatus?: string;
  
  // Priority change
  fromPriority?: string;
  toPriority?: string;
  
  // Assignment
  assigneeId?: string;
  assigneeName?: string;
  
  // Tags
  addedTags?: string[];
  removedTags?: string[];
  
  // SLA
  slaDeadline?: string;
  
  // Generic
  reason?: string;
};

// ─────────────────────────────────────────────────────────────
// Ticket Activities Table (Audit Log)
// ─────────────────────────────────────────────────────────────
export const ticketActivities = pgTable('ticket_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relationships
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .references(() => users.id),
  
  // Activity details
  action: activityActionEnum('action').notNull(),
  metadata: jsonb('metadata').$type<ActivityMetadata>().default({}),
  
  // Timestamp
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  // Activities for a ticket timeline
  index('activities_ticket_idx').on(table.ticketId, table.createdAt),
]);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const ticketActivitiesRelations = relations(ticketActivities, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketActivities.ticketId],
    references: [tickets.id],
  }),
  user: one(users, {
    fields: [ticketActivities.userId],
    references: [users.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type TicketActivity = typeof ticketActivities.$inferSelect;
export type NewTicketActivity = typeof ticketActivities.$inferInsert;
export type ActivityAction = typeof activityActionEnum.enumValues[number];
```

### SLA Policies Schema

```typescript
// backend/src/db/schema/sla.ts
import { 
  pgTable, 
  text, 
  timestamp, 
  uuid,
  integer,
  boolean,
  index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './organizations';
import { ticketPriorityEnum } from './tickets';

// ─────────────────────────────────────────────────────────────
// SLA Policies Table
// ─────────────────────────────────────────────────────────────
export const slaPolicies = pgTable('sla_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Organization
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  
  // Policy details
  name: text('name').notNull(),
  priority: ticketPriorityEnum('priority').notNull(),
  
  // SLA times in minutes
  firstResponseTime: integer('first_response_time').notNull(), // Time to first agent response
  resolutionTime: integer('resolution_time').notNull(),        // Time to resolution
  
  // Business hours (for future)
  businessHoursOnly: boolean('business_hours_only').notNull().default(true),
  
  // Default for priority
  isDefault: boolean('is_default').notNull().default(false),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('sla_org_priority_idx').on(table.organizationId, table.priority),
]);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const slaPoliciesRelations = relations(slaPolicies, ({ one }) => ({
  organization: one(organizations, {
    fields: [slaPolicies.organizationId],
    references: [organizations.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type SlaPolicy = typeof slaPolicies.$inferSelect;
export type NewSlaPolicy = typeof slaPolicies.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Default SLA Configuration
// ─────────────────────────────────────────────────────────────
export const DEFAULT_SLA_TIMES = {
  low: {
    firstResponseTime: 24 * 60,  // 24 hours
    resolutionTime: 72 * 60,     // 72 hours
  },
  medium: {
    firstResponseTime: 8 * 60,   // 8 hours
    resolutionTime: 24 * 60,     // 24 hours
  },
  high: {
    firstResponseTime: 4 * 60,   // 4 hours
    resolutionTime: 8 * 60,      // 8 hours
  },
  urgent: {
    firstResponseTime: 60,       // 1 hour
    resolutionTime: 4 * 60,      // 4 hours
  },
} as const;
```

### Canned Responses Schema

```typescript
// backend/src/db/schema/canned-responses.ts
import { 
  pgTable, 
  text, 
  timestamp, 
  uuid,
  index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './organizations';
import { users } from './users';

// ─────────────────────────────────────────────────────────────
// Canned Responses Table
// ─────────────────────────────────────────────────────────────
export const cannedResponses = pgTable('canned_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Organization
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  
  // Content
  title: text('title').notNull(),
  content: text('content').notNull(),
  
  // Shortcut (e.g., "/greeting", "/closing")
  shortcut: text('shortcut'),
  
  // Category for grouping
  category: text('category'),
  
  // Creator
  createdById: uuid('created_by_id')
    .references(() => users.id),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('canned_org_idx').on(table.organizationId),
  index('canned_shortcut_idx').on(table.organizationId, table.shortcut),
]);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const cannedResponsesRelations = relations(cannedResponses, ({ one }) => ({
  organization: one(organizations, {
    fields: [cannedResponses.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [cannedResponses.createdById],
    references: [users.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type CannedResponse = typeof cannedResponses.$inferSelect;
export type NewCannedResponse = typeof cannedResponses.$inferInsert;
```

---

## 🔧 Database Client

```typescript
// backend/src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '../config';

// Create postgres connection
const client = postgres(config.databaseUrl, {
  max: 10,              // Maximum connections
  idle_timeout: 20,     // Close idle connections after 20s
  connect_timeout: 10,  // Connection timeout
});

// Create drizzle instance with schema
export const db = drizzle(client, { 
  schema,
  logger: config.env === 'development',
});

// Export for type inference
export type Database = typeof db;
```

---

## 📦 Migrations

### Drizzle Config

```typescript
// backend/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/*',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

### Migration Commands

```bash
# Generate migration from schema changes
bun drizzle-kit generate

# Apply pending migrations
bun drizzle-kit migrate

# Push schema directly (dev only - no migration files)
bun drizzle-kit push

# Open Drizzle Studio (GUI)
bun drizzle-kit studio

# Drop all tables (careful!)
bun drizzle-kit drop
```

### Sample Migration

```sql
-- src/db/migrations/0001_initial.sql
CREATE TYPE "ticket_status" AS ENUM('open', 'pending', 'resolved', 'closed');
CREATE TYPE "ticket_priority" AS ENUM('low', 'medium', 'high', 'urgent');
CREATE TYPE "user_role" AS ENUM('customer', 'agent', 'admin', 'owner');

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "settings" jsonb DEFAULT '{}',
  "plan" text NOT NULL DEFAULT 'free',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "avatar_url" text,
  "password_hash" text,
  "email_verified" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- ... more tables
```

---

## 🔍 Common Query Patterns

### List Tickets with Filters

```typescript
import { eq, and, or, ilike, inArray, desc, sql, gte, lte } from 'drizzle-orm';

async function listTickets(params: {
  organizationId: string;
  status?: TicketStatus[];
  priority?: TicketPriority[];
  assigneeId?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}) {
  const {
    organizationId,
    status,
    priority,
    assigneeId,
    search,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
  } = params;

  // Build conditions array
  const conditions = [eq(tickets.organizationId, organizationId)];

  if (status?.length) {
    conditions.push(inArray(tickets.status, status));
  }

  if (priority?.length) {
    conditions.push(inArray(tickets.priority, priority));
  }

  if (assigneeId) {
    conditions.push(eq(tickets.assigneeId, assigneeId));
  }

  if (search) {
    conditions.push(
      or(
        ilike(tickets.title, `%${search}%`),
        ilike(tickets.description, `%${search}%`)
      )!
    );
  }

  if (dateFrom) {
    conditions.push(gte(tickets.createdAt, dateFrom));
  }

  if (dateTo) {
    conditions.push(lte(tickets.createdAt, dateTo));
  }

  // Execute query with pagination
  const offset = (page - 1) * limit;

  const [data, total] = await Promise.all([
    db.query.tickets.findMany({
      where: and(...conditions),
      orderBy: desc(tickets.createdAt),
      limit,
      offset,
      with: {
        customer: {
          columns: { id: true, name: true, email: true, avatarUrl: true },
        },
        assignee: {
          columns: { id: true, name: true, avatarUrl: true },
        },
      },
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(...conditions))
      .then((r) => r[0].count),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

### Full-Text Search

```typescript
async function searchTickets(organizationId: string, query: string) {
  return db.execute(sql`
    SELECT 
      id,
      ticket_number,
      title,
      status,
      priority,
      created_at,
      ts_rank(
        to_tsvector('english', title || ' ' || description),
        plainto_tsquery('english', ${query})
      ) as rank
    FROM tickets
    WHERE 
      organization_id = ${organizationId}
      AND to_tsvector('english', title || ' ' || description) 
          @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC
    LIMIT 20
  `);
}
```

### Ticket Statistics

```typescript
async function getTicketStats(organizationId: string) {
  const stats = await db
    .select({
      status: tickets.status,
      priority: tickets.priority,
      count: sql<number>`count(*)::int`,
    })
    .from(tickets)
    .where(eq(tickets.organizationId, organizationId))
    .groupBy(tickets.status, tickets.priority);

  // Transform to useful format
  return stats.reduce((acc, { status, priority, count }) => {
    if (!acc[status]) acc[status] = { total: 0, byPriority: {} };
    acc[status].total += count;
    acc[status].byPriority[priority] = count;
    return acc;
  }, {} as Record<string, { total: number; byPriority: Record<string, number> }>);
}
```

### Transaction Example

```typescript
async function assignTicketWithActivity(
  ticketId: string,
  assigneeId: string,
  assignedBy: string
) {
  return db.transaction(async (tx) => {
    // Update ticket
    const [ticket] = await tx
      .update(tickets)
      .set({
        assigneeId,
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Get assignee name
    const assignee = await tx.query.users.findFirst({
      where: eq(users.id, assigneeId),
      columns: { name: true },
    });

    // Create activity log
    await tx.insert(ticketActivities).values({
      ticketId,
      userId: assignedBy,
      action: 'assigned',
      metadata: {
        assigneeId,
        assigneeName: assignee?.name,
      },
    });

    return ticket;
  });
}
```

---

## 🛡️ Database Best Practices

### 1. Always Use Indexes for Filtered Columns

```typescript
// ✅ Index on commonly filtered columns
index('tickets_org_status_idx').on(table.organizationId, table.status)

// ❌ Don't query without index on large tables
// This will be slow on 100k+ rows:
db.query.tickets.findMany({
  where: eq(tickets.someUnindexedColumn, value)
})
```

### 2. Use Transactions for Multi-Step Operations

```typescript
// ✅ Atomic operations
await db.transaction(async (tx) => {
  await tx.update(tickets).set({ status: 'closed' });
  await tx.insert(ticketActivities).values({ action: 'closed' });
});

// ❌ Non-atomic - can leave inconsistent state
await db.update(tickets).set({ status: 'closed' });
await db.insert(ticketActivities).values({ action: 'closed' }); // This might fail
```

### 3. Use Soft Deletes for Important Data

```typescript
// Add to schema
deletedAt: timestamp('deleted_at'),

// Soft delete
await db.update(tickets)
  .set({ deletedAt: new Date() })
  .where(eq(tickets.id, id));

// Query excludes deleted
db.query.tickets.findMany({
  where: isNull(tickets.deletedAt)
})
```

---

## 🔐 Row-Level Security (RLS)

### Overview

InsightDesk uses PostgreSQL Row-Level Security (RLS) for database-level multi-tenant isolation. This provides a defense-in-depth approach where data isolation is enforced at the database level, not just in application code.

### Why RLS?

| Approach | Pros | Cons |
|----------|------|------|
| **Application-level filtering** | Simple, works with any DB | Risk of accidental data leaks |
| **Database-per-tenant** | Complete isolation | Operational complexity, no cross-tenant joins |
| **Schema-per-tenant** | Good isolation | Migration complexity |
| **Row-Level Security** ✅ | DB-enforced isolation, single DB | Requires PostgreSQL, slight performance overhead |

### Implementation

#### 1. RLS Roles (`src/db/schema/rls.ts`)

```typescript
// Application role - used by web app connections
export const appUser = pgRole("app_user");

// Service role - bypasses RLS for background jobs
export const serviceRole = pgRole("service_role", { bypassRLS: true });

// Context helpers for policy conditions
export const currentOrgId = sql`current_setting('app.current_org_id', true)::uuid`;
export const currentUserId = sql`current_setting('app.current_user_id', true)::uuid`;
```

#### 2. Policy Factory Functions

```typescript
// Standard tenant isolation (for tables with organization_id column)
export function createTenantPolicies(tableName: string) {
  return [
    pgPolicy(`${tableName}_tenant_select`, {
      for: "select",
      to: appUser,
      using: sql`organization_id = ${currentOrgId}`,
    }),
    pgPolicy(`${tableName}_tenant_insert`, {
      for: "insert",
      to: appUser,
      withCheck: sql`organization_id = ${currentOrgId}`,
    }),
    // ... update and delete policies
  ];
}
```

#### 3. Schema Integration

```typescript
// In tables.ts
export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  // ... other columns
}, (table) => [
  index("tickets_org_idx").on(table.organizationId),
  // RLS policies
  ...createTenantPolicies("tickets"),
]).enableRLS();
```

### Tables with RLS

| Table | RLS Enabled | Policy Type |
|-------|-------------|-------------|
| organizations | ✅ | Self-access (id = current_org_id) |
| userOrganizations | ✅ | Org + user's own memberships |
| tickets | ✅ | Standard tenant |
| ticketMessages | ✅ | Via ticket subquery |
| ticketActivities | ✅ | Via ticket subquery |
| categories | ✅ | Standard tenant |
| tags | ✅ | Standard tenant |
| slaPolicies | ✅ | Standard tenant |
| cannedResponses | ✅ | Standard tenant |
| attachments | ✅ | Standard tenant (org_id) |
| organizationInvitations | ✅ | Standard tenant (org_id) |
| savedFilters | ✅ | Standard tenant |
| csatSurveys | ✅ | Standard tenant |
| organizationSubscriptions | ✅ | Standard tenant |
| subscriptionUsage | ✅ | Standard tenant |
| auditLogs | ✅ | Standard tenant |

### Global Tables (No RLS)

| Table | Reason |
|-------|--------|
| users | Global user accounts |
| sessions | Auth sessions (better-auth) |
| accounts | OAuth accounts |
| verifications | Email tokens |
| subscriptionPlans | Global catalog |

### Using Tenant Context

#### Web App Requests

```typescript
import { withTenant } from "@/db";

// In route handler
app.get("/api/tickets", authenticate, async (req, res, next) => {
  const tickets = await withTenant(
    { organizationId: req.organizationId, userId: req.user.id },
    async (tx) => {
      return await tx.query.tickets.findMany();
      // RLS automatically filters to current tenant!
    }
  );
  res.json({ success: true, data: tickets });
});
```

#### Background Jobs

```typescript
import { adminDb } from "@/db/admin-db";

// Background jobs use adminDb which bypasses RLS
async function checkSLAViolations() {
  // Returns tickets from ALL organizations
  const overdueTickets = await adminDb
    .select()
    .from(tickets)
    .where(lt(tickets.slaDeadline, new Date()));
  
  // Process each ticket...
}
```

### Migration Setup

After modifying schema with RLS:

```bash
# Generate migration
bun run db:generate

# Apply migration
bun run db:migrate

# Grant permissions to app_user role
psql -d insight_desk -c "
  GRANT USAGE ON SCHEMA public TO app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
"
```

### Security Considerations

1. **Defense in Depth**: RLS is a safety net, not a replacement for application-level checks
2. **Superuser Bypass**: PostgreSQL superuser bypasses RLS - use dedicated app roles in production
3. **SET LOCAL Scope**: Always use `SET LOCAL` (not `SET`) to scope context to transaction
4. **Audit**: Log all cross-tenant operations performed via adminDb

---

## Next Steps

→ Continue to [05-core-features.md](./05-core-features.md) to define the MVP features.
