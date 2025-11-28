/**
 * Canned Responses Module - OpenAPI Route Definitions
 *
 * Registers all canned response management endpoints with the OpenAPI registry.
 * Covers CRUD operations, listing with pagination and search, and category retrieval.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  createPaginatedResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TimestampSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// CANNED RESPONSE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canned Response base schema
 */
const CannedResponseSchema = z
  .object({
    id: UuidSchema.describe("Canned Response ID"),
    title: z.string().describe("Response title for quick identification"),
    content: z.string().describe("The response content/template text"),
    shortcut: z.string().nullable().describe("Optional shortcut for quick insertion"),
    category: z.string().nullable().describe("Category for organizing responses"),
    organizationId: UuidSchema.describe("Organization ID"),
    createdById: UuidSchema.describe("ID of the user who created this response"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
  })
  .openapi("CannedResponse");

/**
 * Create canned response request
 */
const CreateCannedResponseRequestSchema = z
  .object({
    title: z.string().min(1).max(200).describe("Response title (1-200 characters)"),
    content: z.string().min(1).max(10000).describe("Response content (1-10000 characters)"),
    shortcut: z
      .string()
      .max(50)
      .optional()
      .describe("Optional shortcut for quick insertion (max 50 characters)"),
    category: z
      .string()
      .max(100)
      .optional()
      .describe("Optional category for organization (max 100 characters)"),
  })
  .openapi("CreateCannedResponseRequest");

/**
 * Update canned response request
 */
const UpdateCannedResponseRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional().describe("Response title (1-200 characters)"),
    content: z
      .string()
      .min(1)
      .max(10000)
      .optional()
      .describe("Response content (1-10000 characters)"),
    shortcut: z
      .string()
      .max(50)
      .optional()
      .nullable()
      .describe("Shortcut for quick insertion (null to remove)"),
    category: z
      .string()
      .max(100)
      .optional()
      .nullable()
      .describe("Category for organization (null to remove)"),
  })
  .openapi("UpdateCannedResponseRequest");

/**
 * List canned responses query parameters
 */
const ListCannedResponsesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).prefault(1).describe("Page number (starting from 1)"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .prefault(50)
      .describe("Number of results per page (1-100)"),
    category: z.string().max(100).optional().describe("Filter by category"),
    search: z.string().max(200).optional().describe("Search in title and content"),
  })
  .openapi("ListCannedResponsesQuery");

/**
 * Category item schema
 */
const CategorySchema = z
  .object({
    category: z.string().describe("Category name"),
    count: z.int().describe("Number of responses in this category"),
  })
  .openapi("Category");

// ═══════════════════════════════════════════════════════════════════════════
// CANNED RESPONSE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/canned-responses
registry.registerPath({
  method: "get",
  path: "/api/canned-responses",
  tags: ["Canned Responses"],
  summary: "List canned responses",
  description: `
Retrieve all canned responses for the current organization with pagination.

**Access Control:**
- Requires agent, admin, or owner role

**Filtering:**
- Use \`category\` to filter responses by category
- Use \`search\` to search in title and content (case-insensitive partial match)

**Pagination:**
- Use \`page\` and \`limit\` for pagination (default: page 1, limit 50)
- Response includes total count and total pages for navigation
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: ListCannedResponsesQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Paginated list of canned responses",
      content: {
        "application/json": {
          schema: createPaginatedResponseSchema(CannedResponseSchema, "CannedResponseListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/canned-responses/categories
registry.registerPath({
  method: "get",
  path: "/api/canned-responses/categories",
  tags: ["Canned Responses"],
  summary: "List canned response categories",
  description: `
Retrieve all unique categories used by canned responses in the organization.

**Access Control:**
- Requires agent, admin, or owner role

**Response:**
Returns a list of categories with the count of responses in each category.
Useful for building category filters in the UI.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "List of categories with response counts",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(CategorySchema), "CategoriesResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/canned-responses/:id
registry.registerPath({
  method: "get",
  path: "/api/canned-responses/{id}",
  tags: ["Canned Responses"],
  summary: "Get canned response by ID",
  description: `
Retrieve a single canned response by its ID.

**Access Control:**
- Requires agent, admin, or owner role

**Response:**
Returns the complete canned response including title, content, shortcut, and category.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Canned Response ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Canned response details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(CannedResponseSchema, "CannedResponseResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/canned-responses
registry.registerPath({
  method: "post",
  path: "/api/canned-responses",
  tags: ["Canned Responses"],
  summary: "Create canned response",
  description: `
Create a new canned response for the organization.

**Access Control:**
- Requires agent, admin, or owner role

**Validation:**
- Title is required (1-200 characters)
- Content is required (1-10,000 characters)
- Shortcut is optional (max 50 characters)
- Category is optional (max 100 characters)

**Usage:**
Canned responses can be used to quickly insert pre-written replies when responding to tickets.
The optional shortcut allows agents to quickly find and insert responses.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: CreateCannedResponseRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Canned response created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(CannedResponseSchema, "CannedResponseCreatedResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// PATCH /api/canned-responses/:id
registry.registerPath({
  method: "patch",
  path: "/api/canned-responses/{id}",
  tags: ["Canned Responses"],
  summary: "Update canned response",
  description: `
Update an existing canned response.

**Access Control:**
- Requires agent, admin, or owner role

**Updatable Fields:**
- \`title\`: Response title
- \`content\`: Response content/template text
- \`shortcut\`: Quick insertion shortcut (set to null to remove)
- \`category\`: Category for organization (set to null to remove)

**Note:**
All fields are optional. Only provided fields will be updated.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Canned Response ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateCannedResponseRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Canned response updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(CannedResponseSchema, "CannedResponseUpdatedResponse"),
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

// DELETE /api/canned-responses/:id
registry.registerPath({
  method: "delete",
  path: "/api/canned-responses/{id}",
  tags: ["Canned Responses"],
  summary: "Delete canned response",
  description: `
Delete a canned response from the organization.

**Access Control:**
- Requires agent, admin, or owner role

**Note:**
This action is permanent and cannot be undone.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Canned Response ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    204: {
      description: "Canned response deleted successfully (no content)",
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
