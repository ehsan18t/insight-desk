import { z } from "zod";

// Message type enum
export const messageTypeValues = ["reply", "internal_note", "system"] as const;

// Attachment schema
export const attachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  url: z.string().url(),
  mimeType: z.string(),
  size: z.number().positive(),
});

// Create message schema
export const createMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message content is required")
    .max(50000, "Message cannot exceed 50000 characters"),
  type: z.enum(messageTypeValues).default("reply"),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

// Update message schema
export const updateMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message content is required")
    .max(50000, "Message cannot exceed 50000 characters"),
});

// Message query params schema
export const messageQuerySchema = z.object({
  type: z.enum(messageTypeValues).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

// Message ID param schema
export const messageIdParamSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});

// Ticket ID param schema (for messages under a ticket)
export const ticketIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Types
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type MessageQuery = z.infer<typeof messageQuerySchema>;
export type AttachmentInput = z.infer<typeof attachmentSchema>;
