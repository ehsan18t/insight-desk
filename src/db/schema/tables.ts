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
// PG18 HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UUIDv7 default for new tables (PostgreSQL 18+)
 * UUIDv7 provides time-sorted IDs with better index locality and insert performance.
 * Use this for NEW tables only - do not change existing tables.
 *
 * Usage: id: uuid("id").primaryKey().default(uuidv7Default)
 */
export const uuidv7Default = sql`uuidv7()`;

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
    // PG18: Additional indexes for dashboard and reporting queries
    index("tickets_org_priority_idx").on(table.organizationId, table.priority),
    index("tickets_org_created_idx").on(table.organizationId, table.createdAt),
    // Partial index for SLA breach checks on active tickets only
    index("tickets_sla_active_idx")
      .on(table.slaDeadline, table.slaBreached)
      .where(sql`status IN ('open', 'pending') AND sla_breached = false`),
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
  previousAssignee?: string;
  addedTags?: string[];
  removedTags?: string[];
  slaDeadline?: string;
  reason?: string;
  messageType?: string;
  // Merge-related fields
  mergedInto?: string;
  mergedFrom?: string;
  primaryTicketNumber?: number;
  secondaryTicketNumber?: number;
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

// ═══════════════════════════════════════════════════════════════════════════
// ATTACHMENTS
// ═══════════════════════════════════════════════════════════════════════════

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => ticketMessages.id, { onDelete: "set null" }),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    filename: text("filename").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    path: text("path").notNull(), // Storage path
    folder: text("folder").notNull().default("general"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attachments_org_idx").on(table.orgId),
    index("attachments_ticket_idx").on(table.ticketId),
    index("attachments_message_idx").on(table.messageId),
    index("attachments_uploaded_by_idx").on(table.uploadedById),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATION INVITATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "expired",
  "cancelled",
]);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull().default("agent"),
    token: text("token").notNull().unique(),
    status: inviteStatusEnum("status").notNull().default("pending"),
    invitedById: uuid("invited_by_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedById: uuid("accepted_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invitations_org_idx").on(table.orgId),
    index("invitations_email_idx").on(table.email),
    index("invitations_token_idx").on(table.token),
    index("invitations_status_idx").on(table.status),
    // Partial index for pending invitations - most common lookup pattern
    index("invitations_pending_idx")
      .on(table.orgId, table.email)
      .where(sql`status = 'pending'`),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// SAVED FILTERS
// ═══════════════════════════════════════════════════════════════════════════

export interface SavedFilterCriteria {
  status?: string[];
  priority?: string[];
  assigneeId?: string | null;
  customerId?: string;
  tags?: string[];
  categoryId?: string;
  search?: string;
  dateRange?: {
    field: "createdAt" | "updatedAt" | "resolvedAt" | "closedAt";
    from?: string;
    to?: string;
  };
}

export const savedFilters = pgTable(
  "saved_filters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    criteria: jsonb("criteria").$type<SavedFilterCriteria>().notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    isShared: boolean("is_shared").notNull().default(false), // Visible to team
    sortBy: text("sort_by").notNull().default("createdAt"),
    sortOrder: text("sort_order").notNull().default("desc"),
    color: text("color"), // Optional color for UI
    icon: text("icon"), // Optional icon for UI
    position: integer("position").notNull().default(0), // Order in list
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("saved_filters_org_idx").on(table.organizationId),
    index("saved_filters_user_idx").on(table.userId),
    index("saved_filters_shared_idx").on(table.isShared),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// CSAT SURVEYS
// ═══════════════════════════════════════════════════════════════════════════

export const csatSurveys = pgTable(
  "csat_surveys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => users.id, { onDelete: "set null" }),
    // Survey token for anonymous access
    token: text("token").notNull().unique(),
    // Rating 1-5 (1=Very Unsatisfied, 5=Very Satisfied)
    rating: integer("rating"),
    // Optional feedback text
    feedback: text("feedback"),
    // Timestamps
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("csat_org_idx").on(table.organizationId),
    index("csat_ticket_idx").on(table.ticketId),
    index("csat_customer_idx").on(table.customerId),
    index("csat_agent_idx").on(table.agentId),
    index("csat_token_idx").on(table.token),
    index("csat_rating_idx").on(table.rating),
    // Index for querying responded vs pending surveys
    index("csat_responded_idx").on(table.respondedAt),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION SYSTEM ENUMS
// ═══════════════════════════════════════════════════════════════════════════

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
]);

export const billingIntervalEnum = pgEnum("billing_interval", ["monthly", "yearly", "lifetime"]);

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION PLANS
// ═══════════════════════════════════════════════════════════════════════════

export interface PlanLimits {
  ticketsPerMonth: number; // -1 for unlimited
  messagesPerMonth: number; // -1 for unlimited
  storagePerOrgMB: number; // -1 for unlimited
  apiRequestsPerMinute: number; // Rate limit for API requests
  agentsPerOrg: number; // -1 for unlimited
  customersPerOrg: number; // -1 for unlimited
  slaEnabled: boolean;
  customFieldsEnabled: boolean;
  reportingEnabled: boolean;
  apiAccessEnabled: boolean;
  prioritySupport: boolean;
}

export interface PlanFeatures {
  ticketManagement: boolean;
  emailChannel: boolean;
  chatWidget: boolean;
  apiChannel: boolean;
  cannedResponses: boolean;
  tags: boolean;
  categories: boolean;
  fileAttachments: boolean;
  csatSurveys: boolean;
  slaManagement: boolean;
  customFields: boolean;
  analytics: boolean;
  advancedReporting: boolean;
  dataExport: boolean;
  customBranding: boolean;
  singleSignOn: boolean;
  auditLog: boolean;
  multipleWorkspaces: boolean;
}

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    // Pricing
    price: integer("price").notNull().default(0), // Price in cents (0 = free)
    currency: text("currency").notNull().default("USD"),
    billingInterval: billingIntervalEnum("billing_interval").notNull().default("monthly"),
    // Limits and features as JSONB
    limits: jsonb("limits").$type<PlanLimits>().notNull(),
    features: jsonb("features").$type<PlanFeatures>().notNull(),
    // Plan settings
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false), // Auto-assign on org creation
    isVisible: boolean("is_visible").notNull().default(true), // Show in pricing page
    // Alert settings
    alertsEnabled: boolean("alerts_enabled").notNull().default(true),
    alertThreshold: integer("alert_threshold").notNull().default(90), // Alert at X% usage
    // Display order for pricing page
    position: integer("position").notNull().default(0),
    // For external billing integration
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    // Metadata for custom fields
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("plan_slug_idx").on(table.slug),
    index("plan_is_active_idx").on(table.isActive),
    index("plan_is_default_idx").on(table.isDefault),
    index("plan_is_visible_idx").on(table.isVisible),
    index("plan_position_idx").on(table.position),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATION SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const organizationSubscriptions = pgTable(
  "organization_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" })
      .unique(), // One subscription per org
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    // Billing period
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    // Cancel management
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    // External billing (Stripe, etc.)
    externalSubscriptionId: text("external_subscription_id"),
    externalCustomerId: text("external_customer_id"),
    // Previous plan for tracking upgrades/downgrades
    previousPlanId: uuid("previous_plan_id").references(() => subscriptionPlans.id, {
      onDelete: "set null",
    }),
    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_org_idx").on(table.organizationId),
    index("subscription_plan_idx").on(table.planId),
    index("subscription_status_idx").on(table.status),
    index("subscription_period_end_idx").on(table.currentPeriodEnd),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION USAGE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

export const subscriptionUsage = pgTable(
  "subscription_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Period tracking
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    // Usage counters
    ticketsCreated: integer("tickets_created").notNull().default(0),
    messagesCreated: integer("messages_created").notNull().default(0),
    storageUsedMB: integer("storage_used_mb").notNull().default(0),
    apiRequestsCount: integer("api_requests_count").notNull().default(0),
    // Remaining limits (for quick checks)
    ticketsRemaining: integer("tickets_remaining").notNull().default(0),
    messagesRemaining: integer("messages_remaining").notNull().default(0),
    storageRemainingMB: integer("storage_remaining_mb").notNull().default(0),
    // Alert tracking
    ticketAlertSentAt: timestamp("ticket_alert_sent_at", { withTimezone: true }),
    messageAlertSentAt: timestamp("message_alert_sent_at", { withTimezone: true }),
    storageAlertSentAt: timestamp("storage_alert_sent_at", { withTimezone: true }),
    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_org_idx").on(table.organizationId),
    index("usage_period_idx").on(table.periodStart, table.periodEnd),
    // Unique constraint: one usage record per org per period
    uniqueIndex("usage_org_period_idx").on(
      table.organizationId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════════

export const auditActionEnum = pgEnum("audit_action", [
  // Auth actions
  "user_login",
  "user_logout",
  "user_password_changed",
  "user_email_changed",
  // Organization actions
  "organization_created",
  "organization_updated",
  "organization_deleted",
  // Subscription actions
  "subscription_created",
  "subscription_upgraded",
  "subscription_downgraded",
  "subscription_canceled",
  "subscription_renewed",
  // User management
  "user_invited",
  "user_removed",
  "user_role_changed",
  // Settings changes
  "settings_updated",
  "sla_policy_created",
  "sla_policy_updated",
  "sla_policy_deleted",
  // Data export
  "data_exported",
  // API access
  "api_key_created",
  "api_key_revoked",
]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: auditActionEnum("action").notNull(),
    // Target resource
    resourceType: text("resource_type"), // 'user', 'ticket', 'organization', etc.
    resourceId: text("resource_id"),
    // Request context
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Change details
    previousValue: jsonb("previous_value").$type<Record<string, unknown>>(),
    newValue: jsonb("new_value").$type<Record<string, unknown>>(),
    // Additional context
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    // Timestamp
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_org_idx").on(table.organizationId),
    index("audit_user_idx").on(table.userId),
    index("audit_action_idx").on(table.action),
    index("audit_resource_idx").on(table.resourceType, table.resourceId),
    index("audit_created_at_idx").on(table.createdAt),
  ],
);
