/**
 * Development Database Seed
 *
 * Seeds the development database with sample data for testing and development.
 * Uses the hybrid seed architecture with better-auth for users and
 * manual seeding for other tables.
 *
 * Usage:
 *   npm run db:seed
 */

import { checkDatabaseConnection, closeDatabaseConnection } from "./db";
import { runDevSeed } from "./lib/seed";
import { logger } from "./lib/logger";

async function seed() {
  logger.info("Starting development database seed...");

  // Check database connection
  const connected = await checkDatabaseConnection();
  if (!connected) {
    logger.error("Failed to connect to database");
    process.exit(1);
  }

  try {
    const result = await runDevSeed();

    logger.info("=".repeat(50));
    logger.info("Seed completed successfully!");
    logger.info("=".repeat(50));
    logger.info(`Users created: ${result.userIds.length}`);
    logger.info(`Organizations created: ${result.organizationIds.length}`);
    logger.info(`Categories created: ${result.categoryIds.length}`);
    logger.info(`Tags created: ${result.tagIds.length}`);
    logger.info(`Subscription plans created: ${result.planIds.length}`);
    logger.info(`Tickets created: ${result.ticketIds.length}`);
    logger.info("=".repeat(50));
    logger.info("");
    logger.info("You can now login with:");
    logger.info("  Email: owner@acme.com");
    logger.info("  Password: Owner123!");
    logger.info("");
    logger.info("Or with other users:");
    logger.info("  admin@acme.com / Admin123!");
    logger.info("  agent@acme.com / Agent123!");
    logger.info("  customer@acme.com / Customer123!");
    logger.info("=".repeat(50));
  } catch (error) {
    logger.error({ err: error }, "Seed failed");
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

seed();
