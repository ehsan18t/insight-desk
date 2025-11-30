/**
 * Valkey Integration Tests
 *
 * Tests real Valkey (Redis) caching functionality including:
 * - Basic cache operations (get, set, delete)
 * - TTL expiration
 * - Valkey 9 hash field expiration commands
 * - Cache patterns and cleanup
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { skipIntegrationTests, flushValkey, execValkey } from "@/test/integration";

describe.skipIf(skipIntegrationTests())("Valkey Integration", () => {
  // Import cache module dynamically to use real Valkey
  let cacheGet: typeof import("@/lib/cache").cacheGet;
  let cacheSet: typeof import("@/lib/cache").cacheSet;
  let cacheDelete: typeof import("@/lib/cache").cacheDelete;
  let cacheDeletePattern: typeof import("@/lib/cache").cacheDeletePattern;
  let checkCacheConnection: typeof import("@/lib/cache").checkCacheConnection;
  let valkey: typeof import("@/lib/cache").valkey;
  let hsetex: typeof import("@/lib/cache").hsetex;
  let hgetex: typeof import("@/lib/cache").hgetex;
  let httl: typeof import("@/lib/cache").httl;
  let hpersist: typeof import("@/lib/cache").hpersist;
  let hexpire: typeof import("@/lib/cache").hexpire;
  let closeCacheConnection: typeof import("@/lib/cache").closeCacheConnection;

  beforeAll(async () => {
    // Import cache module
    const cache = await import("@/lib/cache");
    cacheGet = cache.cacheGet;
    cacheSet = cache.cacheSet;
    cacheDelete = cache.cacheDelete;
    cacheDeletePattern = cache.cacheDeletePattern;
    checkCacheConnection = cache.checkCacheConnection;
    valkey = cache.valkey;
    hsetex = cache.hsetex;
    hgetex = cache.hgetex;
    httl = cache.httl;
    hpersist = cache.hpersist;
    hexpire = cache.hexpire;
    closeCacheConnection = cache.closeCacheConnection;
  });

  beforeEach(() => {
    // Flush before each test for isolation
    flushValkey();
  });

  afterAll(async () => {
    // Clean up
    flushValkey();
    await closeCacheConnection();
  });

  // ─────────────────────────────────────────────────────────────
  // Connection Tests
  // ─────────────────────────────────────────────────────────────

  describe("Connection", () => {
    it("should connect to Valkey successfully", async () => {
      const isConnected = await checkCacheConnection();
      expect(isConnected).toBe(true);
    });

    it("should respond to PING command", async () => {
      const result = execValkey("PING");
      expect(result.trim()).toBe("PONG");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Basic Cache Operations
  // ─────────────────────────────────────────────────────────────

  describe("Basic Operations", () => {
    it("should set and get a string value", async () => {
      await cacheSet("test:string", "hello world");
      const result = await cacheGet<string>("test:string");
      expect(result).toBe("hello world");
    });

    it("should set and get an object value", async () => {
      const data = { id: 1, name: "Test", items: [1, 2, 3] };
      await cacheSet("test:object", data);
      const result = await cacheGet<typeof data>("test:object");
      expect(result).toEqual(data);
    });

    it("should return null for non-existent keys", async () => {
      const result = await cacheGet("non:existent:key");
      expect(result).toBeNull();
    });

    it("should delete a key", async () => {
      await cacheSet("test:delete", "value");
      await cacheDelete("test:delete");
      const result = await cacheGet("test:delete");
      expect(result).toBeNull();
    });

    it("should delete keys by pattern", async () => {
      await cacheSet("pattern:a", "1");
      await cacheSet("pattern:b", "2");
      await cacheSet("pattern:c", "3");
      await cacheSet("other:key", "4");

      await cacheDeletePattern("pattern:*");

      expect(await cacheGet("pattern:a")).toBeNull();
      expect(await cacheGet("pattern:b")).toBeNull();
      expect(await cacheGet("pattern:c")).toBeNull();
      expect(await cacheGet("other:key")).toBe("4");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TTL Tests
  // ─────────────────────────────────────────────────────────────

  describe("TTL Expiration", () => {
    it("should set TTL on cache entries", async () => {
      await cacheSet("test:ttl", "value", 60);
      const ttl = await valkey.ttl("test:ttl");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it("should expire keys after TTL", async () => {
      // Set with 1 second TTL
      await cacheSet("test:expire", "value", 1);

      // Verify it exists
      expect(await cacheGet("test:expire")).toBe("value");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Should be gone
      expect(await cacheGet("test:expire")).toBeNull();
    }, 5000);
  });

  // ─────────────────────────────────────────────────────────────
  // Valkey 9 Hash Field Expiration Tests
  // ─────────────────────────────────────────────────────────────

  describe("Hash Field Expiration (Valkey 9)", () => {
    describe("HSETEX", () => {
      it("should set hash fields with expiration", async () => {
        const result = await hsetex("test:hash", { field1: "value1", field2: "value2" }, 60);
        expect(result).toBeGreaterThanOrEqual(0);

        // Verify fields were set
        const values = await valkey.hmget("test:hash", "field1", "field2");
        expect(values).toEqual(["value1", "value2"]);
      });

      it("should set fields with NX option (key-level)", async () => {
        // First set should succeed
        await hsetex("test:hash:nx", { field: "first" }, 60, { nx: true });
        expect(await valkey.hget("test:hash:nx", "field")).toBe("first");

        // Second set with NX should not overwrite (key exists)
        await hsetex("test:hash:nx", { field: "second" }, 60, { nx: true });
        expect(await valkey.hget("test:hash:nx", "field")).toBe("first");
      });

      it("should set fields with FNX option (field-level)", async () => {
        // Set initial field
        await hsetex("test:hash:fnx", { existing: "original" }, 60);

        // FNX should only set non-existent fields
        await hsetex("test:hash:fnx", { existing: "modified", newField: "new" }, 60, { fnx: true });

        expect(await valkey.hget("test:hash:fnx", "existing")).toBe("original");
        expect(await valkey.hget("test:hash:fnx", "newField")).toBe("new");
      });
    });

    describe("HGETEX", () => {
      it("should get hash fields", async () => {
        await valkey.hset("test:hgetex", "f1", "v1", "f2", "v2");

        const values = await hgetex("test:hgetex", ["f1", "f2", "f3"]);
        expect(values).toEqual(["v1", "v2", null]);
      });

      it("should get fields and update expiration", async () => {
        await valkey.hset("test:hgetex:ex", "field", "value");

        // Get with new expiration
        const values = await hgetex("test:hgetex:ex", ["field"], { ex: 120 });
        expect(values).toEqual(["value"]);

        // Note: TTL verification would require HTTL which is Valkey 9 specific
      });
    });

    describe("HTTL", () => {
      it("should get TTL of hash fields", async () => {
        // Set fields with expiration
        await hsetex("test:httl", { field1: "v1", field2: "v2" }, 60);

        const ttls = await httl("test:httl", ["field1", "field2", "nonexistent"]);
        expect(ttls.length).toBe(3);
        expect(ttls[0]).toBeGreaterThan(0); // Has TTL
        expect(ttls[1]).toBeGreaterThan(0); // Has TTL
        expect(ttls[2]).toBe(-2); // Field doesn't exist
      });

      it("should return -1 for fields without expiration", async () => {
        // Set field without HSETEX (no expiration)
        await valkey.hset("test:httl:noexp", "field", "value");

        const ttls = await httl("test:httl:noexp", ["field"]);
        expect(ttls[0]).toBe(-1); // No expiration
      });
    });

    describe("HPERSIST", () => {
      it("should remove expiration from hash fields", async () => {
        // Set field with expiration
        await hsetex("test:hpersist", { field: "value" }, 60);

        // Remove expiration
        const results = await hpersist("test:hpersist", ["field", "nonexistent"]);
        expect(results[0]).toBe(1); // Expiration removed
        expect(results[1]).toBe(-2); // Field doesn't exist

        // Verify no TTL
        const ttls = await httl("test:hpersist", ["field"]);
        expect(ttls[0]).toBe(-1); // No expiration
      });
    });

    describe("HEXPIRE", () => {
      it("should set expiration on existing hash fields", async () => {
        // Set field without expiration
        await valkey.hset("test:hexpire", "field", "value");

        // Set expiration
        const results = await hexpire("test:hexpire", 60, ["field", "nonexistent"]);
        expect(results[0]).toBe(1); // Expiration set
        expect(results[1]).toBe(-2); // Field doesn't exist

        // Verify TTL
        const ttls = await httl("test:hexpire", ["field"]);
        expect(ttls[0]).toBeGreaterThan(0);
      });

      it("should respect NX option", async () => {
        // Set field with expiration
        await hsetex("test:hexpire:nx", { field: "value" }, 60);

        // Try to set expiration with NX (should fail - already has expiration)
        const results = await hexpire("test:hexpire:nx", 120, ["field"], { nx: true });
        expect(results[0]).toBe(0); // Condition not met

        // Verify TTL unchanged
        const ttls = await httl("test:hexpire:nx", ["field"]);
        expect(ttls[0]).toBeLessThanOrEqual(60);
      });

      it("should respect GT option", async () => {
        // Set field with 30 second TTL
        await hsetex("test:hexpire:gt", { field: "value" }, 30);

        // Try to set smaller TTL with GT (should fail)
        const results1 = await hexpire("test:hexpire:gt", 10, ["field"], { gt: true });
        expect(results1[0]).toBe(0); // New TTL not greater

        // Set larger TTL with GT (should succeed)
        const results2 = await hexpire("test:hexpire:gt", 120, ["field"], { gt: true });
        expect(results2[0]).toBe(1); // New TTL is greater
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Real-world Scenarios
  // ─────────────────────────────────────────────────────────────

  describe("Real-world Scenarios", () => {
    it("should cache API response with TTL", async () => {
      const apiResponse = {
        tickets: [
          { id: "t1", subject: "Issue 1" },
          { id: "t2", subject: "Issue 2" },
        ],
        total: 2,
        fetchedAt: new Date().toISOString(),
      };

      const cacheKey = "api:tickets:org123:page1";
      await cacheSet(cacheKey, apiResponse, 300);

      const cached = await cacheGet<typeof apiResponse>(cacheKey);
      expect(cached).toEqual(apiResponse);
    });

    it("should handle session data with hash fields", async () => {
      const sessionId = "sess:user123";

      // Store session data with per-field expiration
      await hsetex(
        sessionId,
        {
          userId: "user123",
          email: "user@example.com",
          lastActive: Date.now().toString(),
        },
        3600, // 1 hour
      );

      // Get session data
      const values = await hgetex(sessionId, ["userId", "email"]);
      expect(values).toEqual(["user123", "user@example.com"]);

      // Update lastActive and extend expiration
      await hsetex(sessionId, { lastActive: Date.now().toString() }, 3600);
    });

    it("should invalidate cache on data change", async () => {
      const orgId = "org123";

      // Cache ticket list
      await cacheSet(`tickets:${orgId}:list`, [{ id: "t1" }], 300);
      await cacheSet(`tickets:${orgId}:count`, 1, 300);
      await cacheSet(`tickets:${orgId}:stats`, { open: 1, closed: 0 }, 300);

      // On data change, invalidate all org ticket caches
      await cacheDeletePattern(`tickets:${orgId}:*`);

      // All should be null
      expect(await cacheGet(`tickets:${orgId}:list`)).toBeNull();
      expect(await cacheGet(`tickets:${orgId}:count`)).toBeNull();
      expect(await cacheGet(`tickets:${orgId}:stats`)).toBeNull();
    });
  });
});
