/**
 * Seed Orchestrator
 *
 * Coordinates auth seeding (manual via better-auth) with
 * drizzle-seed for all other tables.
 */

export * from "./auth-seed";
export * from "./drizzle-seed";

import { DEV_USERS, seedUsers, TEST_USERS, getExistingUserIds } from "./auth-seed";
import {
  resetDatabase,
  seedCategories,
  seedCannedResponses,
  seedMessages,
  seedOrganizations,
  seedOrganizationSubscriptions,
  seedSavedFilters,
  seedSlaPolicies,
  seedSubscriptionPlans,
  seedTags,
  seedTickets,
  seedUserOrganizations,
} from "./drizzle-seed";
import { db } from "@/db";
import { logger } from "@/lib/logger";

export interface SeedResult {
  userIds: string[];
  organizationIds: string[];
  categoryIds: string[];
  tagIds: string[];
  planIds: string[];
  ticketIds: string[];
}

export interface SeedConfig {
  /** Reset database before seeding */
  reset?: boolean;
  /** Use test users instead of dev users */
  isTest?: boolean;
  /** Seed number for reproducibility */
  seedNumber?: number;
  /** Number of tickets to create */
  ticketCount?: number;
  /** Number of messages per ticket */
  messagesPerTicket?: number;
}

/**
 * Run the complete seed process
 */
export async function runSeed(config: SeedConfig = {}): Promise<SeedResult> {
  const { reset = false, isTest = false, ticketCount = 20, messagesPerTicket = 3 } = config;

  logger.info(`Starting ${isTest ? "test" : "development"} seed...`);

  // Reset if requested
  if (reset) {
    await resetDatabase();
    logger.info("Database reset complete");
  }

  // 1. Seed users via better-auth
  const users = isTest ? TEST_USERS : DEV_USERS;
  let userMap = await seedUsers(users);

  // If users already exist, get their IDs
  if (userMap.size === 0) {
    userMap = await getExistingUserIds(
      db,
      users.map((u) => u.email),
    );
  }

  const userIds = Array.from(userMap.values());
  if (userIds.length === 0) {
    throw new Error("No users found or created. Cannot continue seeding.");
  }

  // 2. Seed subscription plans first (no dependencies)
  const planIds = await seedSubscriptionPlans();

  // 3. Seed organizations
  const organizationIds = await seedOrganizations(userIds, 2);

  // 4. Seed user-organization relationships
  await seedUserOrganizations(userIds, organizationIds);

  // 5. Seed organization subscriptions
  await seedOrganizationSubscriptions(organizationIds, planIds);

  // 6. Seed categories
  const categoryIds = await seedCategories(organizationIds);

  // 7. Seed tags
  const tagIds = await seedTags(organizationIds);

  // 8. Seed SLA policies
  await seedSlaPolicies(organizationIds);

  // 9. Seed canned responses
  await seedCannedResponses(organizationIds, userIds);

  // 10. Seed tickets
  const ticketIds = await seedTickets(organizationIds, userIds, categoryIds, ticketCount);

  // 11. Seed messages
  await seedMessages(ticketIds, userIds, messagesPerTicket);

  // 12. Seed saved filters
  await seedSavedFilters(organizationIds, userIds);

  logger.info("Seed complete!");

  return {
    userIds,
    organizationIds,
    categoryIds,
    tagIds,
    planIds,
    ticketIds,
  };
}

/**
 * Run development seed with default settings
 */
export async function runDevSeed(): Promise<SeedResult> {
  return runSeed({
    reset: true,
    isTest: false,
    ticketCount: 20,
    messagesPerTicket: 3,
  });
}

/**
 * Run test seed with deterministic settings
 */
export async function runTestSeed(): Promise<SeedResult> {
  return runSeed({
    reset: true,
    isTest: true,
    seedNumber: 12345,
    ticketCount: 10,
    messagesPerTicket: 2,
  });
}
