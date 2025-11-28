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
    it("should create a new category", async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCategory]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const input = {
        name: "Technical Support",
        description: "Technical issues",
        color: "#3B82F6",
      };

      const result = await categoriesService.create(mockOrgId, input);

      expect(result).toEqual(mockCategory);
      expect(db.insert).toHaveBeenCalled();
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
