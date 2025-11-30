/**
 * Drizzle Seed Configuration
 *
 * Auto-generates seed data for all non-auth tables using drizzle-seed.
 * Uses refinements for realistic data generation.
 */

import { reset } from "drizzle-seed";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { logger } from "@/lib/logger";

// Tables to exclude from drizzle-seed (handled manually or by better-auth)
const EXCLUDED_TABLES = ["users", "sessions", "accounts", "verifications"];

// Create a schema object without excluded tables
const seedableSchema = Object.fromEntries(
  Object.entries(schema).filter(
    ([key, value]) =>
      typeof value === "object" &&
      value !== null &&
      "getSQL" in value && // Check if it's a table
      !EXCLUDED_TABLES.includes(key),
  ),
);

/**
 * Seed organizations and return their IDs
 */
export async function seedOrganizations(_userIds: string[], count: number): Promise<string[]> {
  const orgs = [
    { name: "Acme Corporation", slug: "acme-corp", plan: "pro" },
    { name: "TechStart Inc", slug: "techstart", plan: "free" },
    { name: "Global Solutions", slug: "global-solutions", plan: "business" },
    { name: "Innovation Labs", slug: "innovation-labs", plan: "pro" },
    { name: "StartupXYZ", slug: "startup-xyz", plan: "free" },
  ].slice(0, count);

  const inserted = await db
    .insert(schema.organizations)
    .values(
      orgs.map((org) => ({
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        settings: {
          branding: { primaryColor: "#3B82F6" },
          notifications: { emailOnNewTicket: true, emailOnTicketUpdate: true },
          features: { liveChatEnabled: true, customerPortalEnabled: true },
        },
      })),
    )
    .returning({ id: schema.organizations.id });

  logger.info(`Created ${inserted.length} organizations`);
  return inserted.map((o) => o.id);
}

/**
 * Seed user-organization relationships
 */
export async function seedUserOrganizations(userIds: string[], orgIds: string[]): Promise<void> {
  if (userIds.length === 0 || orgIds.length === 0) return;

  const roles: Array<"owner" | "admin" | "agent" | "customer"> = [
    "owner",
    "admin",
    "agent",
    "customer",
    "customer",
  ];

  const memberships = [];

  // First org gets first 4 users
  for (let i = 0; i < Math.min(4, userIds.length); i++) {
    memberships.push({
      userId: userIds[i],
      organizationId: orgIds[0],
      role: roles[i] || "customer",
    });
  }

  // Second org (if exists) gets last user as admin
  if (orgIds.length > 1 && userIds.length > 4) {
    memberships.push({
      userId: userIds[4],
      organizationId: orgIds[1],
      role: "admin" as const,
    });
  }

  await db.insert(schema.userOrganizations).values(memberships);
  logger.info(`Created ${memberships.length} user-organization memberships`);
}

/**
 * Seed categories for organizations
 */
export async function seedCategories(orgIds: string[]): Promise<string[]> {
  const categoryData = [
    { name: "Technical Support", description: "Technical issues and bugs", color: "#EF4444" },
    { name: "Billing", description: "Payment and subscription issues", color: "#F59E0B" },
    { name: "General Inquiry", description: "General questions", color: "#3B82F6" },
    { name: "Feature Request", description: "New feature suggestions", color: "#10B981" },
    { name: "Account Issues", description: "Account-related problems", color: "#8B5CF6" },
    { name: "Documentation", description: "Help with documentation", color: "#EC4899" },
  ];

  const categories = [];
  for (const orgId of orgIds) {
    for (const cat of categoryData) {
      categories.push({ ...cat, organizationId: orgId });
    }
  }

  const inserted = await db
    .insert(schema.categories)
    .values(categories)
    .returning({ id: schema.categories.id });

  logger.info(`Created ${inserted.length} categories`);
  return inserted.map((c) => c.id);
}

/**
 * Seed tags for organizations
 */
export async function seedTags(orgIds: string[]): Promise<string[]> {
  const tagData = [
    { name: "urgent", color: "#EF4444" },
    { name: "bug", color: "#F59E0B" },
    { name: "feature", color: "#10B981" },
    { name: "billing", color: "#3B82F6" },
    { name: "feedback", color: "#8B5CF6" },
    { name: "documentation", color: "#EC4899" },
    { name: "question", color: "#6366F1" },
    { name: "enhancement", color: "#14B8A6" },
    { name: "help-wanted", color: "#F97316" },
    { name: "wontfix", color: "#6B7280" },
  ];

  const tags = [];
  for (const orgId of orgIds) {
    for (const tag of tagData) {
      tags.push({ ...tag, organizationId: orgId });
    }
  }

  const inserted = await db.insert(schema.tags).values(tags).returning({ id: schema.tags.id });

  logger.info(`Created ${inserted.length} tags`);
  return inserted.map((t) => t.id);
}

/**
 * Seed SLA policies for organizations
 */
export async function seedSlaPolicies(orgIds: string[]): Promise<void> {
  const slaPolicies = [];

  for (const orgId of orgIds) {
    slaPolicies.push(
      {
        organizationId: orgId,
        name: "Urgent SLA",
        priority: "urgent" as const,
        firstResponseTime: 60,
        resolutionTime: 240,
        businessHoursOnly: false,
        isDefault: true,
      },
      {
        organizationId: orgId,
        name: "High Priority SLA",
        priority: "high" as const,
        firstResponseTime: 240,
        resolutionTime: 480,
        businessHoursOnly: true,
        isDefault: true,
      },
      {
        organizationId: orgId,
        name: "Medium Priority SLA",
        priority: "medium" as const,
        firstResponseTime: 480,
        resolutionTime: 1440,
        businessHoursOnly: true,
        isDefault: true,
      },
      {
        organizationId: orgId,
        name: "Low Priority SLA",
        priority: "low" as const,
        firstResponseTime: 1440,
        resolutionTime: 4320,
        businessHoursOnly: true,
        isDefault: true,
      },
    );
  }

  await db.insert(schema.slaPolicies).values(slaPolicies);
  logger.info(`Created ${slaPolicies.length} SLA policies`);
}

/**
 * Seed canned responses for organizations
 */
export async function seedCannedResponses(orgIds: string[], userIds: string[]): Promise<void> {
  const responses = [
    {
      title: "Greeting",
      content: "Hello! Thank you for reaching out. How can I help you today?",
      shortcut: "/greet",
      category: "General",
    },
    {
      title: "Closing - Resolved",
      content:
        "I'm glad I could help! If you have any more questions, feel free to reach out. Have a great day!",
      shortcut: "/close",
      category: "General",
    },
    {
      title: "Request More Info",
      content:
        "Could you please provide more details about the issue? This will help us assist you better.",
      shortcut: "/moreinfo",
      category: "General",
    },
    {
      title: "Escalation Notice",
      content:
        "I'm escalating this to our senior team for further review. Someone will get back to you shortly.",
      shortcut: "/escalate",
      category: "General",
    },
    {
      title: "Password Reset",
      content:
        "You can reset your password by clicking the 'Forgot Password' link on the login page. Let me know if you need further assistance.",
      shortcut: "/password",
      category: "Account",
    },
    {
      title: "Billing Inquiry",
      content:
        "For billing questions, please provide your account email and I'll look into this for you.",
      shortcut: "/billing",
      category: "Billing",
    },
    {
      title: "Bug Report Acknowledgment",
      content:
        "Thank you for reporting this issue. Our development team has been notified and will investigate.",
      shortcut: "/bug",
      category: "Technical",
    },
    {
      title: "Feature Request",
      content:
        "Thank you for your suggestion! We've added this to our feature request list for consideration.",
      shortcut: "/feature",
      category: "General",
    },
  ];

  const cannedResponses = [];
  for (const orgId of orgIds) {
    for (const resp of responses) {
      cannedResponses.push({
        ...resp,
        organizationId: orgId,
        createdById: userIds[0], // First user creates them
      });
    }
  }

  await db.insert(schema.cannedResponses).values(cannedResponses);
  logger.info(`Created ${cannedResponses.length} canned responses`);
}

/**
 * Seed subscription plans
 */
export async function seedSubscriptionPlans(): Promise<string[]> {
  const plans = [
    {
      name: "Free",
      slug: "free",
      description: "Perfect for small teams getting started",
      price: 0,
      billingInterval: "monthly" as const,
      isDefault: true,
      position: 0,
      limits: {
        ticketsPerMonth: 100,
        messagesPerMonth: 500,
        storagePerOrgMB: 100,
        apiRequestsPerMinute: 10,
        agentsPerOrg: 2,
        customersPerOrg: 50,
        slaEnabled: false,
        customFieldsEnabled: false,
        reportingEnabled: false,
        apiAccessEnabled: false,
        prioritySupport: false,
      },
      features: {
        ticketManagement: true,
        emailChannel: true,
        chatWidget: false,
        apiChannel: false,
        cannedResponses: true,
        tags: true,
        categories: true,
        fileAttachments: true,
        csatSurveys: false,
        slaManagement: false,
        customFields: false,
        analytics: false,
        advancedReporting: false,
        dataExport: false,
        customBranding: false,
        singleSignOn: false,
        auditLog: false,
        multipleWorkspaces: false,
      },
    },
    {
      name: "Pro",
      slug: "pro",
      description: "For growing teams that need more power",
      price: 2900, // $29/month
      billingInterval: "monthly" as const,
      isDefault: false,
      position: 1,
      limits: {
        ticketsPerMonth: 1000,
        messagesPerMonth: 5000,
        storagePerOrgMB: 1000,
        apiRequestsPerMinute: 60,
        agentsPerOrg: 10,
        customersPerOrg: 500,
        slaEnabled: true,
        customFieldsEnabled: true,
        reportingEnabled: true,
        apiAccessEnabled: true,
        prioritySupport: false,
      },
      features: {
        ticketManagement: true,
        emailChannel: true,
        chatWidget: true,
        apiChannel: true,
        cannedResponses: true,
        tags: true,
        categories: true,
        fileAttachments: true,
        csatSurveys: true,
        slaManagement: true,
        customFields: true,
        analytics: true,
        advancedReporting: false,
        dataExport: true,
        customBranding: false,
        singleSignOn: false,
        auditLog: true,
        multipleWorkspaces: false,
      },
    },
    {
      name: "Business",
      slug: "business",
      description: "For large teams and enterprises",
      price: 9900, // $99/month
      billingInterval: "monthly" as const,
      isDefault: false,
      position: 2,
      limits: {
        ticketsPerMonth: -1, // Unlimited
        messagesPerMonth: -1,
        storagePerOrgMB: 10000,
        apiRequestsPerMinute: 300,
        agentsPerOrg: -1,
        customersPerOrg: -1,
        slaEnabled: true,
        customFieldsEnabled: true,
        reportingEnabled: true,
        apiAccessEnabled: true,
        prioritySupport: true,
      },
      features: {
        ticketManagement: true,
        emailChannel: true,
        chatWidget: true,
        apiChannel: true,
        cannedResponses: true,
        tags: true,
        categories: true,
        fileAttachments: true,
        csatSurveys: true,
        slaManagement: true,
        customFields: true,
        analytics: true,
        advancedReporting: true,
        dataExport: true,
        customBranding: true,
        singleSignOn: true,
        auditLog: true,
        multipleWorkspaces: true,
      },
    },
  ];

  const inserted = await db
    .insert(schema.subscriptionPlans)
    .values(plans)
    .returning({ id: schema.subscriptionPlans.id });

  logger.info(`Created ${inserted.length} subscription plans`);
  return inserted.map((p) => p.id);
}

/**
 * Seed organization subscriptions
 */
export async function seedOrganizationSubscriptions(
  orgIds: string[],
  planIds: string[],
): Promise<void> {
  const now = new Date();
  const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const subscriptions = orgIds.map((orgId, index) => ({
    organizationId: orgId,
    planId: planIds[index % planIds.length],
    status: "active" as const,
    currentPeriodStart: now,
    currentPeriodEnd: oneMonthFromNow,
  }));

  await db.insert(schema.organizationSubscriptions).values(subscriptions);
  logger.info(`Created ${subscriptions.length} organization subscriptions`);
}

/**
 * Seed tickets with messages
 */
export async function seedTickets(
  orgIds: string[],
  userIds: string[],
  categoryIds: string[],
  count: number,
): Promise<string[]> {
  const statuses: Array<"open" | "pending" | "resolved" | "closed"> = [
    "open",
    "pending",
    "resolved",
    "closed",
  ];
  const priorities: Array<"low" | "medium" | "high" | "urgent"> = [
    "low",
    "medium",
    "high",
    "urgent",
  ];
  const channels: Array<"web" | "email" | "chat" | "api"> = ["web", "email", "chat", "api"];

  const ticketTemplates = [
    {
      title: "Cannot login to my account",
      description: "I keep getting an error when trying to login. The page just refreshes.",
    },
    {
      title: "Billing question about my subscription",
      description: "I was charged twice this month and need a refund.",
    },
    {
      title: "Feature request: Dark mode",
      description: "Would love to see a dark mode option in the app.",
    },
    {
      title: "Bug: Dashboard not loading",
      description: "The dashboard shows a blank page after the recent update.",
    },
    {
      title: "How do I export my data?",
      description: "I need to export all my tickets to CSV for reporting.",
    },
    {
      title: "Integration with Slack not working",
      description: "Slack notifications stopped working yesterday.",
    },
    { title: "Performance issues on mobile", description: "The app is very slow on my iPhone." },
    {
      title: "Request for API documentation",
      description: "Where can I find the API documentation?",
    },
    { title: "Account upgrade inquiry", description: "What are the benefits of upgrading to Pro?" },
    {
      title: "Password reset not working",
      description: "I never receive the password reset email.",
    },
  ];

  const tickets = [];
  const ticketIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const template = ticketTemplates[i % ticketTemplates.length];
    const orgId = orgIds[i % orgIds.length];
    const customerId = userIds[Math.min(3, userIds.length - 1)]; // Customer user
    const assigneeId = i % 3 === 0 ? null : userIds[Math.min(2, userIds.length - 1)]; // Agent user
    const status = statuses[i % statuses.length];
    const priority = priorities[i % priorities.length];

    tickets.push({
      ticketNumber: 1000 + i,
      title: template.title,
      description: template.description,
      status,
      priority,
      channel: channels[i % channels.length],
      organizationId: orgId,
      customerId,
      assigneeId,
      categoryId: categoryIds.length > 0 ? categoryIds[i % categoryIds.length] : undefined,
      tags: i % 2 === 0 ? ["bug", "urgent"] : ["question"],
      resolvedAt: status === "resolved" || status === "closed" ? new Date() : undefined,
      closedAt: status === "closed" ? new Date() : undefined,
    });
  }

  const inserted = await db
    .insert(schema.tickets)
    .values(tickets)
    .returning({ id: schema.tickets.id });

  ticketIds.push(...inserted.map((t) => t.id));
  logger.info(`Created ${inserted.length} tickets`);

  return ticketIds;
}

/**
 * Seed messages for tickets
 */
export async function seedMessages(
  ticketIds: string[],
  userIds: string[],
  countPerTicket: number = 3,
): Promise<void> {
  const messageTemplates = [
    "Thank you for reaching out. I'm looking into this issue now.",
    "Could you please provide more details about when this started happening?",
    "I've identified the issue and am working on a fix.",
    "This has been resolved. Please let me know if you have any other questions.",
    "I'm escalating this to our senior team for further investigation.",
  ];

  const messages = [];

  for (const ticketId of ticketIds) {
    for (let i = 0; i < countPerTicket; i++) {
      const isAgent = i % 2 === 1; // Alternate between customer and agent
      messages.push({
        ticketId,
        senderId: isAgent
          ? userIds[Math.min(2, userIds.length - 1)] // Agent
          : userIds[Math.min(3, userIds.length - 1)], // Customer
        content: messageTemplates[i % messageTemplates.length],
        type: "reply" as const,
      });
    }
  }

  await db.insert(schema.ticketMessages).values(messages);
  logger.info(`Created ${messages.length} messages`);
}

/**
 * Seed saved filters for users
 */
export async function seedSavedFilters(orgIds: string[], userIds: string[]): Promise<void> {
  const filters = [
    {
      name: "My Open Tickets",
      description: "All open tickets assigned to me",
      criteria: { status: ["open"], assigneeId: userIds[0] },
      isDefault: true,
    },
    {
      name: "Urgent Tickets",
      description: "All urgent priority tickets",
      criteria: { priority: ["urgent"] },
      isDefault: false,
    },
    {
      name: "Unassigned",
      description: "Tickets without an assignee",
      criteria: { assigneeId: null },
      isDefault: false,
      isShared: true,
    },
    {
      name: "Resolved This Week",
      description: "Recently resolved tickets",
      criteria: { status: ["resolved"] },
      isDefault: false,
    },
  ];

  const savedFilters = [];
  for (const orgId of orgIds) {
    for (let i = 0; i < Math.min(userIds.length, 2); i++) {
      for (const filter of filters) {
        savedFilters.push({
          ...filter,
          organizationId: orgId,
          userId: userIds[i],
          position: savedFilters.length,
        });
      }
    }
  }

  await db.insert(schema.savedFilters).values(savedFilters);
  logger.info(`Created ${savedFilters.length} saved filters`);
}

/**
 * Seed API keys for organizations
 * Note: We create deterministic keys for testing purposes
 */
export async function seedApiKeys(orgIds: string[], userIds: string[]): Promise<string[]> {
  const { hashApiKey } = await import("@/modules/auth/api-key.utils");

  // Create deterministic test keys for development/testing
  const testKeys = [
    {
      name: "Development API Key",
      fullKey: "idk_test_development_key_12345678",
      scopes: ["read", "write"],
    },
    {
      name: "CI/CD Pipeline Key",
      fullKey: "idk_test_cicd_pipeline_key_abcdef",
      scopes: ["read", "write", "delete"],
    },
    {
      name: "Read-Only Integration Key",
      fullKey: "idk_test_readonly_integration_key",
      scopes: ["read"],
    },
  ];

  const apiKeyRecords = [];
  for (const orgId of orgIds) {
    for (let i = 0; i < testKeys.length; i++) {
      const keyData = testKeys[i];
      const keyHash = hashApiKey(keyData.fullKey);
      const prefix = `idk_test_${keyData.fullKey.substring(9, 13)}`;

      apiKeyRecords.push({
        organizationId: orgId,
        createdById: userIds[Math.min(i, userIds.length - 1)], // Assign to different users
        name: keyData.name,
        prefix,
        keyHash,
        scopes: keyData.scopes,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        isActive: true,
      });
    }
  }

  const inserted = await db
    .insert(schema.apiKeys)
    .values(apiKeyRecords)
    .returning({ id: schema.apiKeys.id });

  logger.info(`Created ${inserted.length} API keys`);
  logger.info("Test API keys (for development only):");
  for (const key of testKeys) {
    logger.info(`  - ${key.name}: ${key.fullKey}`);
  }

  return inserted.map((k) => k.id);
}

/**
 * Reset all seedable tables
 */
export async function resetDatabase(): Promise<void> {
  logger.info("Resetting database...");

  // Use drizzle-seed reset for compatible tables
  // Note: This only resets tables that drizzle-seed knows about
  try {
    await reset(db, seedableSchema);
    logger.info("Database reset complete");
  } catch (error) {
    logger.warn(`Drizzle reset failed, using manual truncation: ${error}`);
    // Fallback to manual truncation
    await db.execute(
      `TRUNCATE TABLE 
        ticket_activities, ticket_messages, tickets, 
        csat_surveys, saved_filters, canned_responses, 
        sla_policies, tags, categories, 
        organization_subscriptions, subscription_usage, subscription_plans,
        organization_invitations, attachments, audit_logs, api_keys,
        user_organizations, organizations
      CASCADE`,
    );
  }
}
