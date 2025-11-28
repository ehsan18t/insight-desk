import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Input Schemas
// ─────────────────────────────────────────────────────────────

export const uploadAttachmentSchema = z.object({
  ticketId: z.string().optional(),
  commentId: z.string().optional(),
  folder: z.enum(["tickets", "comments", "avatars", "general"]).prefault("general"),
});

export const listAttachmentsSchema = z.object({
  ticketId: z.string().optional(),
  page: z.coerce.number().int().positive().prefault(1),
  limit: z.coerce.number().int().positive().max(100).prefault(20),
});

export const attachmentIdSchema = z.object({
  id: z.string(),
});

// ─────────────────────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────────────────────

export interface AttachmentResponse {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  ticketId: string | null;
  commentId: string | null;
  uploadedBy: string;
  createdAt: Date;
}

export interface AttachmentListResponse {
  attachments: AttachmentResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
