import { beforeEach, describe, expect, it, vi } from "vitest";
import * as attachmentsService from "./attachments.service";

// Mock storage
vi.mock("@/lib/storage", () => ({
  storage: {
    upload: vi.fn(() =>
      Promise.resolve({
        filename: "stored-file.pdf",
        path: "org/tickets/stored-file.pdf",
        url: "https://storage.example.com/stored-file.pdf",
      }),
    ),
    getUrl: vi.fn(() => Promise.resolve("https://storage.example.com/stored-file.pdf")),
    download: vi.fn(() => Promise.resolve(Buffer.from("file content"))),
    delete: vi.fn(() => Promise.resolve()),
  },
}));

// Mock database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
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
import { storage } from "@/lib/storage";

describe("attachmentsService", () => {
  const mockOrgId = "org-123";
  const mockUserId = "user-123";
  const mockAttachmentId = "att-123";
  const mockTicketId = "ticket-123";

  const mockAttachment = {
    id: mockAttachmentId,
    orgId: mockOrgId,
    ticketId: mockTicketId,
    messageId: null,
    uploadedById: mockUserId,
    filename: "stored-file.pdf",
    originalName: "document.pdf",
    mimeType: "application/pdf",
    size: 1024,
    path: "org-123/tickets/stored-file.pdf",
    folder: "tickets",
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("uploadAttachment", () => {
    it("should upload file and create database record with correct values", async () => {
      const valuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockAttachment]),
      });

      vi.mocked(db.insert).mockReturnValue({
        values: valuesMock,
      } as unknown as ReturnType<typeof db.insert>);

      await attachmentsService.uploadAttachment({
        buffer: Buffer.from("test content"),
        orgId: mockOrgId,
        uploadedById: mockUserId,
        filename: "document.pdf",
        mimeType: "application/pdf",
        ticketId: mockTicketId,
        folder: "tickets",
      });

      // Verify storage.upload was called with correct params
      expect(storage.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          filename: "document.pdf",
          mimeType: "application/pdf",
          folder: `${mockOrgId}/tickets`,
        }),
      );

      // Verify db.insert was called with correct values
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: mockOrgId,
          uploadedById: mockUserId,
          ticketId: mockTicketId,
          mimeType: "application/pdf",
          folder: "tickets",
        }),
      );
    });

    it("should use general folder by default", async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...mockAttachment, folder: "general" }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      await attachmentsService.uploadAttachment({
        buffer: Buffer.from("test"),
        orgId: mockOrgId,
        uploadedById: mockUserId,
        filename: "file.txt",
        mimeType: "text/plain",
      });

      expect(storage.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          folder: expect.stringContaining("general"),
        }),
      );
    });
  });

  describe("getAttachmentById", () => {
    it("should return attachment with URL when found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAttachment]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await attachmentsService.getAttachmentById(mockAttachmentId, mockOrgId);

      expect(result).not.toBeNull();
      expect(storage.getUrl).toHaveBeenCalledWith(mockAttachment.path);
    });

    it("should return null when attachment not found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await attachmentsService.getAttachmentById("non-existent", mockOrgId);

      expect(result).toBeNull();
    });
  });

  describe("downloadAttachment", () => {
    it("should return file buffer and metadata", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAttachment]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await attachmentsService.downloadAttachment(mockAttachmentId, mockOrgId);

      expect(result).not.toBeNull();
      expect(result?.buffer).toBeInstanceOf(Buffer);
      expect(result?.filename).toBe(mockAttachment.originalName);
      expect(result?.mimeType).toBe(mockAttachment.mimeType);
      expect(storage.download).toHaveBeenCalledWith(mockAttachment.path);
    });

    it("should return null when attachment not found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await attachmentsService.downloadAttachment("non-existent", mockOrgId);

      expect(result).toBeNull();
    });
  });
});
