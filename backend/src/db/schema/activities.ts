import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  jsonb,
  index,
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
  'sla_breached',
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
export const ticketActivities = pgTable(
  'ticket_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Relationships
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),

    // Activity details
    action: activityActionEnum('action').notNull(),
    metadata: jsonb('metadata').$type<ActivityMetadata>().default({}),

    // Timestamp
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Activities for a ticket timeline
    index('activities_ticket_idx').on(table.ticketId, table.createdAt),
  ]
);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const ticketActivitiesRelations = relations(
  ticketActivities,
  ({ one }) => ({
    ticket: one(tickets, {
      fields: [ticketActivities.ticketId],
      references: [tickets.id],
    }),
    user: one(users, {
      fields: [ticketActivities.userId],
      references: [users.id],
    }),
  })
);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type TicketActivity = typeof ticketActivities.$inferSelect;
export type NewTicketActivity = typeof ticketActivities.$inferInsert;
export type ActivityAction = (typeof activityActionEnum.enumValues)[number];
