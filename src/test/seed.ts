/**
 * Test Database Seed
 *
 * Seeds the test database with deterministic fixture data for integration tests.
 * Uses a fixed seed number for reproducible test data.
 *
 * Usage:
 *   bun run test:seed
 *
 * Or set TEST_DB_SEED=true before running tests:
 *   TEST_DB_SEED=true bun run test
 */

import { checkDatabaseConnection, closeDatabaseConnection } from "@/db";
import { runTestSeed } from "@/lib/seed";
import { logger } from "@/lib/logger";

async function seedTestDatabase() {
  logger.info("Starting test database seed...");

  // Check database connection
  const connected = await checkDatabaseConnection();
  if (!connected) {
    logger.error("Failed to connect to test database");
    process.exit(1);
  }

  try {
    const result = await runTestSeed();

    logger.info("=".repeat(50));
    logger.info("Test seed completed successfully!");
    logger.info("=".repeat(50));
    logger.info(`Users created: ${result.userIds.length}`);
    logger.info(`Organizations created: ${result.organizationIds.length}`);
    logger.info(`Categories created: ${result.categoryIds.length}`);
    logger.info(`Tags created: ${result.tagIds.length}`);
    logger.info(`Subscription plans created: ${result.planIds.length}`);
    logger.info(`Tickets created: ${result.ticketIds.length}`);
    logger.info("=".repeat(50));
    logger.info("");
    logger.info("Test users available:");
    logger.info("  test-owner@test.com / TestOwner123!");
    logger.info("  test-admin@test.com / TestAdmin123!");
    logger.info("  test-agent@test.com / TestAgent123!");
    logger.info("  test-customer@test.com / TestCustomer123!");
    logger.info("=".repeat(50));

    return result;
  } catch (error) {
    logger.error({ err: error }, "Test seed failed");
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

// Export for programmatic use
export { seedTestDatabase };

// Run if called directly or if TEST_DB_SEED is set
if (process.env.TEST_DB_SEED === "true" || process.argv[1]?.includes("seed.ts")) {
  seedTestDatabase();
}
