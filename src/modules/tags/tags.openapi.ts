/**
 * Tags Module - OpenAPI Route Definitions
 *
 * Registers all tag management endpoints with the OpenAPI registry.
 * Covers CRUD operations, autocomplete, popular tags, and statistics.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  createMessageResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TimestampSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// TAG SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tag base schema
 */
const TagSchema = z
  .object({
    id: UuidSchema.describe("Tag ID"),
    name: z.string().describe("Tag name (lowercase)"),
    color: z.string().nullable().describe("Tag color (hex format #RRGGBB)"),
    organizationId: UuidSchema.describe("Organization ID"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
  })
  .openapi("Tag");

/**
 * Tag with usage count for popular tags
 */
const PopularTagSchema = z
  .object({
    id: UuidSchema.describe("Tag ID"),
    name: z.string().describe("Tag name"),
    color: z.string().nullable().describe("Tag color"),
    usageCount: z.number().int().nonnegative().describe("Number of tickets using this tag"),
  })
  .openapi("PopularTag");

/**
 * Tag statistics
 */
const TagStatsSchema = z
  .object({
    totalTags: z.number().int().nonnegative().describe("Total number of tags"),
    usedTags: z.number().int().nonnegative().describe("Tags with at least one ticket"),
    unusedTags: z.number().int().nonnegative().describe("Tags with no tickets"),
    topTags: z.array(PopularTagSchema).describe("Most used tags"),
  })
  .openapi("TagStats");

/**
 * Tag for autocomplete (minimal data)
 */
const AutocompleteTagSchema = z
  .object({
    id: UuidSchema.describe("Tag ID"),
    name: z.string().describe("Tag name"),
    color: z.string().nullable().describe("Tag color"),
  })
  .openapi("AutocompleteTag");

/**
 * Create tag request
 */
const CreateTagRequestSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(50)
      .describe("Tag name (1-50 characters, will be converted to lowercase)"),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .describe("Color in hex format (#RRGGBB)"),
  })
  .openapi("CreateTagRequest");

/**
 * Update tag request
 */
const UpdateTagRequestSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(50)
      .optional()
      .describe("New tag name (will be converted to lowercase)"),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .nullable()
      .describe("New color or null to remove"),
  })
  .openapi("UpdateTagRequest");

/**
 * List tags query parameters
 */
const ListTagsQuerySchema = z
  .object({
    search: z.string().max(50).optional().describe("Search string to filter tags by name"),
    limit: z.coerce
      .number()
      .min(1)
      .max(100)
      .default(50)
      .describe("Maximum number of results (1-100)"),
  })
  .openapi("ListTagsQuery");

/**
 * Popular tags query parameters
 */
const PopularTagsQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("Number of popular tags to return (1-20)"),
  })
  .openapi("PopularTagsQuery");

// ═══════════════════════════════════════════════════════════════════════════
// TAG ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/tags
registry.registerPath({
  method: "get",
  path: "/api/tags",
  tags: ["Tags"],
  summary: "List tags",
  description: `
Retrieve all tags for the current organization.

**Access Control:**
- Requires authentication
- All authenticated users can view tags

**Filtering:**
- Use \`search\` to filter tags by name (partial match)
- Use \`limit\` to control the number of results
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: ListTagsQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "List of tags",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(TagSchema), "TagListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/tags/popular
registry.registerPath({
  method: "get",
  path: "/api/tags/popular",
  tags: ["Tags"],
  summary: "Get popular tags",
  description: `
Retrieve the most frequently used tags in the organization.

**Access Control:**
- Requires authentication
- All authenticated users can view popular tags

**Response:**
Returns tags sorted by usage count (highest first).
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: PopularTagsQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Popular tags with usage counts",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(PopularTagSchema), "PopularTagsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/tags/autocomplete
registry.registerPath({
  method: "get",
  path: "/api/tags/autocomplete",
  tags: ["Tags"],
  summary: "Autocomplete tags",
  description: `
Get tags for autocomplete suggestions when tagging tickets.

**Access Control:**
- Requires authentication
- All authenticated users can use autocomplete

**Usage:**
Designed for real-time search as users type tag names.
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: ListTagsQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Autocomplete tag suggestions",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            z.array(AutocompleteTagSchema),
            "AutocompleteTagsResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/tags/stats
registry.registerPath({
  method: "get",
  path: "/api/tags/stats",
  tags: ["Tags"],
  summary: "Get tag statistics",
  description: `
Retrieve tag usage statistics for the organization.

**Access Control:**
- Requires agent, admin, or owner role

**Statistics Included:**
- Total number of tags
- Tags in use vs unused
- Top tags by usage
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Tag usage statistics",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TagStatsSchema, "TagStatsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/tags/:name
registry.registerPath({
  method: "get",
  path: "/api/tags/{name}",
  tags: ["Tags"],
  summary: "Get tag by name",
  description: `
Retrieve a single tag by its name.

**Access Control:**
- Requires authentication
- All authenticated users can view tag details

**Note:**
Tag names are case-insensitive (stored as lowercase).
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      name: z.string().min(1).max(50).describe("Tag name"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Tag details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TagSchema, "TagResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/tags
registry.registerPath({
  method: "post",
  path: "/api/tags",
  tags: ["Tags"],
  summary: "Create tag",
  description: `
Create a new tag in the organization.

**Access Control:**
- Requires agent, admin, or owner role

**Validation:**
- Name is required (1-50 characters)
- Name will be converted to lowercase and trimmed
- Color must be in hex format (#RRGGBB)
- Tag names must be unique within the organization
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: CreateTagRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Tag created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TagSchema, "TagCreatedResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    409: commonErrorResponses[409],
    500: commonErrorResponses[500],
  },
});

// PATCH /api/tags/:name
registry.registerPath({
  method: "patch",
  path: "/api/tags/{name}",
  tags: ["Tags"],
  summary: "Update tag",
  description: `
Update an existing tag.

**Access Control:**
- Requires admin or owner role

**Validation:**
- All fields are optional
- Name must be 1-50 characters if provided
- Name will be converted to lowercase
- Color must be in hex format (#RRGGBB) if provided
- New name must be unique within the organization
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      name: z.string().min(1).max(50).describe("Current tag name"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateTagRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Tag updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(TagSchema, "TagUpdatedResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    409: commonErrorResponses[409],
    500: commonErrorResponses[500],
  },
});

// DELETE /api/tags/:name
registry.registerPath({
  method: "delete",
  path: "/api/tags/{name}",
  tags: ["Tags"],
  summary: "Delete tag",
  description: `
Delete a tag from the organization.

**Access Control:**
- Requires admin or owner role

**Behavior:**
- The tag is permanently deleted
- The tag is automatically removed from all tickets that had it
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      name: z.string().min(1).max(50).describe("Tag name to delete"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Tag deleted successfully",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("TagDeletedResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
