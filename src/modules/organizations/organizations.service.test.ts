/**
 * Organizations Service Unit Tests
 * Tests for organization management operations
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Organization } from "@/db/schema";
import { type OrganizationMember, organizationsService } from "./organizations.service";

// Mock email service
vi.mock("@/lib/email", () => ({
  sendTemplateEmail: vi.fn().mockResolvedValue(true),
  sendEmail: vi.fn().mockResolvedValue(true),
}));

// Mock subscriptions service
vi.mock("@/modules/subscriptions", () => ({
  subscriptionsService: {
    createForOrganization: vi.fn().mockResolvedValue({
      id: "sub-123",
      organizationId: "org-123",
      plan: "free",
    }),
  },
}));

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
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
    query: {
      organizations: {
        findFirst: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
      },
      userOrganizations: {
        findFirst: vi.fn(),
      },
      organizationInvitations: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
  },
  closeDatabaseConnection: vi.fn(),
}));

import { db } from "@/db";

// Helper to create mock organization
function createMockOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-123",
    name: "Test Organization",
    slug: "test-org",
    settings: {},
    plan: "free",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Helper to create mock member
function createMockMember(overrides: Partial<OrganizationMember> = {}): OrganizationMember {
  return {
    id: "membership-123",
    userId: "user-123",
    email: "test@example.com",
    name: "Test User",
    avatarUrl: null,
    role: "agent",
    joinedAt: new Date(),
    isActive: true,
    ...overrides,
  };
}

describe("organizationsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create organization and add owner", async () => {
      const mockOrg = createMockOrganization();

      // Mock slug check
      vi.mocked(db.query.organizations.findFirst).mockResolvedValue(undefined);

      // Mock transaction
      vi.mocked(db.transaction).mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockOrg]),
            }),
          }),
        };
        return callback(tx as never);
      });

      const result = await organizationsService.create(
        { name: "Test Organization", slug: "test-org" },
        "owner-123",
      );

      expect(result).toEqual(mockOrg);
    });

    it("should throw error if slug is already taken", async () => {
      vi.mocked(db.query.organizations.findFirst).mockResolvedValue(createMockOrganization());

      await expect(
        organizationsService.create({ name: "Test", slug: "existing-slug" }, "owner-123"),
      ).rejects.toThrow("Organization slug is already taken");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getById
  // ─────────────────────────────────────────────────────────────
  describe("getById", () => {
    it("should return organization with member count when found", async () => {
      const mockOrg = createMockOrganization();

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockOrg]),
              }),
            }),
          }) as never,
      );

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: vi.fn().mockResolvedValue([{ memberCount: 5 }]),
            }),
          }) as never,
      );

      const result = await organizationsService.getById("org-123");

      expect(result).toBeDefined();
      expect(result?.memberCount).toBe(5);
    });

    it("should return null when organization not found", async () => {
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

      const result = await organizationsService.getById("nonexistent");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getBySlug
  // ─────────────────────────────────────────────────────────────
  describe("getBySlug", () => {
    it("should return organization by slug", async () => {
      const mockOrg = createMockOrganization();

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockOrg]),
              }),
            }),
          }) as never,
      );

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: vi.fn().mockResolvedValue([{ memberCount: 3 }]),
            }),
          }) as never,
      );

      const result = await organizationsService.getBySlug("test-org");

      expect(result?.slug).toBe("test-org");
      expect(result?.memberCount).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────────────────────
  describe("update", () => {
    it("should update organization name", async () => {
      const updatedOrg = createMockOrganization({ name: "Updated Name" });

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([updatedOrg]),
          }),
        }),
      } as never);

      const result = await organizationsService.update("org-123", {
        name: "Updated Name",
      });

      expect(result.name).toBe("Updated Name");
    });

    it("should merge settings when updating", async () => {
      const currentSettings = {
        branding: { primaryColor: "#000" },
        features: { liveChatEnabled: true },
      };
      const mockOrg = createMockOrganization({
        settings: {
          branding: { primaryColor: "#fff" },
          features: { liveChatEnabled: true, customerPortalEnabled: true },
        },
      });

      // Mock getting current settings
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([{ settings: currentSettings }]),
              }),
            }),
          }) as never,
      );

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([mockOrg]),
          }),
        }),
      } as never);

      const result = await organizationsService.update("org-123", {
        settings: {
          branding: { primaryColor: "#fff" },
          features: { customerPortalEnabled: true },
        },
      });

      expect(result.settings?.branding?.primaryColor).toBe("#fff");
    });

    it("should throw error when organization not found", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      await expect(organizationsService.update("nonexistent", { name: "Test" })).rejects.toThrow(
        "Organization not found",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // inviteMember
  // ─────────────────────────────────────────────────────────────
  describe("inviteMember", () => {
    it("should add existing user to organization", async () => {
      const existingUser = {
        id: "user-123",
        email: "existing@test.com",
        name: "Existing User",
      };

      // Mock user exists
      vi.mocked(db.query.users.findFirst).mockResolvedValue(existingUser as never);
      // Mock not already a member
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue(undefined);
      // Mock insert
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as never);

      const result = await organizationsService.inviteMember(
        "org-123",
        { email: "existing@test.com", role: "agent" },
        "inviter-123",
      );

      expect(result.userId).toBe("user-123");
      expect(result.invited).toBe(false);
      expect(result.message).toBe("User added to organization");
    });

    it("should throw error if user is already a member", async () => {
      const existingUser = { id: "user-123", email: "existing@test.com" };

      vi.mocked(db.query.users.findFirst).mockResolvedValue(existingUser as never);
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
        id: "membership-123",
        userId: "user-123",
        organizationId: "org-123",
        role: "agent",
        joinedAt: new Date(),
      });

      await expect(
        organizationsService.inviteMember(
          "org-123",
          { email: "existing@test.com", role: "agent" },
          "inviter-123",
        ),
      ).rejects.toThrow("User is already a member of this organization");
    });

    it("should create invitation for non-existent user", async () => {
      vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
      vi.mocked(db.query.organizationInvitations.findFirst).mockResolvedValue(undefined);
      // Mock organization and inviter lookups for email template
      vi.mocked(db.query.organizations.findFirst).mockResolvedValue(createMockOrganization());
      vi.mocked(db.query.users.findFirst)
        .mockResolvedValueOnce(undefined) // First call: check if user exists
        .mockResolvedValueOnce({
          id: "inviter-123",
          name: "Test Inviter",
          email: "inviter@test.com",
        } as never); // Second call: get inviter details
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "inv-123",
              orgId: "org-123",
              email: "new@test.com",
              role: "agent",
              token: "test-token",
              status: "pending",
              invitedById: "inviter-123",
              expiresAt: new Date(),
              createdAt: new Date(),
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await organizationsService.inviteMember(
        "org-123",
        { email: "new@test.com", role: "agent" },
        "inviter-123",
      );

      expect(result.invited).toBe(true);
      expect(result.invitationId).toBe("inv-123");
      expect(result.message).toContain("Invitation sent");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // updateMemberRole
  // ─────────────────────────────────────────────────────────────
  describe("updateMemberRole", () => {
    it("should throw error when trying to change own role", async () => {
      await expect(
        organizationsService.updateMemberRole("org-123", "user-123", { role: "admin" }, "user-123"),
      ).rejects.toThrow("Cannot change your own role");
    });

    it("should throw error when user is not a member", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue(undefined);

      await expect(
        organizationsService.updateMemberRole(
          "org-123",
          "user-123",
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
        organizationsService.updateMemberRole(
          "org-123",
          "user-123",
          { role: "admin" },
          "requester-123",
        ),
      ).rejects.toThrow("Cannot change owner role");
    });

    it("should update member role successfully", async () => {
      const mockMember = createMockMember({ role: "admin" });

      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
        id: "membership-123",
        userId: "user-123",
        organizationId: "org-123",
        role: "agent",
        joinedAt: new Date(),
      });

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  limit: vi.fn().mockResolvedValue([mockMember]),
                }),
              }),
            }),
          }) as never,
      );

      const result = await organizationsService.updateMemberRole(
        "org-123",
        "user-123",
        { role: "admin" },
        "requester-123",
      );

      expect(result.role).toBe("admin");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // removeMember
  // ─────────────────────────────────────────────────────────────
  describe("removeMember", () => {
    it("should throw error when trying to remove self", async () => {
      await expect(
        organizationsService.removeMember("org-123", "user-123", "user-123"),
      ).rejects.toThrow("Cannot remove yourself from the organization");
    });

    it("should throw error when user is not a member", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue(undefined);

      await expect(
        organizationsService.removeMember("org-123", "user-123", "requester-123"),
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
        organizationsService.removeMember("org-123", "user-123", "requester-123"),
      ).rejects.toThrow("Cannot remove the organization owner");
    });

    it("should remove member successfully", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
        id: "membership-to-remove",
        userId: "user-to-remove",
        organizationId: "org-123",
        role: "agent",
        joinedAt: new Date(),
      });

      // Track the where clause
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as never);

      await expect(
        organizationsService.removeMember("org-123", "user-to-remove", "requester-123"),
      ).resolves.not.toThrow();

      // Verify delete was called and where clause was invoked
      expect(db.delete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // checkUserRole
  // ─────────────────────────────────────────────────────────────
  describe("checkUserRole", () => {
    it("should return true when user has allowed role", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
        id: "membership-123",
        userId: "user-123",
        organizationId: "org-123",
        role: "admin",
        joinedAt: new Date(),
      });

      const result = await organizationsService.checkUserRole("user-123", "org-123", [
        "admin",
        "owner",
      ]);

      expect(result).toBe(true);
    });

    it("should return false when user does not have allowed role", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
        id: "membership-123",
        userId: "user-123",
        organizationId: "org-123",
        role: "customer",
        joinedAt: new Date(),
      });

      const result = await organizationsService.checkUserRole("user-123", "org-123", [
        "admin",
        "owner",
      ]);

      expect(result).toBe(false);
    });

    it("should return false when user is not a member", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue(undefined);

      const result = await organizationsService.checkUserRole("user-123", "org-123", [
        "admin",
        "owner",
      ]);

      expect(result).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getUserRole
  // ─────────────────────────────────────────────────────────────
  describe("getUserRole", () => {
    it("should return user role when member", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue({
        id: "membership-123",
        userId: "user-123",
        organizationId: "org-123",
        role: "admin",
        joinedAt: new Date(),
      });

      const result = await organizationsService.getUserRole("user-123", "org-123");

      expect(result).toBe("admin");
    });

    it("should return null when user is not a member", async () => {
      vi.mocked(db.query.userOrganizations.findFirst).mockResolvedValue(undefined);

      const result = await organizationsService.getUserRole("user-123", "org-123");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // deactivate
  // ─────────────────────────────────────────────────────────────
  describe("deactivate", () => {
    it("should deactivate organization", async () => {
      const deactivatedOrg = createMockOrganization({ isActive: false });

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([deactivatedOrg]),
          }),
        }),
      } as never);

      const result = await organizationsService.deactivate("org-123");

      expect(result.isActive).toBe(false);
    });

    it("should throw error when organization not found", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      await expect(organizationsService.deactivate("nonexistent")).rejects.toThrow(
        "Organization not found",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // reactivate
  // ─────────────────────────────────────────────────────────────
  describe("reactivate", () => {
    it("should reactivate organization", async () => {
      const reactivatedOrg = createMockOrganization({ isActive: true });

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([reactivatedOrg]),
          }),
        }),
      } as never);

      const result = await organizationsService.reactivate("org-123");

      expect(result.isActive).toBe(true);
    });

    it("should throw error when organization not found", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      await expect(organizationsService.reactivate("nonexistent")).rejects.toThrow(
        "Organization not found",
      );
    });
  });
});
