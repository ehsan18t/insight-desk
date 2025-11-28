/**
 * Error Handler Middleware Tests
 *
 * Tests for custom error classes and error handling middleware.
 */

import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AppError,
  BadRequestError,
  ConflictError,
  errorHandler,
  ForbiddenError,
  NotFoundError,
  notFoundHandler,
  UnauthorizedError,
} from "@/middleware/error-handler";

// ─────────────────────────────────────────────────────────────
// AppError Class Tests
// ─────────────────────────────────────────────────────────────

describe("AppError", () => {
  it("should create an error with default values", () => {
    const error = new AppError("Test error");

    expect(error.message).toBe("Test error");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBeUndefined(); // code is optional, undefined by default
    expect(error.isOperational).toBe(true);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  it("should create an error with custom values", () => {
    const error = new AppError("Custom error", 422, "VALIDATION_ERROR");

    expect(error.message).toBe("Custom error");
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe("VALIDATION_ERROR");
  });

  it("should have a stack trace", () => {
    const error = new AppError("Test error");

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("Error"); // Stack trace contains Error (base class name)
  });

  it("should preserve prototype chain", () => {
    const error = new AppError("Test error");

    expect(error.name).toBe("Error"); // name inherits from Error, not overridden
    expect(Object.getPrototypeOf(error)).toBe(AppError.prototype);
  });
});

// ─────────────────────────────────────────────────────────────
// Specialized Error Classes
// ─────────────────────────────────────────────────────────────

describe("NotFoundError", () => {
  it("should have correct defaults", () => {
    const error = new NotFoundError();

    expect(error.message).toBe("Resource not found");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("should accept custom message", () => {
    const error = new NotFoundError("User not found");

    expect(error.message).toBe("User not found");
    expect(error.statusCode).toBe(404);
  });
});

describe("UnauthorizedError", () => {
  it("should have correct defaults", () => {
    const error = new UnauthorizedError();

    expect(error.message).toBe("Unauthorized");
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("should accept custom message", () => {
    const error = new UnauthorizedError("Invalid token");

    expect(error.message).toBe("Invalid token");
  });
});

describe("ForbiddenError", () => {
  it("should have correct defaults", () => {
    const error = new ForbiddenError();

    expect(error.message).toBe("Forbidden");
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });

  it("should accept custom message", () => {
    const error = new ForbiddenError("Access denied");

    expect(error.message).toBe("Access denied");
  });
});

describe("BadRequestError", () => {
  it("should have correct defaults", () => {
    const error = new BadRequestError();

    expect(error.message).toBe("Bad request");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
  });

  it("should accept custom message", () => {
    const error = new BadRequestError("Invalid input");

    expect(error.message).toBe("Invalid input");
  });
});

describe("ConflictError", () => {
  it("should have correct defaults", () => {
    const error = new ConflictError();

    expect(error.message).toBe("Resource already exists"); // Actual default message
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("CONFLICT");
  });

  it("should accept custom message", () => {
    const error = new ConflictError("Email already exists");

    expect(error.message).toBe("Email already exists");
  });
});

// ─────────────────────────────────────────────────────────────
// Error Handler Middleware Tests
// ─────────────────────────────────────────────────────────────

describe("errorHandler middleware", () => {
  let app: express.Express;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function addErrorRoute(error: Error) {
    app.get("/error", (_req: Request, _res: Response, next: NextFunction) => {
      next(error);
    });
    app.use(errorHandler);
  }

  it("should handle AppError with correct status code", async () => {
    addErrorRoute(new AppError("Custom error", 418, "TEAPOT"));

    const response = await request(app).get("/error");

    expect(response.status).toBe(418);
    expect(response.body).toEqual({
      success: false,
      error: "Custom error",
      code: "TEAPOT",
    });
  });

  it("should handle NotFoundError", async () => {
    addErrorRoute(new NotFoundError("User not found"));

    const response = await request(app).get("/error");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("User not found");
    expect(response.body.code).toBe("NOT_FOUND");
  });

  it("should handle UnauthorizedError", async () => {
    addErrorRoute(new UnauthorizedError("Invalid token"));

    const response = await request(app).get("/error");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("should handle ForbiddenError", async () => {
    addErrorRoute(new ForbiddenError("Access denied"));

    const response = await request(app).get("/error");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("should handle BadRequestError", async () => {
    addErrorRoute(new BadRequestError("Invalid input"));

    const response = await request(app).get("/error");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("BAD_REQUEST");
  });

  it("should handle generic Error with 500 status", async () => {
    addErrorRoute(new Error("Something broke"));

    const response = await request(app).get("/error");

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Something broke"); // Actual error message is passed through
    expect(response.body.code).toBe("INTERNAL_ERROR");
  });

  it("should include stack trace in development", async () => {
    process.env.NODE_ENV = "development";
    addErrorRoute(new Error("Dev error"));

    const response = await request(app).get("/error");

    expect(response.status).toBe(500);
    expect(response.body.stack).toBeDefined();
    expect(response.body.stack).toContain("Error");
  });

  it("should not include stack trace in production", async () => {
    process.env.NODE_ENV = "production";
    addErrorRoute(new Error("Prod error"));

    const response = await request(app).get("/error");

    expect(response.status).toBe(500);
    expect(response.body.stack).toBeUndefined();
  });

  it("should not include stack trace in test", async () => {
    process.env.NODE_ENV = "test";
    addErrorRoute(new Error("Test error"));

    const response = await request(app).get("/error");

    expect(response.body.stack).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Not Found Handler Tests
// ─────────────────────────────────────────────────────────────

describe("notFoundHandler middleware", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.get("/exists", (_req, res) => res.json({ ok: true }));
    app.use(notFoundHandler);
    app.use(errorHandler);
  });

  it("should return 404 for unknown routes", async () => {
    const response = await request(app).get("/unknown");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe("ROUTE_NOT_FOUND"); // notFoundHandler uses ROUTE_NOT_FOUND
  });

  it("should include path in error message", async () => {
    const response = await request(app).get("/some/random/path");

    expect(response.body.error).toContain("/some/random/path");
  });

  it("should include HTTP method in error message", async () => {
    const response = await request(app).post("/unknown");

    expect(response.body.error).toContain("POST");
  });

  it("should not affect existing routes", async () => {
    const response = await request(app).get("/exists");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});
