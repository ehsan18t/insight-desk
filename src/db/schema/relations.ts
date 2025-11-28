// Database Schema - Relations
// All Drizzle ORM relations defined separately to avoid circular imports

import { relations } from "drizzle-orm";
import {
  accounts,
  cannedResponses,
  categories,
  organizations,
  sessions,
  slaPolicies,
  tags,
  ticketActivities,
  ticketMessages,
  tickets,
  userOrganizations,
  users,
} from "./tables";

// ═══════════════════════════════════════════════════════════════════════════
// USER RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  organizations: many(userOrganizations),
  customerTickets: many(tickets, { relationName: "customer_tickets" }),
  assignedTickets: many(tickets, { relationName: "assigned_tickets" }),
  messages: many(ticketMessages),
  activities: many(ticketActivities),
  sessions: many(sessions),
  accounts: many(accounts),
}));

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATION RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(userOrganizations),
  tickets: many(tickets),
  slaPolicies: many(slaPolicies),
  cannedResponses: many(cannedResponses),
  categories: many(categories),
  tags: many(tags),
}));

// ═══════════════════════════════════════════════════════════════════════════
// USER ORGANIZATIONS RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// TICKET RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tickets.organizationId],
    references: [organizations.id],
  }),
  customer: one(users, {
    fields: [tickets.customerId],
    references: [users.id],
    relationName: "customer_tickets",
  }),
  assignee: one(users, {
    fields: [tickets.assigneeId],
    references: [users.id],
    relationName: "assigned_tickets",
  }),
  category: one(categories, {
    fields: [tickets.categoryId],
    references: [categories.id],
  }),
  messages: many(ticketMessages),
  activities: many(ticketActivities),
}));

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// SLA POLICY RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const slaPoliciesRelations = relations(slaPolicies, ({ one }) => ({
  organization: one(organizations, {
    fields: [slaPolicies.organizationId],
    references: [organizations.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [categories.organizationId],
    references: [organizations.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "parent_category",
  }),
  children: many(categories, { relationName: "parent_category" }),
  tickets: many(tickets),
}));

// ═══════════════════════════════════════════════════════════════════════════
// TAG RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const tagsRelations = relations(tags, ({ one }) => ({
  organization: one(organizations, {
    fields: [tags.organizationId],
    references: [organizations.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// CANNED RESPONSE RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// SESSION RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));
