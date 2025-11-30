/**
 * Integration Test Module
 *
 * Re-exports all integration test utilities for convenient access.
 *
 * @example
 * import {
 *   globalSetup,
 *   resetTestEnvironment,
 *   skipIntegrationTests,
 *   getMailpitMessages,
 *   clearMinioBucket,
 * } from "@/test/integration";
 */

// Setup and lifecycle
export {
  globalSetup,
  resetTestEnvironment,
  seedTestDatabase,
  shouldRunIntegrationTests,
  skipIntegrationTests,
  getTestDatabaseUrl,
  getTestValkeyUrl,
  getTestMinioConfig,
  getTestMailpitConfig,
} from "./setup";

// Service management
export {
  TEST_CONFIG,
  isContainerRunning,
  areAllContainersRunning,
  getContainersStatus,
  startTestContainers,
  stopTestContainers,
  waitForPostgres,
  waitForValkey,
  waitForMinio,
  waitForMailpit,
  waitForAllServices,
  execSql,
  execValkey,
} from "./services";

// Cleanup utilities
export {
  truncateAllTables,
  truncateTables,
  deleteFromTable,
  flushValkey,
  deleteValkeyKeys,
  getAllValkeyKeys,
  clearMinioBucket,
  ensureMinioBucket,
  clearMailpit,
  getMailpitMessages,
  getMailpitMessage,
  cleanAllTestData,
  type MailpitMessage,
  type MailpitMessageDetail,
} from "./cleanup";
