import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './organizations';
import { tickets } from './tickets';
import { ticketMessages } from './messages';
import { ticketActivities } from './activities';

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'agent',
  'admin',
  'owner',
]);

// ─────────────────────────────────────────────────────────────
// Users Table
// ─────────────────────────────────────────────────────────────
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Profile
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),

    // Authentication (managed by Better Auth)
    emailVerified: boolean('email_verified').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    // Status
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_created_at_idx').on(table.createdAt),
  ]
);

// ─────────────────────────────────────────────────────────────
// User Organization Membership (Many-to-Many with role)
// ─────────────────────────────────────────────────────────────
export const userOrganizations = pgTable(
  'user_organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull().default('customer'),

    // Timestamps
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique constraint: one role per user per org
    uniqueIndex('user_org_unique').on(table.userId, table.organizationId),
    index('user_orgs_user_idx').on(table.userId),
    index('user_orgs_org_idx').on(table.organizationId),
  ]
);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  organizations: many(userOrganizations),
  customerTickets: many(tickets, { relationName: 'customer_tickets' }),
  assignedTickets: many(tickets, { relationName: 'assigned_tickets' }),
  messages: many(ticketMessages),
  activities: many(ticketActivities),
}));

export const userOrganizationsRelations = relations(
  userOrganizations,
  ({ one }) => ({
    user: one(users, {
      fields: [userOrganizations.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [userOrganizations.organizationId],
      references: [organizations.id],
    }),
  })
);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type UserOrganization = typeof userOrganizations.$inferSelect;
export type NewUserOrganization = typeof userOrganizations.$inferInsert;
