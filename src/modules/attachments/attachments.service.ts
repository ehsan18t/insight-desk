/**
 * Attachments Service
 * Handles file upload, download, and metadata management
 */

import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, users } from "@/db/schema";
import { storage } from "@/lib/storage";
import type { UploadOptions } from "@/lib/storage";
import type { AttachmentListResponse, AttachmentResponse } from "./attachments.schema";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface UploadParams {
  buffer: Buffer;
  orgId: string;
  uploadedById: string;
  filename: string;
  mimeType: string;
  ticketId?: string;
  messageId?: string;
  folder?: "tickets" | "comments" | "avatars" | "general";
}

interface ListParams {
  orgId: string;
  ticketId?: string;
  messageId?: string;
  page?: number;
  limit?: number;
}

// ─────────────────────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────────────────────

/**
 * Upload a file and create attachment record
 */
export async function uploadAttachment(params: UploadParams): Promise<AttachmentResponse> {
  const { buffer, orgId, uploadedById, filename, mimeType, ticketId, messageId, folder = "general" } = params;

  // Upload to storage
  const uploadOptions: UploadOptions = {
    filename,
    mimeType,
    folder: `${orgId}/${folder}`,
  };

  const storedFile = await storage.upload(buffer, uploadOptions);

  // Create database record
  const [record] = await db
    .insert(attachments)
    .values({
      orgId,
      ticketId: ticketId || null,
      messageId: messageId || null,
      uploadedById,
      filename: storedFile.filename,
      originalName: filename,
      mimeType,
      size: buffer.length,
      path: storedFile.path,
      folder,
    })
    .returning();

  return formatAttachment(record, storedFile.url);
}

/**
 * Get attachment by ID
 */
export async function getAttachmentById(
  id: string,
  orgId: string,
): Promise<AttachmentResponse | null> {
  const [record] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.orgId, orgId)));

  if (!record) return null;

  const url = await storage.getUrl(record.path);
  return formatAttachment(record, url);
}

/**
 * Download attachment file
 */
export async function downloadAttachment(
  id: string,
  orgId: string,
): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
  const [record] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.orgId, orgId)));

  if (!record) return null;

  const buffer = await storage.download(record.path);
  return {
    buffer,
    filename: record.originalName,
    mimeType: record.mimeType,
  };
}

/**
 * List attachments with pagination
 */
export async function listAttachments(params: ListParams): Promise<AttachmentListResponse> {
  const { orgId, ticketId, messageId, page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [eq(attachments.orgId, orgId)];
  if (ticketId) conditions.push(eq(attachments.ticketId, ticketId));
  if (messageId) conditions.push(eq(attachments.messageId, messageId));

  // Get total count
  const [{ total }] = await db
    .select({ total: count() })
    .from(attachments)
    .where(and(...conditions));

  // Get records
  const records = await db
    .select({
      attachment: attachments,
      uploader: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(attachments)
    .leftJoin(users, eq(attachments.uploadedById, users.id))
    .where(and(...conditions))
    .orderBy(desc(attachments.createdAt))
    .limit(limit)
    .offset(offset);

  // Get URLs for all attachments
  const attachmentResponses = await Promise.all(
    records.map(async (r) => {
      const url = await storage.getUrl(r.attachment.path);
      return formatAttachment(r.attachment, url);
    }),
  );

  return {
    attachments: attachmentResponses,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Delete an attachment
 */
export async function deleteAttachment(id: string, orgId: string): Promise<boolean> {
  const [record] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.orgId, orgId)));

  if (!record) return false;

  // Delete from storage
  await storage.delete(record.path);

  // Delete database record
  await db
    .delete(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.orgId, orgId)));

  return true;
}

/**
 * Get attachments for a ticket (including message attachments)
 */
export async function getTicketAttachments(
  ticketId: string,
  orgId: string,
): Promise<AttachmentResponse[]> {
  const records = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.ticketId, ticketId), eq(attachments.orgId, orgId)))
    .orderBy(desc(attachments.createdAt));

  return Promise.all(
    records.map(async (record) => {
      const url = await storage.getUrl(record.path);
      return formatAttachment(record, url);
    }),
  );
}

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────

function formatAttachment(
  record: typeof attachments.$inferSelect,
  url: string,
): AttachmentResponse {
  return {
    id: record.id,
    filename: record.filename,
    originalName: record.originalName,
    mimeType: record.mimeType,
    size: record.size,
    url,
    ticketId: record.ticketId,
    commentId: record.messageId,
    uploadedBy: record.uploadedById,
    createdAt: record.createdAt,
  };
}
