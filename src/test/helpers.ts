/**
 * Test Helpers
 *
 * Utilities for authentication, API testing, and common test operations.
 */

import type { Express } from "express";
import request, { type Response, type Test } from "supertest";
import { vi } from "vitest";

// ─────────────────────────────────────────────────────────────
// Auth Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Mock session data for authenticated requests
 */
export interface MockSession {
  userId: string;
  sessionId: string;
  organizationId?: string;
  role?: string;
}

/**
 * Create a mock session token (for testing auth middleware)
 * In tests, we mock the auth middleware to use this data
 */
export function createMockSession(data: Partial<MockSession> = {}): MockSession {
  return {
    userId: data.userId ?? "test-user-id",
    sessionId: data.sessionId ?? "test-session-id",
    organizationId: data.organizationId,
    role: data.role,
  };
}

/**
 * Create an authenticated supertest request
 * Sets up headers that the mocked auth middleware will recognize
 */
export function authenticatedRequest(app: Express, session: MockSession) {
  return {
    get: (url: string): Test =>
      request(app)
        .get(url)
        .set("X-Test-User-Id", session.userId)
        .set("X-Test-Session-Id", session.sessionId)
        .set("X-Organization-Id", session.organizationId ?? ""),

    post: (url: string): Test =>
      request(app)
        .post(url)
        .set("X-Test-User-Id", session.userId)
        .set("X-Test-Session-Id", session.sessionId)
        .set("X-Organization-Id", session.organizationId ?? ""),

    patch: (url: string): Test =>
      request(app)
        .patch(url)
        .set("X-Test-User-Id", session.userId)
        .set("X-Test-Session-Id", session.sessionId)
        .set("X-Organization-Id", session.organizationId ?? ""),

    put: (url: string): Test =>
      request(app)
        .put(url)
        .set("X-Test-User-Id", session.userId)
        .set("X-Test-Session-Id", session.sessionId)
        .set("X-Organization-Id", session.organizationId ?? ""),

    delete: (url: string): Test =>
      request(app)
        .delete(url)
        .set("X-Test-User-Id", session.userId)
        .set("X-Test-Session-Id", session.sessionId)
        .set("X-Organization-Id", session.organizationId ?? ""),
  };
}

// ─────────────────────────────────────────────────────────────
// Response Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Standard API response structure
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: Array<{ field: string; message: string }>;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Assert a successful API response
 */
export function expectSuccess<T>(response: Response): ApiResponse<T> {
  const body = response.body as ApiResponse<T>;
  if (!body.success) {
    throw new Error(`Expected success but got error: ${body.error}`);
  }
  return body;
}

/**
 * Assert an error API response
 */
export function expectError(response: Response, expectedError?: string): ApiResponse {
  const body = response.body as ApiResponse;
  if (body.success) {
    throw new Error("Expected error but got success");
  }
  if (expectedError && body.error !== expectedError) {
    throw new Error(`Expected error "${expectedError}" but got "${body.error}"`);
  }
  return body;
}

// ─────────────────────────────────────────────────────────────
// Mock Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Create a mock function that tracks calls
 */
export function createMockFn<T extends (...args: unknown[]) => unknown>() {
  return vi.fn<T>();
}

/**
 * Wait for a condition to be true (useful for async operations)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timed out after ${timeout}ms`);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// Database Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Clean up specific tables (respecting foreign key constraints)
 * Order matters: delete child tables before parent tables
 */
export async function cleanupTables(
  db: typeof import("@/db").db,
  tables: Array<"messages" | "tickets" | "userOrganizations" | "users" | "organizations">,
): Promise<void> {
  const schema = await import("@/db/schema");

  const tableMap = {
    messages: schema.ticketMessages,
    tickets: schema.tickets,
    userOrganizations: schema.userOrganizations,
    users: schema.users,
    organizations: schema.organizations,
  };

  for (const tableName of tables) {
    await db.delete(tableMap[tableName]);
  }
}

/**
 * Clean all test data from the database
 */
export async function cleanDatabase(db: typeof import("@/db").db): Promise<void> {
  await cleanupTables(db, ["messages", "tickets", "userOrganizations", "users", "organizations"]);
}
