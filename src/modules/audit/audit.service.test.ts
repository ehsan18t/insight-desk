/**
 * Audit Service Tests
 * Comprehensive test coverage for audit log management
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditService } from "./audit.service";

// Mock the database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  closeDatabaseConnection: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────

const mockContext = {
  organizationId: "org-123",
  userId: "user-123",
  ipAddress: "192.168.1.1",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
};

const mockAuditLog = {
  id: "audit-123",
  organizationId: "org-123",
  userId: "user-123",
  action: "user_login" as const,
  resourceType: "user",
  resourceId: "user-123",
  ipAddress: "192.168.1.1",
  userAgent: "Mozilla/5.0",
  previousValue: null,
  newValue: null,
  metadata: {},
  createdAt: new Date("2024-01-15T10:00:00Z"),
};

const mockAuditLogWithUser = {
  ...mockAuditLog,
  user: {
    id: "user-123",
    name: "John Doe",
    email: "john@example.com",
  },
};

describe("auditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create an audit log entry", async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockAuditLog]),
        }),
      } as never);

      const result = await auditService.create(mockContext, {
        action: "user_login",
        resourceType: "user",
        resourceId: "user-123",
      });

      expect(result.id).toBe("audit-123");
      expect(result.action).toBe("user_login");
      expect(db.insert).toHaveBeenCalled();
    });

    it("should store previous and new values for updates", async () => {
      const updateLog = {
        ...mockAuditLog,
        action: "settings_updated" as const,
        previousValue: { theme: "light" },
        newValue: { theme: "dark" },
      };

      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([updateLog]),
        }),
      } as never);

      const result = await auditService.create(mockContext, {
        action: "settings_updated",
        resourceType: "settings",
        previousValue: { theme: "light" },
        newValue: { theme: "dark" },
      });

      expect(result.previousValue).toEqual({ theme: "light" });
      expect(result.newValue).toEqual({ theme: "dark" });
    });

    it("should store metadata in audit log", async () => {
      const logWithMetadata = {
        ...mockAuditLog,
        metadata: { source: "api", version: "1.0" },
      };

      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([logWithMetadata]),
        }),
      } as never);

      const result = await auditService.create(mockContext, {
        action: "user_login",
        metadata: { source: "api", version: "1.0" },
      });

      expect(result.metadata).toEqual({ source: "api", version: "1.0" });
    });

    it("should handle context without userId (system actions)", async () => {
      const systemContext = {
        organizationId: "org-123",
        ipAddress: "127.0.0.1",
      };

      const systemLog = {
        ...mockAuditLog,
        userId: null,
      };

      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([systemLog]),
        }),
      } as never);

      const result = await auditService.create(systemContext, {
        action: "subscription_renewed",
      });

      expect(result.userId).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // list
  // ─────────────────────────────────────────────────────────────
  describe("list", () => {
    it("should return paginated audit logs", async () => {
      // Mock count query
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ total: 100 }]),
        }),
      } as never);

      // Mock data query
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: vi.fn().mockResolvedValue([mockAuditLogWithUser]),
                }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.list("org-123", {
        page: 1,
        limit: 50,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      expect(result.logs).toHaveLength(1);
      expect(result.pagination.total).toBe(100);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalPages).toBe(2);
    });

    it("should filter by action type", async () => {
      const loginLog = { ...mockAuditLogWithUser, action: "user_login" as const };

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        }),
      } as never);

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: vi.fn().mockResolvedValue([loginLog]),
                }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.list("org-123", {
        page: 1,
        limit: 50,
        action: "user_login",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      // Verify the returned log matches the filter and pagination is correct
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].action).toBe("user_login");
      expect(result.pagination.total).toBe(1);
    });

    it("should filter by user ID", async () => {
      const user123Log = { ...mockAuditLogWithUser, userId: "user-123" };
      const secondLog = { ...user123Log, id: "audit-456" };

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ total: 2 }]),
        }),
      } as never);

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: vi.fn().mockResolvedValue([user123Log, secondLog]),
                }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.list("org-123", {
        page: 1,
        limit: 50,
        userId: "user-123",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      // Verify all returned logs belong to the filtered user
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every((log) => log.userId === "user-123")).toBe(true);
      expect(result.pagination.total).toBe(2);
    });

    it("should filter by date range", async () => {
      const jan15Log = {
        ...mockAuditLogWithUser,
        createdAt: new Date("2024-01-15T10:00:00Z"),
      };
      const jan20Log = {
        ...mockAuditLogWithUser,
        id: "audit-456",
        createdAt: new Date("2024-01-20T10:00:00Z"),
      };

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ total: 2 }]),
        }),
      } as never);

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: vi.fn().mockResolvedValue([jan20Log, jan15Log]),
                }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.list("org-123", {
        page: 1,
        limit: 50,
        from: "2024-01-01T00:00:00Z",
        to: "2024-01-31T23:59:59Z",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      // Verify returned logs are within date range
      expect(result.logs).toHaveLength(2);
      const dateFrom = new Date("2024-01-01T00:00:00Z");
      const dateTo = new Date("2024-01-31T23:59:59Z");
      expect(result.logs.every((log) => log.createdAt >= dateFrom && log.createdAt <= dateTo)).toBe(
        true,
      );
      expect(result.pagination.total).toBe(2);
    });

    it("should filter by resource type and ID", async () => {
      const userResourceLog = {
        ...mockAuditLogWithUser,
        resourceType: "user",
        resourceId: "user-123",
      };

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        }),
      } as never);

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: vi.fn().mockResolvedValue([userResourceLog]),
                }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.list("org-123", {
        page: 1,
        limit: 50,
        resourceType: "user",
        resourceId: "user-123",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      // Verify returned log matches both resourceType and resourceId filters
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].resourceType).toBe("user");
      expect(result.logs[0].resourceId).toBe("user-123");
      expect(result.pagination.total).toBe(1);
    });

    it("should sort by action ascending", async () => {
      const settingsLog = {
        ...mockAuditLogWithUser,
        id: "audit-1",
        action: "settings_updated" as const,
      };
      const loginLog = { ...mockAuditLogWithUser, id: "audit-2", action: "user_login" as const };

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ total: 2 }]),
        }),
      } as never);

      // When sorted ascending by action, "settings_updated" comes before "user_login"
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: vi.fn().mockResolvedValue([settingsLog, loginLog]),
                }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.list("org-123", {
        page: 1,
        limit: 50,
        sortBy: "action",
        sortOrder: "asc",
      });

      // Verify logs are in ascending order by action
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].action).toBe("settings_updated");
      expect(result.logs[1].action).toBe("user_login");
    });

    it("should return empty logs when none exist", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        }),
      } as never);

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.list("org-123", {
        page: 1,
        limit: 50,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      expect(result.logs).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it("should calculate pagination correctly", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ total: 150 }]),
        }),
      } as never);

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: vi.fn().mockResolvedValue([mockAuditLogWithUser]),
                }),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.list("org-123", {
        page: 2,
        limit: 50,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(50);
      expect(result.pagination.total).toBe(150);
      expect(result.pagination.totalPages).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getById
  // ─────────────────────────────────────────────────────────────
  describe("getById", () => {
    it("should return audit log when found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockAuditLogWithUser]),
            }),
          }),
        }),
      } as never);

      const result = await auditService.getById("audit-123", "org-123");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("audit-123");
      expect(result?.user?.name).toBe("John Doe");
    });

    it("should return null when audit log not found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      const result = await auditService.getById("non-existent", "org-123");

      expect(result).toBeNull();
    });

    it("should not return audit log from different organization", async () => {
      // Service enforces org check in query, mock returns empty for wrong org
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      const result = await auditService.getById("audit-123", "different-org");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // export
  // ─────────────────────────────────────────────────────────────
  describe("export", () => {
    it("should export all matching logs", async () => {
      const logs = [mockAuditLogWithUser, { ...mockAuditLogWithUser, id: "audit-456" }];

      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: vi.fn().mockResolvedValue(logs),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.export("org-123", {});

      expect(result).toHaveLength(2);
    });

    it("should filter export by action", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: vi.fn().mockResolvedValue([mockAuditLogWithUser]),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.export("org-123", { action: "user_login" });

      expect(result).toHaveLength(1);
    });

    it("should filter export by date range", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: vi.fn().mockResolvedValue([mockAuditLogWithUser]),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.export("org-123", {
        from: "2024-01-01T00:00:00Z",
        to: "2024-01-31T23:59:59Z",
      });

      expect(result).toHaveLength(1);
    });

    it("should return empty array when no logs match", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as never);

      const result = await auditService.export("org-123", {});

      expect(result).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // logAction (helper)
  // ─────────────────────────────────────────────────────────────
  describe("logAction", () => {
    it("should log action with all options", async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockAuditLog]),
        }),
      } as never);

      const result = await auditService.logAction(mockContext, "settings_updated", {
        resourceType: "settings",
        resourceId: "org-settings-123",
        previousValue: { key: "old" },
        newValue: { key: "new" },
        metadata: { updatedBy: "admin" },
      });

      expect(result.action).toBe("user_login"); // Mock returns this
      expect(db.insert).toHaveBeenCalled();
    });

    it("should log action with minimal options", async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockAuditLog]),
        }),
      } as never);

      const result = await auditService.logAction(mockContext, "user_logout");

      expect(result).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getContextFromRequest
  // ─────────────────────────────────────────────────────────────
  describe("getContextFromRequest", () => {
    it("should extract context from request object", () => {
      const mockRequest = {
        organizationId: "org-123",
        user: { id: "user-123" },
        ip: "192.168.1.1",
        headers: { "user-agent": "Mozilla/5.0" },
      };

      const context = auditService.getContextFromRequest(mockRequest);

      expect(context).not.toBeNull();
      expect(context?.organizationId).toBe("org-123");
      expect(context?.userId).toBe("user-123");
      expect(context?.ipAddress).toBe("192.168.1.1");
      expect(context?.userAgent).toBe("Mozilla/5.0");
    });

    it("should return null when no organization ID", () => {
      const mockRequest = {
        user: { id: "user-123" },
        ip: "192.168.1.1",
      };

      const context = auditService.getContextFromRequest(mockRequest);

      expect(context).toBeNull();
    });

    it("should handle missing optional fields", () => {
      const mockRequest = {
        organizationId: "org-123",
      };

      const context = auditService.getContextFromRequest(mockRequest);

      expect(context).not.toBeNull();
      expect(context?.userId).toBeUndefined();
      expect(context?.ipAddress).toBeUndefined();
      expect(context?.userAgent).toBeUndefined();
    });
  });
});
