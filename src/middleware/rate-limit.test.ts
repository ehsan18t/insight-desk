/**
 * Rate Limit Middleware Tests
 *
 * Tests for request rate limiting middleware.
 */

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { rateLimit } from "@/middleware/rate-limit";

// ─────────────────────────────────────────────────────────────
// Test App Factory
// ─────────────────────────────────────────────────────────────

function createApp(options?: { windowMs?: number; maxRequests?: number; message?: string }) {
  const app = express();
  app.use(rateLimit(options));
  app.get("/test", (_req, res) => {
    res.json({ success: true });
  });
  return app;
}

// Helper to generate unique IP for test isolation
function uniqueIp(): string {
  return `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// ─────────────────────────────────────────────────────────────
// Basic Rate Limiting Tests
// ─────────────────────────────────────────────────────────────

describe("rateLimit middleware", () => {
  describe("basic rate limiting", () => {
    it("should allow requests under the limit", async () => {
      const app = createApp({ maxRequests: 5, windowMs: 60000 });
      const ip = uniqueIp();

      const response = await request(app).get("/test").set("X-Forwarded-For", ip);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should set rate limit headers", async () => {
      const app = createApp({ maxRequests: 10, windowMs: 60000 });
      const ip = uniqueIp();

      const response = await request(app).get("/test").set("X-Forwarded-For", ip);

      expect(response.headers["x-ratelimit-limit"]).toBe("10");
      expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(response.headers["x-ratelimit-reset"]).toBeDefined();
    });

    it("should decrement remaining count with each request", async () => {
      const app = createApp({ maxRequests: 5, windowMs: 60000 });
      const ip = uniqueIp();

      const response1 = await request(app).get("/test").set("X-Forwarded-For", ip);
      const remaining1 = Number.parseInt(response1.headers["x-ratelimit-remaining"], 10);

      const response2 = await request(app).get("/test").set("X-Forwarded-For", ip);
      const remaining2 = Number.parseInt(response2.headers["x-ratelimit-remaining"], 10);

      expect(remaining2).toBeLessThan(remaining1);
      expect(remaining1).toBe(4);
      expect(remaining2).toBe(3);
    });

    it("should block requests exceeding the limit", async () => {
      const app = createApp({ maxRequests: 3, windowMs: 60000 });
      const ip = uniqueIp();

      // Make requests up to the limit
      await request(app).get("/test").set("X-Forwarded-For", ip);
      await request(app).get("/test").set("X-Forwarded-For", ip);
      await request(app).get("/test").set("X-Forwarded-For", ip);

      // Next request should be blocked
      const response = await request(app).get("/test").set("X-Forwarded-For", ip);

      expect(response.status).toBe(429);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should return 0 remaining when limit exceeded", async () => {
      const app = createApp({ maxRequests: 2, windowMs: 60000 });
      const ip = uniqueIp();

      await request(app).get("/test").set("X-Forwarded-For", ip);
      await request(app).get("/test").set("X-Forwarded-For", ip);

      const response = await request(app).get("/test").set("X-Forwarded-For", ip);

      expect(response.headers["x-ratelimit-remaining"]).toBe("0");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Error Response Tests
  // ─────────────────────────────────────────────────────────────

  describe("error response", () => {
    it("should include default error message", async () => {
      const app = createApp({ maxRequests: 1, windowMs: 60000 });
      const ip = uniqueIp();

      await request(app).get("/test").set("X-Forwarded-For", ip);
      const response = await request(app).get("/test").set("X-Forwarded-For", ip);

      expect(response.body.error).toBe("Too many requests, please try again later");
    });

    it("should use custom error message", async () => {
      const app = createApp({
        maxRequests: 1,
        windowMs: 60000,
        message: "Slow down!",
      });
      const ip = uniqueIp();

      await request(app).get("/test").set("X-Forwarded-For", ip);
      const response = await request(app).get("/test").set("X-Forwarded-For", ip);

      expect(response.body.error).toBe("Slow down!");
    });

    it("should include retryAfter in seconds", async () => {
      const app = createApp({ maxRequests: 1, windowMs: 60000 });
      const ip = uniqueIp();

      await request(app).get("/test").set("X-Forwarded-For", ip);
      const response = await request(app).get("/test").set("X-Forwarded-For", ip);

      expect(response.body.retryAfter).toBeDefined();
      expect(typeof response.body.retryAfter).toBe("number");
      expect(response.body.retryAfter).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // IP Identification Tests
  // ─────────────────────────────────────────────────────────────

  describe("IP identification", () => {
    it("should track different IPs separately", async () => {
      const app = createApp({ maxRequests: 2, windowMs: 60000 });
      const ip1 = uniqueIp();
      const ip2 = uniqueIp();

      // Both IPs should have their own limits
      const response1 = await request(app).get("/test").set("X-Forwarded-For", ip1);
      const response2 = await request(app).get("/test").set("X-Forwarded-For", ip2);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Both should have same remaining count (independent tracking)
      expect(response1.headers["x-ratelimit-remaining"]).toBe("1");
      expect(response2.headers["x-ratelimit-remaining"]).toBe("1");
    });

    it("should handle comma-separated X-Forwarded-For", async () => {
      const app = createApp({ maxRequests: 5, windowMs: 60000 });
      const ip = uniqueIp();

      const response = await request(app)
        .get("/test")
        .set("X-Forwarded-For", `${ip}, 10.0.0.1, 172.16.0.1`);

      expect(response.status).toBe(200);
    });

    it("should use first IP from X-Forwarded-For chain", async () => {
      const app = createApp({ maxRequests: 2, windowMs: 60000 });
      const clientIp = uniqueIp();

      // Same client IP, different proxy chain - should be same limit
      await request(app).get("/test").set("X-Forwarded-For", `${clientIp}, 10.0.0.1`);
      await request(app).get("/test").set("X-Forwarded-For", `${clientIp}, 10.0.0.2`);

      // Should be blocked now (2 requests from same client IP)
      const response = await request(app)
        .get("/test")
        .set("X-Forwarded-For", `${clientIp}, 10.0.0.3`);

      expect(response.status).toBe(429);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Window Reset Tests
  // ─────────────────────────────────────────────────────────────

  describe("window reset", () => {
    it("should reset count after window expires", async () => {
      const app = createApp({ maxRequests: 2, windowMs: 100 }); // 100ms window
      const ip = uniqueIp();

      // Use up the limit
      await request(app).get("/test").set("X-Forwarded-For", ip);
      await request(app).get("/test").set("X-Forwarded-For", ip);

      // Should be blocked
      const blockedResponse = await request(app).get("/test").set("X-Forwarded-For", ip);
      expect(blockedResponse.status).toBe(429);

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should work again
      const response = await request(app).get("/test").set("X-Forwarded-For", ip);
      expect(response.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Configuration Tests
  // ─────────────────────────────────────────────────────────────

  describe("configuration", () => {
    it("should use default values when no options provided", async () => {
      const app = express();
      app.use(rateLimit());
      app.get("/test", (_req, res) => res.json({ success: true }));
      const ip = uniqueIp();

      const response = await request(app).get("/test").set("X-Forwarded-For", ip);

      expect(response.status).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    });

    it("should respect custom window duration", async () => {
      const app = createApp({ maxRequests: 100, windowMs: 1000 }); // 1 second
      const ip = uniqueIp();

      const response = await request(app).get("/test").set("X-Forwarded-For", ip);
      const resetTime = Number.parseInt(response.headers["x-ratelimit-reset"], 10);
      const now = Math.ceil(Date.now() / 1000);

      // Reset should be within 2 seconds from now
      expect(resetTime - now).toBeLessThanOrEqual(2);
      expect(resetTime - now).toBeGreaterThanOrEqual(0);
    });

    it("should allow very high limits", async () => {
      const app = createApp({ maxRequests: 10000, windowMs: 60000 });
      const ip = uniqueIp();

      const response = await request(app).get("/test").set("X-Forwarded-For", ip);

      expect(response.status).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBe("10000");
    });
  });
});
