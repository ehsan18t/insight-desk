/**
 * SLA Policies Module - OpenAPI Route Definitions
 *
 * Registers all SLA policy management endpoints with the OpenAPI registry.
 * Covers CRUD operations, listing with filters, and default policy initialization.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TimestampSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// SLA POLICY SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SLA Priority levels
 */
const SlaPrioritySchema = z.enum(["low", "medium", "high", "urgent"]).openapi({
  description: "Priority level for SLA policy",
  example: "medium",
});

/**
 * SLA Policy base schema
 */
const SlaPolicySchema = z
  .object({
    id: UuidSchema.describe("SLA Policy ID"),
    name: z.string().describe("Policy name"),
    priority: SlaPrioritySchema.describe("Priority level this policy applies to"),
    firstResponseTime: z.number().int().describe("Target first response time in minutes"),
    resolutionTime: z.number().int().describe("Target resolution time in minutes"),
    businessHoursOnly: z.boolean().describe("Whether SLA times only count during business hours"),
    isDefault: z.boolean().describe("Whether this is a default policy"),
    organizationId: UuidSchema.describe("Organization ID"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
  })
  .openapi("SlaPolicy");

/**
 * Create SLA policy request
 */
const CreateSlaPolicyRequestSchema = z
  .object({
    name: z.string().min(1).max(100).describe("Policy name (1-100 characters)"),
    priority: SlaPrioritySchema.describe("Priority level this policy applies to"),
    firstResponseTime: z
      .number()
      .int()
      .min(1)
      .max(10080)
      .describe("Target first response time in minutes (1 min to 7 days)"),
    resolutionTime: z
      .number()
      .int()
      .min(1)
      .max(43200)
      .describe("Target resolution time in minutes (1 min to 30 days)"),
    businessHoursOnly: z
      .boolean()
      .default(true)
      .describe("Whether SLA times only count during business hours"),
    isDefault: z.boolean().default(false).describe("Whether this is a default policy"),
  })
  .openapi("CreateSlaPolicyRequest");

/**
 * Update SLA policy request
 */
const UpdateSlaPolicyRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional().describe("Policy name (1-100 characters)"),
    firstResponseTime: z
      .number()
      .int()
      .min(1)
      .max(10080)
      .optional()
      .describe("Target first response time in minutes (1 min to 7 days)"),
    resolutionTime: z
      .number()
      .int()
      .min(1)
      .max(43200)
      .optional()
      .describe("Target resolution time in minutes (1 min to 30 days)"),
    businessHoursOnly: z
      .boolean()
      .optional()
      .describe("Whether SLA times only count during business hours"),
    isDefault: z.boolean().optional().describe("Whether this is a default policy"),
  })
  .openapi("UpdateSlaPolicyRequest");

/**
 * List SLA policies query parameters
 */
const ListSlaPoliciesQuerySchema = z
  .object({
    priority: SlaPrioritySchema.optional().describe("Filter by priority level"),
  })
  .openapi("ListSlaPoliciesQuery");

// ═══════════════════════════════════════════════════════════════════════════
// SLA POLICY ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/sla-policies
registry.registerPath({
  method: "get",
  path: "/api/sla-policies",
  tags: ["SLA Policies"],
  summary: "List SLA policies",
  description: `
Retrieve all SLA policies for the current organization.

**Access Control:**
- Requires agent, admin, or owner role

**Filtering:**
- Use \`priority\` to filter policies by priority level (low, medium, high, urgent)

**SLA Policy Details:**
Each policy defines target response and resolution times for tickets of a specific priority.
Times are specified in minutes.
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: ListSlaPoliciesQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "List of SLA policies",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(SlaPolicySchema), "SlaPolicyListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/sla-policies/:id
registry.registerPath({
  method: "get",
  path: "/api/sla-policies/{id}",
  tags: ["SLA Policies"],
  summary: "Get SLA policy by ID",
  description: `
Retrieve a single SLA policy by its ID.

**Access Control:**
- Requires agent, admin, or owner role

**Response:**
Returns the complete SLA policy details including target times and configuration.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("SLA Policy ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "SLA policy details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SlaPolicySchema, "SlaPolicyResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/sla-policies
registry.registerPath({
  method: "post",
  path: "/api/sla-policies",
  tags: ["SLA Policies"],
  summary: "Create SLA policy",
  description: `
Create a new SLA policy for the organization.

**Access Control:**
- Requires admin or owner role

**Validation:**
- Name is required (1-100 characters)
- Priority must be one of: low, medium, high, urgent
- First response time: 1 to 10,080 minutes (1 minute to 7 days)
- Resolution time: 1 to 43,200 minutes (1 minute to 30 days)

**Note:**
If a policy already exists for the specified priority, it will be updated instead of creating a duplicate.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: CreateSlaPolicyRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "SLA policy created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SlaPolicySchema, "SlaPolicyCreatedResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// PATCH /api/sla-policies/:id
registry.registerPath({
  method: "patch",
  path: "/api/sla-policies/{id}",
  tags: ["SLA Policies"],
  summary: "Update SLA policy",
  description: `
Update an existing SLA policy.

**Access Control:**
- Requires admin or owner role

**Updatable Fields:**
- \`name\`: Policy name
- \`firstResponseTime\`: Target first response time in minutes
- \`resolutionTime\`: Target resolution time in minutes
- \`businessHoursOnly\`: Whether SLA times only count during business hours
- \`isDefault\`: Whether this is a default policy

**Note:**
Priority cannot be changed after creation. To change priority, delete and recreate the policy.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("SLA Policy ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateSlaPolicyRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "SLA policy updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SlaPolicySchema, "SlaPolicyUpdatedResponse"),
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

// DELETE /api/sla-policies/:id
registry.registerPath({
  method: "delete",
  path: "/api/sla-policies/{id}",
  tags: ["SLA Policies"],
  summary: "Delete SLA policy",
  description: `
Delete an SLA policy from the organization.

**Access Control:**
- Requires admin or owner role

**Warning:**
Deleting an SLA policy will cause tickets of that priority to fall back to default SLA times.
Existing tickets will retain their current SLA deadlines.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("SLA Policy ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    204: {
      description: "SLA policy deleted successfully (no content)",
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/sla-policies/initialize
registry.registerPath({
  method: "post",
  path: "/api/sla-policies/initialize",
  tags: ["SLA Policies"],
  summary: "Initialize default SLA policies",
  description: `
Initialize the organization with default SLA policies for all priority levels.

**Access Control:**
- Requires admin or owner role

**Default Policies:**
Creates policies with sensible defaults for each priority level:
- **Urgent**: 15 min first response, 4 hours resolution
- **High**: 1 hour first response, 8 hours resolution
- **Medium**: 4 hours first response, 24 hours resolution
- **Low**: 8 hours first response, 72 hours resolution

**Note:**
This endpoint is idempotent. Calling it multiple times will not create duplicate policies.
Existing policies for a priority level will not be overwritten.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    201: {
      description: "Default SLA policies initialized successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            z.array(SlaPolicySchema),
            "SlaPoliciesInitializedResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});
