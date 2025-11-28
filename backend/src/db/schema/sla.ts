import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './organizations';
import { ticketPriorityEnum } from './tickets';

// ─────────────────────────────────────────────────────────────
// SLA Policies Table
// ─────────────────────────────────────────────────────────────
export const slaPolicies = pgTable(
  'sla_policies',
  {
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
    resolutionTime: integer('resolution_time').notNull(), // Time to resolution

    // Business hours (for future)
    businessHoursOnly: boolean('business_hours_only').notNull().default(true),

    // Default for priority
    isDefault: boolean('is_default').notNull().default(false),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('sla_org_priority_idx').on(table.organizationId, table.priority),
  ]
);

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
    firstResponseTime: 24 * 60, // 24 hours
    resolutionTime: 72 * 60, // 72 hours
  },
  medium: {
    firstResponseTime: 8 * 60, // 8 hours
    resolutionTime: 24 * 60, // 24 hours
  },
  high: {
    firstResponseTime: 4 * 60, // 4 hours
    resolutionTime: 8 * 60, // 8 hours
  },
  urgent: {
    firstResponseTime: 60, // 1 hour
    resolutionTime: 4 * 60, // 4 hours
  },
} as const;
