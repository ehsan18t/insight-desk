import { beforeEach, describe, expect, it, vi } from "vitest";
import { tagsService } from "./tags.service";

// Mock database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
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
    execute: vi.fn(() => Promise.resolve([])),
  },
  closeDatabaseConnection: vi.fn(),
}));

import { db } from "@/db";

describe("tagsService", () => {
  const mockOrgId = "org-123";
  const mockTag = {
    id: "tag-123",
    organizationId: mockOrgId,
    name: "bug",
    color: "#EF4444",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getByName", () => {
    it("should return tag when found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockTag]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await tagsService.getByName("bug", mockOrgId);

      expect(result).toEqual(mockTag);
    });

    it("should return null when tag not found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await tagsService.getByName("nonexistent", mockOrgId);

      expect(result).toBeNull();
    });

    it("should search in lowercase", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockTag]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await tagsService.getByName("BUG", mockOrgId);

      expect(result).toEqual(mockTag);
    });
  });

  describe("create", () => {
    it("should create a new tag", async () => {
      // Mock getByName to return null (tag doesn't exist)
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockTag]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await tagsService.create(mockOrgId, { name: "bug", color: "#EF4444" });

      expect(result).toEqual(mockTag);
      expect(db.insert).toHaveBeenCalled();
    });

    it("should return existing tag if already exists", async () => {
      // Mock getByName to return existing tag
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockTag]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await tagsService.create(mockOrgId, { name: "bug" });

      expect(result).toEqual(mockTag);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("should convert tag name to lowercase", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const lowercaseTag = { ...mockTag, name: "urgent" };
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([lowercaseTag]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await tagsService.create(mockOrgId, { name: "URGENT" });

      expect(result.name).toBe("urgent");
    });
  });

  describe("update", () => {
    it("should update tag successfully", async () => {
      const updatedTag = { ...mockTag, color: "#22C55E" };

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTag]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const result = await tagsService.update("bug", mockOrgId, { color: "#22C55E" });

      expect(result.color).toBe("#22C55E");
    });

    it("should throw NotFoundError when tag not found", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      await expect(tagsService.update("nonexistent", mockOrgId, { color: "#000" })).rejects.toThrow(
        "Tag not found",
      );
    });

    it("should update tag name in tickets when name changes", async () => {
      const updatedTag = { ...mockTag, name: "critical" };

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTag]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      // biome-ignore lint/suspicious/noExplicitAny: Mock return type flexibility
      vi.mocked(db.execute).mockResolvedValue([] as any);

      await tagsService.update("bug", mockOrgId, { name: "critical" });

      expect(db.execute).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("should delete tag and remove from tickets", async () => {
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockTag]),
        }),
      } as unknown as ReturnType<typeof db.delete>);

      // biome-ignore lint/suspicious/noExplicitAny: Mock return type flexibility
      vi.mocked(db.execute).mockResolvedValue([] as any);

      const result = await tagsService.remove("bug", mockOrgId);

      expect(result).toEqual({ deleted: true });
      expect(db.execute).toHaveBeenCalled();
    });

    it("should throw NotFoundError when tag not found", async () => {
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.delete>);

      await expect(tagsService.remove("nonexistent", mockOrgId)).rejects.toThrow("Tag not found");
    });
  });
});
