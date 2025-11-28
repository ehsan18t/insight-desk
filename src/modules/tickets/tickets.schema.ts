import { z } from "zod";

// Ticket status and priority enums
export const ticketStatusValues = ["open", "pending", "resolved", "closed"] as const;
export const ticketPriorityValues = ["low", "medium", "high", "urgent"] as const;
export const ticketChannelValues = ["web", "email", "chat", "api"] as const;

// Create ticket schema
export const createTicketSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(255, "Title cannot exceed 255 characters"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(10000, "Description cannot exceed 10000 characters"),
  priority: z.enum(ticketPriorityValues).default("medium"),
  channel: z.enum(ticketChannelValues).default("web"),
  tags: z.array(z.string()).max(10).optional(),
  categoryId: z.string().uuid().optional(),
});

// Update ticket schema
export const updateTicketSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(255, "Title cannot exceed 255 characters")
    .optional(),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(10000, "Description cannot exceed 10000 characters")
    .optional(),
  priority: z.enum(ticketPriorityValues).optional(),
  status: z.enum(ticketStatusValues).optional(),
  tags: z.array(z.string()).max(10).optional(),
  categoryId: z.string().uuid().nullable().optional(),
});

// Assign ticket schema
export const assignTicketSchema = z.object({
  assigneeId: z.string().uuid().nullable(),
});

// Ticket query params schema
export const ticketQuerySchema = z.object({
  status: z.enum(ticketStatusValues).optional(),
  priority: z.enum(ticketPriorityValues).optional(),
  assigneeId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  tags: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "updatedAt", "priority", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Ticket ID param schema
export const ticketIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Activities query params schema
export const activitiesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

// ─────────────────────────────────────────────────────────────
// Bulk Operation Schemas
// ─────────────────────────────────────────────────────────────

// Bulk update schema
export const bulkUpdateSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  updates: z
    .object({
      status: z.enum(ticketStatusValues).optional(),
      priority: z.enum(ticketPriorityValues).optional(),
      assigneeId: z.string().uuid().nullable().optional(),
      categoryId: z.string().uuid().nullable().optional(),
      addTags: z.array(z.string()).max(10).optional(),
      removeTags: z.array(z.string()).max(10).optional(),
    })
    .refine((data) => Object.values(data).some((v) => v !== undefined), {
      message: "At least one update field must be provided",
    }),
});

// Bulk delete schema
export const bulkDeleteSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  permanent: z.boolean().default(false), // false = soft close, true = permanent delete
});

// Bulk assign schema
export const bulkAssignSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  assigneeId: z.string().uuid().nullable(),
});

// Merge tickets schema
export const mergeTicketsSchema = z.object({
  primaryTicketId: z.string().uuid(),
  secondaryTicketIds: z.array(z.string().uuid()).min(1).max(10),
  mergeComments: z.boolean().default(true), // Copy comments from secondary to primary
});

// Types
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type TicketQuery = z.infer<typeof ticketQuerySchema>;
export type ActivitiesQuery = z.infer<typeof activitiesQuerySchema>;
export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
export type MergeTicketsInput = z.infer<typeof mergeTicketsSchema>;
