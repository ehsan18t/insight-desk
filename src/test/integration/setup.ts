/**
 * Integration Test Setup
 *
 * Global setup and teardown for integration tests.
 * Ensures all external services are running and properly configured.
 */

import {
  areAllContainersRunning,
  getContainersStatus,
  startTestContainers,
  waitForAllServices,
  TEST_CONFIG,
} from "./services";
import { ensureMinioBucket, truncateAllTables, flushValkey, clearMailpit } from "./cleanup";

// ─────────────────────────────────────────────────────────────
// Global Setup
// ─────────────────────────────────────────────────────────────

/**
 * Global setup for integration tests
 * Called once before all integration tests run
 */
export async function globalSetup(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       Integration Test Environment Setup                 ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Check if containers are running
  if (!areAllContainersRunning()) {
    const status = getContainersStatus();
    console.log("📊 Container status:");
    for (const [name, running] of Object.entries(status)) {
      console.log(`   ${running ? "✅" : "❌"} ${name}`);
    }

    console.log("\n🚀 Starting missing containers...");
    await startTestContainers();
  } else {
    console.log("✅ All test containers are running");
  }

  // Wait for all services to be healthy
  console.log("\n🏥 Health checks...");
  await waitForAllServices();

  // Ensure MinIO bucket exists
  console.log("\n📦 Preparing MinIO...");
  await ensureMinioBucket();

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║       ✅ Integration Test Environment Ready              ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

/**
 * Reset test environment between test files
 * Provides Option B: Complete database reset per test file
 */
export async function resetTestEnvironment(): Promise<void> {
  console.log("\n🔄 Resetting test environment...\n");

  // Truncate all database tables (faster than drop/recreate)
  await truncateAllTables();

  // Flush Valkey cache
  flushValkey();

  // Clear Mailpit messages
  await clearMailpit();

  console.log("✅ Test environment reset complete\n");
}

/**
 * Seed test database with fixture data
 * Call after resetTestEnvironment() if you need seed data
 */
export async function seedTestDatabase(): Promise<void> {
  console.log("🌱 Seeding test database...");

  // Import and run the seed function
  const { runTestSeed: seed } = await import("@/lib/seed");
  await seed();

  console.log("   ✅ Test database seeded");
}

// ─────────────────────────────────────────────────────────────
// Vitest Integration
// ─────────────────────────────────────────────────────────────

/**
 * Check if we should run integration tests
 * Returns true only if RUN_INTEGRATION_TESTS=true
 * Container management is handled by global-setup.ts
 */
export function shouldRunIntegrationTests(): boolean {
  return process.env.RUN_INTEGRATION_TESTS === "true";
}

/**
 * Skip integration tests conditionally
 * Use: describe.skipIf(skipIntegrationTests())("Integration tests", ...)
 */
export function skipIntegrationTests(): boolean {
  return !shouldRunIntegrationTests();
}

// ─────────────────────────────────────────────────────────────
// Connection Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Get database connection URL for tests
 */
export function getTestDatabaseUrl(): string {
  const { host, port, user, password, database } = TEST_CONFIG.postgres;
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

/**
 * Get Valkey connection URL for tests
 */
export function getTestValkeyUrl(): string {
  const { host, port } = TEST_CONFIG.valkey;
  return `redis://${host}:${port}`;
}

/**
 * Get MinIO S3 config for tests
 */
export function getTestMinioConfig() {
  return {
    endpoint: TEST_CONFIG.minio.endpoint,
    bucket: TEST_CONFIG.minio.bucket,
    accessKey: TEST_CONFIG.minio.accessKey,
    secretKey: TEST_CONFIG.minio.secretKey,
    region: "us-east-1",
    forcePathStyle: true,
  };
}

/**
 * Get Mailpit SMTP config for tests
 */
export function getTestMailpitConfig() {
  return {
    host: TEST_CONFIG.mailpit.smtpHost,
    port: TEST_CONFIG.mailpit.smtpPort,
    apiUrl: TEST_CONFIG.mailpit.apiUrl,
  };
}

// ─────────────────────────────────────────────────────────────
// Export all
// ─────────────────────────────────────────────────────────────

export { TEST_CONFIG } from "./services";
export * from "./cleanup";
export * from "./services";
