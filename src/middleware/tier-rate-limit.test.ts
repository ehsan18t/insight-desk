/**
 * Tier Rate Limit Middleware Tests
 * Tests for subscription-based rate limiting
 */

import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscriptionsService } from "@/modules/subscriptions";
import { clearAllRateLimitCaches, clearRateLimitCache, tierRateLimit } from "./tier-rate-limit";

// Mock subscriptions service
vi.mock("@/modules/subscriptions", () => ({
  subscriptionsService: {
    getByOrganizationId: vi.fn(),
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
function createMockResponse(): Response & {
  _headers: Map<string, string | number>;
  _status: number;
  _jsonData: unknown;
} {
  const headers = new Map<string, string | number>();
  const mockRes = {
    _headers: headers,
    _status: 200,
    _jsonData: null as unknown,
    setHeader: vi.fn((name: string, value: string | number) => {
      headers.set(name, value);
      return mockRes;
    }),
    status: vi.fn((code: number) => {
      mockRes._status = code;
      return mockRes;
    }),
    json: vi.fn((data: unknown) => {
      mockRes._jsonData = data;
      return mockRes;
    }),
  };
  return mockRes as never;
}

describe("tier-rate-limit middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllRateLimitCaches();
  });

  afterEach(() => {
    clearAllRateLimitCaches();
  });

  // ─────────────────────────────────────────────────────────────
  // tierRateLimit middleware
  // ─────────────────────────────────────────────────────────────
  describe("tierRateLimit", () => {
    it("should allow requests under rate limit", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 100 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = tierRateLimit();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res._headers.get("X-RateLimit-Limit")).toBe(100);
      expect(res._headers.get("X-RateLimit-Remaining")).toBe(99);
    });

    it("should block requests when rate limit exceeded", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 5 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = tierRateLimit();

      // Make 5 requests to hit the limit
      for (let i = 0; i < 5; i++) {
        await middleware(req, createMockResponse(), vi.fn());
      }

      // 6th request should be blocked
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(429);
      expect(res._jsonData).toMatchObject({
        success: false,
        code: "RATE_LIMIT_EXCEEDED",
      });
    });

    it("should skip rate limiting when no organizationId", async () => {
      const req = createMockRequest({ organizationId: undefined });
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = tierRateLimit();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(subscriptionsService.getByOrganizationId).not.toHaveBeenCalled();
    });

    it("should use default rate limit when no subscription", async () => {
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(null as never);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = tierRateLimit();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res._headers.get("X-RateLimit-Limit")).toBe(30); // DEFAULT_RATE_LIMIT
    });

    it("should use default rate limit on service error", async () => {
      vi.mocked(subscriptionsService.getByOrganizationId).mockRejectedValue(
        new Error("Service error"),
      );

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = tierRateLimit();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res._headers.get("X-RateLimit-Limit")).toBe(30);
    });

    it("should set appropriate rate limit headers", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 50 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = tierRateLimit();
      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 50);
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(Number));
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Reset", expect.any(Number));
    });

    it("should include Retry-After header when rate limited", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 1 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = tierRateLimit();

      // Hit the limit
      await middleware(req, createMockResponse(), vi.fn());

      // Blocked request
      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(Number));
    });

    it("should track rate limits per organization", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 5 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const middleware = tierRateLimit();

      // Request from org-1 (3 requests)
      for (let i = 0; i < 3; i++) {
        await middleware(
          createMockRequest({ organizationId: "org-1" }),
          createMockResponse(),
          vi.fn(),
        );
      }

      // Request from org-2 (first request)
      const req2 = createMockRequest({ organizationId: "org-2" });
      const res2 = createMockResponse();
      await middleware(req2, res2, vi.fn());

      // org-2 should have full remaining
      expect(res2._headers.get("X-RateLimit-Remaining")).toBe(4);
    });

    it("should cache rate limits for 5 minutes", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 100 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const middleware = tierRateLimit();
      const req = createMockRequest();

      // First request - should call service
      await middleware(req, createMockResponse(), vi.fn());
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(1);

      // Second request - should use cache
      await middleware(req, createMockResponse(), vi.fn());
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(1);
    });

    it("should return correct error details when rate limited", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 1 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const middleware = tierRateLimit();
      const req = createMockRequest();
      const res = createMockResponse();

      // Hit the limit
      await middleware(req, createMockResponse(), vi.fn());

      // Blocked request
      await middleware(req, res, vi.fn());

      const errorData = res._jsonData as {
        success: boolean;
        error: string;
        code: string;
        details: {
          limit: number;
          remaining: number;
          resetAt: string;
          retryAfterSeconds: number;
          upgradeUrl: string;
        };
      };

      expect(errorData.success).toBe(false);
      expect(errorData.error).toContain("Rate limit exceeded");
      expect(errorData.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(errorData.details.limit).toBe(1);
      expect(errorData.details.remaining).toBe(0);
      expect(errorData.details.upgradeUrl).toBe("/settings/billing");
      expect(errorData.details.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // clearRateLimitCache
  // ─────────────────────────────────────────────────────────────
  describe("clearRateLimitCache", () => {
    it("should clear cache for specific organization", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 100 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const middleware = tierRateLimit();
      const req = createMockRequest({ organizationId: "org-to-clear" });

      // First request - should call service
      await middleware(req, createMockResponse(), vi.fn());
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(1);

      // Clear cache
      clearRateLimitCache("org-to-clear");

      // Next request should call service again
      await middleware(req, createMockResponse(), vi.fn());
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(2);
    });

    it("should not affect other organizations", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 100 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const middleware = tierRateLimit();

      // Cache org-1
      await middleware(
        createMockRequest({ organizationId: "org-1" }),
        createMockResponse(),
        vi.fn(),
      );
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(1);

      // Cache org-2
      await middleware(
        createMockRequest({ organizationId: "org-2" }),
        createMockResponse(),
        vi.fn(),
      );
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(2);

      // Clear only org-1
      clearRateLimitCache("org-1");

      // org-1 should call service
      await middleware(
        createMockRequest({ organizationId: "org-1" }),
        createMockResponse(),
        vi.fn(),
      );
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(3);

      // org-2 should use cache
      await middleware(
        createMockRequest({ organizationId: "org-2" }),
        createMockResponse(),
        vi.fn(),
      );
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // clearAllRateLimitCaches
  // ─────────────────────────────────────────────────────────────
  describe("clearAllRateLimitCaches", () => {
    it("should clear all caches", async () => {
      const subscription = {
        plan: { limits: { apiRequestsPerMinute: 100 } },
      };
      vi.mocked(subscriptionsService.getByOrganizationId).mockResolvedValue(subscription as never);

      const middleware = tierRateLimit();

      // Cache multiple orgs
      await middleware(
        createMockRequest({ organizationId: "org-1" }),
        createMockResponse(),
        vi.fn(),
      );
      await middleware(
        createMockRequest({ organizationId: "org-2" }),
        createMockResponse(),
        vi.fn(),
      );
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(2);

      // Clear all
      clearAllRateLimitCaches();

      // Both should call service
      await middleware(
        createMockRequest({ organizationId: "org-1" }),
        createMockResponse(),
        vi.fn(),
      );
      await middleware(
        createMockRequest({ organizationId: "org-2" }),
        createMockResponse(),
        vi.fn(),
      );
      expect(subscriptionsService.getByOrganizationId).toHaveBeenCalledTimes(4);
    });
  });
});
