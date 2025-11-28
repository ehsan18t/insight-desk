/**
 * Test Database Seed
 *
 * Seeds the test database with fixture data for integration tests.
 * Run this before integration tests that require real database data.
 *
 * Usage:
 *   bun run db:seed:test
 */

import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { checkDatabaseConnection, closeDatabaseConnection, db } from "@/db";
import type { PlanFeatures, PlanLimits } from "@/db/schema";
import {
  accounts,
  cannedResponses,
  categories,
  csatSurveys,
  organizationInvitations,
  organizationSubscriptions,
  organizations,
  savedFilters,
  sessions,
  slaPolicies,
  subscriptionPlans,
  subscriptionUsage,
  tags,
  ticketActivities,
  ticketMessages,
  tickets,
  userOrganizations,
  users,
  verifications,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { TEST_IDS } from "./fixtures";

// ═══════════════════════════════════════════════════════════════════════════
// Test Passwords (pre-hashed with bcrypt, cost 10)
// Password for all test users: "Test123!"
// ═══════════════════════════════════════════════════════════════════════════

const TEST_PASSWORD_HASH = "$2a$10$rQZ8JqQz8vQzQzQzQzQzQeQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQ";

// ═══════════════════════════════════════════════════════════════════════════
// Clear Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clear all test data from the database
 * Order matters due to foreign key constraints
 */
export async function clearTestData(): Promise<void> {
  logger.info("Clearing test data...");

  // Delete in reverse order of dependencies
  await db.delete(csatSurveys);
  await db.delete(ticketActivities);
  await db.delete(ticketMessages);
  await db.delete(tickets);
  await db.delete(savedFilters);
  await db.delete(cannedResponses);
  await db.delete(slaPolicies);
  await db.delete(tags);
  await db.delete(categories);
  await db.delete(subscriptionUsage);
  await db.delete(organizationSubscriptions);
  await db.delete(subscriptionPlans);
  await db.delete(organizationInvitations);
  await db.delete(userOrganizations);
  await db.delete(sessions);
  await db.delete(accounts);
  await db.delete(verifications);
  await db.delete(organizations);
  await db.delete(users);

  // Reset sequences if needed
  await db.execute(sql`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT c.relname FROM pg_class c WHERE c.relkind = 'S') LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.relname) || ' RESTART WITH 1';
      END LOOP;
    END $$;
  `);

  logger.info("Test data cleared");
}

// ═══════════════════════════════════════════════════════════════════════════
// Seed Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Seed test users
 */
export async function seedUsers(): Promise<void> {
  logger.info("Seeding users...");

  await db.insert(users).values([
    {
      id: TEST_IDS.USER_ADMIN,
      email: "admin@test.com",
      name: "Test Admin",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
    {
      id: TEST_IDS.USER_AGENT,
      email: "agent@test.com",
      name: "Test Agent",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
    {
      id: TEST_IDS.USER_CUSTOMER,
      email: "customer@test.com",
      name: "Test Customer",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
    {
      id: TEST_IDS.USER_OWNER,
      email: "owner@test.com",
      name: "Test Owner",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  ]);

  // Create accounts with passwords
  await db.insert(accounts).values([
    {
      id: nanoid(),
      userId: TEST_IDS.USER_ADMIN,
      accountId: TEST_IDS.USER_ADMIN,
      providerId: "credential",
      password: TEST_PASSWORD_HASH,
    },
    {
      id: nanoid(),
      userId: TEST_IDS.USER_AGENT,
      accountId: TEST_IDS.USER_AGENT,
      providerId: "credential",
      password: TEST_PASSWORD_HASH,
    },
    {
      id: nanoid(),
      userId: TEST_IDS.USER_CUSTOMER,
      accountId: TEST_IDS.USER_CUSTOMER,
      providerId: "credential",
      password: TEST_PASSWORD_HASH,
    },
    {
      id: nanoid(),
      userId: TEST_IDS.USER_OWNER,
      accountId: TEST_IDS.USER_OWNER,
      providerId: "credential",
      password: TEST_PASSWORD_HASH,
    },
  ]);

  logger.info({ count: 4 }, "Users seeded");
}

/**
 * Seed test organizations
 */
export async function seedOrganizations(): Promise<void> {
  logger.info("Seeding organizations...");

  await db.insert(organizations).values([
    {
      id: TEST_IDS.ORG_ACME,
      name: "Test Organization",
      slug: "test-org",
      settings: {
        notifications: { emailOnNewTicket: true, emailOnTicketUpdate: true },
        features: { liveChatEnabled: true, customerPortalEnabled: true },
      },
      isActive: true,
    },
    {
      id: TEST_IDS.ORG_TECHSTART,
      name: "Second Organization",
      slug: "second-org",
      settings: {},
      isActive: true,
    },
  ]);

  logger.info({ count: 2 }, "Organizations seeded");
}

/**
 * Seed user-organization relationships
 */
export async function seedUserOrganizations(): Promise<void> {
  logger.info("Seeding user-organization relationships...");

  await db.insert(userOrganizations).values([
    {
      id: nanoid(),
      userId: TEST_IDS.USER_OWNER,
      organizationId: TEST_IDS.ORG_ACME,
      role: "owner",
    },
    {
      id: nanoid(),
      userId: TEST_IDS.USER_ADMIN,
      organizationId: TEST_IDS.ORG_ACME,
      role: "admin",
    },
    {
      id: nanoid(),
      userId: TEST_IDS.USER_AGENT,
      organizationId: TEST_IDS.ORG_ACME,
      role: "agent",
    },
    {
      id: nanoid(),
      userId: TEST_IDS.USER_CUSTOMER,
      organizationId: TEST_IDS.ORG_ACME,
      role: "customer",
    },
  ]);

  logger.info({ count: 4 }, "User-organization relationships seeded");
}

/**
 * Seed subscription plans
 */
export async function seedPlans(): Promise<void> {
  logger.info("Seeding subscription plans...");

  const freeLimits: PlanLimits = {
    ticketsPerMonth: 50,
    messagesPerMonth: 200,
    storagePerOrgMB: 100,
    apiRequestsPerMinute: 10,
    agentsPerOrg: 2,
    customersPerOrg: 100,
    slaEnabled: false,
    customFieldsEnabled: false,
    reportingEnabled: false,
    apiAccessEnabled: false,
    prioritySupport: false,
  };

  const freeFeatures: PlanFeatures = {
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
  };

  await db.insert(subscriptionPlans).values({
    id: TEST_IDS.PLAN_FREE,
    name: "Free",
    slug: "free",
    description: "Free plan for testing",
    price: 0,
    billingInterval: "monthly",
    limits: freeLimits,
    features: freeFeatures,
    isDefault: true,
    isVisible: true,
    position: 1,
  });

  logger.info({ count: 1 }, "Subscription plans seeded");
}

/**
 * Seed organization subscriptions
 */
export async function seedSubscriptions(): Promise<void> {
  logger.info("Seeding organization subscriptions...");

  const periodStart = new Date();
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db.insert(organizationSubscriptions).values({
    id: nanoid(),
    organizationId: TEST_IDS.ORG_ACME,
    planId: TEST_IDS.PLAN_FREE,
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  });

  await db.insert(subscriptionUsage).values({
    id: nanoid(),
    organizationId: TEST_IDS.ORG_ACME,
    periodStart,
    periodEnd,
    ticketsCreated: 0,
    messagesCreated: 0,
    storageUsedMB: 0,
    apiRequestsCount: 0,
    ticketsRemaining: 50,
    messagesRemaining: 200,
    storageRemainingMB: 100,
  });

  logger.info({ count: 1 }, "Organization subscriptions seeded");
}

/**
 * Seed categories
 */
export async function seedCategories(): Promise<void> {
  logger.info("Seeding categories...");

  await db.insert(categories).values([
    {
      id: TEST_IDS.CATEGORY_GENERAL,
      organizationId: TEST_IDS.ORG_ACME,
      name: "General",
      description: "General inquiries",
      color: "#6B7280",
    },
    {
      id: TEST_IDS.CATEGORY_TECHNICAL,
      organizationId: TEST_IDS.ORG_ACME,
      name: "Technical Support",
      description: "Technical issues",
      color: "#3B82F6",
    },
    {
      id: TEST_IDS.CATEGORY_BILLING,
      organizationId: TEST_IDS.ORG_ACME,
      name: "Billing",
      description: "Payment and subscription issues",
      color: "#10B981",
    },
  ]);

  logger.info({ count: 3 }, "Categories seeded");
}

/**
 * Seed tags
 */
export async function seedTags(): Promise<void> {
  logger.info("Seeding tags...");

  await db.insert(tags).values([
    {
      id: TEST_IDS.TAG_URGENT,
      organizationId: TEST_IDS.ORG_ACME,
      name: "urgent",
      color: "#EF4444",
    },
    {
      id: TEST_IDS.TAG_BUG,
      organizationId: TEST_IDS.ORG_ACME,
      name: "bug",
      color: "#F59E0B",
    },
  ]);

  logger.info({ count: 2 }, "Tags seeded");
}

/**
 * Seed SLA policies
 */
export async function seedSlaPolicies(): Promise<void> {
  logger.info("Seeding SLA policies...");

  await db.insert(slaPolicies).values([
    {
      id: TEST_IDS.SLA_URGENT,
      organizationId: TEST_IDS.ORG_ACME,
      name: "Urgent SLA",
      priority: "urgent",
      firstResponseTime: 60,
      resolutionTime: 240,
      businessHoursOnly: false,
      isDefault: true,
    },
    {
      id: TEST_IDS.SLA_HIGH,
      organizationId: TEST_IDS.ORG_ACME,
      name: "High Priority SLA",
      priority: "high",
      firstResponseTime: 240,
      resolutionTime: 480,
      businessHoursOnly: true,
      isDefault: true,
    },
    {
      id: TEST_IDS.SLA_MEDIUM,
      organizationId: TEST_IDS.ORG_ACME,
      name: "Medium Priority SLA",
      priority: "medium",
      firstResponseTime: 480,
      resolutionTime: 1440,
      businessHoursOnly: true,
      isDefault: true,
    },
    {
      id: TEST_IDS.SLA_LOW,
      organizationId: TEST_IDS.ORG_ACME,
      name: "Low Priority SLA",
      priority: "low",
      firstResponseTime: 1440,
      resolutionTime: 4320,
      businessHoursOnly: true,
      isDefault: true,
    },
  ]);

  logger.info({ count: 4 }, "SLA policies seeded");
}

/**
 * Seed tickets
 */
export async function seedTickets(): Promise<void> {
  logger.info("Seeding tickets...");

  await db.insert(tickets).values([
    {
      id: TEST_IDS.TICKET_OPEN,
      organizationId: TEST_IDS.ORG_ACME,
      ticketNumber: 1001,
      title: "Test Open Ticket",
      description: "This is an open test ticket",
      status: "open",
      priority: "high",
      customerId: TEST_IDS.USER_CUSTOMER,
      assigneeId: TEST_IDS.USER_AGENT,
      categoryId: TEST_IDS.CATEGORY_TECHNICAL,
      tags: ["urgent"],
    },
    {
      id: TEST_IDS.TICKET_PENDING,
      organizationId: TEST_IDS.ORG_ACME,
      ticketNumber: 1002,
      title: "Test Pending Ticket",
      description: "This is a pending test ticket",
      status: "pending",
      priority: "medium",
      customerId: TEST_IDS.USER_CUSTOMER,
      assigneeId: TEST_IDS.USER_ADMIN,
      categoryId: TEST_IDS.CATEGORY_BILLING,
    },
    {
      id: TEST_IDS.TICKET_RESOLVED,
      organizationId: TEST_IDS.ORG_ACME,
      ticketNumber: 1003,
      title: "Test Resolved Ticket",
      description: "This is a resolved test ticket",
      status: "resolved",
      priority: "medium",
      customerId: TEST_IDS.USER_CUSTOMER,
      assigneeId: TEST_IDS.USER_AGENT,
      resolvedAt: new Date(),
    },
    {
      id: TEST_IDS.TICKET_CLOSED,
      organizationId: TEST_IDS.ORG_ACME,
      ticketNumber: 1004,
      title: "Test Closed Ticket",
      description: "This is a closed test ticket",
      status: "closed",
      priority: "low",
      customerId: TEST_IDS.USER_CUSTOMER,
      closedAt: new Date(),
    },
  ]);

  logger.info({ count: 4 }, "Tickets seeded");
}

/**
 * Seed ticket messages
 */
export async function seedMessages(): Promise<void> {
  logger.info("Seeding messages...");

  await db.insert(ticketMessages).values([
    {
      id: TEST_IDS.MESSAGE_REPLY,
      ticketId: TEST_IDS.TICKET_OPEN,
      senderId: TEST_IDS.USER_CUSTOMER,
      content: "This is a customer reply",
      type: "reply",
    },
    {
      id: TEST_IDS.MESSAGE_INTERNAL,
      ticketId: TEST_IDS.TICKET_OPEN,
      senderId: TEST_IDS.USER_AGENT,
      content: "This is an internal note",
      type: "internal_note",
    },
    {
      id: TEST_IDS.MESSAGE_SYSTEM,
      ticketId: TEST_IDS.TICKET_OPEN,
      senderId: null,
      content: "Ticket assigned to agent",
      type: "system",
    },
  ]);

  logger.info({ count: 3 }, "Messages seeded");
}

/**
 * Seed canned responses
 */
export async function seedCannedResponses(): Promise<void> {
  logger.info("Seeding canned responses...");

  await db.insert(cannedResponses).values([
    {
      id: nanoid(),
      organizationId: TEST_IDS.ORG_ACME,
      title: "Greeting",
      content: "Hello {{customer_name}}, thank you for contacting us!",
      shortcut: "/greet",
      category: "General",
      createdById: TEST_IDS.USER_AGENT,
    },
    {
      id: nanoid(),
      organizationId: TEST_IDS.ORG_ACME,
      title: "Closing",
      content: "Thank you for your patience. Is there anything else I can help you with?",
      shortcut: "/close",
      category: "General",
      createdById: TEST_IDS.USER_AGENT,
    },
  ]);

  logger.info({ count: 2 }, "Canned responses seeded");
}

/**
 * Seed saved filters
 */
export async function seedSavedFilters(): Promise<void> {
  logger.info("Seeding saved filters...");

  await db.insert(savedFilters).values([
    {
      id: nanoid(),
      organizationId: TEST_IDS.ORG_ACME,
      userId: TEST_IDS.USER_AGENT,
      name: "My Open Tickets",
      criteria: { status: ["open"], assigneeId: TEST_IDS.USER_AGENT },
      isDefault: true,
      isShared: false,
      position: 1,
    },
    {
      id: nanoid(),
      organizationId: TEST_IDS.ORG_ACME,
      userId: TEST_IDS.USER_ADMIN,
      name: "Urgent Tickets",
      criteria: { priority: ["urgent", "high"] },
      isDefault: false,
      isShared: true,
      position: 2,
    },
  ]);

  logger.info({ count: 2 }, "Saved filters seeded");
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Seed Function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run all seed functions in order
 */
export async function seedTestDatabase(): Promise<void> {
  logger.info("Starting test database seed...");

  const connected = await checkDatabaseConnection();
  if (!connected) {
    throw new Error("Failed to connect to database");
  }

  try {
    // Clear existing data
    await clearTestData();

    // Seed in dependency order
    await seedUsers();
    await seedOrganizations();
    await seedUserOrganizations();
    await seedPlans();
    await seedSubscriptions();
    await seedCategories();
    await seedTags();
    await seedSlaPolicies();
    await seedTickets();
    await seedMessages();
    await seedCannedResponses();
    await seedSavedFilters();

    logger.info("Test database seeding completed successfully!");
    logger.info("---");
    logger.info("Test accounts (password: Test123!):");
    logger.info("  Owner: owner@test.com");
    logger.info("  Admin: admin@test.com");
    logger.info("  Agent: agent@test.com");
    logger.info("  Customer: customer@test.com");
    logger.info("---");
  } catch (error) {
    logger.error({ err: error }, "Test seed failed");
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI Entry Point
// ═══════════════════════════════════════════════════════════════════════════

// Run if called directly
if (import.meta.main) {
  seedTestDatabase()
    .then(() => {
      closeDatabaseConnection();
      process.exit(0);
    })
    .catch((error) => {
      console.error("Test seed error:", error);
      closeDatabaseConnection();
      process.exit(1);
    });
}
