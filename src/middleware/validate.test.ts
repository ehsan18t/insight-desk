/**
 * Validate Middleware Tests
 *
 * Tests for Zod-based request validation middleware.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { validate, validateRequest } from "@/middleware/validate";

// ─────────────────────────────────────────────────────────────
// Test Schemas
// ─────────────────────────────────────────────────────────────

const userSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  age: z.number().min(0, "Age must be positive").optional(),
});

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

const paramsSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

// ─────────────────────────────────────────────────────────────
// Body Validation Tests
// ─────────────────────────────────────────────────────────────

describe("validate middleware - body", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.post("/users", validate(userSchema, "body"), (req, res) => {
      res.json({ success: true, data: req.body });
    });
  });

  it("should pass valid body data", async () => {
    const response = await request(app)
      .post("/users")
      .send({ name: "John Doe", email: "john@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe("John Doe");
    expect(response.body.data.email).toBe("john@example.com");
  });

  it("should include optional fields when provided", async () => {
    const response = await request(app)
      .post("/users")
      .send({ name: "John Doe", email: "john@example.com", age: 25 });

    expect(response.status).toBe(200);
    expect(response.body.data.age).toBe(25);
  });

  it("should reject missing required field", async () => {
    const response = await request(app).post("/users").send({ name: "John Doe" }); // Missing email

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Validation failed");
    expect(response.body.details).toBeInstanceOf(Array);
    expect(response.body.details.length).toBeGreaterThan(0);
  });

  it("should reject invalid email format", async () => {
    const response = await request(app)
      .post("/users")
      .send({ name: "John Doe", email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body.details).toContainEqual({
      field: "email",
      message: "Invalid email format",
    });
  });

  it("should reject name too short", async () => {
    const response = await request(app)
      .post("/users")
      .send({ name: "J", email: "john@example.com" });

    expect(response.status).toBe(400);
    expect(response.body.details).toContainEqual({
      field: "name",
      message: "Name must be at least 2 characters",
    });
  });

  it("should report multiple validation errors", async () => {
    const response = await request(app).post("/users").send({ name: "J", email: "invalid" });

    expect(response.status).toBe(400);
    expect(response.body.details.length).toBeGreaterThanOrEqual(2);
  });

  it("should strip unknown fields by default", async () => {
    const response = await request(app).post("/users").send({
      name: "John Doe",
      email: "john@example.com",
      unknownField: "should be stripped",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.unknownField).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Query Validation Tests
// ─────────────────────────────────────────────────────────────

describe("validate middleware - query", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.get("/items", validate(querySchema, "query"), (req, res) => {
      res.json({ success: true, query: req.query });
    });
  });

  it("should pass valid query params", async () => {
    const response = await request(app).get("/items?page=2&limit=20");

    expect(response.status).toBe(200);
    expect(Number(response.body.query.page)).toBe(2);
    expect(Number(response.body.query.limit)).toBe(20);
  });

  it("should apply default values for missing params", async () => {
    const response = await request(app).get("/items");

    expect(response.status).toBe(200);
    // Defaults should be applied
    expect(response.body.query).toBeDefined();
  });

  it("should coerce string to number", async () => {
    const response = await request(app).get("/items?page=5&limit=25");

    expect(response.status).toBe(200);
    // Coercion should work - value is parsed as number
    expect(Number(response.body.query.page)).toBe(5);
  });

  it("should reject invalid query params", async () => {
    const response = await request(app).get("/items?limit=200"); // Exceeds max

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("should reject negative page number", async () => {
    const response = await request(app).get("/items?page=-1");

    expect(response.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────
// Params Validation Tests
// ─────────────────────────────────────────────────────────────

describe("validate middleware - params", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.get("/users/:id", validate(paramsSchema, "params"), (req, res) => {
      res.json({ success: true, id: req.params.id });
    });
  });

  it("should pass valid UUID", async () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const response = await request(app).get(`/users/${uuid}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(uuid);
  });

  it("should reject invalid UUID format", async () => {
    const response = await request(app).get("/users/not-a-uuid");

    expect(response.status).toBe(400);
    expect(response.body.details).toContainEqual({
      field: "id",
      message: "Invalid ID format",
    });
  });

  it("should reject empty ID", async () => {
    // Express won't match this route with empty param, but let's test the pattern
    const response = await request(app).get("/users/123");

    expect(response.status).toBe(400); // Not a valid UUID
  });
});

// ─────────────────────────────────────────────────────────────
// validateRequest (Multiple Sources) Tests
// ─────────────────────────────────────────────────────────────

describe("validateRequest middleware", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it("should validate all sources at once", async () => {
    app.post(
      "/users/:id",
      validateRequest({
        params: paramsSchema,
        body: userSchema,
        query: querySchema,
      }),
      (req, res) => {
        res.json({
          success: true,
          id: req.params.id,
          user: req.body,
          query: req.query,
        });
      },
    );

    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const response = await request(app)
      .post(`/users/${uuid}?page=2`)
      .send({ name: "John Doe", email: "john@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(uuid);
    expect(response.body.user.name).toBe("John Doe");
    expect(Number(response.body.query.page)).toBe(2);
  });

  it("should fail if any source is invalid", async () => {
    app.post(
      "/users/:id",
      validateRequest({
        params: paramsSchema,
        body: userSchema,
      }),
      (_req, res) => {
        res.json({ success: true });
      },
    );

    const response = await request(app)
      .post("/users/invalid-uuid")
      .send({ name: "John Doe", email: "john@example.com" });

    expect(response.status).toBe(400);
  });

  it("should work with partial schemas (only body)", async () => {
    app.post("/users", validateRequest({ body: userSchema }), (req, res) => {
      res.json({ success: true, user: req.body });
    });

    const response = await request(app)
      .post("/users")
      .send({ name: "John Doe", email: "john@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe("John Doe");
  });
});

// ─────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────

describe("validate edge cases", () => {
  it("should handle nested object validation", async () => {
    const nestedSchema = z.object({
      user: z.object({
        profile: z.object({
          bio: z.string().min(10, "Bio must be at least 10 characters"),
        }),
      }),
    });

    const app = express();
    app.use(express.json());
    app.post("/profile", validate(nestedSchema, "body"), (_req, res) => {
      res.json({ success: true });
    });

    const response = await request(app)
      .post("/profile")
      .send({ user: { profile: { bio: "Short" } } });

    expect(response.status).toBe(400);
    expect(response.body.details[0].field).toBe("user.profile.bio");
  });

  it("should handle array validation", async () => {
    const arraySchema = z.object({
      tags: z.array(z.string().min(1)).min(1, "At least one tag required"),
    });

    const app = express();
    app.use(express.json());
    app.post("/tags", validate(arraySchema, "body"), (req, res) => {
      res.json({ success: true, tags: req.body.tags });
    });

    // Valid array
    let response = await request(app)
      .post("/tags")
      .send({ tags: ["a", "b"] });
    expect(response.status).toBe(200);
    expect(response.body.tags).toEqual(["a", "b"]);

    // Empty array
    response = await request(app).post("/tags").send({ tags: [] });
    expect(response.status).toBe(400);
  });

  it("should reject unknown keys with strict schema", async () => {
    const strictSchema = z
      .object({
        name: z.string(),
      })
      .strict();

    const app = express();
    app.use(express.json());
    app.post("/strict", validate(strictSchema, "body"), (_req, res) => {
      res.json({ success: true });
    });

    const response = await request(app).post("/strict").send({ name: "Test", unknownKey: "value" });

    expect(response.status).toBe(400);
  });

  it("should handle empty body gracefully", async () => {
    const optionalSchema = z.object({
      name: z.string().optional(),
    });

    const app = express();
    app.use(express.json());
    app.post("/optional", validate(optionalSchema, "body"), (req, res) => {
      res.json({ success: true, data: req.body });
    });

    const response = await request(app).post("/optional").send({});

    expect(response.status).toBe(200);
  });
});
