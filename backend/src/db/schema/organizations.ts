import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  boolean,
  uniqueIndex,
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
export const organizations = pgTable(
  'organizations',
  {
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('org_slug_idx').on(table.slug)]
);

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
