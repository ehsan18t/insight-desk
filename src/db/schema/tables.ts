// Database Schema - Tables
// All table definitions without relations to avoid circular imports

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════

export const userRoleEnum = pgEnum("user_role", ["customer", "agent", "admin", "owner"]);

export const ticketStatusEnum = pgEnum("ticket_status", ["open", "pending", "resolved", "closed"]);

export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "medium", "high", "urgent"]);

export const ticketChannelEnum = pgEnum("ticket_channel", ["web", "email", "chat", "api"]);

export const messageTypeEnum = pgEnum("message_type", ["reply", "internal_note", "system"]);

export const activityActionEnum = pgEnum("activity_action", [
  "created",
  "status_changed",
  "priority_changed",
  "assigned",
  "unassigned",
  "tagged",
  "message_added",
  "resolved",
  "closed",
  "reopened",
  "sla_breached",
]);

// ═══════════════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════════════

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    index("users_created_at_idx").on(table.createdAt),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS
// ═══════════════════════════════════════════════════════════════════════════

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

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    settings: jsonb("settings").$type<OrganizationSettings>().default({}),
    plan: text("plan").notNull().default("free"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("org_slug_idx").on(table.slug)],
);

// ═══════════════════════════════════════════════════════════════════════════
// USER ORGANIZATIONS (Many-to-Many with role)
// ═══════════════════════════════════════════════════════════════════════════

export const userOrganizations = pgTable(
  "user_organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull().default("customer"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_org_unique").on(table.userId, table.organizationId),
    index("user_orgs_user_idx").on(table.userId),
    index("user_orgs_org_idx").on(table.organizationId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// TICKETS
// ═══════════════════════════════════════════════════════════════════════════

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketNumber: integer("ticket_number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    priority: ticketPriorityEnum("priority").notNull().default("medium"),
    channel: ticketChannelEnum("channel").notNull().default("web"),
    tags: text("tags").array().default(sql`ARRAY[]::text[]`),
    categoryId: uuid("category_id"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    assigneeId: uuid("assignee_id").references(() => users.id),
    slaDeadline: timestamp("sla_deadline", { withTimezone: true }),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    slaBreached: boolean("sla_breached").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("tickets_org_status_idx").on(table.organizationId, table.status),
    index("tickets_customer_idx").on(table.customerId),
    index("tickets_assignee_idx").on(table.assigneeId),
    index("tickets_sla_deadline_idx").on(table.slaDeadline),
    index("tickets_org_number_idx").on(table.organizationId, table.ticketNumber),
    index("tickets_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.title} || ' ' || ${table.description})`,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// TICKET MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id),
    content: text("content").notNull(),
    type: messageTypeEnum("type").notNull().default("reply"),
    attachments: jsonb("attachments").$type<Attachment[]>().default([]),
    emailMessageId: text("email_message_id"),
    isEdited: boolean("is_edited").notNull().default(false),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_ticket_created_idx").on(table.ticketId, table.createdAt),
    index("messages_email_id_idx").on(table.emailMessageId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// TICKET ACTIVITIES (Audit Log)
// ═══════════════════════════════════════════════════════════════════════════

export interface ActivityMetadata {
  fromStatus?: string;
  toStatus?: string;
  fromPriority?: string;
  toPriority?: string;
  assigneeId?: string;
  assigneeName?: string;
  previousAssignee?: string | null;
  addedTags?: string[];
  removedTags?: string[];
  slaDeadline?: string;
  reason?: string;
  messageType?: string;
}

export const ticketActivities = pgTable(
  "ticket_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    action: activityActionEnum("action").notNull(),
    metadata: jsonb("metadata").$type<ActivityMetadata>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("activities_ticket_idx").on(table.ticketId, table.createdAt)],
);

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    parentId: uuid("parent_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("categories_org_idx").on(table.organizationId),
    index("categories_parent_idx").on(table.parentId),
    uniqueIndex("categories_org_name_unique").on(table.organizationId, table.name),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// TAGS
// ═══════════════════════════════════════════════════════════════════════════

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tags_org_idx").on(table.organizationId),
    uniqueIndex("tags_org_name_unique").on(table.organizationId, table.name),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// SLA POLICIES
// ═══════════════════════════════════════════════════════════════════════════

export const slaPolicies = pgTable(
  "sla_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priority: ticketPriorityEnum("priority").notNull(),
    firstResponseTime: integer("first_response_time").notNull(),
    resolutionTime: integer("resolution_time").notNull(),
    businessHoursOnly: boolean("business_hours_only").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sla_org_priority_idx").on(table.organizationId, table.priority)],
);

export const DEFAULT_SLA_TIMES = {
  low: { firstResponseTime: 24 * 60, resolutionTime: 72 * 60 },
  medium: { firstResponseTime: 8 * 60, resolutionTime: 24 * 60 },
  high: { firstResponseTime: 4 * 60, resolutionTime: 8 * 60 },
  urgent: { firstResponseTime: 60, resolutionTime: 4 * 60 },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// CANNED RESPONSES
// ═══════════════════════════════════════════════════════════════════════════

export const cannedResponses = pgTable(
  "canned_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    shortcut: text("shortcut"),
    category: text("category"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("canned_org_idx").on(table.organizationId),
    index("canned_shortcut_idx").on(table.organizationId, table.shortcut),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// BETTER AUTH: SESSIONS
// ═══════════════════════════════════════════════════════════════════════════

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_token_idx").on(table.token),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// BETTER AUTH: ACCOUNTS (OAuth)
// ═══════════════════════════════════════════════════════════════════════════

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("accounts_user_idx").on(table.userId),
    index("accounts_provider_idx").on(table.providerId, table.accountId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// BETTER AUTH: VERIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);
