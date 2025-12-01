import { beforeEach, describe, expect, it, vi } from "vitest";
import { savedFiltersService } from "./saved-filters.service";

// Mock database
vi.mock("@/db", () => ({
  db: {
    query: {
      savedFilters: {
        findMany: vi.fn(() => Promise.resolve([])),
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
  },
  closeDatabaseConnection: vi.fn(),
}));

import { db } from "@/db";

describe("savedFiltersService", () => {
  const mockOrgId = "org-123";
  const mockUserId = "user-123";
  const mockFilterId = "filter-123";
  const mockFilter = {
    id: mockFilterId,
    organizationId: mockOrgId,
    userId: mockUserId,
    name: "My Open Tickets",
    description: "All my assigned open tickets",
    criteria: { status: ["open"], assigneeId: mockUserId },
    isDefault: false,
    isShared: false,
    sortBy: "createdAt",
    sortOrder: "desc",
    color: "#3B82F6",
    icon: null,
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getById", () => {
    it("should return filter when found", async () => {
      vi.mocked(db.query.savedFilters.findFirst).mockResolvedValue(mockFilter);

      const result = await savedFiltersService.getById(mockFilterId, mockOrgId, mockUserId);

      expect(result).toEqual(mockFilter);
    });

    it("should return null when filter not found", async () => {
      vi.mocked(db.query.savedFilters.findFirst).mockResolvedValue(undefined);

      const result = await savedFiltersService.getById("non-existent", mockOrgId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("should create a new saved filter with correct values", async () => {
      vi.mocked(db.query.savedFilters.findMany).mockResolvedValue([]);

      const valuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockFilter]),
      });

      vi.mocked(db.insert).mockReturnValue({
        values: valuesMock,
      } as unknown as ReturnType<typeof db.insert>);

      const input = {
        name: "My Open Tickets",
        description: "All my assigned open tickets",
        criteria: { status: ["open" as const], assigneeId: mockUserId },
        isDefault: false,
        isShared: false,
        sortBy: "createdAt" as const,
        sortOrder: "desc" as const,
      };

      await savedFiltersService.create(input, mockOrgId, mockUserId);

      // Verify insert was called with correct values including organizationId and userId
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: mockOrgId,
          userId: mockUserId,
          name: "My Open Tickets",
          description: "All my assigned open tickets",
          isDefault: false,
          isShared: false,
        }),
      );
    });

    it("should set position based on existing filters", async () => {
      vi.mocked(db.query.savedFilters.findMany).mockResolvedValue([
        { position: 0 },
        { position: 1 },
        { position: 2 },
      ] as (typeof mockFilter)[]);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...mockFilter, position: 3 }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const input = {
        name: "New Filter",
        criteria: { status: ["pending" as const] },
        isDefault: false,
        isShared: false,
        sortBy: "createdAt" as const,
        sortOrder: "desc" as const,
      };

      const result = await savedFiltersService.create(input, mockOrgId, mockUserId);

      expect(result.position).toBe(3);
    });

    it("should unset other defaults when creating default filter", async () => {
      vi.mocked(db.query.savedFilters.findMany).mockResolvedValue([]);

      // Track what set() is called with
      const mockSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(db.update).mockReturnValue({
        set: mockSet,
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...mockFilter, isDefault: true }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const input = {
        name: "Default Filter",
        criteria: { status: ["open" as const] },
        isDefault: true,
        isShared: false,
        sortBy: "createdAt" as const,
        sortOrder: "desc" as const,
      };

      await savedFiltersService.create(input, mockOrgId, mockUserId);

      // Verify that other defaults are unset with isDefault: false
      expect(db.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith({ isDefault: false });
    });
  });

  describe("update", () => {
    it("should update filter successfully", async () => {
      vi.mocked(db.query.savedFilters.findFirst).mockResolvedValue(mockFilter);
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockFilter, name: "Updated Name" }]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const result = await savedFiltersService.update(
        mockFilterId,
        { name: "Updated Name" },
        mockOrgId,
        mockUserId,
      );

      expect(result.name).toBe("Updated Name");
    });

    it("should throw NotFoundError when filter not found", async () => {
      vi.mocked(db.query.savedFilters.findFirst).mockResolvedValue(undefined);

      await expect(
        savedFiltersService.update("non-existent", { name: "New Name" }, mockOrgId, mockUserId),
      ).rejects.toThrow("Saved filter not found");
    });

    it("should throw ForbiddenError when updating another user's filter", async () => {
      vi.mocked(db.query.savedFilters.findFirst).mockResolvedValue({
        ...mockFilter,
        userId: "another-user",
      });

      await expect(
        savedFiltersService.update(mockFilterId, { name: "New Name" }, mockOrgId, mockUserId),
      ).rejects.toThrow("You can only update your own filters");
    });
  });

  describe("delete", () => {
    it("should delete filter successfully", async () => {
      vi.mocked(db.query.savedFilters.findFirst).mockResolvedValue(mockFilter);

      // Track the where clause
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as unknown as ReturnType<typeof db.delete>);

      await savedFiltersService.delete(mockFilterId, mockOrgId, mockUserId);

      // Verify delete was called and where clause was invoked
      expect(db.delete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });

    it("should throw NotFoundError when filter not found", async () => {
      vi.mocked(db.query.savedFilters.findFirst).mockResolvedValue(undefined);

      await expect(
        savedFiltersService.delete("non-existent", mockOrgId, mockUserId),
      ).rejects.toThrow("Saved filter not found");
    });

    it("should throw ForbiddenError when deleting another user's filter", async () => {
      vi.mocked(db.query.savedFilters.findFirst).mockResolvedValue({
        ...mockFilter,
        userId: "another-user",
      });

      await expect(savedFiltersService.delete(mockFilterId, mockOrgId, mockUserId)).rejects.toThrow(
        "You can only delete your own filters",
      );
    });
  });
});
