/**
 * Export Module - OpenAPI Route Definitions
 *
 * Registers all data export endpoints with the OpenAPI registry.
 * Covers ticket exports in CSV and XLSX formats with various filtering options.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TicketStatusSchema,
  TicketPrioritySchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export format enum
 */
const ExportFormatSchema = z.enum(["csv", "xlsx"]).openapi({
  description: "Export file format",
  example: "csv",
});

/**
 * Export query parameters
 */
const ExportQuerySchema = z
  .object({
    format: ExportFormatSchema.default("csv").describe("Export file format"),
    fields: z
      .string()
      .optional()
      .describe("Comma-separated list of fields to include. Defaults to all fields."),
    status: TicketStatusSchema.optional().describe("Filter by ticket status"),
    priority: TicketPrioritySchema.optional().describe("Filter by ticket priority"),
    assigneeId: UuidSchema.optional().describe("Filter by assigned agent ID"),
    categoryId: UuidSchema.optional().describe("Filter by category ID"),
    dateFrom: z.iso.datetime().optional().describe("Filter tickets created from this date"),
    dateTo: z.iso.datetime().optional().describe("Filter tickets created until this date"),
    search: z.string().optional().describe("Search in ticket title and description"),
  })
  .openapi("ExportQuery");

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/export/:organizationId/fields
registry.registerPath({
  method: "get",
  path: "/api/export/{organizationId}/fields",
  tags: ["Export"],
  summary: "Get available export fields",
  description: `
Retrieve the list of available fields for ticket exports.

**Access Control:**
- Requires authentication
- Must be a member of the organization

**Response:**
Returns all fields that can be included in exports with their names and descriptions.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "List of available export fields",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            z.array(
              z.object({
                name: z.string(),
                label: z.string(),
              }),
            ),
            "ExportFieldsResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/export/:organizationId/tickets
registry.registerPath({
  method: "get",
  path: "/api/export/{organizationId}/tickets",
  tags: ["Export"],
  summary: "Export tickets",
  description: `
Export tickets in CSV or XLSX format with optional filtering.

**Access Control:**
- Requires authentication
- Must be a member of the organization

**Export Formats:**
- \`csv\`: Comma-separated values (default)
- \`xlsx\`: Microsoft Excel format

**Available Fields:**
- \`ticketNumber\`: Unique ticket identifier
- \`title\`: Ticket subject
- \`description\`: Ticket content
- \`status\`: Current status (open, pending, resolved, closed)
- \`priority\`: Priority level (low, medium, high, urgent)
- \`channel\`: Source channel (web, email, api, chat)
- \`customerName\`: Customer's full name
- \`customerEmail\`: Customer's email address
- \`assigneeName\`: Assigned agent's name
- \`assigneeEmail\`: Assigned agent's email
- \`categoryName\`: Category name
- \`tags\`: Comma-separated tag names
- \`createdAt\`: Creation timestamp
- \`updatedAt\`: Last update timestamp
- \`resolvedAt\`: Resolution timestamp
- \`closedAt\`: Close timestamp
- \`firstResponseAt\`: First response timestamp
- \`slaResponseDue\`: SLA response deadline
- \`slaResolutionDue\`: SLA resolution deadline

**Filtering:**
- Filter by status, priority, assignee, category
- Filter by date range
- Search in title and description

**Response:**
Returns a file download with appropriate content type headers.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
    query: ExportQuerySchema,
  },
  responses: {
    200: {
      description: "Exported file download",
      content: {
        "text/csv": {
          schema: z.string().describe("CSV file content"),
        },
        "application/vnd.ms-excel": {
          schema: z.string().describe("XLSX file content (binary)"),
        },
      },
      headers: z.object({
        "Content-Disposition": z
          .string()
          .describe('File download header (e.g., attachment; filename="tickets-export.csv")'),
      }),
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});
