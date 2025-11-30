/**
 * Canned Responses Service Unit Tests
 * Tests for canned response template management operations
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CannedResponse } from "./canned-responses.service";
import { cannedResponsesService } from "./canned-responses.service";

// Mock the database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    selectDistinct: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
  closeDatabaseConnection: vi.fn(),
}));

import { db } from "@/db";

// Mock canned response for tests
const mockCannedResponse: CannedResponse = {
  id: "response-1",
  organizationId: "org-1",
  title: "Welcome Message",
  content: "Thank you for contacting us! How can we help you today?",
  shortcut: "/welcome",
  category: "greetings",
  createdById: "user-1",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

describe("cannedResponsesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // list
  // ─────────────────────────────────────────────────────────────
  describe("list", () => {
    it("should return paginated list of canned responses", async () => {
      const mockResponses = [mockCannedResponse];

      // Mock the Promise.all with two parallel queries
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => ({
                    offset: vi.fn().mockResolvedValue(mockResponses),
                  }),
                }),
              }),
            }),
          }) as never,
      );

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: vi.fn().mockResolvedValue([{ total: 1 }]),
            }),
          }) as never,
      );

      const result = await cannedResponsesService.list("org-1");

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getById
  // ─────────────────────────────────────────────────────────────
  describe("getById", () => {
    it("should return canned response when found", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockCannedResponse]),
              }),
            }),
          }) as never,
      );

      const result = await cannedResponsesService.getById("response-1", "org-1");

      expect(result).toEqual(mockCannedResponse);
    });

    it("should return null when canned response not found", async () => {
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

      const result = await cannedResponsesService.getById("non-existent", "org-1");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getByShortcut
  // ─────────────────────────────────────────────────────────────
  describe("getByShortcut", () => {
    it("should return canned response for specific shortcut", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockCannedResponse]),
              }),
            }),
          }) as never,
      );

      const result = await cannedResponsesService.getByShortcut("org-1", "/welcome");

      expect(result).toEqual(mockCannedResponse);
      expect(result?.shortcut).toBe("/welcome");
    });

    it("should return null when no response for shortcut", async () => {
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

      const result = await cannedResponsesService.getByShortcut("org-1", "/nonexistent");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getCategories
  // ─────────────────────────────────────────────────────────────
  describe("getCategories", () => {
    it("should return unique categories for organization", async () => {
      vi.mocked(db.selectDistinct).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: vi
                .fn()
                .mockResolvedValue([
                  { category: "greetings" },
                  { category: "closings" },
                  { category: "support" },
                ]),
            }),
          }) as never,
      );

      const result = await cannedResponsesService.getCategories("org-1");

      expect(result).toHaveLength(3);
      expect(result).toContain("greetings");
      expect(result).toContain("closings");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create a new canned response without shortcut", async () => {
      const inputData = {
        title: "No Shortcut Message",
        content: "Custom content here",
        category: "misc",
      };

      // Track what values are passed to db.insert().values()
      const mockValues = vi.fn();
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues.mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "response-new",
              organizationId: "org-1",
              title: inputData.title,
              content: inputData.content,
              shortcut: null,
              category: inputData.category,
              createdById: "user-1",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      } as never);

      const result = await cannedResponsesService.create("org-1", "user-1", inputData);

      // Verify the actual input values were passed to the database
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          createdById: "user-1",
          title: "No Shortcut Message",
          content: "Custom content here",
          shortcut: null,
          category: "misc",
        }),
      );
      expect(result.shortcut).toBeNull();
      expect(result.title).toBe("No Shortcut Message");
    });

    it("should create a new canned response with unique shortcut", async () => {
      // First: getByShortcut returns no existing
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

      // Then: insert returns new response
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockCannedResponse]),
        }),
      } as never);

      const result = await cannedResponsesService.create("org-1", "user-1", {
        title: "Welcome Message",
        content: "Thank you for contacting us!",
        shortcut: "/welcome",
        category: "greetings",
      });

      expect(result).toEqual(mockCannedResponse);
    });

    it("should throw ForbiddenError when shortcut already exists", async () => {
      // getByShortcut returns existing response
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockCannedResponse]),
              }),
            }),
          }) as never,
      );

      await expect(
        cannedResponsesService.create("org-1", "user-1", {
          title: "New Message",
          content: "Content",
          shortcut: "/welcome", // Already exists
          category: "greetings",
        }),
      ).rejects.toThrow("already in use");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────────────────────
  describe("update", () => {
    it("should update canned response title", async () => {
      // getById returns existing response
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockCannedResponse]),
              }),
            }),
          }) as never,
      );

      // update returns updated response
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi
              .fn()
              .mockResolvedValue([{ ...mockCannedResponse, title: "Updated Title" }]),
          }),
        }),
      } as never);

      const result = await cannedResponsesService.update("response-1", "org-1", {
        title: "Updated Title",
      });

      expect(result.title).toBe("Updated Title");
    });

    it("should update canned response content", async () => {
      // getById returns existing response
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockCannedResponse]),
              }),
            }),
          }) as never,
      );

      // update returns updated response
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi
              .fn()
              .mockResolvedValue([{ ...mockCannedResponse, content: "Updated content" }]),
          }),
        }),
      } as never);

      const result = await cannedResponsesService.update("response-1", "org-1", {
        content: "Updated content",
      });

      expect(result.content).toBe("Updated content");
    });

    it("should throw NotFoundError when response not found", async () => {
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

      await expect(
        cannedResponsesService.update("non-existent", "org-1", { title: "Test" }),
      ).rejects.toThrow("not found");
    });

    it("should throw ForbiddenError when updating to existing shortcut", async () => {
      // getById returns existing response
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockCannedResponse]),
              }),
            }),
          }) as never,
      );

      // getByShortcut returns another response with that shortcut
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([{ ...mockCannedResponse, id: "response-2" }]),
              }),
            }),
          }) as never,
      );

      await expect(
        cannedResponsesService.update("response-1", "org-1", {
          shortcut: "/existingshortcut",
        }),
      ).rejects.toThrow("already in use");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────────────────────────
  describe("remove", () => {
    it("should delete canned response with correct ID", async () => {
      const responseToDelete = { ...mockCannedResponse, id: "response-to-delete" };

      // getById returns existing response
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([responseToDelete]),
              }),
            }),
          }) as never,
      );

      // Track the where condition for delete
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as never);

      await cannedResponsesService.remove("response-to-delete", "org-1");

      // Verify delete was called and the where clause was invoked
      expect(db.delete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });

    it("should throw NotFoundError when response not found", async () => {
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

      await expect(cannedResponsesService.remove("non-existent", "org-1")).rejects.toThrow(
        "not found",
      );
    });
  });
});
