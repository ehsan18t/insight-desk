import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './organizations';
import { users } from './users';

// ─────────────────────────────────────────────────────────────
// Canned Responses Table
// ─────────────────────────────────────────────────────────────
export const cannedResponses = pgTable(
  'canned_responses',
  {
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
    createdById: uuid('created_by_id').references(() => users.id),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('canned_org_idx').on(table.organizationId),
    index('canned_shortcut_idx').on(table.organizationId, table.shortcut),
  ]
);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const cannedResponsesRelations = relations(
  cannedResponses,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [cannedResponses.organizationId],
      references: [organizations.id],
    }),
    createdBy: one(users, {
      fields: [cannedResponses.createdById],
      references: [users.id],
    }),
  })
);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type CannedResponse = typeof cannedResponses.$inferSelect;
export type NewCannedResponse = typeof cannedResponses.$inferInsert;
