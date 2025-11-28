/**
 * Audit Module - OpenAPI Route Definitions
 *
 * Registers all audit log endpoints with the OpenAPI registry.
 * Covers listing, exporting, and viewing audit logs.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TimestampSchema,
  PaginationSchema,
  EmailSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Audit action types
 */
const AuditActionSchema = z
  .enum([
    "user_login",
    "user_logout",
    "user_password_changed",
    "user_email_changed",
    "organization_created",
    "organization_updated",
    "organization_deleted",
    "subscription_created",
    "subscription_upgraded",
    "subscription_downgraded",
    "subscription_canceled",
    "subscription_renewed",
    "user_invited",
    "user_removed",
    "user_role_changed",
    "settings_updated",
    "sla_policy_created",
    "sla_policy_updated",
    "sla_policy_deleted",
    "data_exported",
    "api_key_created",
    "api_key_revoked",
  ])
  .describe("Type of audit action")
  .openapi("AuditAction");

/**
 * User reference in audit log
 */
const AuditUserSchema = z
  .object({
    id: UuidSchema.describe("User ID"),
    name: z.string().describe("User's name"),
    email: EmailSchema.describe("User's email"),
  })
  .openapi("AuditUser");

/**
 * Audit log entry
 */
const AuditLogSchema = z
  .object({
    id: UuidSchema.describe("Audit log ID"),
    action: AuditActionSchema,
    user: AuditUserSchema.nullable().describe("User who performed the action"),
    resourceType: z.string().nullable().describe("Type of resource affected"),
    resourceId: z.string().nullable().describe("ID of affected resource"),
    metadata: z.record(z.string(), z.unknown()).nullable().describe("Additional action details"),
    ipAddress: z.string().nullable().describe("IP address of the request"),
    userAgent: z.string().nullable().describe("User agent of the request"),
    createdAt: TimestampSchema.describe("When the action occurred"),
  })
  .openapi("AuditLog");

/**
 * Audit log query parameters
 */
const AuditLogQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).describe("Page number"),
    limit: z.coerce.number().int().min(1).max(100).default(50).describe("Items per page"),
    action: AuditActionSchema.optional().describe("Filter by action type"),
    userId: UuidSchema.optional().describe("Filter by user ID"),
    resourceType: z.string().optional().describe("Filter by resource type"),
    resourceId: z.string().optional().describe("Filter by resource ID"),
    from: z.string().datetime().optional().describe("Start date (ISO 8601)"),
    to: z.string().datetime().optional().describe("End date (ISO 8601)"),
    sortBy: z.enum(["createdAt", "action", "userId"]).default("createdAt").describe("Sort field"),
    sortOrder: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
  })
  .openapi("AuditLogQuery");

/**
 * Export query parameters
 */
const ExportAuditLogsQuerySchema = z
  .object({
    format: z.enum(["json", "csv"]).default("json").describe("Export format"),
    action: AuditActionSchema.optional().describe("Filter by action type"),
    userId: UuidSchema.optional().describe("Filter by user ID"),
    from: z.string().datetime().optional().describe("Start date (ISO 8601)"),
    to: z.string().datetime().optional().describe("End date (ISO 8601)"),
  })
  .openapi("ExportAuditLogsQuery");

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/audit
registry.registerPath({
  method: "get",
  path: "/api/audit",
  tags: ["Audit"],
  summary: "List audit logs",
  description: `
Retrieve a paginated list of audit logs for the organization.

**Access Control:**
- Requires admin or owner role

**Filtering:**
- Filter by action type, user, resource, or date range
- Search across multiple dimensions

**Tracked Actions:**
- Authentication events (login, logout, password changes)
- Organization changes (create, update, delete)
- Subscription events (upgrade, downgrade, cancel)
- User management (invite, remove, role changes)
- Security events (API key creation/revocation)
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: AuditLogQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Paginated list of audit logs",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(AuditLogSchema),
              pagination: PaginationSchema,
            })
            .openapi("AuditLogListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/audit/export
registry.registerPath({
  method: "get",
  path: "/api/audit/export",
  tags: ["Audit"],
  summary: "Export audit logs",
  description: `
Export audit logs for compliance or analysis.

**Access Control:**
- Requires admin or owner role

**Export Formats:**
- \`json\`: Full JSON data with all fields
- \`csv\`: Spreadsheet-compatible format

**Notes:**
- Exports are subject to rate limiting
- Large exports may take time to generate
- This action is itself logged in the audit trail
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: ExportAuditLogsQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Exported audit logs",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(AuditLogSchema),
              exportedAt: TimestampSchema,
            })
            .openapi("ExportAuditLogsJsonResponse"),
        },
        "text/csv": {
          schema: z.string().describe("CSV formatted audit logs"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/audit/:id
registry.registerPath({
  method: "get",
  path: "/api/audit/{id}",
  tags: ["Audit"],
  summary: "Get audit log details",
  description: `
Retrieve detailed information about a specific audit log entry.

**Access Control:**
- Requires admin or owner role
- Log must belong to the current organization

**Use Cases:**
- Investigating specific events
- Compliance auditing
- Security incident analysis
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Audit log ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Audit log details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(AuditLogSchema, "AuditLogDetailResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
