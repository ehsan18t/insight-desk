/**
 * Vitest Test Setup
 *
 * This file runs before each test file.
 * It sets up the test environment, database connection, and cleanup.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

// ─────────────────────────────────────────────────────────────
// Load Test Environment
// ─────────────────────────────────────────────────────────────
function loadTestEnv() {
  const envPath = resolve(__dirname, "../../.env.test");
  const envContent = readFileSync(envPath, "utf-8");

  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Load env before anything else
loadTestEnv();

// ─────────────────────────────────────────────────────────────
// Mock External Services (before importing app modules)
// ─────────────────────────────────────────────────────────────

// Mock email service
vi.mock("@/utils/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: "test-id" }),
  sendTicketNotification: vi.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock cache - use in-memory implementation
const mockCache = new Map<string, { value: string; expiry?: number }>();

vi.mock("@/utils/cache", () => ({
  cache: {
    get: vi.fn(async (key: string) => {
      const item = mockCache.get(key);
      if (!item) return null;
      if (item.expiry && Date.now() > item.expiry) {
        mockCache.delete(key);
        return null;
      }
      return item.value;
    }),
    set: vi.fn(async (key: string, value: string, ttlSeconds?: number) => {
      mockCache.set(key, {
        value,
        expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
    }),
    del: vi.fn(async (key: string) => {
      mockCache.delete(key);
    }),
    exists: vi.fn(async (key: string) => mockCache.has(key)),
    clear: vi.fn(async () => mockCache.clear()),
  },
  initCache: vi.fn().mockResolvedValue(undefined),
  closeCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock job queue
vi.mock("@/utils/jobs", () => ({
  jobQueue: {
    add: vi.fn().mockResolvedValue({ id: "test-job-id" }),
    getJob: vi.fn().mockResolvedValue(null),
  },
  initJobQueue: vi.fn().mockResolvedValue(undefined),
  closeJobQueue: vi.fn().mockResolvedValue(undefined),
}));

// Mock socket.io
vi.mock("@/utils/socket", () => ({
  getIO: vi.fn(() => ({
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    in: vi.fn().mockReturnThis(),
  })),
  initSocketIO: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────
// Database Setup
// ─────────────────────────────────────────────────────────────

// Import db after mocks are set up
let db: typeof import("@/db").db;
let closeDatabaseConnection: typeof import("@/db").closeDatabaseConnection;

beforeAll(async () => {
  // Dynamically import to ensure mocks are in place
  const dbModule = await import("@/db");
  db = dbModule.db;
  closeDatabaseConnection = dbModule.closeDatabaseConnection;

  // Note: In a real setup, you'd run migrations here
  // await migrate(db, { migrationsFolder: "./drizzle" });
});

afterEach(async () => {
  // Clear mock cache between tests
  mockCache.clear();

  // Reset all mocks
  vi.clearAllMocks();
});

afterAll(async () => {
  // Close database connection
  if (closeDatabaseConnection) {
    await closeDatabaseConnection();
  }
});

// ─────────────────────────────────────────────────────────────
// Global Test Utilities
// ─────────────────────────────────────────────────────────────

// Export for use in tests
export { db, mockCache };
