/**
 * Vitest Test Setup
 *
 * This file runs before each test file.
 * It sets up the test environment, database connection, and cleanup.
 *
 * For unit tests (default):
 *   - Mocks all external services (Valkey/MinIO/Email)
 *   - Run with: npm run test
 *
 * For integration tests (RUN_INTEGRATION_TESTS=true):
 *   - Uses real external services from docker-compose.test.yml
 *   - Run with: npm run test:integration
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

// ─────────────────────────────────────────────────────────────
// Load Test Environment (MUST happen first, before any checks)
// ─────────────────────────────────────────────────────────────

// Check for integration test mode BEFORE loading .env.test
// This allows cross-env to set RUN_INTEGRATION_TESTS=true
const isIntegrationTest = process.env.RUN_INTEGRATION_TESTS === "true";

function loadTestEnv() {
  const envPath = resolve(__dirname, "../../.env.test");
  try {
    const envContent = readFileSync(envPath, "utf-8");

    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const equalIndex = trimmed.indexOf("=");
      if (equalIndex === -1) continue;

      const key = trimmed.slice(0, equalIndex).trim();
      const value = trimmed.slice(equalIndex + 1).trim();

      // Don't override existing env vars (allows CLI to take precedence)
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.test might not exist, that's okay
  }
}

// Load env after checking isIntegrationTest
loadTestEnv();

// Log test mode for debugging
if (isIntegrationTest) {
  console.log("🔌 Running in INTEGRATION TEST mode (using real services)");
}

// ─────────────────────────────────────────────────────────────
// In-Memory Mock Storage for Unit Tests
// ─────────────────────────────────────────────────────────────

// Simple cache for cacheGet/cacheSet functions
const mockCache = new Map<string, { value: string; expiry?: number }>();

// Hash storage for valkey.hincrby/hget/etc (used by rate-limiter)
const mockHashStore = new Map<string, Map<string, string>>();
const mockKeyExpiry = new Map<string, number>();

// Helper to check if a key has expired
function isKeyExpired(key: string): boolean {
  const expiry = mockKeyExpiry.get(key);
  if (expiry && Date.now() > expiry) {
    mockCache.delete(key);
    mockHashStore.delete(key);
    mockKeyExpiry.delete(key);
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Conditional Mocks - Use factory pattern for conditional mocking
// vi.mock() is hoisted, but factory is evaluated at runtime
// ─────────────────────────────────────────────────────────────

// Mock email service (only for unit tests)
vi.mock("@/lib/email", async (importOriginal) => {
  if (process.env.RUN_INTEGRATION_TESTS === "true") {
    return importOriginal();
  }
  return {
    sendEmail: vi.fn().mockResolvedValue(true),
    sendTemplateEmail: vi.fn().mockResolvedValue(true),
  };
});

// Mock @/lib/cache - The main cache module with valkey client
vi.mock("@/lib/cache", async (importOriginal) => {
  // For integration tests, use real module
  if (process.env.RUN_INTEGRATION_TESTS === "true") {
    return importOriginal();
  }

  // For unit tests, use in-memory mock
  return {
    // Valkey client mock - implements methods used by rate-limiter
    valkey: {
      // Hash operations (used by rate-limiter)
      hincrby: vi.fn(async (key: string, field: string, increment: number) => {
        isKeyExpired(key);
        let hash = mockHashStore.get(key);
        if (!hash) {
          hash = new Map<string, string>();
          mockHashStore.set(key, hash);
        }
        const current = Number.parseInt(hash.get(field) || "0", 10);
        const newValue = current + increment;
        hash.set(field, newValue.toString());
        return newValue;
      }),
      hget: vi.fn(async (key: string, field: string) => {
        if (isKeyExpired(key)) return null;
        const hash = mockHashStore.get(key);
        return hash?.get(field) || null;
      }),
      hset: vi.fn(async (key: string, field: string, value: string) => {
        let hash = mockHashStore.get(key);
        if (!hash) {
          hash = new Map<string, string>();
          mockHashStore.set(key, hash);
        }
        hash.set(field, value);
        return 1;
      }),
      hdel: vi.fn(async (key: string, ...fields: string[]) => {
        const hash = mockHashStore.get(key);
        if (!hash) return 0;
        let deleted = 0;
        for (const field of fields) {
          if (hash.delete(field)) deleted++;
        }
        return deleted;
      }),
      expire: vi.fn(async (key: string, seconds: number) => {
        mockKeyExpiry.set(key, Date.now() + seconds * 1000);
        return 1;
      }),
      call: vi.fn(async (command: string, ..._args: unknown[]) => {
        if (command === "HEXPIRE") return 1;
        return null;
      }),
      get: vi.fn(async (key: string) => {
        if (isKeyExpired(key)) return null;
        const item = mockCache.get(key);
        return item?.value || null;
      }),
      set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
        const exIndex = args.indexOf("EX");
        const ttl = exIndex >= 0 ? (args[exIndex + 1] as number) : undefined;
        mockCache.set(key, {
          value,
          expiry: ttl ? Date.now() + ttl * 1000 : undefined,
        });
        if (ttl) {
          mockKeyExpiry.set(key, Date.now() + ttl * 1000);
        }
        return "OK";
      }),
      del: vi.fn(async (...keys: string[]) => {
        let deleted = 0;
        for (const key of keys) {
          if (mockCache.delete(key)) deleted++;
          if (mockHashStore.delete(key)) deleted++;
          mockKeyExpiry.delete(key);
        }
        return deleted;
      }),
      keys: vi.fn(async (_pattern: string) => {
        return [...mockCache.keys(), ...mockHashStore.keys()];
      }),
      ping: vi.fn(async () => "PONG"),
      quit: vi.fn(async () => "OK"),
      on: vi.fn(),
    },
    cacheGet: vi.fn(async (key: string) => {
      if (isKeyExpired(key)) return null;
      const item = mockCache.get(key);
      if (!item) return null;
      try {
        return JSON.parse(item.value);
      } catch {
        return null;
      }
    }),
    cacheSet: vi.fn(async (key: string, value: unknown, ttlSeconds?: number) => {
      mockCache.set(key, {
        value: JSON.stringify(value),
        expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
      if (ttlSeconds) {
        mockKeyExpiry.set(key, Date.now() + ttlSeconds * 1000);
      }
    }),
    cacheDelete: vi.fn(async (key: string) => {
      mockCache.delete(key);
      mockKeyExpiry.delete(key);
    }),
    cacheDeletePattern: vi.fn(async (_pattern: string) => {
      mockCache.clear();
    }),
    checkCacheConnection: vi.fn(async () => true),
    closeCacheConnection: vi.fn(async () => undefined),
  };
});

// Mock job queue (only for unit tests)
vi.mock("@/utils/jobs", async (importOriginal) => {
  if (process.env.RUN_INTEGRATION_TESTS === "true") {
    return importOriginal();
  }
  return {
    jobQueue: {
      add: vi.fn().mockResolvedValue({ id: "test-job-id" }),
      getJob: vi.fn().mockResolvedValue(null),
    },
    initJobQueue: vi.fn().mockResolvedValue(undefined),
    closeJobQueue: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock socket.io (only for unit tests)
vi.mock("@/utils/socket", async (importOriginal) => {
  if (process.env.RUN_INTEGRATION_TESTS === "true") {
    return importOriginal();
  }
  return {
    getIO: vi.fn(() => ({
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
      in: vi.fn().mockReturnThis(),
    })),
    initSocketIO: vi.fn(),
  };
});

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
});

afterEach(async () => {
  // Clear mock storage between tests (unit tests only)
  if (!isIntegrationTest) {
    mockCache.clear();
    mockHashStore.clear();
    mockKeyExpiry.clear();
  }

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
export { db, mockCache, mockHashStore, mockKeyExpiry, isIntegrationTest };
