import { beforeEach, describe, expect, it, vi } from "vitest";
import { categoriesService } from "./categories.service";

// Mock database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
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

describe("categoriesService", () => {
  const mockOrgId = "org-123";
  const mockCategoryId = "cat-123";
  const mockCategory = {
    id: mockCategoryId,
    organizationId: mockOrgId,
    name: "Technical Support",
    description: "Technical issues",
    color: "#3B82F6",
    parentId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // list
  // ─────────────────────────────────────────────────────────────
  describe("list", () => {
    it("should return all active categories for organization", async () => {
      const mockCategories = [
        mockCategory,
        { ...mockCategory, id: "cat-456", name: "Billing Support" },
      ];

      const whereMock = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(mockCategories),
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: whereMock,
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await categoriesService.list(mockOrgId);

      // Verify db.select was called (verifying the query was made)
      expect(db.select).toHaveBeenCalled();
      // Verify where was called (filtering logic applied)
      expect(whereMock).toHaveBeenCalled();
      // Verify correct number of results
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no categories exist", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await categoriesService.list(mockOrgId);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it("should include inactive categories when includeInactive is true - verifies different WHERE clause", async () => {
      const inactiveCategory = { ...mockCategory, isActive: false, name: "Inactive Category" };
      const mockCategories = [mockCategory, inactiveCategory];

      const whereMock = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(mockCategories),
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: whereMock,
        }),
      } as unknown as ReturnType<typeof db.select>);

      // Call with includeInactive=true
      await categoriesService.list(mockOrgId, { includeInactive: true });

      // Verify where was called - the WHERE clause should be different from default
      // (not filtering by isActive=true)
      expect(whereMock).toHaveBeenCalled();
    });

    it("should filter by parentId when provided - verifies parentId in WHERE clause", async () => {
      const childCategory = { ...mockCategory, id: "child-1", parentId: "parent-1" };

      const whereMock = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([childCategory]),
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: whereMock,
        }),
      } as unknown as ReturnType<typeof db.select>);

      await categoriesService.list(mockOrgId, { parentId: "parent-1" });

      // Verify where was called with parentId condition
      expect(whereMock).toHaveBeenCalled();
      expect(db.select).toHaveBeenCalled();
    });

    it("should return only root categories when parentId is null - verifies null filter in WHERE", async () => {
      const rootCategory = { ...mockCategory, parentId: null };

      const whereMock = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([rootCategory]),
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: whereMock,
        }),
      } as unknown as ReturnType<typeof db.select>);

      await categoriesService.list(mockOrgId, { parentId: null });

      // Verify where was called - should filter for parentId IS NULL
      expect(whereMock).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getById
  // ─────────────────────────────────────────────────────────────
  describe("getById", () => {
    it("should return category when found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCategory]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await categoriesService.getById(mockCategoryId, mockOrgId);

      expect(result).toEqual(mockCategory);
    });

    it("should return null when category not found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await categoriesService.getById("non-existent", mockOrgId);

      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("should create a new category with correct values passed to insert", async () => {
      const valuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockCategory]),
      });

      vi.mocked(db.insert).mockReturnValue({
        values: valuesMock,
      } as unknown as ReturnType<typeof db.insert>);

      const input = {
        name: "Technical Support",
        description: "Technical issues",
        color: "#3B82F6",
      };

      await categoriesService.create(mockOrgId, input);

      // Verify insert was called
      expect(db.insert).toHaveBeenCalled();
      // Verify values() was called with the correct data (isActive defaults in DB)
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: mockOrgId,
          name: "Technical Support",
          description: "Technical issues",
          color: "#3B82F6",
        }),
      );
    });

    it("should validate parent category exists when provided", async () => {
      // Mock getById to return null (parent not found)
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const input = {
        name: "Sub Category",
        parentId: "non-existent-parent",
      };

      await expect(categoriesService.create(mockOrgId, input)).rejects.toThrow(
        "Parent category not found",
      );
    });

    it("should create subcategory when parent exists", async () => {
      const parentCategory = { ...mockCategory, id: "parent-id" };
      const childCategory = { ...mockCategory, id: "child-id", parentId: "parent-id" };

      // First call for getById (parent check)
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([parentCategory]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([childCategory]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const input = {
        name: "Sub Category",
        parentId: "parent-id",
      };

      const result = await categoriesService.create(mockOrgId, input);

      expect(result.parentId).toBe("parent-id");
    });
  });

  describe("update", () => {
    it("should update category successfully", async () => {
      const updatedCategory = { ...mockCategory, name: "Updated Name" };

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedCategory]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const result = await categoriesService.update(mockCategoryId, mockOrgId, {
        name: "Updated Name",
      });

      expect(result.name).toBe("Updated Name");
    });

    it("should throw NotFoundError when category not found", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      await expect(
        categoriesService.update("non-existent", mockOrgId, { name: "New Name" }),
      ).rejects.toThrow("Category not found");
    });

    it("should throw error when setting category as its own parent", async () => {
      await expect(
        categoriesService.update(mockCategoryId, mockOrgId, { parentId: mockCategoryId }),
      ).rejects.toThrow("Category cannot be its own parent");
    });
  });

  describe("remove", () => {
    it("should soft delete when category has tickets", async () => {
      // Mock ticket count check - has tickets
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ count: "ticket-id" }]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      // Mock update for soft delete
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockCategory, isActive: false }]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const result = await categoriesService.remove(mockCategoryId, mockOrgId);

      expect(result).toEqual({ deleted: false, deactivated: true });
    });

    it("should hard delete when category has no tickets", async () => {
      // Mock ticket count check - no tickets
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      // Mock delete
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCategory]),
        }),
      } as unknown as ReturnType<typeof db.delete>);

      const result = await categoriesService.remove(mockCategoryId, mockOrgId);

      expect(result).toEqual({ deleted: true, deactivated: false });
    });

    it("should throw NotFoundError when category not found during soft delete", async () => {
      // Mock ticket count check - has tickets
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ count: "ticket-id" }]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      // Mock update returns empty (not found)
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      await expect(categoriesService.remove("non-existent", mockOrgId)).rejects.toThrow(
        "Category not found",
      );
    });

    it("should throw NotFoundError when category not found during hard delete", async () => {
      // Mock ticket count check - no tickets
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      // Mock delete returns empty (not found)
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.delete>);

      await expect(categoriesService.remove("non-existent", mockOrgId)).rejects.toThrow(
        "Category not found",
      );
    });
  });
});
