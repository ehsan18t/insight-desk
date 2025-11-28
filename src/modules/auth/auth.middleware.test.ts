/**
 * Auth Middleware Tests
 *
 * Tests for authentication and authorization middleware.
 * Uses mocked Better Auth session API for isolation.
 */

import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { ForbiddenError, UnauthorizedError } from "@/middleware/error-handler";
import { authenticate, optionalAuth, requireRole } from "./auth.middleware";

// Mock Better Auth
vi.mock("./auth.config", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock database - include closeDatabaseConnection to satisfy global setup
vi.mock("@/db", () => ({
  db: {
    query: {
      userOrganizations: {
        findFirst: vi.fn(),
      },
    },
  },
  closeDatabaseConnection: vi.fn(),
}));

// Import the mocked auth after vi.mock
import { auth } from "./auth.config";

// ─────────────────────────────────────────────────────────────
// Test Utilities
// ─────────────────────────────────────────────────────────────

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as Request;
}

function createMockResponse(): Response {
  return {} as Response;
}

function createMockNext() {
  return vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
}

const mockSession = {
  user: {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    image: "https://example.com/avatar.jpg",
    createdAt: new Date(),
    updatedAt: new Date(),
    emailVerified: true,
    isActive: true,
  },
  session: {
    id: "session-123",
    userId: "user-123",
    token: "test-session-token",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

// ─────────────────────────────────────────────────────────────
// authenticate Middleware Tests
// ─────────────────────────────────────────────────────────────

describe("authenticate middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should attach user and session to request on valid session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);

    expect(req.user).toEqual({
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      avatarUrl: "https://example.com/avatar.jpg",
      isActive: true,
    });
    expect(req.session).toEqual({
      id: "session-123",
      userId: "user-123",
      expiresAt: mockSession.session.expiresAt,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("should handle user without avatar", async () => {
    const sessionWithoutAvatar = {
      ...mockSession,
      user: { ...mockSession.user, image: null },
    };
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionWithoutAvatar);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);

    expect(req.user?.avatarUrl).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("should throw UnauthorizedError when no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    const error = next.mock.calls[0][0] as UnauthorizedError;
    expect(error.message).toBe("Authentication required");
  });

  it("should throw UnauthorizedError when session has no user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: mockSession.session,
      user: null,
    } as unknown as typeof mockSession);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("should throw UnauthorizedError on session API error", async () => {
    vi.mocked(auth.api.getSession).mockRejectedValue(new Error("Session expired"));

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    const error = next.mock.calls[0][0] as UnauthorizedError;
    expect(error.message).toBe("Invalid or expired session");
  });

  it("should pass through UnauthorizedError thrown within", async () => {
    const customUnauthorized = new UnauthorizedError("Custom unauthorized message");
    vi.mocked(auth.api.getSession).mockRejectedValue(customUnauthorized);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(customUnauthorized);
  });

  it("should pass headers to session API", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

    const req = createMockRequest({
      headers: {
        authorization: "Bearer token123",
        cookie: "session=abc",
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);

    expect(auth.api.getSession).toHaveBeenCalledWith({
      headers: expect.objectContaining({
        authorization: "Bearer token123",
        cookie: "session=abc",
      }),
    });
  });
});

// ─────────────────────────────────────────────────────────────
// requireRole Middleware Tests
// ─────────────────────────────────────────────────────────────

describe("requireRole middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should pass when user has allowed role", async () => {
    const req = createMockRequest({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      headers: {
        "x-organization-id": "org-456",
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
      id: "membership-1",
      userId: "user-123",
      organizationId: "org-456",
      role: "admin",
      joinedAt: new Date(),
    });

    const middleware = requireRole("admin", "owner");
    await middleware(req, res, next);

    expect(req.organizationId).toBe("org-456");
    expect(req.userRole).toBe("admin");
    expect(next).toHaveBeenCalledWith();
  });

  it("should pass when user has any of the allowed roles", async () => {
    const req = createMockRequest({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      headers: {
        "x-organization-id": "org-456",
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
      id: "membership-1",
      userId: "user-123",
      organizationId: "org-456",
      role: "owner",
      joinedAt: new Date(),
    });

    const middleware = requireRole("agent", "admin", "owner");
    await middleware(req, res, next);

    expect(req.userRole).toBe("owner");
    expect(next).toHaveBeenCalledWith();
  });

  it("should use organizationId from request if already set", async () => {
    const req = createMockRequest({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      organizationId: "org-from-request",
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
      id: "membership-1",
      userId: "user-123",
      organizationId: "org-from-request",
      role: "agent",
      joinedAt: new Date(),
    });

    const middleware = requireRole("agent");
    await middleware(req, res, next);

    expect(req.organizationId).toBe("org-from-request");
    expect(next).toHaveBeenCalledWith();
  });

  it("should throw UnauthorizedError when no user", async () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requireRole("admin");
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    const error = next.mock.calls[0][0] as UnauthorizedError;
    expect(error.message).toBe("Authentication required");
  });

  it("should throw ForbiddenError when no organization context", async () => {
    const req = createMockRequest({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requireRole("admin");
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    const error = next.mock.calls[0][0] as ForbiddenError;
    expect(error.message).toBe("Organization context required");
  });

  it("should throw ForbiddenError when user is not a member", async () => {
    const req = createMockRequest({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      headers: {
        "x-organization-id": "org-456",
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue(undefined);

    const middleware = requireRole("admin");
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    const error = next.mock.calls[0][0] as ForbiddenError;
    expect(error.message).toBe("Not a member of this organization");
  });

  it("should throw ForbiddenError when user has insufficient role", async () => {
    const req = createMockRequest({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      headers: {
        "x-organization-id": "org-456",
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
      id: "membership-1",
      userId: "user-123",
      organizationId: "org-456",
      role: "customer",
      joinedAt: new Date(),
    });

    const middleware = requireRole("admin", "owner");
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    const error = next.mock.calls[0][0] as ForbiddenError;
    expect(error.message).toContain("Access denied");
    expect(error.message).toContain("admin or owner");
  });

  it("should query database with correct parameters", async () => {
    const req = createMockRequest({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      headers: {
        "x-organization-id": "org-456",
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
      id: "membership-1",
      userId: "user-123",
      organizationId: "org-456",
      role: "admin",
      joinedAt: new Date(),
    });

    const middleware = requireRole("admin");
    await middleware(req, res, next);

    expect(db.query.userOrganizations.findFirst).toHaveBeenCalledWith({
      where: expect.anything(), // The SQL expression
    });
  });
});

// ─────────────────────────────────────────────────────────────
// optionalAuth Middleware Tests
// ─────────────────────────────────────────────────────────────

describe("optionalAuth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should attach user when session exists", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await optionalAuth(req, res, next);

    expect(req.user).toEqual({
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      avatarUrl: "https://example.com/avatar.jpg",
      isActive: true,
    });
    expect(req.session).toBeDefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("should continue without user when no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await optionalAuth(req, res, next);

    expect(req.user).toBeUndefined();
    expect(req.session).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("should continue without error when session API fails", async () => {
    vi.mocked(auth.api.getSession).mockRejectedValue(new Error("Session error"));

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await optionalAuth(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
    // Verify no error was passed to next
    expect(next.mock.calls[0]).toHaveLength(0);
  });

  it("should handle user without avatar", async () => {
    const sessionNoAvatar = {
      ...mockSession,
      user: { ...mockSession.user, image: undefined },
    };
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionNoAvatar);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await optionalAuth(req, res, next);

    expect(req.user?.avatarUrl).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});

// ─────────────────────────────────────────────────────────────
// Edge Cases and Security Tests
// ─────────────────────────────────────────────────────────────

describe("auth middleware security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not expose sensitive session data", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);

    // Should not contain raw session tokens or secrets
    expect(req.session).not.toHaveProperty("token");
    expect(req.session).not.toHaveProperty("secret");
    expect(req.user).not.toHaveProperty("password");
    expect(req.user).not.toHaveProperty("passwordHash");
  });

  it("should handle malformed organization ID in header", async () => {
    const req = createMockRequest({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      headers: {
        "x-organization-id": ["org-1", "org-2"] as unknown as string, // Array instead of string
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requireRole("admin");
    await middleware(req, res, next);

    // Should reject non-string organization IDs
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("should handle empty organization ID", async () => {
    const req = createMockRequest({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      headers: {
        "x-organization-id": "",
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = requireRole("admin");
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });
});
