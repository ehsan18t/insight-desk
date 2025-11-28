import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  index,
  integer,
  boolean,
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
  'open', // New ticket, not yet assigned
  'pending', // Assigned, awaiting response
  'resolved', // Solution provided, awaiting confirmation
  'closed', // Completed
]);

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'low',
  'medium',
  'high',
  'urgent',
]);

export const ticketChannelEnum = pgEnum('ticket_channel', [
  'web', // Customer portal
  'email', // Email integration
  'chat', // Live chat
  'api', // API submission
]);

// ─────────────────────────────────────────────────────────────
// Tickets Table
// ─────────────────────────────────────────────────────────────
export const tickets = pgTable(
  'tickets',
  {
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
    tags: text('tags')
      .array()
      .default(sql`ARRAY[]::text[]`),
    categoryId: uuid('category_id'),

    // Relationships
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id),
    assigneeId: uuid('assignee_id').references(() => users.id),

    // SLA Tracking
    slaDeadline: timestamp('sla_deadline', { withTimezone: true }),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    slaBreached: boolean('sla_breached').notNull().default(false),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
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
  ]
);

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
export type TicketStatus = (typeof ticketStatusEnum.enumValues)[number];
export type TicketPriority = (typeof ticketPriorityEnum.enumValues)[number];
export type TicketChannel = (typeof ticketChannelEnum.enumValues)[number];
