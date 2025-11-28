import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Export Query Schema
// ─────────────────────────────────────────────────────────────
export const exportQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  fields: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",") : undefined))
    .describe("Comma-separated list of fields to include. Defaults to all fields."),
  // Ticket filters
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigneeId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().optional(),
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;

// Available fields for export
export const TICKET_EXPORT_FIELDS = [
  "ticketNumber",
  "title",
  "description",
  "status",
  "priority",
  "channel",
  "customerName",
  "customerEmail",
  "assigneeName",
  "assigneeEmail",
  "categoryName",
  "tags",
  "createdAt",
  "updatedAt",
  "resolvedAt",
  "closedAt",
  "firstResponseAt",
  "slaResponseDue",
  "slaResolutionDue",
] as const;

export type TicketExportField = (typeof TICKET_EXPORT_FIELDS)[number];
