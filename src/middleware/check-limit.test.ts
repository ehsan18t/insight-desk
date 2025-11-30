/**
 * Check Limit Middleware Tests
 * Tests for subscription limit checking middleware
 */

import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscriptionsService } from "@/modules/subscriptions";
import { checkLimit, incrementUsage, LimitExceededError } from "./check-limit";

// Mock subscriptions service
vi.mock("@/modules/subscriptions", () => ({
  subscriptionsService: {
    checkLimit: vi.fn(),
    incrementUsage: vi.fn(),
    markAlertSent: vi.fn(),
  },
}));

// Helper to create mock request
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    organizationId: "org-123",
    ...overrides,
  } as Request;
}

// Helper to create mock response
function createMockResponse(): Response & { _listeners: Map<string, () => void> } {
  const listeners = new Map<string, () => void>();
  return {
    statusCode: 200,
    on: vi.fn((event: string, callback: () => void) => {
      listeners.set(event, callback);
    }),
    _listeners: listeners,
  } as never;
}

// Helper to create mock next function
function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe("check-limit middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // LimitExceededError
  // ─────────────────────────────────────────────────────────────
  describe("LimitExceededError", () => {
    it("should create error with correct message and properties", () => {
      const error = new LimitExceededError("tickets", 50, 50, "/settings/billing");

      expect(error.message).toContain("tickets limit");
      expect(error.message).toContain("50/50");
      expect(error.usageType).toBe("tickets");
      expect(error.current).toBe(50);
      expect(error.limit).toBe(50);
      expect(error.upgradeUrl).toBe("/settings/billing");
    });

    it("should extend ForbiddenError", () => {
      const error = new LimitExceededError("messages", 200, 200, "/billing");

      expect(error.name).toBe("Error"); // ForbiddenError doesn't override name
      expect(error.statusCode).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // checkLimit middleware
  // ─────────────────────────────────────────────────────────────
  describe("checkLimit", () => {
    it("should call next when limit is not exceeded", async () => {
      const limitCheck = {
        allowed: true,
        usageType: "tickets" as const,
        current: 10,
        limit: 50,
        remaining: 40,
        percentUsed: 20,
        shouldAlert: false,
      };

      vi.mocked(subscriptionsService.checkLimit).mockResolvedValue(limitCheck);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = checkLimit("tickets");
      await middleware(req, res, next);

      expect(subscriptionsService.checkLimit).toHaveBeenCalledWith("org-123", "tickets");
      expect(next).toHaveBeenCalledWith();
    });

    it("should throw LimitExceededError when limit is exceeded", async () => {
      const limitCheck = {
        allowed: false,
        usageType: "tickets" as const,
        current: 50,
        limit: 50,
        remaining: 0,
        percentUsed: 100,
        shouldAlert: false,
        upgradeUrl: "/settings/billing",
      };

      vi.mocked(subscriptionsService.checkLimit).mockResolvedValue(limitCheck);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = checkLimit("tickets");
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(LimitExceededError));
      const nextMock = next as unknown as ReturnType<typeof vi.fn>;
      const error = nextMock.mock.calls[0][0] as LimitExceededError;
      expect(error.usageType).toBe("tickets");
      expect(error.current).toBe(50);
      expect(error.limit).toBe(50);
    });

    it("should skip limit check when no organizationId", async () => {
      const req = createMockRequest({ organizationId: undefined });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = checkLimit("tickets");
      await middleware(req, res, next);

      expect(subscriptionsService.checkLimit).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it("should attach limitCheck to request", async () => {
      const limitCheck = {
        allowed: true,
        usageType: "messages" as const,
        current: 100,
        limit: 200,
        remaining: 100,
        percentUsed: 50,
        shouldAlert: false,
      };

      vi.mocked(subscriptionsService.checkLimit).mockResolvedValue(limitCheck);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = checkLimit("messages");
      await middleware(req, res, next);

      expect((req as Request & { limitCheck: typeof limitCheck }).limitCheck).toEqual(limitCheck);
    });

    it("should mark alert sent when shouldAlert is true", async () => {
      const limitCheck = {
        allowed: true,
        usageType: "storage" as const,
        current: 85,
        limit: 100,
        remaining: 15,
        percentUsed: 85,
        shouldAlert: true,
      };

      vi.mocked(subscriptionsService.checkLimit).mockResolvedValue(limitCheck);
      vi.mocked(subscriptionsService.markAlertSent).mockResolvedValue(undefined);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = checkLimit("storage");
      await middleware(req, res, next);

      // Trigger the 'finish' event
      const finishCallback = res._listeners.get("finish");
      expect(finishCallback).toBeDefined();
      finishCallback?.();

      // Wait for async call
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(subscriptionsService.markAlertSent).toHaveBeenCalledWith("org-123", "storage");
    });

    it("should increment usage on success when incrementOnSuccess is true", async () => {
      const limitCheck = {
        allowed: true,
        usageType: "tickets" as const,
        current: 10,
        limit: 50,
        remaining: 40,
        percentUsed: 20,
        shouldAlert: false,
      };

      vi.mocked(subscriptionsService.checkLimit).mockResolvedValue(limitCheck);
      vi.mocked(subscriptionsService.incrementUsage).mockResolvedValue(undefined);

      const req = createMockRequest();
      const res = createMockResponse();
      res.statusCode = 201;
      const next = createMockNext();

      const middleware = checkLimit("tickets", true);
      await middleware(req, res, next);

      // Trigger the 'finish' event
      const finishCallback = res._listeners.get("finish");
      expect(finishCallback).toBeDefined();
      finishCallback?.();

      // Wait for async call
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(subscriptionsService.incrementUsage).toHaveBeenCalledWith("org-123", "tickets");
    });

    it("should not increment usage on non-2xx status codes", async () => {
      const limitCheck = {
        allowed: true,
        usageType: "messages" as const,
        current: 50,
        limit: 200,
        remaining: 150,
        percentUsed: 25,
        shouldAlert: false,
      };

      vi.mocked(subscriptionsService.checkLimit).mockResolvedValue(limitCheck);

      const req = createMockRequest();
      const res = createMockResponse();
      res.statusCode = 400; // Error status
      const next = createMockNext();

      const middleware = checkLimit("messages", true);
      await middleware(req, res, next);

      // Trigger the 'finish' event
      const finishCallback = res._listeners.get("finish");
      expect(finishCallback).toBeDefined();
      finishCallback?.();

      // Wait for async call
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(subscriptionsService.incrementUsage).not.toHaveBeenCalled();
    });

    it("should handle checkLimit service errors gracefully", async () => {
      vi.mocked(subscriptionsService.checkLimit).mockRejectedValue(new Error("Service error"));

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = checkLimit("tickets");
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // incrementUsage middleware
  // ─────────────────────────────────────────────────────────────
  describe("incrementUsage", () => {
    it("should increment usage for organization", async () => {
      vi.mocked(subscriptionsService.incrementUsage).mockResolvedValue(undefined);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = incrementUsage("storage", 50);
      await middleware(req, res, next);

      expect(subscriptionsService.incrementUsage).toHaveBeenCalledWith("org-123", "storage", 50);
      expect(next).toHaveBeenCalledWith();
    });

    it("should use default amount of 1 when not specified", async () => {
      vi.mocked(subscriptionsService.incrementUsage).mockResolvedValue(undefined);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = incrementUsage("messages");
      await middleware(req, res, next);

      expect(subscriptionsService.incrementUsage).toHaveBeenCalledWith("org-123", "messages", 1);
    });

    it("should skip increment when no organizationId", async () => {
      const req = createMockRequest({ organizationId: undefined });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = incrementUsage("tickets");
      await middleware(req, res, next);

      expect(subscriptionsService.incrementUsage).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it("should not fail request when increment fails", async () => {
      vi.mocked(subscriptionsService.incrementUsage).mockRejectedValue(
        new Error("Increment failed"),
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = incrementUsage("storage", 100);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(); // Called without error
    });
  });
});
