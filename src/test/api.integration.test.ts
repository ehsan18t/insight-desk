/**
 * API Integration Tests
 *
 * Tests for the complete API using supertest.
 * These tests verify the HTTP layer works correctly.
 */

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler, notFoundHandler } from "@/middleware/error-handler";
import { rateLimit } from "@/middleware/rate-limit";

// ─────────────────────────────────────────────────────────────
// Helper: Create minimal test app
// ─────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
    });
  });

  // API info
  app.get("/api", (_req, res) => {
    res.json({
      success: true,
      message: "InsightDesk API v0.1.0",
    });
  });

  // Rate limiting on /api
  app.use("/api/protected", rateLimit({ maxRequests: 5, windowMs: 60000 }));
  app.get("/api/protected", (_req, res) => {
    res.json({ success: true, message: "Protected endpoint" });
  });

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// ─────────────────────────────────────────────────────────────
// Health Check Tests
// ─────────────────────────────────────────────────────────────

describe("Health Check Endpoint", () => {
  const app = createTestApp();

  it("GET /health should return 200 with status ok", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.version).toBe("0.1.0");
  });

  it("should return JSON content type", async () => {
    const response = await request(app).get("/health");

    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });
});

// ─────────────────────────────────────────────────────────────
// API Root Tests
// ─────────────────────────────────────────────────────────────

describe("API Root Endpoint", () => {
  const app = createTestApp();

  it("GET /api should return 200 with API info", async () => {
    const response = await request(app).get("/api");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain("InsightDesk API");
  });
});

// ─────────────────────────────────────────────────────────────
// 404 Handler Tests
// ─────────────────────────────────────────────────────────────

describe("404 Handler", () => {
  const app = createTestApp();

  it("should return 404 for unknown routes", async () => {
    const response = await request(app).get("/unknown/route");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("/unknown/route");
    expect(response.body.code).toBe("ROUTE_NOT_FOUND");
  });

  it("should include HTTP method in error message", async () => {
    const response = await request(app).post("/nonexistent");

    expect(response.body.error).toContain("POST");
  });

  it("should handle different HTTP methods", async () => {
    const methods = ["get", "post", "put", "patch", "delete"] as const;

    for (const method of methods) {
      const response = await request(app)[method]("/does-not-exist");
      expect(response.status).toBe(404);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Rate Limiting Tests
// ─────────────────────────────────────────────────────────────

// Helper to generate unique IP for test isolation
function uniqueIp(): string {
  return `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

describe("Rate Limiting", () => {
  it("should include rate limit headers", async () => {
    const app = createTestApp();
    const testIp = uniqueIp();
    const response = await request(app).get("/api/protected").set("X-Forwarded-For", testIp);

    expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(response.headers["x-ratelimit-reset"]).toBeDefined();
  });

  it("should decrement remaining count with each request", async () => {
    const app = createTestApp();
    const testIp = uniqueIp();

    const response1 = await request(app).get("/api/protected").set("X-Forwarded-For", testIp);
    const remaining1 = Number.parseInt(response1.headers["x-ratelimit-remaining"], 10);

    const response2 = await request(app).get("/api/protected").set("X-Forwarded-For", testIp);
    const remaining2 = Number.parseInt(response2.headers["x-ratelimit-remaining"], 10);

    expect(remaining2).toBeLessThan(remaining1);
  });

  it("should block requests after rate limit exceeded", async () => {
    const app = createTestApp();
    const testIp = uniqueIp();

    // Make 5 requests (the limit set in createTestApp)
    for (let i = 0; i < 5; i++) {
      await request(app).get("/api/protected").set("X-Forwarded-For", testIp);
    }

    // 6th request should be blocked
    const response = await request(app).get("/api/protected").set("X-Forwarded-For", testIp);

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("Too many requests");
  });
});

// ─────────────────────────────────────────────────────────────
// Content-Type Tests
// ─────────────────────────────────────────────────────────────

describe("Content-Type Handling", () => {
  it("should accept application/json", async () => {
    const app = express();
    app.use(express.json());

    app.post("/api/echo", (req, res) => {
      res.json(req.body);
    });

    const response = await request(app)
      .post("/api/echo")
      .set("Content-Type", "application/json")
      .send({ test: "data" });

    expect(response.status).toBe(200);
    expect(response.body.test).toBe("data");
  });

  it("should handle empty body", async () => {
    const app = express();
    app.use(express.json());

    app.post("/api/empty", (req, res) => {
      res.json({ received: Object.keys(req.body || {}).length === 0 });
    });

    const response = await request(app).post("/api/empty").set("Content-Type", "application/json");

    expect(response.status).toBe(200);
    expect(response.body.received).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Error Response Format Tests
// ─────────────────────────────────────────────────────────────

describe("Error Response Format", () => {
  const app = express();
  app.use(express.json());

  // Add routes that throw errors
  app.get("/api/error", () => {
    throw new Error("Test error");
  });

  app.use(errorHandler);

  it("should return consistent error format", async () => {
    const response = await request(app).get("/api/error");

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty("success", false);
    expect(response.body).toHaveProperty("error");
    expect(response.body).toHaveProperty("code");
  });

  it("should not expose stack trace in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const response = await request(app).get("/api/error");

    expect(response.body.stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });
});

// ─────────────────────────────────────────────────────────────
// JSON Response Tests
// ─────────────────────────────────────────────────────────────

describe("JSON Response Handling", () => {
  it("should return valid JSON for all responses", async () => {
    const app = createTestApp();

    const endpoints = [
      { method: "get", path: "/health" },
      { method: "get", path: "/api" },
      { method: "get", path: "/nonexistent" },
    ] as const;

    for (const { method, path } of endpoints) {
      const response = await request(app)[method](path);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(() => JSON.parse(response.text)).not.toThrow();
    }
  });
});
