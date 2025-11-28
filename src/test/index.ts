/**
 * Test Utilities Index
 *
 * Re-exports all test utilities for convenient imports.
 * Usage: import { createTestUser, authenticatedRequest } from "@/test";
 */

// Factories for creating test data
export {
  type CreateMembershipOptions,
  type CreateMessageOptions,
  type CreateOrganizationOptions,
  type CreateTicketOptions,
  type CreateUserOptions,
  type CreateUserWithOrgOptions,
  createTestMembership,
  createTestMessage,
  createTestOrganization,
  createTestScenario,
  createTestTicket,
  createTestUser,
  createTestUserWithOrg,
  generateEmail,
  generateId,
  generateSlug,
  type TestScenario,
} from "./factories";

// Test helpers and utilities
export {
  type ApiResponse,
  authenticatedRequest,
  cleanDatabase,
  cleanupTables,
  createMockFn,
  createMockSession,
  expectError,
  expectSuccess,
  type MockSession,
  sleep,
  waitFor,
} from "./helpers";
