/**
 * Edge Case Tests
 *
 * Tests for edge cases, boundary conditions, and error scenarios:
 * - Invalid UUID handling
 * - Pagination edge cases
 * - Concurrent access scenarios
 * - Database constraint violations
 * - Role-based access edge cases
 */

import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/middleware/error-handler";

// ─────────────────────────────────────────────────────────────
// UUID Validation Edge Cases
// ─────────────────────────────────────────────────────────────

describe("UUID Validation Edge Cases", () => {
  const uuidSchema = z.string().uuid();

  it("should accept valid UUID v4", () => {
    const validUUIDs = [
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    ];

    for (const uuid of validUUIDs) {
      expect(() => uuidSchema.parse(uuid)).not.toThrow();
    }
  });

  it("should reject invalid UUID formats", () => {
    const invalidUUIDs = [
      "",
      "not-a-uuid",
      "550e8400-e29b-41d4-a716", // too short
      "550e8400-e29b-41d4-a716-446655440000-extra", // too long
      "550e8400e29b41d4a716446655440000", // no hyphens
      "ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ", // invalid characters
      "550e8400-e29b-41d4-a716-44665544000g", // invalid hex
      "123", // too short
      null,
      undefined,
    ];

    for (const uuid of invalidUUIDs) {
      expect(() => uuidSchema.parse(uuid)).toThrow();
    }
  });

  it("should handle case-insensitive UUIDs", () => {
    const upperCase = "550E8400-E29B-41D4-A716-446655440000";
    const lowerCase = "550e8400-e29b-41d4-a716-446655440000";

    // Both should be valid (zod uuid is case-insensitive)
    expect(() => uuidSchema.parse(upperCase)).not.toThrow();
    expect(() => uuidSchema.parse(lowerCase)).not.toThrow();
  });

  it("should handle UUIDs with special characters", () => {
    const specialCases = [
      " 550e8400-e29b-41d4-a716-446655440000", // leading space
      "550e8400-e29b-41d4-a716-446655440000 ", // trailing space
      "\t550e8400-e29b-41d4-a716-446655440000", // tab
      "550e8400-e29b-41d4-a716-446655440000\n", // newline
    ];

    for (const uuid of specialCases) {
      expect(() => uuidSchema.parse(uuid)).toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Pagination Edge Cases
// ─────────────────────────────────────────────────────────────

describe("Pagination Edge Cases", () => {
  const paginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
  });

  it("should accept valid pagination values", () => {
    const validCases = [
      { page: 1, limit: 20 },
      { page: 100, limit: 100 },
      { page: 1, limit: 1 },
      { page: "1", limit: "20" }, // string coercion
    ];

    for (const pagination of validCases) {
      const result = paginationSchema.parse(pagination);
      expect(result.page).toBeGreaterThanOrEqual(1);
      expect(result.limit).toBeGreaterThanOrEqual(1);
      expect(result.limit).toBeLessThanOrEqual(100);
    }
  });

  it("should reject invalid page values", () => {
    const invalidCases = [
      { page: 0, limit: 20 },
      { page: -1, limit: 20 },
      { page: -100, limit: 20 },
    ];

    for (const pagination of invalidCases) {
      expect(() => paginationSchema.parse(pagination)).toThrow();
    }
  });

  it("should reject invalid limit values", () => {
    const invalidCases = [
      { page: 1, limit: 0 },
      { page: 1, limit: -1 },
      { page: 1, limit: 101 },
      { page: 1, limit: 1000 },
    ];

    for (const pagination of invalidCases) {
      expect(() => paginationSchema.parse(pagination)).toThrow();
    }
  });

  it("should apply default values when omitted", () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("should handle float values by coercion", () => {
    const result = paginationSchema.parse({ page: "1.5", limit: "20.9" });
    expect(result.page).toBe(1.5);
    expect(result.limit).toBe(20.9);
  });

  it("should handle non-numeric strings", () => {
    expect(() => paginationSchema.parse({ page: "abc", limit: "20" })).toThrow();
    expect(() => paginationSchema.parse({ page: "1", limit: "xyz" })).toThrow();
  });

  describe("Pagination boundary calculations", () => {
    function calculatePagination(page: number, limit: number, total: number) {
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return { totalPages, offset, hasNext, hasPrev };
    }

    it("should handle empty results", () => {
      const result = calculatePagination(1, 20, 0);
      expect(result.totalPages).toBe(0);
      expect(result.offset).toBe(0);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(false);
    });

    it("should handle single page results", () => {
      const result = calculatePagination(1, 20, 10);
      expect(result.totalPages).toBe(1);
      expect(result.offset).toBe(0);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(false);
    });

    it("should handle exact page boundary", () => {
      const result = calculatePagination(1, 20, 20);
      expect(result.totalPages).toBe(1);
      expect(result.hasNext).toBe(false);
    });

    it("should handle multiple pages", () => {
      const result = calculatePagination(2, 20, 50);
      expect(result.totalPages).toBe(3);
      expect(result.offset).toBe(20);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(true);
    });

    it("should handle last page", () => {
      const result = calculatePagination(3, 20, 50);
      expect(result.totalPages).toBe(3);
      expect(result.offset).toBe(40);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });

    it("should handle page beyond total", () => {
      const result = calculatePagination(10, 20, 50);
      expect(result.totalPages).toBe(3);
      expect(result.offset).toBe(180); // Would return empty results
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Error Hierarchy Tests
// ─────────────────────────────────────────────────────────────

describe("Error Hierarchy", () => {
  it("NotFoundError should have correct status code", () => {
    const error = new NotFoundError("Resource not found");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Resource not found");
  });

  it("ForbiddenError should have correct status code", () => {
    const error = new ForbiddenError("Access denied");
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });

  it("BadRequestError should have correct status code", () => {
    const error = new BadRequestError("Invalid input");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
  });

  it("ConflictError should have correct status code", () => {
    const error = new ConflictError("Resource already exists");
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("CONFLICT");
  });

  it("Errors should be instances of Error", () => {
    expect(new NotFoundError()).toBeInstanceOf(Error);
    expect(new ForbiddenError()).toBeInstanceOf(Error);
    expect(new BadRequestError()).toBeInstanceOf(Error);
    expect(new ConflictError()).toBeInstanceOf(Error);
  });

  it("Errors should have stack traces", () => {
    const error = new NotFoundError("Test");
    expect(error.stack).toBeDefined();
    // Stack trace contains the file path where error was created
    expect(error.stack).toContain("edge-cases.test.ts");
  });

  it("Errors should have correct code property", () => {
    const notFound = new NotFoundError("Test");
    const forbidden = new ForbiddenError("Test");
    const badRequest = new BadRequestError("Test");
    const conflict = new ConflictError("Test");

    expect(notFound.code).toBe("NOT_FOUND");
    expect(forbidden.code).toBe("FORBIDDEN");
    expect(badRequest.code).toBe("BAD_REQUEST");
    expect(conflict.code).toBe("CONFLICT");
  });
});

// ─────────────────────────────────────────────────────────────
// Role-Based Access Control Edge Cases
// ─────────────────────────────────────────────────────────────

describe("Role-Based Access Control Edge Cases", () => {
  const roles = ["customer", "agent", "admin", "owner"] as const;

  function checkAccess(userRole: string, requiredRoles: string[]): boolean {
    return requiredRoles.includes(userRole);
  }

  function checkRoleHierarchy(userRole: string, minimumRole: string): boolean {
    const roleHierarchy = { customer: 0, agent: 1, admin: 2, owner: 3 };
    return (
      roleHierarchy[userRole as keyof typeof roleHierarchy] >=
      roleHierarchy[minimumRole as keyof typeof roleHierarchy]
    );
  }

  it("should correctly check role inclusion", () => {
    expect(checkAccess("admin", ["admin", "owner"])).toBe(true);
    expect(checkAccess("agent", ["admin", "owner"])).toBe(false);
    expect(checkAccess("customer", ["customer", "agent", "admin", "owner"])).toBe(true);
  });

  it("should correctly check role hierarchy", () => {
    expect(checkRoleHierarchy("owner", "customer")).toBe(true);
    expect(checkRoleHierarchy("owner", "owner")).toBe(true);
    expect(checkRoleHierarchy("customer", "agent")).toBe(false);
    expect(checkRoleHierarchy("agent", "customer")).toBe(true);
  });

  it("should handle edge case of same role", () => {
    for (const role of roles) {
      expect(checkRoleHierarchy(role, role)).toBe(true);
    }
  });

  it("should maintain role hierarchy order", () => {
    // Customer < Agent < Admin < Owner
    expect(checkRoleHierarchy("agent", "customer")).toBe(true);
    expect(checkRoleHierarchy("admin", "agent")).toBe(true);
    expect(checkRoleHierarchy("owner", "admin")).toBe(true);

    // Reverse should fail
    expect(checkRoleHierarchy("customer", "agent")).toBe(false);
    expect(checkRoleHierarchy("agent", "admin")).toBe(false);
    expect(checkRoleHierarchy("admin", "owner")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// String Input Validation Edge Cases
// ─────────────────────────────────────────────────────────────

describe("String Input Validation Edge Cases", () => {
  const titleSchema = z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(255, "Title cannot exceed 255 characters");

  const descriptionSchema = z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(10000, "Description cannot exceed 10000 characters");

  it("should accept strings at minimum length", () => {
    expect(() => titleSchema.parse("12345")).not.toThrow();
    expect(() => descriptionSchema.parse("1234567890")).not.toThrow();
  });

  it("should accept strings at maximum length", () => {
    expect(() => titleSchema.parse("a".repeat(255))).not.toThrow();
    expect(() => descriptionSchema.parse("a".repeat(10000))).not.toThrow();
  });

  it("should reject strings below minimum length", () => {
    expect(() => titleSchema.parse("1234")).toThrow();
    expect(() => descriptionSchema.parse("123456789")).toThrow();
  });

  it("should reject strings above maximum length", () => {
    expect(() => titleSchema.parse("a".repeat(256))).toThrow();
    expect(() => descriptionSchema.parse("a".repeat(10001))).toThrow();
  });

  it("should handle unicode characters correctly", () => {
    // Unicode characters should count as characters, not bytes
    expect(() => titleSchema.parse("👋🌍🎉🚀✨")).not.toThrow();
    expect(() => titleSchema.parse("日本語テスト")).not.toThrow();
  });

  it("should handle empty strings", () => {
    expect(() => titleSchema.parse("")).toThrow();
    expect(() => descriptionSchema.parse("")).toThrow();
  });

  it("should handle whitespace-only strings", () => {
    // Whitespace counts as characters
    expect(() => titleSchema.parse("     ")).not.toThrow();
    expect(() => titleSchema.parse("   ")).toThrow(); // only 3 spaces
  });

  it("should handle special characters", () => {
    expect(() => titleSchema.parse("<script>alert('xss')</script>")).not.toThrow();
    expect(() => titleSchema.parse("' OR 1=1 --")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Email Validation Edge Cases
// ─────────────────────────────────────────────────────────────

describe("Email Validation Edge Cases", () => {
  const emailSchema = z.string().email();

  it("should accept valid email formats", () => {
    const validEmails = [
      "user@example.com",
      "user.name@example.com",
      "user+tag@example.com",
      "user@subdomain.example.com",
      "user@example.co.uk",
      "123@example.com",
    ];

    for (const email of validEmails) {
      expect(() => emailSchema.parse(email)).not.toThrow();
    }
  });

  it("should reject invalid email formats", () => {
    const invalidEmails = [
      "",
      "notanemail",
      "@example.com",
      "user@",
      "user@.com",
      "user@example",
      "user @example.com",
      "user@ example.com",
    ];

    for (const email of invalidEmails) {
      expect(() => emailSchema.parse(email)).toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Enum Validation Edge Cases
// ─────────────────────────────────────────────────────────────

describe("Enum Validation Edge Cases", () => {
  const statusSchema = z.enum(["open", "pending", "resolved", "closed"]);
  const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);

  it("should accept valid enum values", () => {
    expect(statusSchema.parse("open")).toBe("open");
    expect(prioritySchema.parse("urgent")).toBe("urgent");
  });

  it("should reject invalid enum values", () => {
    expect(() => statusSchema.parse("invalid")).toThrow();
    expect(() => prioritySchema.parse("critical")).toThrow();
  });

  it("should be case-sensitive", () => {
    expect(() => statusSchema.parse("OPEN")).toThrow();
    expect(() => statusSchema.parse("Open")).toThrow();
    expect(() => prioritySchema.parse("HIGH")).toThrow();
  });

  it("should reject empty strings", () => {
    expect(() => statusSchema.parse("")).toThrow();
    expect(() => prioritySchema.parse("")).toThrow();
  });

  it("should reject null and undefined", () => {
    expect(() => statusSchema.parse(null)).toThrow();
    expect(() => prioritySchema.parse(undefined)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Array Validation Edge Cases
// ─────────────────────────────────────────────────────────────

describe("Array Validation Edge Cases", () => {
  const tagsSchema = z.array(z.string()).max(10);
  const attachmentsSchema = z.array(z.string().uuid()).max(10);

  it("should accept empty arrays", () => {
    expect(() => tagsSchema.parse([])).not.toThrow();
    expect(() => attachmentsSchema.parse([])).not.toThrow();
  });

  it("should accept arrays at maximum length", () => {
    const tenTags = Array(10).fill("tag");
    const tenUUIDs = Array(10).fill("550e8400-e29b-41d4-a716-446655440000");

    expect(() => tagsSchema.parse(tenTags)).not.toThrow();
    expect(() => attachmentsSchema.parse(tenUUIDs)).not.toThrow();
  });

  it("should reject arrays exceeding maximum length", () => {
    const elevenTags = Array(11).fill("tag");
    const elevenUUIDs = Array(11).fill("550e8400-e29b-41d4-a716-446655440000");

    expect(() => tagsSchema.parse(elevenTags)).toThrow();
    expect(() => attachmentsSchema.parse(elevenUUIDs)).toThrow();
  });

  it("should validate array item types", () => {
    expect(() => tagsSchema.parse([1, 2, 3])).toThrow();
    expect(() => attachmentsSchema.parse(["not-a-uuid"])).toThrow();
  });

  it("should handle mixed valid/invalid items", () => {
    expect(() =>
      attachmentsSchema.parse(["550e8400-e29b-41d4-a716-446655440000", "not-a-uuid"]),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Date/Timestamp Edge Cases
// ─────────────────────────────────────────────────────────────

describe("Date/Timestamp Edge Cases", () => {
  it("should handle various date formats", () => {
    const dateSchema = z.coerce.date();

    const validDates = [
      "2024-01-15",
      "2024-01-15T10:30:00Z",
      "2024-01-15T10:30:00.000Z",
      new Date(),
      Date.now(),
    ];

    for (const date of validDates) {
      expect(() => dateSchema.parse(date)).not.toThrow();
    }
  });

  it("should handle date range comparisons", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    expect(yesterday < now).toBe(true);
    expect(tomorrow > now).toBe(true);
    expect(now >= yesterday).toBe(true);
    expect(now <= tomorrow).toBe(true);
  });

  it("should handle timezone considerations", () => {
    const utcDate = new Date("2024-01-15T12:00:00Z");
    const localDate = new Date("2024-01-15T12:00:00");

    // UTC date should be timezone-aware
    expect(utcDate.toISOString()).toContain("Z");

    // Local date should differ from UTC if not in UTC timezone
    // or be the same if the test environment is in UTC
    expect(localDate instanceof Date).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Concurrent Access Scenarios
// ─────────────────────────────────────────────────────────────

describe("Concurrent Access Scenarios", () => {
  it("should handle concurrent updates simulation", async () => {
    let counter = 0;
    const increment = async () => {
      const current = counter;
      await new Promise((r) => setTimeout(r, Math.random() * 10));
      counter = current + 1;
    };

    // Simulate race condition
    await Promise.all([increment(), increment(), increment()]);

    // Without proper locking, this could be 1, 2, or 3
    // This demonstrates why optimistic locking or transactions are needed
    expect(counter).toBeLessThanOrEqual(3);
  });

  it("should handle concurrent reads", async () => {
    const data = { value: "original" };
    const results: string[] = [];

    const read = async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      results.push(data.value);
    };

    await Promise.all([read(), read(), read(), read(), read()]);

    // All reads should see the same value
    expect(results.every((r) => r === "original")).toBe(true);
    expect(results).toHaveLength(5);
  });

  it("should demonstrate optimistic locking concept", async () => {
    interface VersionedData {
      value: string;
      version: number;
    }

    const data: VersionedData = { value: "original", version: 1 };

    function updateWithVersion(newValue: string, expectedVersion: number): boolean {
      if (data.version !== expectedVersion) {
        return false; // Conflict detected
      }
      data.value = newValue;
      data.version++;
      return true;
    }

    // First update succeeds
    expect(updateWithVersion("first", 1)).toBe(true);
    expect(data.version).toBe(2);

    // Second update with stale version fails
    expect(updateWithVersion("second", 1)).toBe(false);
    expect(data.value).toBe("first");
  });
});

// ─────────────────────────────────────────────────────────────
// Null and Undefined Handling
// ─────────────────────────────────────────────────────────────

describe("Null and Undefined Handling", () => {
  const optionalStringSchema = z.string().optional();
  const nullableStringSchema = z.string().nullable();
  const nullishStringSchema = z.string().nullish();

  it("should handle optional fields correctly", () => {
    expect(optionalStringSchema.parse(undefined)).toBeUndefined();
    expect(optionalStringSchema.parse("value")).toBe("value");
    expect(() => optionalStringSchema.parse(null)).toThrow();
  });

  it("should handle nullable fields correctly", () => {
    expect(nullableStringSchema.parse(null)).toBeNull();
    expect(nullableStringSchema.parse("value")).toBe("value");
    expect(() => nullableStringSchema.parse(undefined)).toThrow();
  });

  it("should handle nullish fields correctly", () => {
    expect(nullishStringSchema.parse(null)).toBeNull();
    expect(nullishStringSchema.parse(undefined)).toBeUndefined();
    expect(nullishStringSchema.parse("value")).toBe("value");
  });

  it("should handle nested optional objects", () => {
    const nestedSchema = z.object({
      user: z
        .object({
          name: z.string(),
          email: z.string().optional(),
        })
        .optional(),
    });

    expect(() => nestedSchema.parse({})).not.toThrow();
    expect(() => nestedSchema.parse({ user: { name: "Test" } })).not.toThrow();
    expect(() =>
      nestedSchema.parse({ user: { name: "Test", email: "test@example.com" } }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Database Constraint Simulation
// ─────────────────────────────────────────────────────────────

describe("Database Constraint Simulation", () => {
  const uniqueConstraint = new Set<string>();

  function simulateInsert(key: string): boolean {
    if (uniqueConstraint.has(key)) {
      return false; // Unique constraint violation
    }
    uniqueConstraint.add(key);
    return true;
  }

  beforeEach(() => {
    uniqueConstraint.clear();
  });

  it("should allow first insert", () => {
    expect(simulateInsert("key1")).toBe(true);
  });

  it("should reject duplicate insert", () => {
    simulateInsert("key1");
    expect(simulateInsert("key1")).toBe(false);
  });

  it("should allow different keys", () => {
    expect(simulateInsert("key1")).toBe(true);
    expect(simulateInsert("key2")).toBe(true);
    expect(simulateInsert("key3")).toBe(true);
  });

  describe("Foreign key simulation", () => {
    const organizations = new Set(["org-1", "org-2"]);
    const users = new Map<string, string>(); // userId -> organizationId

    function addUser(userId: string, organizationId: string): boolean {
      if (!organizations.has(organizationId)) {
        return false; // Foreign key violation
      }
      users.set(userId, organizationId);
      return true;
    }

    it("should allow insert with valid foreign key", () => {
      expect(addUser("user-1", "org-1")).toBe(true);
    });

    it("should reject insert with invalid foreign key", () => {
      expect(addUser("user-1", "non-existent-org")).toBe(false);
    });
  });
});
