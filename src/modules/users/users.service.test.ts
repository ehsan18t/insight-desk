/**
 * Users Service Unit Tests
 * Tests for user management operations
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/db/schema";
import { type UserWithRole, usersService } from "./users.service";

// Mock User type for tests (since we're not importing full User)
interface MockUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Mock the database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    delete: vi.fn().mockReturnThis(),
    query: {
      userOrganizations: {
        findFirst: vi.fn(),
      },
    },
  },
  closeDatabaseConnection: vi.fn(),
}));

import { db } from "@/db";

// Helper to create mock user
function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    avatarUrl: null,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Helper to create mock user with role
function createMockUserWithRole(overrides: Partial<UserWithRole> = {}): UserWithRole {
  return {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    role: "agent",
    joinedAt: new Date(),
    ...overrides,
  };
}

describe("usersService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // listByOrganization - Skipped due to complex query chain mocking
  // Note: This function is tested via integration tests
  // ─────────────────────────────────────────────────────────────
  describe.skip("listByOrganization", () => {
    it("should return paginated list of users in organization", async () => {
      // Complex query chain - tested via integration tests
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getByIdInOrganization
  // ─────────────────────────────────────────────────────────────
  describe("getByIdInOrganization", () => {
    it("should return user with role when found", async () => {
      const mockUser = createMockUserWithRole();

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  limit: vi.fn().mockResolvedValue([mockUser]),
                }),
              }),
            }),
          }) as never,
      );

      const result = await usersService.getByIdInOrganization("user-123", "org-123");

      expect(result).toEqual(mockUser);
    });

    it("should return null when user not found", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }) as never,
      );

      const result = await usersService.getByIdInOrganization("nonexistent", "org-123");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getProfile
  // ─────────────────────────────────────────────────────────────
  describe("getProfile", () => {
    it("should return user profile when found", async () => {
      const mockUser = createMockUser();

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockUser]),
              }),
            }),
          }) as never,
      );

      const result = await usersService.getProfile("user-123");

      expect(result).toEqual(mockUser);
    });

    it("should return null when user not found", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      const result = await usersService.getProfile("nonexistent");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // updateProfile
  // ─────────────────────────────────────────────────────────────
  describe("updateProfile", () => {
    it("should update user profile and return updated user", async () => {
      const mockUser = createMockUser({ name: "Updated Name" });

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      } as never);

      const result = await usersService.updateProfile("user-123", {
        name: "Updated Name",
      });

      expect(result).toEqual(mockUser);
      expect(result.name).toBe("Updated Name");
    });

    it("should throw error when user not found", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      await expect(usersService.updateProfile("nonexistent", { name: "Test" })).rejects.toThrow(
        "User not found",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // updateRoleInOrganization
  // ─────────────────────────────────────────────────────────────
  describe("updateRoleInOrganization", () => {
    it("should throw error when trying to change own role", async () => {
      await expect(
        usersService.updateRoleInOrganization(
          "user-123",
          "org-123",
          { role: "admin" },
          "user-123", // same as userId
        ),
      ).rejects.toThrow("Cannot change your own role");
    });

    it("should throw error when user is not a member", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue(undefined);

      await expect(
        usersService.updateRoleInOrganization(
          "user-123",
          "org-123",
          { role: "admin" },
          "requester-123",
        ),
      ).rejects.toThrow("User is not a member of this organization");
    });

    it("should throw error when trying to change owner role", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
        id: "membership-123",
        userId: "user-123",
        organizationId: "org-123",
        role: "owner",
        joinedAt: new Date(),
      });

      await expect(
        usersService.updateRoleInOrganization(
          "user-123",
          "org-123",
          { role: "admin" },
          "requester-123",
        ),
      ).rejects.toThrow("Cannot change owner role");
    });

    it("should update role successfully", async () => {
      const mockMembership = {
        id: "membership-123",
        userId: "user-123",
        organizationId: "org-123",
        role: "agent" as UserRole,
        joinedAt: new Date(),
      };

      const mockUpdatedUser = createMockUserWithRole({ role: "admin" });

      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue(mockMembership);

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      // Mock getByIdInOrganization call
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  limit: vi.fn().mockResolvedValue([mockUpdatedUser]),
                }),
              }),
            }),
          }) as never,
      );

      const result = await usersService.updateRoleInOrganization(
        "user-123",
        "org-123",
        { role: "admin" },
        "requester-123",
      );

      expect(result.role).toBe("admin");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // deactivate
  // ─────────────────────────────────────────────────────────────
  describe("deactivate", () => {
    it("should throw error when trying to deactivate self", async () => {
      await expect(usersService.deactivate("user-123", "user-123")).rejects.toThrow(
        "Cannot deactivate your own account",
      );
    });

    it("should throw error when user not found", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      await expect(usersService.deactivate("nonexistent", "requester-123")).rejects.toThrow(
        "User not found",
      );
    });

    it("should deactivate user successfully", async () => {
      const mockUser = createMockUser();
      const deactivatedUser = { ...mockUser, isActive: false };

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockUser]),
              }),
            }),
          }) as never,
      );

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([deactivatedUser]),
          }),
        }),
      } as never);

      const result = await usersService.deactivate("user-123", "requester-123");

      expect(result.isActive).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // reactivate
  // ─────────────────────────────────────────────────────────────
  describe("reactivate", () => {
    it("should reactivate user successfully", async () => {
      const mockUser = createMockUser({ isActive: true });

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      } as never);

      const result = await usersService.reactivate("user-123");

      expect(result.isActive).toBe(true);
    });

    it("should throw error when user not found", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      await expect(usersService.reactivate("nonexistent")).rejects.toThrow("User not found");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // updateLastLogin
  // ─────────────────────────────────────────────────────────────
  describe("updateLastLogin", () => {
    it("should update last login timestamp", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      await expect(usersService.updateLastLogin("user-123")).resolves.not.toThrow();

      expect(db.update).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getAvailableAgents
  // ─────────────────────────────────────────────────────────────
  describe("getAvailableAgents", () => {
    it("should return list of available agents", async () => {
      const mockAgents = [
        {
          id: "agent-1",
          name: "Agent 1",
          email: "agent1@test.com",
          avatarUrl: null,
          role: "agent" as UserRole,
        },
        {
          id: "agent-2",
          name: "Agent 2",
          email: "agent2@test.com",
          avatarUrl: null,
          role: "admin" as UserRole,
        },
      ];

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: vi.fn().mockResolvedValue(mockAgents),
                }),
              }),
            }),
          }) as never,
      );

      const result = await usersService.getAvailableAgents("org-123");

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("agent");
    });

    it("should return empty array when no agents available", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }) as never,
      );

      const result = await usersService.getAvailableAgents("org-123");

      expect(result).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // removeFromOrganization
  // ─────────────────────────────────────────────────────────────
  describe("removeFromOrganization", () => {
    it("should throw error when trying to remove self", async () => {
      await expect(
        usersService.removeFromOrganization("user-123", "org-123", "user-123"),
      ).rejects.toThrow("Cannot remove yourself from the organization");
    });

    it("should throw error when user is not a member", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue(undefined);

      await expect(
        usersService.removeFromOrganization("user-123", "org-123", "requester-123"),
      ).rejects.toThrow("User is not a member of this organization");
    });

    it("should throw error when trying to remove owner", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
        id: "membership-123",
        userId: "user-123",
        organizationId: "org-123",
        role: "owner",
        joinedAt: new Date(),
      });

      await expect(
        usersService.removeFromOrganization("user-123", "org-123", "requester-123"),
      ).rejects.toThrow("Cannot remove the organization owner");
    });

    it("should remove user from organization successfully", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
        id: "membership-123",
        userId: "user-123",
        organizationId: "org-123",
        role: "agent",
        joinedAt: new Date(),
      });

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as never);

      await expect(
        usersService.removeFromOrganization("user-123", "org-123", "requester-123"),
      ).resolves.not.toThrow();

      expect(db.delete).toHaveBeenCalled();
    });
  });
});
