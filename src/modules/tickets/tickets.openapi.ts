/**
 * Tickets Module - OpenAPI Route Definitions
 *
 * Registers all ticket management endpoints with the OpenAPI registry.
 * Covers CRUD operations, assignments, bulk actions, and activities.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  commonErrorResponses,
  TicketStatusSchema,
  TicketPrioritySchema,
  TicketChannelSchema,
  UuidSchema,
  TimestampSchema,
  PaginationSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// TICKET SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Basic user reference for tickets
 */
const UserRefSchema = z
  .object({
    id: UuidSchema.describe("User ID"),
    name: z.string().describe("User's display name"),
    email: z.email().describe("User's email"),
    avatarUrl: z.url().nullable().describe("Avatar URL"),
  })
  .openapi("UserRef");

/**
 * Tag reference
 */
const TagRefSchema = z
  .object({
    id: UuidSchema.describe("Tag ID"),
    name: z.string().describe("Tag name"),
    color: z.string().nullable().describe("Tag color (hex)"),
  })
  .openapi("TagRef");

/**
 * Category reference
 */
const CategoryRefSchema = z
  .object({
    id: UuidSchema.describe("Category ID"),
    name: z.string().describe("Category name"),
  })
  .openapi("CategoryRef");

/**
 * Ticket summary for lists
 */
const TicketSummarySchema = z
  .object({
    id: UuidSchema.describe("Ticket ID"),
    number: z.int().positive().describe("Human-readable ticket number"),
    title: z.string().describe("Ticket title"),
    status: TicketStatusSchema,
    priority: TicketPrioritySchema,
    channel: TicketChannelSchema,
    customer: UserRefSchema.describe("Customer who created the ticket"),
    assignee: UserRefSchema.nullable().describe("Assigned agent"),
    category: CategoryRefSchema.nullable().describe("Ticket category"),
    tags: z.array(TagRefSchema).describe("Associated tags"),
    messageCount: z.int().nonnegative().describe("Number of messages"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
    resolvedAt: TimestampSchema.nullable().describe("Resolution timestamp"),
    closedAt: TimestampSchema.nullable().describe("Close timestamp"),
  })
  .openapi("TicketSummary");

/**
 * Full ticket details
 */
const TicketDetailSchema = TicketSummarySchema.extend({
  description: z.string().describe("Full ticket description"),
  organizationId: UuidSchema.describe("Organization ID"),
  firstResponseAt: TimestampSchema.nullable().describe("First agent response timestamp"),
  slaBreachAt: TimestampSchema.nullable().describe("SLA breach deadline"),
  metadata: z.record(z.string(), z.unknown()).optional().describe("Custom metadata"),
}).openapi("TicketDetail");

/**
 * Create ticket request
 */
const CreateTicketRequestSchema = z
  .object({
    title: z.string().min(5).max(255).describe("Ticket title (5-255 characters)"),
    description: z.string().min(10).max(10000).describe("Ticket description (10-10000 characters)"),
    priority: TicketPrioritySchema.default("medium").describe("Priority level"),
    channel: TicketChannelSchema.default("web").describe("Creation channel"),
    tags: z.array(z.string()).max(10).optional().describe("Tag names to attach (max 10)"),
    categoryId: UuidSchema.optional().describe("Category ID"),
  })
  .openapi("CreateTicketRequest");

/**
 * Update ticket request
 */
const UpdateTicketRequestSchema = z
  .object({
    title: z.string().min(5).max(255).optional().describe("New title"),
    description: z.string().min(10).max(10000).optional().describe("New description"),
    priority: TicketPrioritySchema.optional().describe("New priority"),
    status: TicketStatusSchema.optional().describe("New status"),
    tags: z.array(z.string()).max(10).optional().describe("Replace all tags"),
    categoryId: UuidSchema.nullable().optional().describe("New category ID or null to remove"),
  })
  .openapi("UpdateTicketRequest");

/**
 * Assign ticket request
 */
const AssignTicketRequestSchema = z
  .object({
    assigneeId: UuidSchema.nullable().describe("Agent ID to assign, or null to unassign"),
  })
  .openapi("AssignTicketRequest");

/**
 * Ticket query parameters
 */
const TicketQuerySchema = z
  .object({
    status: TicketStatusSchema.optional().describe("Filter by status"),
    priority: TicketPrioritySchema.optional().describe("Filter by priority"),
    assigneeId: UuidSchema.optional().describe("Filter by assignee"),
    customerId: UuidSchema.optional().describe("Filter by customer"),
    search: z.string().max(100).optional().describe("Search in title and description"),
    tags: z.string().optional().describe("Comma-separated tag names"),
    page: z.coerce.number().min(1).default(1).describe("Page number"),
    limit: z.coerce.number().min(1).max(100).default(20).describe("Items per page"),
    sortBy: z
      .enum(["createdAt", "updatedAt", "priority", "status"])
      .default("createdAt")
      .describe("Sort field"),
    sortOrder: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
  })
  .openapi("TicketQuery");

/**
 * Ticket statistics
 */
const TicketStatsSchema = z
  .object({
    total: z.int().describe("Total tickets"),
    open: z.int().describe("Open tickets"),
    pending: z.int().describe("Pending tickets"),
    resolved: z.int().describe("Resolved tickets"),
    closed: z.int().describe("Closed tickets"),
    unassigned: z.int().describe("Unassigned tickets"),
    avgResolutionTime: z.number().nullable().describe("Average resolution time in hours"),
    avgFirstResponseTime: z.number().nullable().describe("Average first response time in hours"),
  })
  .openapi("TicketStats");

/**
 * Activity entry
 */
const ActivitySchema = z
  .object({
    id: UuidSchema.describe("Activity ID"),
    type: z
      .enum([
        "created",
        "updated",
        "assigned",
        "unassigned",
        "status_changed",
        "priority_changed",
        "commented",
        "merged",
        "tagged",
        "untagged",
      ])
      .describe("Activity type"),
    actor: UserRefSchema.describe("User who performed the action"),
    changes: z.record(z.string(), z.unknown()).optional().describe("What changed"),
    createdAt: TimestampSchema.describe("When the activity occurred"),
  })
  .openapi("Activity");

// ═══════════════════════════════════════════════════════════════════════════
// BULK OPERATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bulk update request
 */
const BulkUpdateRequestSchema = z
  .object({
    ticketIds: z.array(UuidSchema).min(1).max(100).describe("Ticket IDs to update (max 100)"),
    updates: z.object({
      status: TicketStatusSchema.optional(),
      priority: TicketPrioritySchema.optional(),
      assigneeId: UuidSchema.nullable().optional(),
      categoryId: UuidSchema.nullable().optional(),
      addTags: z.array(z.string()).max(10).optional().describe("Tags to add"),
      removeTags: z.array(z.string()).max(10).optional().describe("Tags to remove"),
    }),
  })
  .openapi("BulkUpdateRequest");

/**
 * Bulk assign request
 */
const BulkAssignRequestSchema = z
  .object({
    ticketIds: z.array(UuidSchema).min(1).max(100).describe("Ticket IDs to assign"),
    assigneeId: UuidSchema.nullable().describe("Agent ID or null to unassign"),
  })
  .openapi("BulkAssignRequest");

/**
 * Bulk delete request
 */
const BulkDeleteRequestSchema = z
  .object({
    ticketIds: z.array(UuidSchema).min(1).max(100).describe("Ticket IDs to delete"),
    permanent: z
      .boolean()
      .default(false)
      .describe("true for permanent delete, false for soft close"),
  })
  .openapi("BulkDeleteRequest");

/**
 * Merge tickets request
 */
const MergeTicketsRequestSchema = z
  .object({
    primaryTicketId: UuidSchema.describe("Ticket to merge into (survives)"),
    secondaryTicketIds: z
      .array(UuidSchema)
      .min(1)
      .max(10)
      .describe("Tickets to merge from (closed)"),
    mergeComments: z.boolean().default(true).describe("Copy comments to primary ticket"),
  })
  .openapi("MergeTicketsRequest");

/**
 * Bulk operation result
 */
const BulkResultSchema = z
  .object({
    success: z.int().describe("Number of successful operations"),
    failed: z.int().describe("Number of failed operations"),
    errors: z
      .array(
        z.object({
          ticketId: UuidSchema,
          error: z.string(),
        }),
      )
      .optional()
      .describe("Details of failures"),
  })
  .openapi("BulkResult");

// ═══════════════════════════════════════════════════════════════════════════
// TICKET LIST ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/tickets
registry.registerPath({
  method: "get",
  path: "/api/tickets",
  tags: ["Tickets"],
  summary: "List tickets",
  description: `
Retrieve a paginated list of tickets based on filters and user permissions.

**Access Control:**
- Customers see only their own tickets
- Agents see assigned tickets and unassigned tickets
- Admins/Owners see all organization tickets

**Filtering:**
- Filter by status, priority, assignee, customer
- Search in title and description
- Filter by tags (comma-separated)

**Sorting:**
- Sort by createdAt, updatedAt, priority, or status
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: TicketQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.optional().describe(
        "Organization context (optional for customers)",
      ),
    }),
  },
  responses: {
    200: {
      description: "Paginated list of tickets",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(TicketSummarySchema),
              pagination: PaginationSchema,
            })
            .openapi("TicketListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/tickets/stats
registry.registerPath({
  method: "get",
  path: "/api/tickets/stats",
  tags: ["Tickets"],
  summary: "Get ticket statistics",
  description: `
Retrieve aggregate statistics for tickets in the organization.

**Access Control:**
- Requires agent, admin, or owner role

**Statistics Included:**
- Total count by status
- Unassigned count
- Average resolution and first response times
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Ticket statistics",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TicketStatsSchema, "TicketStatsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// TICKET DETAIL ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/tickets/:id
registry.registerPath({
  method: "get",
  path: "/api/tickets/{id}",
  tags: ["Tickets"],
  summary: "Get ticket details",
  description: `
Retrieve full details of a specific ticket.

**Access Control:**
- Customers can only view their own tickets
- Agents can view assigned tickets
- Admins/Owners can view all tickets
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
    }),
  },
  responses: {
    200: {
      description: "Ticket details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TicketDetailSchema, "TicketDetailResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// GET /api/tickets/:id/activities
registry.registerPath({
  method: "get",
  path: "/api/tickets/{id}/activities",
  tags: ["Tickets"],
  summary: "Get ticket activity history",
  description: `
Retrieve the activity log for a specific ticket.

**Tracked Activities:**
- Creation, updates, status changes
- Assignment changes
- Comments and messages
- Tag modifications
- Merges

**Access Control:**
- Same as viewing the ticket
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
    }),
    query: z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(50),
    }),
  },
  responses: {
    200: {
      description: "Paginated activity history",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(ActivitySchema),
              pagination: PaginationSchema,
            })
            .openapi("TicketActivitiesResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// TICKET CRUD ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/tickets
registry.registerPath({
  method: "post",
  path: "/api/tickets",
  tags: ["Tickets"],
  summary: "Create a new ticket",
  description: `
Create a new support ticket.

**Notes:**
- Ticket number is auto-generated
- Creator becomes the customer
- SLA timer starts based on organization policies
- Tags are matched by name and created if needed
`,
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: CreateTicketRequestSchema,
        },
      },
    },
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    201: {
      description: "Ticket created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TicketDetailSchema, "CreateTicketResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// PATCH /api/tickets/:id
registry.registerPath({
  method: "patch",
  path: "/api/tickets/{id}",
  tags: ["Tickets"],
  summary: "Update a ticket",
  description: `
Update ticket properties.

**Access Control:**
- Customers can update title/description of their own open tickets
- Agents can update assigned tickets
- Admins/Owners can update all tickets

**Status Transitions:**
- open → pending, resolved, closed
- pending → open, resolved, closed
- resolved → open (reopen), closed
- closed → open (reopen)
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: UpdateTicketRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Ticket updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TicketDetailSchema, "UpdateTicketResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// DELETE /api/tickets/:id
registry.registerPath({
  method: "delete",
  path: "/api/tickets/{id}",
  tags: ["Tickets"],
  summary: "Delete a ticket",
  description: `
Permanently delete a ticket and all associated data.

**Access Control:**
- Requires admin or owner role

**Warning:**
- This action is irreversible
- All messages and attachments are deleted
- Consider closing instead of deleting for audit purposes
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
    }),
  },
  responses: {
    204: {
      description: "Ticket deleted successfully",
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// TICKET ACTION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/tickets/:id/assign
registry.registerPath({
  method: "post",
  path: "/api/tickets/{id}/assign",
  tags: ["Tickets"],
  summary: "Assign ticket to agent",
  description: `
Assign a ticket to an agent or unassign it.

**Access Control:**
- Requires agent, admin, or owner role

**Notes:**
- Pass null for assigneeId to unassign
- Activity is logged for audit
- Notifications are sent to the assignee
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: AssignTicketRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Ticket assigned successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TicketDetailSchema, "AssignTicketResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/tickets/:id/close
registry.registerPath({
  method: "post",
  path: "/api/tickets/{id}/close",
  tags: ["Tickets"],
  summary: "Close a ticket",
  description: `
Close a ticket, marking it as completed.

**Access Control:**
- Customers can close their own tickets
- Agents can close assigned tickets
- Admins/Owners can close any ticket

**Effects:**
- Status changes to "closed"
- closedAt timestamp is set
- CSAT survey may be triggered
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
    }),
    body: {
      required: false,
      content: {
        "application/json": {
          schema: z
            .object({
              reason: z.string().max(500).optional().describe("Reason for closing"),
            })
            .openapi("CloseTicketRequest"),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Ticket closed successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TicketDetailSchema, "CloseTicketResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/tickets/:id/reopen
registry.registerPath({
  method: "post",
  path: "/api/tickets/{id}/reopen",
  tags: ["Tickets"],
  summary: "Reopen a closed ticket",
  description: `
Reopen a previously closed or resolved ticket.

**Access Control:**
- Customers can reopen their own tickets
- Agents can reopen assigned tickets
- Admins/Owners can reopen any ticket

**Effects:**
- Status changes to "open"
- closedAt/resolvedAt are cleared
- SLA timer may restart
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
    }),
  },
  responses: {
    200: {
      description: "Ticket reopened successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TicketDetailSchema, "ReopenTicketResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK OPERATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/tickets/bulk/update
registry.registerPath({
  method: "post",
  path: "/api/tickets/bulk/update",
  tags: ["Tickets"],
  summary: "Bulk update tickets",
  description: `
Update multiple tickets at once.

**Access Control:**
- Requires agent, admin, or owner role

**Operations:**
- Change status, priority, assignee, category
- Add or remove tags

**Limits:**
- Maximum 100 tickets per request
`,
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: BulkUpdateRequestSchema,
        },
      },
    },
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Bulk update results",
      content: {
        "application/json": {
          schema: createDataResponseSchema(BulkResultSchema, "BulkUpdateResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// POST /api/tickets/bulk/assign
registry.registerPath({
  method: "post",
  path: "/api/tickets/bulk/assign",
  tags: ["Tickets"],
  summary: "Bulk assign tickets",
  description: `
Assign multiple tickets to the same agent.

**Access Control:**
- Requires agent, admin, or owner role

**Notes:**
- Pass null for assigneeId to unassign all
- Activity is logged for each ticket
`,
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: BulkAssignRequestSchema,
        },
      },
    },
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Bulk assign results",
      content: {
        "application/json": {
          schema: createDataResponseSchema(BulkResultSchema, "BulkAssignResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// POST /api/tickets/bulk/delete
registry.registerPath({
  method: "post",
  path: "/api/tickets/bulk/delete",
  tags: ["Tickets"],
  summary: "Bulk delete/close tickets",
  description: `
Delete or close multiple tickets.

**Access Control:**
- Requires admin or owner role

**Modes:**
- \`permanent: false\` - Soft close (recommended)
- \`permanent: true\` - Permanent deletion
`,
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: BulkDeleteRequestSchema,
        },
      },
    },
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Bulk delete results",
      content: {
        "application/json": {
          schema: createDataResponseSchema(BulkResultSchema, "BulkDeleteResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// POST /api/tickets/merge
registry.registerPath({
  method: "post",
  path: "/api/tickets/merge",
  tags: ["Tickets"],
  summary: "Merge tickets",
  description: `
Merge multiple tickets into one.

**Access Control:**
- Requires agent, admin, or owner role

**Process:**
1. Messages from secondary tickets are copied to primary
2. Secondary tickets are closed with merge reference
3. Original data is preserved for audit

**Limits:**
- Maximum 10 tickets to merge at once
`,
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: MergeTicketsRequestSchema,
        },
      },
    },
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Merge completed",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TicketDetailSchema, "MergeTicketsResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
